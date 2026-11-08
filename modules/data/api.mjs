import {PlannerRepository} from './repository.mjs';
import {PlannerError,LIMITS,validId,resolveLocalTime} from './domain.mjs';
const PREFIX='/api/planner';
const HEADERS={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Vary':'oai-authenticated-user-id'};
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:HEADERS});}
function principal(request){
  // Only deploy behind Sites Dispatch, which owns authentication and injects
  // this header. Never derive ownership from JSON, URL, email, or localStorage.
  const owner=request.headers.get('oai-authenticated-user-id');
  if(!owner||!owner.trim()||owner.length>256)throw new PlannerError(401,'SIGN_IN_REQUIRED','Bitte mit ChatGPT anmelden.');
  return owner;
}
function mutationGuard(request){
  const origin=request.headers.get('Origin');
  if((origin&&origin!==new URL(request.url).origin)||request.headers.get('Sec-Fetch-Site')==='cross-site'||request.headers.get('X-Planner-Request')!=='1')throw new PlannerError(403,'CROSS_ORIGIN_REQUEST','Diese Anfrage ist nicht erlaubt.');
}
async function bytes(request,max){
  const reported=Number(request.headers.get('content-length'));
  if(Number.isFinite(reported)&&reported>max)throw new PlannerError(413,'PAYLOAD_TOO_LARGE','Die Datei oder Anfrage ist zu groß.');
  if(!request.body)return new Uint8Array();
  const reader=request.body.getReader();const parts=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();throw new PlannerError(413,'PAYLOAD_TOO_LARGE','Die Datei oder Anfrage ist zu groß.');}parts.push(value);}}finally{reader.releaseLock();}
  const result=new Uint8Array(size);let offset=0;for(const p of parts){result.set(p,offset);offset+=p.length;}return result;
}
async function bodyJSON(request){if(request.headers.get('content-type')?.split(';')[0]!=='application/json')throw new PlannerError(415,'JSON_REQUIRED','JSON erwartet.');try{return JSON.parse(new TextDecoder().decode(await bytes(request,LIMITS.jsonBytes)));}catch(e){if(e instanceof PlannerError)throw e;throw new PlannerError(400,'INVALID_JSON','Ungültiges JSON.');}}
function namedHeader(request,key,max,fallback=''){let value=request.headers.get(key);if(value==null)return fallback;try{value=decodeURIComponent(value);}catch{throw new PlannerError(400,'INVALID_HEADER','Ungültige Dateiinformation.');}if(value.length>max||/[\u0000-\u001f\u007f]/.test(value))throw new PlannerError(400,'INVALID_HEADER','Ungültige Dateiinformation.');return value;}
function validMediaSignature(bytes,mime){
  const at=(arr,index=0)=>arr.every((b,i)=>bytes[index+i]===b);const ascii=(text,index=0)=>at([...text].map(c=>c.charCodeAt(0)),index);
  return (mime==='image/png'&&at([137,80,78,71,13,10,26,10]))||(mime==='image/jpeg'&&at([255,216,255]))||(mime==='image/gif'&&(ascii('GIF87a')||ascii('GIF89a')))||(mime==='image/webp'&&ascii('RIFF')&&ascii('WEBP',8))||(mime==='video/mp4'&&ascii('ftyp',4))||(mime==='video/webm'&&at([0x1a,0x45,0xdf,0xa3]));
}
/** Returns null for non-planner routes; integrate before the app's normal router. */
export async function handlePlannerRequest(request,env){
  const url=new URL(request.url);if(url.pathname!==PREFIX&&!url.pathname.startsWith(PREFIX+'/'))return null;
  try{
    const owner=principal(request);if(!['GET','HEAD'].includes(request.method))mutationGuard(request);
    const repo=new PlannerRepository(env.DB,{hasBucket:!!env.BUCKET});
    const path=url.pathname.slice(PREFIX.length);
    if(path==='/state'&&request.method==='GET')return json(await repo.load(owner));
    if(path==='/state'&&request.method==='PUT')return json(await repo.save(owner,await bodyJSON(request)));
    if(path==='/resolve-time'&&request.method==='POST'){const body=await bodyJSON(request);return json({scheduledAt:resolveLocalTime(body.local,body.timezone,body.disambiguation)});}
    if(path==='/media'&&request.method==='POST'){
      if(!env.BUCKET)throw new PlannerError(503,'MEDIA_UNAVAILABLE','Medienspeicher ist noch nicht verfügbar.');
      const mimeType=request.headers.get('content-type')?.split(';')[0]??'';
      if(!['image/png','image/jpeg','image/gif','image/webp','video/mp4','video/webm'].includes(mimeType))throw new PlannerError(415,'UNSUPPORTED_MEDIA','Erlaubt sind PNG, JPEG, GIF, WebP, MP4 und WebM.');
      const filename=namedHeader(request,'X-Planner-File-Name',255,'Medium');const altText=namedHeader(request,'X-Planner-Alt-Text',2000);
      const content=await bytes(request,LIMITS.uploadBytes);
      if(!content.byteLength||!validMediaSignature(content,mimeType))throw new PlannerError(415,'INVALID_MEDIA','Dateiinhalt und Dateityp passen nicht zusammen.');
      const id=crypto.randomUUID();const key=`planner-media/${crypto.randomUUID()}/${id}`;
      await env.BUCKET.put(key,content,{httpMetadata:{contentType:mimeType}});
      try{return json(await repo.addMedia(owner,{id,key,filename,mimeType,size:content.byteLength,altText}),201);}
      catch(error){try{await env.BUCKET.delete(key);}catch{/* Private orphan may need later operator cleanup; never expose its key. */}throw error;}
    }
    const mediaMatch=path.match(/^\/media\/([A-Za-z0-9_-]{1,100})$/);
    if(mediaMatch&&['GET','HEAD'].includes(request.method)){
      if(!env.BUCKET)throw new PlannerError(503,'MEDIA_UNAVAILABLE','Medienspeicher ist noch nicht verfügbar.');
      const media=await repo.getMedia(owner,validId(mediaMatch[1]));
      if(!media)throw new PlannerError(404,'NOT_FOUND','Medium nicht gefunden.');
      const object=await env.BUCKET.get(media.object_key);
      if(!object)throw new PlannerError(404,'NOT_FOUND','Medium nicht gefunden.');
      return new Response(request.method==='HEAD'?null:object.body,{headers:{'Content-Type':media.mime_type,'Content-Length':String(media.byte_size),'Content-Disposition':`inline; filename*=UTF-8''${encodeURIComponent(media.filename)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Vary':'oai-authenticated-user-id'}});
    }
    return json({error:{code:'NOT_FOUND',message:'Planer-Endpunkt nicht gefunden.'}},404);
  }catch(error){if(error instanceof PlannerError)return json({error:{code:error.code,message:error.message,...(error.details?{details:error.details}:{})}},error.status);
    // Never send SQL, tokens, internal object keys, or raw exceptions to the browser.
    return json({error:{code:'STORAGE_ERROR',message:'Die Änderung konnte nicht sicher gespeichert werden. Bitte erneut laden und prüfen.'}},500);
  }
}
