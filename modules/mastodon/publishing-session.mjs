import {preparePublication,createPublicationCandidate} from './publishing-preparation.mjs';
import {INSTANCE} from './oauth.mjs';
// Server-side orchestration seam only. Identity/store/provider never come from UI.
// Remains disabled even with a linked profile. No router imports this module.
export function createPublishingSession({identity,grantStore,ledger,provider,authorize,offlineFixture=false}) {
 if(offlineFixture!==true) throw Error('PUBLISHING_OFFLINE_ONLY');
 if(!identity?.ownerId||grantStore?.context?.ownerId!==identity.ownerId||grantStore.context.purpose!=='publishing'||ledger?.context?.ownerId!==identity.ownerId||ledger.context.siteId!==grantStore.context.siteId) throw Error('PUBLISHING_OWNER_MISMATCH');
 const ownerId=identity.ownerId;
 let current=null, generation=0;
 async function grant() {
  const row=await grantStore.read(),v=row?.value;
  if(v?.purpose!=='publishing'||v.phase!=='linked'||v.scope!=='profile write:statuses') throw Error('SEPARATE_PUBLISHING_GRANT_REQUIRED');
  return {ownerId,subject:v.subject,instance:INSTANCE,phase:v.phase,scopes:v.scope.split(' '),expiresAt:v.expiresAt};
 }
 return Object.freeze({
  async preview(fields) {
   current=null; const attempt=++generation;
   if(!fields||Object.keys(fields).some(k=>!['text','visibility','sensitive','spoilerText'].includes(k))) throw Error('TEXT_ONLY_PREVIEW_REQUIRED');
   fields=structuredClone(fields);
   const g=await grant();
   const plan=await preparePublication({...fields,ownerId,subject:g.subject});
   if(attempt!==generation) throw Error('PREVIEW_SUPERSEDED');
   current=plan;
   return plan;
  },
  cancel(){generation++;current=null;return {state:'cancelled'};},
  async submit({confirmedReviewId,explicitAction}) {
   const plan=current;
   if(!plan||plan.reviewId!==confirmedReviewId||explicitAction!=='publish_now') throw Error('NEW_PREVIEW_REQUIRED');
   // Consume synchronously, before storage/network awaits. Back/cancel cannot undo
   // an already started request. A second browser/session is stopped by SQL.
   current=null; generation++;
   const g=await grant();
   return createPublicationCandidate({ledger,authorize,provider}).execute({plan,identity:{ownerId},grant:g,confirmedReviewId,explicitAction});
  }
 });
}
