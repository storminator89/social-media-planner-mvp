import {INSTANCE} from './oauth.mjs';

// Preparation only: deliberately NOT imported by a router, worker or scheduler.
// No global fetch, credential access or profile-store writes. A production
// adapter and durable atomic store require their own review before activation.
const assert=(condition,code)=>{if(!condition)throw new Error(code);};
const id=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(value);
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),b=>b.toString(16).padStart(2,'0')).join('');
export const PUBLISHING_AVAILABLE=false;
export function requiredPublishingScopes({hasImage=false}={}) {
 return Object.freeze(['write:statuses',...(hasImage?['write:media']:[])]);
}
/** Immutable review snapshot. Schedule is a local reminder, NEVER a provider
 * scheduled_at instruction. Editing any field requires a new review/approval.
 * Limits must come from validated server-side instance configuration. */
export async function preparePublication(input,{now=Date.now(),maxCharacters=500,maxImageBytes=8*1024*1024}={}) {
 assert(input&&Object.keys(input).every(k=>['ownerId','subject','text','visibility','sensitive','spoilerText','image','remindAt'].includes(k)),'PLAN_FIELDS_INVALID');
 assert(id(input.ownerId)&&typeof input.subject==='string'&&/^\d{1,40}$/.test(input.subject),'ACCOUNT_INVALID');
 assert(typeof input.text==='string'&&input.text.trim().length>0,'TEXT_REQUIRED');
 const spoilerText=input.spoilerText??'';
 assert(typeof spoilerText==='string'&&Number.isSafeInteger(maxCharacters)&&maxCharacters>0&&[...input.text,...spoilerText].length<=maxCharacters,'TEXT_LIMIT');
 // Conservative code-point count can reject long URLs unnecessarily; does not
 // promise parity with provider character-count rules.
 assert(['public','unlisted','private','direct'].includes(input.visibility),'VISIBILITY_REQUIRED');
 assert(typeof input.sensitive==='boolean','SENSITIVE_CHOICE_REQUIRED');
 const remindAt=input.remindAt??null;
 assert(remindAt===null||Number.isSafeInteger(remindAt)&&remindAt>now,'REMINDER_INVALID');
 let image=null;
 if(input.image!=null){
  const i=input.image;
  assert(Object.keys(i).sort().join(',')==='altText,bytes,mime,sha256,storageId','IMAGE_FIELDS_INVALID');
  assert(id(i.storageId)&&/^[a-f0-9]{64}$/.test(i.sha256)&&['image/png','image/jpeg','image/webp'].includes(i.mime)&&Number.isSafeInteger(i.bytes)&&i.bytes>0&&i.bytes<=maxImageBytes&&typeof i.altText==='string'&&i.altText.trim().length>0&&[...i.altText].length<=1500,'IMAGE_INVALID');
  image=Object.freeze({...i});
 }
 const value={version:1,instance:INSTANCE,ownerId:input.ownerId,subject:input.subject,text:input.text,visibility:input.visibility,sensitive:input.sensitive,spoilerText,image,remindAt};
 return Object.freeze({...value,reviewId:await digest(value)});
}
/** Offline execution seam. Host MUST supply an owner-bound atomic durable ledger,
 * server-verified identity and grant, and reviewed provider adapter. Adapter must
 * verify private blob ownership, hash, size and decoded MIME before uploading.
 * Never feed browser-supplied grant/identity/transport values into this API.
 * reserve is insert-if-absent by owner + reviewId. Uncertain outcomes stay locked.
 */
export function createPublicationCandidate({ledger,authorize,provider,clock=Date.now}) {
 assert(ledger&&typeof ledger.reserve==='function'&&typeof ledger.finish==='function'&&typeof authorize==='function'&&provider&&typeof provider.publish==='function','ADAPTER_REQUIRED');
 return Object.freeze({
  async execute({plan,identity,grant,confirmedReviewId,explicitAction}) {
   assert(explicitAction==='publish_now'&&confirmedReviewId===plan?.reviewId,'EXPLICIT_APPROVAL_REQUIRED');
   // Copy before the first await so caller mutation cannot change approved data.
   plan=structuredClone(plan);
   if(plan.image)Object.freeze(plan.image);
   Object.freeze(plan);
   const canonical=await preparePublication({ownerId:plan.ownerId,subject:plan.subject,text:plan.text,visibility:plan.visibility,sensitive:plan.sensitive,spoilerText:plan.spoilerText,image:plan.image,remindAt:null});
   // Revalidate a past reminder without turning it into scheduled publication.
   assert(plan.remindAt===null||Number.isSafeInteger(plan.remindAt),'REMINDER_INVALID');
   const {reviewId:_,...value}=canonical;
   assert(plan.version===1&&plan.instance===INSTANCE&&await digest({...value,remindAt:plan.remindAt})===plan.reviewId,'REVIEW_CHANGED');
   assert(identity?.ownerId===plan.ownerId&&grant?.ownerId===plan.ownerId&&grant.subject===plan.subject&&grant.instance===INSTANCE&&grant.phase==='linked','ACCOUNT_MISMATCH');
   assert(Array.isArray(grant.scopes)&&requiredPublishingScopes({hasImage:!!plan.image}).every(s=>grant.scopes.includes(s)),'REAUTHORIZATION_REQUIRED');
   assert(grant.expiresAt==null||Number.isSafeInteger(grant.expiresAt)&&grant.expiresAt>clock(),'GRANT_EXPIRED');
   // Approval is bound to exactly the reviewed content/account, including upload.
   assert(await authorize({ownerId:plan.ownerId,subject:plan.subject,reviewId:plan.reviewId,instance:INSTANCE,action:'publish_now',includesUpload:!!plan.image})===true,'ACTION_NOT_APPROVED');
   assert(await ledger.reserve({ownerId:plan.ownerId,reviewId:plan.reviewId,state:'outcome_unknown'})===true,'ATTEMPT_ALREADY_EXISTS');
   // From this point any error is uncertain. No automatic retry, no re-upload,
   // no new idempotency key. Reconcile manually; never reset the reservation.
   let mediaIds=[];
   if(plan.image){
    assert(typeof provider.upload==='function','UPLOAD_ADAPTER_REQUIRED');
    const media=await provider.upload({image:plan.image,ownerId:plan.ownerId,subject:plan.subject,reviewId:plan.reviewId});
    assert(media?.ready===true&&typeof media.id==='string'&&/^\d{1,40}$/.test(media.id),'MEDIA_NOT_READY');
    mediaIds=[media.id];
   }
   const result=await provider.publish({subject:plan.subject,ownerId:plan.ownerId,idempotencyKey:plan.reviewId,status:plan.text,visibility:plan.visibility,sensitive:plan.sensitive,spoiler_text:plan.spoilerText,media_ids:mediaIds});
   assert(typeof result?.id==='string'&&/^\d{1,40}$/.test(result.id),'PROVIDER_RESULT_INVALID');
   await ledger.finish({ownerId:plan.ownerId,reviewId:plan.reviewId,state:'published',providerId:result.id});
   return Object.freeze({state:'published',providerId:result.id});
  }
 });
}
