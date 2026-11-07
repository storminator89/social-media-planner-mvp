import {WorkspaceError,fail,ownSnapshot,ownerId,mutationId} from './workspace-domain.mjs';
import {isWorkspaceRepository} from './workspace-repository.mjs';
const PREFIX='/api/planner/workspaces',MAX_BYTES=131072+4096;
const HEADERS={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','Pragma':'no-cache','X-Content-Type-Options':'nosniff','Vary':'Cookie, oai-authenticated-user-id'};
function json(body,status=200){return new Response(JSON.stringify(body),{status,headers:HEADERS});}
/** Strict JSON: duplicate keys, excessive nesting/nodes and malformed UTF-8 fail. */
function parseJSON(source){
 let i=0,nodes=0;const ws=()=>{while(/[\t\r\n ]/.test(source[i]??'')&&i<source.length)i++;};
 function string(){const start=i++;while(i<source.length){const c=source[i++];if(c==='"'){try{return JSON.parse(source.slice(start,i));}catch{fail('WORKSPACE_JSON_INVALID');}}if(c==='\\'){if(source[i]==='u')i+=5;else i++;}else if(c.charCodeAt(0)<32)fail('WORKSPACE_JSON_INVALID');}fail('WORKSPACE_JSON_INVALID');}
 function value(depth){if(depth>24||++nodes>10000)fail('WORKSPACE_JSON_INVALID');ws();const c=source[i];if(c==='"')return string();if(c==='{'){i++;ws();const result=Object.create(null),keys=new Set();if(source[i]==='}'){i++;return result;}while(true){ws();if(source[i]!=='"')fail('WORKSPACE_JSON_INVALID');const key=string();if(keys.has(key))fail('WORKSPACE_JSON_INVALID');keys.add(key);ws();if(source[i++]!==':')fail('WORKSPACE_JSON_INVALID');result[key]=value(depth+1);ws();const end=source[i++];if(end==='}')return result;if(end!==',')fail('WORKSPACE_JSON_INVALID');}}if(c==='['){i++;ws();const result=[];if(source[i]===']'){i++;return result;}while(true){result.push(value(depth+1));ws();const end=source[i++];if(end===']')return result;if(end!==',')fail('WORKSPACE_JSON_INVALID');}}for(const [token,out] of [['true',true],['false',false],['null',null]])if(source.startsWith(token,i)){i+=token.length;return out;}const match=source.slice(i).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);if(!match)fail('WORKSPACE_JSON_INVALID');i+=match[0].length;const n=Number(match[0]);if(!Number.isFinite(n))fail('WORKSPACE_JSON_INVALID');return n;}
 const result=value(0);ws();if(i!==source.length)fail('WORKSPACE_JSON_INVALID');return result;
}
async function readJSON(request,bodyTimeoutMs){
 if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type')??''))fail('WORKSPACE_JSON_REQUIRED',415);
 const declared=request.headers.get('content-length');if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>MAX_BYTES))fail('WORKSPACE_TOO_LARGE',413);if(!request.body)fail('WORKSPACE_JSON_INVALID');
 const reader=request.body.getReader(),parts=[];let length=0,timer;const now=performance.now.bind(performance),expiresAt=now()+bodyTimeoutMs;
 const checkDeadline=()=>{const current=now();if(!Number.isFinite(current)||current>=expiresAt)fail('WORKSPACE_BODY_TIMEOUT',408);};
 const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new WorkspaceError(408,'WORKSPACE_BODY_TIMEOUT')),bodyTimeoutMs);});
 try{while(true){checkDeadline();const chunk=await Promise.race([reader.read(),deadline]);checkDeadline();if(chunk.done)break;if(!(chunk.value instanceof Uint8Array))fail('WORKSPACE_JSON_INVALID');length+=chunk.value.byteLength;if(length>MAX_BYTES)fail('WORKSPACE_TOO_LARGE',413);if(chunk.value.byteLength)parts.push(new Uint8Array(chunk.value));}checkDeadline();const bytes=new Uint8Array(length);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.byteLength;}checkDeadline();let source;try{source=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{fail('WORKSPACE_JSON_INVALID');}checkDeadline();const parsed=parseJSON(source);checkDeadline();return parsed;}
 catch(error){try{reader.cancel().catch(()=>{});}catch{}if(error instanceof WorkspaceError)throw error;fail('WORKSPACE_BODY_UNAVAILABLE',400);}
 finally{clearTimeout(timer);try{reader.releaseLock();}catch{}}
}
/** No authentication implementation here. Caller supplies a trusted server resolver.
 * The resolver must ignore all user-supplied owner fields and must be bound to the
 * same private Site DB. This library never claims raw headers authenticate users.
 */
export function createEditorWorkspaceApi({repository,siteOrigin,authenticateRequest,bodyTimeoutMs=5000,allowLoopbackHttp=false}={}){
 let origin;try{origin=new URL(siteOrigin);if(typeof allowLoopbackHttp!=='boolean'||origin.origin!==siteOrigin||origin.username||origin.password)throw Error();const protocolOK=origin.protocol==='https:'||(allowLoopbackHttp&&origin.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(origin.hostname));if(!protocolOK)throw Error();}catch{fail('WORKSPACE_CONFIG_INVALID',503);}
 if(!isWorkspaceRepository(repository)||typeof authenticateRequest!=='function'||!Number.isInteger(bodyTimeoutMs)||bodyTimeoutMs<10||bodyTimeoutMs>10000)fail('WORKSPACE_CONFIG_INVALID',503);
 return async function handleEditorWorkspaceRequest(request){
  let url;try{url=new URL(request.url);}catch{return json({error:{code:'WORKSPACE_REQUEST_INVALID'}},400);}
  if(url.pathname!==PREFIX&&!url.pathname.startsWith(PREFIX+'/'))return null;
  try{
   if(url.origin!==origin.origin||url.search||url.hash)fail('WORKSPACE_REQUEST_INVALID',400);
   if(request.headers.get('Sec-Fetch-Site')==='cross-site')fail('WORKSPACE_CROSS_ORIGIN',403);
   const method=request.method;if(method!=='GET'){
    if(request.headers.get('Origin')!==origin.origin||request.headers.get('X-Planner-Request')!=='1')fail('WORKSPACE_CROSS_ORIGIN',403);
   }
   let owner;try{owner=await authenticateRequest(request);}catch{fail('SIGN_IN_REQUIRED',401);}ownerId(owner);
   if(url.pathname===PREFIX&&method==='GET')return json(await repository.list(owner));
   const match=url.pathname.slice(PREFIX.length).match(/^\/([A-Za-z0-9_-]{16,100})(\/discard)?$/);if(!match)fail('WORKSPACE_ROUTE_NOT_FOUND',404);const workspaceId=mutationId(match[1]);
   if(!match[2]&&method==='GET')return json(await repository.load(owner,workspaceId));
   if(!match[2]&&method==='PUT'){const b=ownSnapshot(await readJSON(request,bodyTimeoutMs),['schemaVersion','expectedRevision','writeId','sourcePostId','basePlannerRevision','payload']);return json(await repository.save(owner,{...b,workspaceId}));}
   if(match[2]&&method==='POST'){const b=ownSnapshot(await readJSON(request,bodyTimeoutMs),['schemaVersion','expectedRevision','writeId']);return json(await repository.discard(owner,{...b,workspaceId}));}
   fail('WORKSPACE_METHOD_NOT_ALLOWED',405);
  }catch(error){if(error instanceof WorkspaceError)return json({error:{code:error.code,...(error.details?{details:error.details}:{})}},error.status);return json({error:{code:'WORKSPACE_UNAVAILABLE'}},503);}
 };
}
