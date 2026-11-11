/** Withdraw only explicitly selected canonical appointments. No rescheduling or publication. */
import {WorkflowError} from './workflows.mjs';
import {validateScheduleChanges,validatePostScheduleBinding} from './posting-schedules.mjs';
const fail=(code,message)=>{throw new WorkflowError(code,message);};
const instant=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
export function prepareReturnDrafts(snapshot,{postIds,now=new Date().toISOString()}={}){
  if(!Array.isArray(postIds)||!postIds.length||postIds.length>100||new Set(postIds).size!==postIds.length||postIds.some(id=>typeof id!=='string'))fail('RETURN_SELECTION_REQUIRED','Wähle 1 bis 100 Beiträge.');
  const next=structuredClone(snapshot),entries=[];
  for(const postId of postIds){
    const post=next.posts.find(p=>p.id===postId),variant=post?.variants?.[0];
    if(!post||post.stage!=='planned'||!instant(post.scheduledAt)||post.variants.length!==1||variant.status!=='planned'||variant.format!=='post'||variant.scheduledAt!==post.scheduledAt||variant.timezone!==post.timezone||variant.publishedAt!==null||variant.publishedUrl!==null||typeof post.timezone!=='string'||!post.timezone||typeof variant.inheritsBody!=='boolean'||variant.inheritsBody&&variant.body!==post.body||!Array.isArray(variant.mediaIds)||variant.mediaIds.length>10||new Set(variant.mediaIds).size!==variant.mediaIds.length||variant.mediaIds.some(id=>typeof id!=='string'||!snapshot.media?.some(m=>m.id===id)))fail('RETURN_POST_REQUIRED','Nur geplante Einzelkanal-Beiträge.');
    try{new Intl.DateTimeFormat('en',{timeZone:post.timezone}).format();}catch{fail('RETURN_POST_REQUIRED','Beitrag einzeln prüfen.');}
    validatePostScheduleBinding(post);
    entries.push({postId,channelId:variant.channelId,title:post.title,text:variant.body,instant:post.scheduledAt,timezone:post.timezone});
    post.stage='draft';post.scheduledAt=null;post.scheduleBinding=null;
    variant.status='draft';variant.scheduledAt=null;
  }
  validateScheduleChanges(next,snapshot,now);
  return {next,entries};
}
