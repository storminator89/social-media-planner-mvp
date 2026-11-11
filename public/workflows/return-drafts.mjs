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
    if(!post||post.stage!=='planned'||!instant(post.scheduledAt)||typeof post.timezone!=='string'||!post.timezone||!Array.isArray(post.variants)||!post.variants.length||new Set(post.variants.map(v=>v.channelId)).size!==post.variants.length||post.variants.some(v=>v.status!=='planned'||v.format!=='post'||v.scheduledAt!==post.scheduledAt||v.timezone!==post.timezone||v.publishedAt!==null||v.publishedUrl!==null||typeof v.inheritsBody!=='boolean'||v.inheritsBody&&v.body!==post.body||!Array.isArray(v.mediaIds)||v.mediaIds.length>10||new Set(v.mediaIds).size!==v.mediaIds.length||v.mediaIds.some(id=>typeof id!=='string'||!snapshot.media?.some(m=>m.id===id))))fail('RETURN_POST_REQUIRED','Nur gemeinsam geplante Beiträge.');
    try{new Intl.DateTimeFormat('en',{timeZone:post.timezone}).format();}catch{fail('RETURN_POST_REQUIRED','Beitrag einzeln prüfen.');}
    validatePostScheduleBinding(post);
    entries.push({postId,channelId:variant.channelId,title:post.title,text:variant.body,channels:post.variants.map(v=>({channelId:v.channelId,text:v.body})),instant:post.scheduledAt,timezone:post.timezone});
    post.stage='draft';post.scheduledAt=null;post.scheduleBinding=null;
    for(const v of post.variants){v.status='draft';v.scheduledAt=null;}
  }
  validateScheduleChanges(next,snapshot,now);
  return {next,entries};
}
