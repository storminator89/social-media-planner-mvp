/** Plan saved drafts and every selected channel only. No publication, persistence or mutation. */
import { WorkflowError } from './workflows.mjs';
import { findNextPostingSlots, selectPostingSlot, validateScheduleChanges } from './posting-schedules.mjs';
const fail=(code,message)=>{throw new WorkflowError(code,message);};
export function prepareDraftBatch(snapshot,{postIds,now=new Date().toISOString()}={}) {
  if(!Array.isArray(postIds)||!postIds.length||postIds.length>100||new Set(postIds).size!==postIds.length||postIds.some(id=>typeof id!=='string'))fail('BATCH_SELECTION_REQUIRED','Wähle eindeutige gespeicherte Entwürfe.');
  const next=structuredClone(snapshot),entries=[];
  for(const postId of postIds){
    const post=next.posts.find(p=>p.id===postId),variant=post?.variants?.[0];
    if(!post||post.stage!=='draft'||post.scheduledAt!==null||post.scheduleBinding!==null||!post.variants.length||post.variants.some(v=>v.status!=='draft'||v.scheduledAt!==null||v.publishedAt!==null||v.publishedUrl!==null||v.format!=='post')||new Set(post.variants.map(v=>v.channelId)).size!==post.variants.length)fail('BATCH_DRAFT_REQUIRED','Nur gespeicherte Entwürfe ohne Termin mit mindestens einem Kanal sind möglich.');
    if(post.variants.some(v=>!v.body.trim()))fail('BATCH_CONTENT_REQUIRED','Ein ausgewählter Kanaltext ist leer.');
    const proposal=findNextPostingSlots(next,{postId,channelIds:post.variants.map(v=>v.channelId),after:now,displayTimezone:snapshot.settings.timezone,limit:1});
    if(!proposal.suggestions.length){const reasons={queue_paused:'Posting-Zeiten sind pausiert.',queue_empty:'Posting-Zeiten fehlen.',all_occupied:'Kein freier Termin in den nächsten 60 Tagen.',no_shared_slot:'Kein passender Termin in den nächsten 60 Tagen.'};fail('BATCH_NO_SLOT',reasons[proposal.reason]||'Kein passender Termin gefunden.');}
    const chosen=selectPostingSlot(next,proposal,proposal.suggestions[0],{now});
    post.stage='planned';post.scheduledAt=chosen.scheduledAt;post.timezone=chosen.timezone;post.scheduleBinding=chosen.scheduleBinding;
    for(const v of post.variants){v.status='planned';v.scheduledAt=chosen.scheduledAt;v.timezone=chosen.timezone;}
    entries.push({postId,channelId:variant.channelId,text:variant.body,channels:post.variants.map(v=>({channelId:v.channelId,text:v.body})),title:post.title,instant:chosen.scheduledAt,local:chosen.local,timezone:chosen.timezone});
  }
  validateScheduleChanges(next,snapshot,now);
  return {next,entries};
}
