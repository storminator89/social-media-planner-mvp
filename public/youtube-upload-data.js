/** Private upload DTOs and fixed same-origin requests. No session URLs or credentials. */
import {ytExact,ytInteger,youtubeUIError} from './youtube-auth.js';
export const YT_MAX_BYTES=8388608,YT_MAX_FILES=20;
const fail=()=>{throw youtubeUIError();};
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(v),hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const text=v=>typeof v==='string'&&v.isWellFormed(),channel=v=>typeof v==='string'&&/^UC[A-Za-z0-9_-]{22}$/.test(v);
const iso=v=>typeof v==='string'&&Number.isSafeInteger(Date.parse(v))&&new Date(v).toISOString()===v;
export function validateYouTubeFile(file){if(!(file instanceof Blob)||!['video/mp4','video/webm'].includes(file.type)||!ytInteger(file.size)||file.size<1||file.size>YT_MAX_BYTES||!text(file.name)||file.name.length<1||file.name.length>255||/[\u0000-\u001f\u007f]/.test(file.name))throw new Error('Bitte eine MP4- oder WebM-Datei mit 1 Byte bis 8 MiB und gültigem Dateinamen wählen.');return file;}
export function normalizeYouTubeMedia(v){if(!ytExact(v,['mediaId','filename','byteSize','mimeType','sha256','createdAtMs'])||!id(v.mediaId)||!text(v.filename)||v.filename.length<1||v.filename.length>255||/[\u0000-\u001f\u007f]/.test(v.filename)||!ytInteger(v.byteSize)||v.byteSize<1||v.byteSize>YT_MAX_BYTES||!['video/mp4','video/webm'].includes(v.mimeType)||!hash(v.sha256)||!ytInteger(v.createdAtMs))fail();return {...v};}
export function normalizeYouTubeMetadata(v){
 if(!ytExact(v,['title','description','tags','categoryId','madeForKids','containsSyntheticMedia'])||!text(v.title)||!v.title.trim()||[...v.title].length>100||/[<>]/.test(v.title)||!text(v.description)||new TextEncoder().encode(v.description).length>5000||/[<>]/.test(v.description)||typeof v.categoryId!=='string'||!/^\d{1,5}$/.test(v.categoryId)||typeof v.madeForKids!=='boolean'||typeof v.containsSyntheticMedia!=='boolean'||!Array.isArray(v.tags)||v.tags.length>500||v.tags.some(t=>!text(t)||!t.trim()||/[<>]/.test(t))||v.tags.reduce((n,t)=>n+[...t].length+(/\s/.test(t)?2:0),Math.max(0,v.tags.length-1))>500)fail();
 return {...v,tags:[...v.tags]};
}
export function metadataFromDraft(v){return normalizeYouTubeMetadata({title:v.title,description:v.description,tags:v.tagsText?v.tagsText.split(/\r?\n/).filter(t=>t!==''):[],categoryId:v.categoryId,madeForKids:v.madeForKids==='yes'?true:v.madeForKids==='no'?false:null,containsSyntheticMedia:v.containsSyntheticMedia==='yes'?true:v.containsSyntheticMedia==='no'?false:null});}
const STATES=['prepared','approved','in_flight','session_ready','unknown','auth_required','rate_limited','quota_exceeded','blocked','upload_accepted','cancelled'];
export const YT_OUTCOME_CODES=Object.freeze(['PROVIDER_OUTCOME_UNKNOWN','CREDENTIALS_REQUIRED','SESSION_NOT_FOUND_OR_EXPIRED','RATE_LIMITED','QUOTA_EXCEEDED','PROVIDER_PERMISSION_DENIED','VIDEO_IDENTITY_NOT_VERIFIED','UNEXPECTED_PROVIDER_VISIBILITY','PREMATURE_COMPLETION','PROBE_REQUIRED_BEFORE_UPLOAD','RETRY_AFTER_NOT_REACHED']);
const ACTIONS=['approve_private_upload','start_private_upload','wait','none','inspect_video','manual_reconciliation_no_reupload','upload_next_chunk','probe_same_session'];
export function normalizeYouTubeUpload(v){
 if(!ytExact(v,['operationId','revision','state','outcomeCode','approval','operation','fingerprint','media','uploadedBytes','totalBytes','videoId','retryAt','nextAction'])||!id(v.operationId)||!ytInteger(v.revision)||!STATES.includes(v.state)||(v.outcomeCode!==null&&!YT_OUTCOME_CODES.includes(v.outcomeCode))||!['pending','approved','cancelled'].includes(v.approval)||!hash(v.fingerprint)||!ytInteger(v.uploadedBytes)||!ytInteger(v.totalBytes)||v.totalBytes<1||v.totalBytes>YT_MAX_BYTES||v.uploadedBytes>v.totalBytes||(v.videoId!==null&&(typeof v.videoId!=='string'||!/^[A-Za-z0-9_-]{11}$/.test(v.videoId)))||(v.retryAt!==null&&!iso(v.retryAt))||!ACTIONS.includes(v.nextAction))fail();
 const media=normalizeYouTubeMedia(v.media),o=v.operation;
 if(!ytExact(o,['operationId','channelId','media','metadata','notifySubscribers','fingerprint'])||o.operationId!==v.operationId||o.fingerprint!==v.fingerprint||!channel(o.channelId)||o.notifySubscribers!==false||!ytExact(o.media,['size','mimeType','sha256'])||o.media.size!==media.byteSize||o.media.mimeType!==media.mimeType||o.media.sha256!==media.sha256||v.totalBytes!==media.byteSize||!ytExact(o.metadata,['snippet','status'])||!ytExact(o.metadata.snippet,['title','description','tags','categoryId'])||!ytExact(o.metadata.status,['privacyStatus','selfDeclaredMadeForKids','containsSyntheticMedia'])||o.metadata.status.privacyStatus!=='private')fail();
 const md=normalizeYouTubeMetadata({...o.metadata.snippet,madeForKids:o.metadata.status.selfDeclaredMadeForKids,containsSyntheticMedia:o.metadata.status.containsSyntheticMedia});
 const manual=v.nextAction==='manual_reconciliation_no_reupload';
 if(['SESSION_NOT_FOUND_OR_EXPIRED','UNEXPECTED_PROVIDER_VISIBILITY'].includes(v.outcomeCode)&&!manual)fail();
 if(v.state==='prepared'&&(v.approval!=='pending'||v.nextAction!=='approve_private_upload'||v.uploadedBytes!==0)||v.state==='approved'&&(v.approval!=='approved'||v.nextAction!=='start_private_upload')||v.state==='in_flight'&&!manual&&v.nextAction!=='wait'||v.state==='session_ready'&&!manual&&!['upload_next_chunk','wait'].includes(v.nextAction)||v.state==='upload_accepted'&&(!v.videoId||v.uploadedBytes!==v.totalBytes||!manual&&v.nextAction!=='inspect_video')||v.state==='cancelled'&&(v.approval!=='cancelled'||!manual&&v.nextAction!=='none'))fail();
 if(!['prepared','cancelled'].includes(v.state)&&v.approval!=='approved')fail();
 if(v.nextAction==='upload_next_chunk'&&v.state!=='session_ready'||v.nextAction==='approve_private_upload'&&v.state!=='prepared'||v.nextAction==='start_private_upload'&&v.state!=='approved'||v.nextAction==='inspect_video'&&v.state!=='upload_accepted')fail();
 return {...v,media,operation:{...o,media:{...o.media},metadata:{snippet:{title:md.title,description:md.description,tags:md.tags,categoryId:md.categoryId},status:{...o.metadata.status}}}};
}
export function sameYouTubePlan(before,after){return before.operationId===after.operationId&&before.fingerprint===after.fingerprint&&JSON.stringify(before.operation)===JSON.stringify(after.operation)&&JSON.stringify(before.media)===JSON.stringify(after.media)&&after.revision>=before.revision&&(before.nextAction!=='manual_reconciliation_no_reupload'||after.nextAction==='manual_reconciliation_no_reupload');}
export function normalizeYouTubeObservation(v){
 if(!v||typeof v!=='object')fail();
 if(['check_failed','not_found'].includes(v.state)){
  if(!ytExact(v,['state','code'])||!['VIDEO_CHECK_FAILED','VIDEO_IDENTITY_NOT_VERIFIED','UNEXPECTED_PROVIDER_VISIBILITY','VIDEO_NOT_FOUND_AT_CHECK_TIME'].includes(v.code)||v.state==='not_found'&&v.code!=='VIDEO_NOT_FOUND_AT_CHECK_TIME')fail();return {...v};
 }
 if(!ytExact(v,['state','videoId','privacyStatus','processingStatus','uploadStatus'])||!['private_ready','processing_or_unknown','processing_failed'].includes(v.state)||typeof v.videoId!=='string'||!/^[A-Za-z0-9_-]{11}$/.test(v.videoId)||v.privacyStatus!=='private'||!['processing','succeeded','failed','terminated','unknown'].includes(v.processingStatus)||!['uploaded','processed','failed','rejected','deleted','unknown'].includes(v.uploadStatus))fail();
 if(v.state==='private_ready'&&v.processingStatus!=='succeeded'&&v.uploadStatus!=='processed')fail();return {...v};
}
export function createYouTubeUploadClient({fetcher=globalThis.fetch.bind(globalThis),timeoutMs=30000}={}){
 async function request(path,{method='GET',body,headers={},signal}={}){
  const c=new AbortController(),abort=()=>c.abort();if(signal?.aborted)fail();signal?.addEventListener('abort',abort,{once:true});const timer=setTimeout(abort,timeoutMs);
  try{const r=await fetcher(path,{method,credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Accept:'application/json','X-Planner-Request':'1',...headers},...(body===undefined?{}:{body}),signal:c.signal});if(c.signal.aborted||!r.ok||r.redirected||!/^application\/json(?:\s*;|$)/i.test(r.headers.get('Content-Type')||''))fail();const v=await r.json();if(c.signal.aborted)fail();return v;}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
 }
 const one=v=>{if(!ytExact(v,['schemaVersion','upload'])||v.schemaVersion!==1)fail();return normalizeYouTubeUpload(v.upload);};
 const path=idValue=>{if(!id(idValue))fail();return '/api/providers/youtube/uploads/'+idValue;};
 const post=(url,body,signal)=>request(url,{method:'POST',body:JSON.stringify(body),headers:{'Content-Type':'application/json'},signal});
 return {
  async listMedia({signal}={}){const v=await request('/api/providers/youtube/media',{signal});if(!ytExact(v,['schemaVersion','media'])||v.schemaVersion!==1||!Array.isArray(v.media)||v.media.length>YT_MAX_FILES)fail();const list=v.media.map(normalizeYouTubeMedia);if(new Set(list.map(m=>m.mediaId)).size!==list.length)fail();return list;},
  async saveMedia(file,{signal}={}){validateYouTubeFile(file);const v=await request('/api/providers/youtube/media',{method:'POST',body:file,headers:{'Content-Type':file.type,'X-Planner-File-Name':encodeURIComponent(file.name)},signal});if(!ytExact(v,['schemaVersion','media'])||v.schemaVersion!==1)fail();const m=normalizeYouTubeMedia(v.media);if(m.filename!==file.name||m.byteSize!==file.size||m.mimeType!==file.type)fail();return m;},
  async list({signal}={}){const v=await request('/api/providers/youtube/uploads',{signal});if(!ytExact(v,['schemaVersion','uploads'])||v.schemaVersion!==1||!Array.isArray(v.uploads)||v.uploads.length>100)fail();const list=v.uploads.map(normalizeYouTubeUpload);if(new Set(list.map(u=>u.operationId)).size!==list.length)fail();return list;},
  async read(id,{signal}={}){return one(await request(path(id),{signal}));},
  async prepare({mediaId,metadata},{signal}={}){if(!id(mediaId))fail();return one(await post('/api/providers/youtube/uploads/prepare',{mediaId,metadata:normalizeYouTubeMetadata(metadata)},signal));},
  async step(id,action,body={}, {signal}={}){if(!['start','chunk','probe','cancel'].includes(action))fail();if(action==='start'){if(!ytExact(body,['expectedRevision','fingerprint','intent'])||!ytInteger(body.expectedRevision)||!hash(body.fingerprint)||body.intent!=='upload_private')fail();}else if(action==='cancel'){if(!ytExact(body,['expectedRevision'])||!ytInteger(body.expectedRevision))fail();}else if(!ytExact(body,[]))fail();return one(await post(path(id)+'/'+action,body,signal));},
  async inspect(id,{signal}={}){const v=await post(path(id)+'/inspect',{},signal);if(!ytExact(v,['schemaVersion','upload','observation'])||v.schemaVersion!==1)fail();const upload=normalizeYouTubeUpload(v.upload),observation=normalizeYouTubeObservation(v.observation);if(observation.videoId&&observation.videoId!==upload.videoId)fail();return {upload,observation};}
 };
}
