// Frozen v46 rollback-negative fixture. NEVER deploy.
/** Unfinished editor data only. No post authorization, publication, auth or storage. */
import {normalizeScheduleBinding} from '../../../modules/workflows/posting-schedules.mjs';
export const WORKSPACE_SCHEMA_VERSION=1;
export const WORKSPACE_LIMITS=Object.freeze({active:20,total:100,jsonBytes:128*1024,text:20000,variants:20,channels:20,retentionMs:30*24*60*60*1000});
export class WorkspaceError extends Error{constructor(status,code,details){super(code);this.status=status;this.code=code;if(details)this.details=details;}}
export function fail(code,status=400,details){throw new WorkspaceError(status,code,details);}
export function ownSnapshot(source,keys,code='WORKSPACE_INPUT_INVALID',optionalKeys=[]){
 try{if(!source||![Object.prototype,null].includes(Object.getPrototypeOf(source)))fail(code);const d=Object.getOwnPropertyDescriptors(source);if(Reflect.ownKeys(d).some(key=>!keys.includes(key)&&!optionalKeys.includes(key)))fail(code);const out={};for(const key of [...keys,...optionalKeys.filter(key=>Object.hasOwn(d,key))]){if(!d[key]||!Object.hasOwn(d[key],'value')||!d[key].enumerable)fail(code);out[key]=d[key].value;}return out;}catch{fail(code);}
}
export function text(value,max){if(typeof value!=='string'||!value.isWellFormed()||value.length>max)fail('WORKSPACE_INPUT_INVALID');return value;}
export function id(value){if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(value))fail('WORKSPACE_INPUT_INVALID');return value;}
export function mutationId(value){if(typeof value!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(value))fail('WORKSPACE_INPUT_INVALID');return value;}
export function revision(value){if(!Number.isSafeInteger(value)||value<0||value>=Number.MAX_SAFE_INTEGER)fail('WORKSPACE_INPUT_INVALID');return value;}
export function ownerId(value){if(typeof value!=='string'||!value.isWellFormed()||!value||value.length>256||value.trim()!==value||/[\u0000-\u001f\u007f]/.test(value))fail('SIGN_IN_REQUIRED',401);return value;}
function arraySnapshot(source,max,convert){
 try{if(!Array.isArray(source)||Object.getPrototypeOf(source)!==Array.prototype||source.length>max)fail('WORKSPACE_INPUT_INVALID');const d=Object.getOwnPropertyDescriptors(source);if(Reflect.ownKeys(d).length!==source.length+1)fail('WORKSPACE_INPUT_INVALID');const a=[];for(let i=0;i<source.length;i++){if(!d[i]||!d[i].enumerable||!Object.hasOwn(d[i],'value'))fail('WORKSPACE_INPUT_INVALID');a.push(convert(d[i].value));}return a;}catch{fail('WORKSPACE_INPUT_INVALID');}
}
function variantSnapshot(source){
 let d;try{if(!source||![Object.prototype,null].includes(Object.getPrototypeOf(source)))fail('WORKSPACE_INPUT_INVALID');d=Object.getOwnPropertyDescriptors(source);}catch{fail('WORKSPACE_INPUT_INVALID');}const keys=Reflect.ownKeys(d);if(keys.length>WORKSPACE_LIMITS.variants||keys.some(k=>typeof k!=='string'))fail('WORKSPACE_INPUT_INVALID');const result=Object.create(null);for(const key of keys.sort()){id(key);if(!d[key].enumerable||!Object.hasOwn(d[key],'value'))fail('WORKSPACE_INPUT_INVALID');result[key]=text(d[key].value,WORKSPACE_LIMITS.text);}return result;
}
// Only plain own data reaches the canonical schedule helper. Workspace planning
// is preserved editorial context, never permission to save a planner snapshot.
function planningText(value,max){const result=text(value,max);if(/[\u0000-\u001f\u007f-\u009f]/.test(result))fail('WORKSPACE_INPUT_INVALID');return result;}
function canonicalInstant(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value)fail('WORKSPACE_INPUT_INVALID');return value;
}
function bindingSnapshot(source){
 if(source===null)return null;
 const b=ownSnapshot(source,['schemaVersion','mode','instant','selectedAt','sourceRevision','refs']);
 if(b.schemaVersion!==1||b.mode!=='queue'||!Number.isSafeInteger(b.sourceRevision)||b.sourceRevision<0)fail('WORKSPACE_INPUT_INVALID');
 b.instant=canonicalInstant(b.instant);b.selectedAt=canonicalInstant(b.selectedAt);
 b.refs=arraySnapshot(b.refs,WORKSPACE_LIMITS.channels,source=>{
  const r=ownSnapshot(source,['channelId','slotId','local','timezone','overlapChoice','minimumGapMinutes']);
  r.channelId=id(r.channelId);r.slotId=id(r.slotId);r.local=planningText(r.local,16);r.timezone=planningText(r.timezone,100);
  if(!['reject','earlier','later'].includes(r.overlapChoice)||!Number.isSafeInteger(r.minimumGapMinutes)||r.minimumGapMinutes<0||r.minimumGapMinutes>1440)fail('WORKSPACE_INPUT_INVALID');return r;
 });
 // Validate resolution and uniqueness, without silently normalizing instants or
 // sorting the retained working context. All values above are detached data.
 try{normalizeScheduleBinding(b);}catch{fail('WORKSPACE_INPUT_INVALID');}return b;
}
function planningSnapshot(source){
 const p=ownSnapshot(source,['schemaVersion','scheduledInstant','scheduleBinding']);
 if(p.schemaVersion!==1)fail('WORKSPACE_INPUT_INVALID');
 if(p.scheduledInstant!==null)p.scheduledInstant=canonicalInstant(p.scheduledInstant);
 p.scheduleBinding=bindingSnapshot(p.scheduleBinding);
 if(p.scheduleBinding!==null&&p.scheduledInstant!==p.scheduleBinding.instant)fail('WORKSPACE_INPUT_INVALID');return p;
}
export function payloadSnapshot(source){
 const p=ownSnapshot(source,['title','tags','rawTags','baselineRenderedTags','text','variantTexts','channels','date','time','timeZone','media','cover','activeTextTarget','localMediaOmitted'],'WORKSPACE_INPUT_INVALID',['planning']);
 p.title=text(p.title,200);p.tags=arraySnapshot(p.tags,20,x=>text(x,60));p.rawTags=text(p.rawTags,4096);p.baselineRenderedTags=text(p.baselineRenderedTags,4096);p.text=text(p.text,WORKSPACE_LIMITS.text);p.variantTexts=variantSnapshot(p.variantTexts);p.channels=arraySnapshot(p.channels,WORKSPACE_LIMITS.channels,id);if(new Set(p.channels).size!==p.channels.length)fail('WORKSPACE_INPUT_INVALID');
 // Raw work-in-progress values: do not parse dates/CSV, trim text, infer UTC or schedule.
 p.date=text(p.date,32);p.time=text(p.time,32);p.timeZone=text(p.timeZone,100);p.activeTextTarget=text(p.activeTextTarget,100);if(p.activeTextTarget!=='base'&&!p.channels.includes(p.activeTextTarget))fail('WORKSPACE_INPUT_INVALID');
 if(![null,'sunrise','forms','studio','nature'].includes(p.cover))fail('WORKSPACE_INPUT_INVALID');
 if(typeof p.localMediaOmitted!=='boolean'||(p.localMediaOmitted&&p.media!==null))fail('WORKSPACE_INPUT_INVALID');
 if(p.media!==null){p.media=ownSnapshot(p.media,['kind','id','alt']);if(p.media.kind!=='planner_image')fail('WORKSPACE_INPUT_INVALID');p.media.id=id(p.media.id);p.media.alt=text(p.media.alt,2000);}
 if(Object.hasOwn(p,'planning'))p.planning=planningSnapshot(p.planning);
 const json=JSON.stringify(p);if(new TextEncoder().encode(json).byteLength>WORKSPACE_LIMITS.jsonBytes)fail('WORKSPACE_TOO_LARGE',413);return p;
}
export function saveSnapshot(source){const s=ownSnapshot(source,['schemaVersion','workspaceId','expectedRevision','writeId','sourcePostId','basePlannerRevision','payload']);if(s.schemaVersion!==WORKSPACE_SCHEMA_VERSION)fail('WORKSPACE_SCHEMA_CHANGED',409);s.workspaceId=mutationId(s.workspaceId);s.writeId=mutationId(s.writeId);s.expectedRevision=revision(s.expectedRevision);if(s.sourcePostId!==null)s.sourcePostId=id(s.sourcePostId);if(s.basePlannerRevision!==null)s.basePlannerRevision=revision(s.basePlannerRevision);s.payload=payloadSnapshot(s.payload);return s;}
export function discardSnapshot(source){const s=ownSnapshot(source,['schemaVersion','workspaceId','expectedRevision','writeId']);if(s.schemaVersion!==WORKSPACE_SCHEMA_VERSION)fail('WORKSPACE_SCHEMA_CHANGED',409);s.workspaceId=mutationId(s.workspaceId);s.writeId=mutationId(s.writeId);s.expectedRevision=revision(s.expectedRevision);if(s.expectedRevision===0)fail('WORKSPACE_INPUT_INVALID');return s;}
export function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
export async function hash(value){try{return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,'0')).join('');}catch{fail('WORKSPACE_UNAVAILABLE',503);}}
