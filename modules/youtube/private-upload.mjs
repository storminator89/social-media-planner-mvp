/** Server-only explicitly approved YouTube uploads. No scheduler, OAuth
 * defaults, automatic retries or browser-supplied session URLs. */
export const YOUTUBE_PRIVATE_LIMITS=Object.freeze({mediaBytes:8*1024*1024,chunkBytes:1024*1024,responseBytes:65536,stepMs:20000});
export const YOUTUBE_UPLOAD_CAPABILITIES=Object.freeze({provider:'youtube',privacy:Object.freeze(['private','public','unlisted']),publicPublishing:true,nativeScheduling:false,automaticRetries:false,liveVerified:false});
const API='https://www.googleapis.com/youtube/v3',UPLOAD='https://www.googleapis.com/upload/youtube/v3/videos';
const CHANNEL=/^UC[A-Za-z0-9_-]{22}$/,VIDEO=/^[A-Za-z0-9_-]{11}$/,ID=/^[A-Za-z0-9_-]{1,100}$/;
const enc=new TextEncoder();
export class YouTubeUploadError extends Error{constructor(code){super('Der Upload konnte nicht sicher verarbeitet werden.');this.code=code;}}
function fail(code){throw new YouTubeUploadError(code);}
function own(v,k){return Object.hasOwn(v,k);}
function wellFormed(v){return typeof v==='string'&&v.isWellFormed();}
function integer(v,min,max){return Number.isSafeInteger(v)&&v>=min&&v<=max;}
function record(v){return v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));}
function snapshot(v,allowed,required=allowed){
 if(!record(v))fail('INVALID_INPUT');const desc=Object.getOwnPropertyDescriptors(v);
 if(Reflect.ownKeys(desc).some(k=>typeof k!=='string'||!allowed.includes(k)||!desc[k].enumerable||!own(desc[k],'value'))||required.some(k=>!own(desc,k)))fail('UNSUPPORTED_FIELDS');
 return Object.fromEntries(Object.keys(desc).map(k=>[k,desc[k].value]));
}
function array(v){if(!Array.isArray(v)||Object.getPrototypeOf(v)!==Array.prototype||v.length>500)fail('INVALID_TAGS');const d=Object.getOwnPropertyDescriptors(v);if(Reflect.ownKeys(d).some(k=>typeof k!=='string'||(k!=='length'&&(!/^(0|[1-9][0-9]*)$/.test(k)||!own(d[k],'value')))))fail('INVALID_TAGS');const out=[];for(let i=0;i<v.length;i++){if(!own(d,String(i)))fail('INVALID_TAGS');out.push(d[i].value);}return out;}
function freeze(v){if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
async function digest(v){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(v)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function preparePrivateYouTubeUpload(input){
 const v=snapshot(input,['operationId','channelId','title','description','tags','categoryId','madeForKids','containsSyntheticMedia','privacyStatus','media'],['operationId','channelId','title','categoryId','madeForKids','containsSyntheticMedia','media']);
 if(v.privacyStatus!==undefined&&!['private','public','unlisted'].includes(v.privacyStatus))fail('INVALID_VISIBILITY');
 const m=snapshot(v.media,['size','mimeType','sha256']);const tags=v.tags===undefined?[]:array(v.tags);const description=v.description===undefined?'':v.description;
 if(typeof v.operationId!=='string'||!ID.test(v.operationId)||typeof v.channelId!=='string'||!CHANNEL.test(v.channelId))fail('INVALID_TARGET');
 if(!wellFormed(v.title)||!v.title.trim()||[...v.title].length>100||/[<>]/.test(v.title))fail('INVALID_TITLE');
 if(!wellFormed(description)||enc.encode(description).length>5000||/[<>]/.test(description))fail('INVALID_DESCRIPTION');
 if(typeof v.categoryId!=='string'||!/^\d{1,5}$/.test(v.categoryId))fail('CATEGORY_REQUIRED');
 if(typeof v.madeForKids!=='boolean'||typeof v.containsSyntheticMedia!=='boolean')fail('EXPLICIT_DISCLOSURES_REQUIRED');
 if(tags.some(t=>!wellFormed(t)||!t.trim()||/[<>]/.test(t))||tags.reduce((n,t)=>n+[...t].length+(/\s/.test(t)?2:0),Math.max(0,tags.length-1))>500)fail('INVALID_TAGS');
 if(!integer(m.size,1,YOUTUBE_PRIVATE_LIMITS.mediaBytes)||!['video/mp4','video/webm'].includes(m.mimeType)||typeof m.sha256!=='string'||!/^[a-f0-9]{64}$/.test(m.sha256))fail('INVALID_SERVER_MEDIA');
 const op={operationId:v.operationId,channelId:v.channelId,media:{size:m.size,mimeType:m.mimeType,sha256:m.sha256},metadata:{snippet:{title:v.title,description,tags,categoryId:v.categoryId},status:{privacyStatus:v.privacyStatus??'private',selfDeclaredMadeForKids:v.madeForKids,containsSyntheticMedia:v.containsSyntheticMedia}},notifySubscribers:false};
 op.fingerprint=await digest(JSON.stringify(op));return freeze(op);
}
export function validateYouTubeSessionURL(value){
 if(typeof value!=='string'||value.length>4096||value.includes('#')||!value.isWellFormed()||/[\u0000-\u001f\u007f]/.test(value))fail('INVALID_SESSION');let u;try{u=new URL(value);}catch{fail('INVALID_SESSION');}
 if(u.origin!=='https://www.googleapis.com'||u.pathname!=='/upload/youtube/v3/videos'||u.username||u.password||u.href!==value||u.port||u.searchParams.getAll('uploadType').length!==1||u.searchParams.get('uploadType')!=='resumable'||u.searchParams.getAll('upload_id').length!==1||!/^[A-Za-z0-9_-]{1,3000}$/.test(u.searchParams.get('upload_id')??'')||[...u.searchParams.keys()].some(k=>!['uploadType','upload_id','part'].includes(k)||u.searchParams.getAll(k).length!==1)||(u.searchParams.has('part')&&!/^[A-Za-z,]{1,100}$/.test(u.searchParams.get('part'))))fail('INVALID_SESSION');return value;
}
function stepBudget(ms){const controller=new AbortController(),expires=performance.now()+ms;let timer;const check=()=>{if(controller.signal.aborted||performance.now()>=expires){controller.abort();fail('STEP_OUTCOME_UNKNOWN');}};const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new YouTubeUploadError('STEP_OUTCOME_UNKNOWN'));},ms);});return{signal:controller.signal,check,async run(fn){check();const value=await Promise.race([Promise.resolve().then(()=>{check();return fn();}),timeout]);check();return value;},close(){clearTimeout(timer);controller.abort();}};}
function retryAfter(response,now){const v=response.headers.get('Retry-After');if(!v)return null;const at=/^\d+$/.test(v)?now+Number(v)*1000:Date.parse(v);return Number.isSafeInteger(at)&&at>=now&&at<=now+7*86400000?new Date(at).toISOString():null;}

function parseUniqueJSON(text) {
  let at = 0, nodes = 0;
  const bad = () => fail('RESPONSE_MALFORMED');
  function space() { while (at < text.length && /[\x20\t\r\n]/.test(text[at])) at++; }
  function string() {
    if (text[at] !== '"') bad();
    const start = at++;
    while (at < text.length) {
      const character = text[at++];
      if (character === '\\') { at++; continue; }
      if (character === '"') {
        let value;
        try { value = JSON.parse(text.slice(start, at)); } catch { bad(); }
        if (!wellFormed(value)) bad();
        return value;
      }
    }
    bad();
  }
  function value(depth) {
    if (++nodes > 4096 || depth > 16) bad();
    space();
    if (text[at] === '"') return string();
    if (text[at] === '{') {
      at++; space();
      const result = Object.create(null);
      if (text[at] === '}') { at++; return result; }
      while (at < text.length) {
        space(); const key = string(); space();
        if (own(result, key) || text[at++] !== ':') bad();
        result[key] = value(depth + 1); space();
        const end = text[at++];
        if (end === '}') return result;
        if (end !== ',') bad();
      }
      bad();
    }
    if (text[at] === '[') {
      at++; space(); const result = [];
      if (text[at] === ']') { at++; return result; }
      while (at < text.length) {
        result.push(value(depth + 1)); space();
        const end = text[at++];
        if (end === ']') return result;
        if (end !== ',') bad();
      }
      bad();
    }
    for (const [literal, result] of [['true', true], ['false', false], ['null', null]]) {
      if (text.startsWith(literal, at)) { at += literal.length; return result; }
    }
    const number = text.slice(at).match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/);
    if (!number || !Number.isFinite(Number(number[0]))) bad();
    at += number[0].length; return Number(number[0]);
  }
  const result = value(0); space();
  if (at !== text.length || !result || Array.isArray(result) || typeof result !== 'object') bad();
  return result;
}

async function boundedReply(response,url,ctx){
 if(!(response instanceof Response)||response.url!==url||response.redirected!==false||['opaque','opaqueredirect'].includes(response.type)||!integer(response.status,100,599)||(response.status>=300&&response.status<400&&response.status!==308))fail('RESPONSE_ORIGIN_INVALID');
 const declared=response.headers.get('Content-Length');if(declared!==null&&(!/^(0|[1-9][0-9]*)$/.test(declared)||Number(declared)>YOUTUBE_PRIVATE_LIMITS.responseBytes))fail('RESPONSE_TOO_LARGE');
 if(!response.body)return null;const reader=response.body.getReader(),parts=[];let size=0;
 try{while(true){const {done,value}=await ctx.run(()=>reader.read());if(done)break;if(!(value instanceof Uint8Array))fail('RESPONSE_MALFORMED');size+=value.byteLength;if(size>YOUTUBE_PRIVATE_LIMITS.responseBytes)fail('RESPONSE_TOO_LARGE');parts.push(new Uint8Array(value));}}
 catch(e){try{void reader.cancel().catch(()=>{});}catch{}throw e;}finally{try{reader.releaseLock();}catch{}}
 ctx.check();if(!size)return null;
 if(!/^application\/json(?:\s*;\s*charset\s*=\s*"?utf-8"?)?\s*$/i.test(response.headers.get('Content-Type')??''))fail('RESPONSE_TYPE_INVALID');
 const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.byteLength;}
 const data=parseUniqueJSON(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes));ctx.check();return data;
}
function uncertain(code='PROVIDER_OUTCOME_UNKNOWN'){return{state:'unknown',code,nextAction:'manual_reconciliation_no_reupload'};}
function providerFailure(reply,phase){
 const base={state:'unknown',code:'PROVIDER_OUTCOME_UNKNOWN',nextAction:phase==='start'?'manual_reconciliation_no_reupload':'probe_same_session',retryAt:reply.retryAt??null};
 // Malformed/redirect/transport and 5xx remain uncertain regardless of a body code.
 if(reply.failed||reply.malformed||!integer(reply.status,100,599)||reply.status>=500||reply.status>=300&&reply.status<400)return base;
 if(reply.status===401)return{...base,state:'auth_required',code:'CREDENTIALS_REQUIRED'};
 if(reply.status===404||reply.status===410)return{...base,code:'SESSION_NOT_FOUND_OR_EXPIRED',nextAction:'manual_reconciliation_no_reupload'};
 const reason=reply.data?.error?.errors?.[0]?.reason;
 if(reply.status===429)return{...base,state:'rate_limited',code:'RATE_LIMITED'};
 if(reply.status===403&&['quotaExceeded','dailyLimitExceeded','uploadLimitExceeded'].includes(reason))return{...base,state:'quota_exceeded',code:'QUOTA_EXCEEDED'};
 if(reply.status===403)return{...base,state:'blocked',code:'PROVIDER_PERMISSION_DENIED'};
 return base;
}
function videoResult(data,op){
 if(!record(data)||typeof data.id!=='string'||!VIDEO.test(data.id)||data.snippet?.channelId!==op.channelId)return{...uncertain('VIDEO_IDENTITY_NOT_VERIFIED'),nextAction:'probe_same_session'};
 if(data.status?.privacyStatus!==op.metadata.status.privacyStatus||own(data.status,'publishAt'))return{...uncertain('UNEXPECTED_PROVIDER_VISIBILITY'),videoId:data.id};
 return{state:'upload_accepted',videoId:data.id,privacyStatus:op.metadata.status.privacyStatus,processingStatus:'unknown',nextAction:'inspect_video'};
}
/** Each invocation has one total monotonic budget. Repository claims must be
 * durable; their expiry/crash recovery may only permit a probe of a known session.
 * Dependency code is server-owned. No request or job can inject these callbacks. */
export function createPrivateYouTubeUploadAdapter(options={}){
 const v=snapshot(options,['enabled','authorizedFetch','authorizeOperation','repository','readMediaChunk','now','stepMs','chunkBytes'],[]);
 if(v.enabled!==true)return Object.freeze({enabled:false,capabilities:YOUTUBE_UPLOAD_CAPABILITIES});
 const {authorizedFetch,authorizeOperation,readMediaChunk}=v,clock=v.now??Date.now,stepMs=v.stepMs??YOUTUBE_PRIVATE_LIMITS.stepMs,chunkBytes=v.chunkBytes??YOUTUBE_PRIVATE_LIMITS.chunkBytes;
 const source=v.repository,repo={};for(const name of ['reserveStart','reserveNext','finish','assertLease']){if(typeof source?.[name]!=='function')fail('TRUSTED_DEPENDENCIES_REQUIRED');repo[name]=source[name].bind(source);}
 if([authorizedFetch,authorizeOperation,readMediaChunk,clock].some(x=>typeof x!=='function')||!integer(stepMs,1,30000)||!integer(chunkBytes,262144,YOUTUBE_PRIVATE_LIMITS.mediaBytes)||chunkBytes%262144)fail('TRUSTED_DEPENDENCIES_REQUIRED');
 const now=()=>{const n=clock();if(!integer(n,0,Number.MAX_SAFE_INTEGER-7*86400000))fail('INVALID_CLOCK');return n;};
 async function step(action){const ctx=stepBudget(stepMs);try{return await action(ctx);}catch{return uncertain('STEP_OUTCOME_UNKNOWN');}finally{ctx.close();}}
 async function permitted(ctx,op){if(await ctx.run(()=>authorizeOperation(op))!==true)fail('UPLOAD_NOT_AUTHORIZED');}
 async function fence(ctx,lease){if(await ctx.run(()=>repo.assertLease(lease))!==true)fail('UPLOAD_FENCE_CHANGED');return true;}
 async function finish(ctx,lease,checkpoint,result){try{if(await ctx.run(()=>repo.finish(lease,{...checkpoint,outcomeCode:result.code??null,manualReconciliation:result.nextAction==='manual_reconciliation_no_reupload'}))!==true)return uncertain('CHECKPOINT_NOT_CONFIRMED');return result;}catch{return uncertain('CHECKPOINT_NOT_CONFIRMED');}}
 async function request(ctx,method,url,headers={},body,lease=null){
  try{ctx.check();const response=await ctx.run(()=>authorizedFetch(url,{method,headers:{Accept:'application/json',...headers},...(body===undefined?{}:{body}),redirect:'error',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal:ctx.signal},Object.freeze({beforeSend:lease?()=>fence(ctx,lease):null})));
   // Never trust status/body-derived codes until final Response provenance holds.
   if(!(response instanceof Response)||response.url!==url||response.redirected!==false||['opaque','opaqueredirect'].includes(response.type)||(response.status>=300&&response.status<400&&response.status!==308))return{failed:true};
   const common={status:response.status,location:response.headers.get('Location'),range:response.headers.get('Range'),retryAt:retryAfter(response,now())};
   try{return{...common,data:await boundedReply(response,url,ctx)};}catch{return{...common,malformed:true};}
  }catch{return{failed:true};}
 }
 async function reserve(ctx,id,action){
  if(typeof id!=='string'||!ID.test(id))fail('INVALID_OPERATION');const saved=await ctx.run(()=>repo.reserveNext(id,action));if(!saved)return null;
  const {operation:op,checkpoint:cp,lease}=saved;
  if(op?.operationId!==id||!['private','public','unlisted'].includes(op?.metadata?.status?.privacyStatus)||own(op.metadata.status,'publishAt')||op.notifySubscribers!==false||!['session_ready','unknown','auth_required','rate_limited','quota_exceeded','blocked'].includes(cp?.state))fail('INVALID_CHECKPOINT');
  validateYouTubeSessionURL(cp.sessionUrl);
  if(!integer(cp.nextOffset,0,op.media.size-1)||!integer(cp.chunkBytes,262144,YOUTUBE_PRIVATE_LIMITS.mediaBytes)||cp.chunkBytes%262144)fail('INVALID_CHECKPOINT');
  await fence(ctx,lease);return saved;
 }
 async function uploadReply(ctx,lease,op,cp,reply,phase,lastByte=null){
  if((reply.status===200||reply.status===201)&&!reply.malformed&&!reply.failed){
   if(phase==='upload'&&lastByte!==op.media.size-1)return finish(ctx,lease,{...cp,state:'unknown'},{...uncertain('PREMATURE_COMPLETION'),nextAction:'probe_same_session'});
   const result=videoResult(reply.data,op);return finish(ctx,lease,{...cp,state:result.state,videoId:result.videoId??null,nextOffset:result.state==='upload_accepted'?op.media.size:cp.nextOffset},result);
  }
  if(reply.status===308&&!reply.malformed&&!reply.failed){
   const m=/^bytes=0-(\d+)$/.exec(reply.range??'');const offset=reply.range===null?0:m?Number(m[1])+1:NaN;
   if(integer(offset,cp.nextOffset,op.media.size-1)&&(lastByte===null||offset<=lastByte+1))return finish(ctx,lease,{...cp,state:'session_ready',nextOffset:offset,retryAt:reply.retryAt??null},{state:'session_ready',uploadedBytes:offset,totalBytes:op.media.size,retryAt:reply.retryAt??null,nextAction:'upload_next_chunk'});
  }
  const result=providerFailure(reply,phase);return finish(ctx,lease,{...cp,state:result.state,retryAt:result.retryAt??null},result);
 }
 return Object.freeze({enabled:true,capabilities:YOUTUBE_UPLOAD_CAPABILITIES,
  async initiateOnce(input){return step(async ctx=>{
   const op=await ctx.run(()=>preparePrivateYouTubeUpload(input));await permitted(ctx,op);
   const identity=await request(ctx,'GET',API+'/channels?part=id&mine=true');
   if(identity.status!==200||identity.failed||identity.malformed||!Array.isArray(identity.data?.items)||identity.data.items.length!==1||identity.data.items[0]?.id!==op.channelId||identity.data.nextPageToken)return{state:'blocked',code:'AUTHENTICATED_CHANNEL_NOT_VERIFIED'};
   await permitted(ctx,op);const lease=await ctx.run(()=>repo.reserveStart(op));if(!lease)return{state:'blocked',code:'OPERATION_ALREADY_RESERVED'};
   await permitted(ctx,op);await fence(ctx,lease);
   const reply=await request(ctx,'POST',UPLOAD+'?uploadType=resumable&part=snippet%2Cstatus%2CprocessingDetails&notifySubscribers=false',{'Content-Type':'application/json; charset=UTF-8','X-Upload-Content-Length':String(op.media.size),'X-Upload-Content-Type':op.media.mimeType},JSON.stringify(op.metadata),lease);
   if(reply.status===200&&!reply.failed&&!reply.malformed){let session;try{session=validateYouTubeSessionURL(reply.location);}catch{}
    if(session)return finish(ctx,lease,{state:'session_ready',sessionUrl:session,nextOffset:0,chunkBytes,retryAt:null},{state:'session_ready',uploadedBytes:0,totalBytes:op.media.size,nextAction:'upload_next_chunk'});
   }
   const result=providerFailure(reply,'start');return finish(ctx,lease,{state:result.state,sessionUrl:null,nextOffset:0,chunkBytes,retryAt:result.retryAt??null},result);
  });},
  async uploadNextChunk(id){return step(async ctx=>{
   const saved=await reserve(ctx,id,'upload');if(!saved)return{state:'blocked',code:'OPERATION_BUSY_OR_NOT_FOUND'};const {lease,operation:op,checkpoint:cp}=saved;
   if(cp.state!=='session_ready')return finish(ctx,lease,cp,{state:'blocked',code:'PROBE_REQUIRED_BEFORE_UPLOAD',nextAction:'probe_same_session'});
   if(cp.retryAt&&Date.parse(cp.retryAt)>now())return finish(ctx,lease,cp,{state:'rate_limited',code:'RETRY_AFTER_NOT_REACHED',retryAt:cp.retryAt});
   await permitted(ctx,op);await fence(ctx,lease);
   const length=Math.min(cp.chunkBytes,op.media.size-cp.nextOffset),delivered=await ctx.run(()=>readMediaChunk({sha256:op.media.sha256,offset:cp.nextOffset,length}));
   if(!(delivered instanceof Uint8Array)||delivered.byteLength!==length)fail('MEDIA_CHUNK_MISMATCH');const bytes=new Uint8Array(delivered);
   await permitted(ctx,op);await fence(ctx,lease);const end=cp.nextOffset+length-1;
   const reply=await request(ctx,'PUT',cp.sessionUrl,{'Content-Type':op.media.mimeType,'Content-Length':String(length),'Content-Range':`bytes ${cp.nextOffset}-${end}/${op.media.size}`},bytes,lease);
   return uploadReply(ctx,lease,op,cp,reply,'upload',end);
  });},
  async probeUpload(id){return step(async ctx=>{
   const saved=await reserve(ctx,id,'probe');if(!saved)return{state:'blocked',code:'OPERATION_BUSY_OR_NOT_FOUND'};const {lease,operation:op,checkpoint:cp}=saved;
   if(cp.retryAt&&Date.parse(cp.retryAt)>now())return finish(ctx,lease,cp,{state:'rate_limited',code:'RETRY_AFTER_NOT_REACHED',retryAt:cp.retryAt});
   await fence(ctx,lease);const reply=await request(ctx,'PUT',cp.sessionUrl,{'Content-Length':'0','Content-Range':`bytes */${op.media.size}`},undefined,lease);return uploadReply(ctx,lease,op,cp,reply,'probe');
  });},
  async inspectVideo({videoId,channelId,privacyStatus='private'}={}){const result=await step(async ctx=>{
   if(!['private','public','unlisted'].includes(privacyStatus)||typeof videoId!=='string'||!VIDEO.test(videoId)||typeof channelId!=='string'||!CHANNEL.test(channelId))fail('INVALID_VIDEO_REFERENCE');
   const reply=await request(ctx,'GET',API+`/videos?part=snippet%2Cstatus%2CprocessingDetails&id=${videoId}`);
   if(reply.status!==200||reply.failed||reply.malformed||!Array.isArray(reply.data?.items))return{state:'check_failed',code:'VIDEO_CHECK_FAILED'};
   if(!reply.data.items.length)return{state:'not_found',code:'VIDEO_NOT_FOUND_AT_CHECK_TIME'};
   const x=reply.data.items[0];if(reply.data.items.length!==1||!record(x)||x.id!==videoId||x.snippet?.channelId!==channelId||!record(x.status)||own(x,'processingDetails')&&!record(x.processingDetails))return{state:'check_failed',code:'VIDEO_IDENTITY_NOT_VERIFIED'};
   if(x.status.privacyStatus!==privacyStatus||own(x.status,'publishAt'))return{state:'check_failed',code:'UNEXPECTED_PROVIDER_VISIBILITY'};
   const upload=x.status.uploadStatus,processing=x.processingDetails?.processingStatus;const state=['failed','rejected','deleted'].includes(upload)||['failed','terminated'].includes(processing)?'processing_failed':processing==='succeeded'||upload==='processed'?(privacyStatus==='private'?'private_ready':'video_ready'):'processing_or_unknown';
   return{state,videoId,privacyStatus,processingStatus:['succeeded','processing','failed','terminated'].includes(processing)?processing:'unknown',uploadStatus:['uploaded','processed','failed','rejected','deleted'].includes(upload)?upload:'unknown'};
  });return result.state==='unknown'?{state:'check_failed',code:'VIDEO_CHECK_FAILED'}:result;}
 });
}
