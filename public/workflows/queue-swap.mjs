/** Exchange exactly two explicitly selected existing reservations. No allocation. */
import {WorkflowError} from './workflows.mjs';
import {inspectScheduleBinding,normalizeScheduleBinding,scheduleLocalTime,validateScheduleChanges} from './posting-schedules.mjs';
const fail=(code,message)=>{throw new WorkflowError(code,message);};
const validId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(value);
const canonicalInstant=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
const timing=(instant,timezone)=>({instant,local:scheduleLocalTime(instant,timezone),timezone});
export function prepareQueueSwap(snapshot,{postIds,channelId,now=new Date().toISOString()}={}){
  if(!Array.isArray(postIds)||postIds.length!==2||!postIds.every(validId)||new Set(postIds).size!==2||!validId(channelId)||!Number.isSafeInteger(snapshot?.revision)||snapshot.revision<0||!Array.isArray(snapshot.posts)||!Array.isArray(snapshot.channels)||!canonicalInstant(now))fail('SWAP_INPUT_INVALID','Zwei Beiträge wählen.');
  const channel=snapshot.channels.find(item=>item.id===channelId);
  if(!channel||channel.enabled!==true||!channel.postingSchedule||channel.postingSchedule.paused)fail('SWAP_CHANNEL_REQUIRED','Posting-Zeiten prüfen.');
  const affected=postIds.map(id=>{
    const matches=snapshot.posts.filter(post=>post.id===id);
    if(matches.length!==1)fail('SWAP_INPUT_INVALID','Zwei Beiträge wählen.');
    return matches[0];
  });
  for(const post of affected){
    if(!canonicalInstant(post.scheduledAt)||Date.parse(post.scheduledAt)<=Date.parse(now)||!post.scheduleBinding)fail('SWAP_POST_REQUIRED','Zukünftige Queue-Beiträge wählen.');
    const variant=post.variants?.[0];
    if(post.stage!=='planned'||post.variants?.length!==1||variant.channelId!==channelId||variant.status!=='planned'||variant.scheduledAt!==post.scheduledAt||variant.timezone!==post.timezone||variant.format!=='post'||variant.publishedAt!==null||variant.publishedUrl!==null)fail('SWAP_UNSUPPORTED','Nur Einzelkanal-Queue-Beiträge möglich.');
    if(inspectScheduleBinding(post,snapshot.channels).state!=='current')fail('SWAP_QUEUE_INVALID','Queue-Termine zuerst prüfen.');
  }
  if(affected[0].scheduledAt===affected[1].scheduledAt)fail('SWAP_QUEUE_INVALID','Verschiedene Termine wählen.');
  const next=structuredClone(snapshot),entries=[];
  for(const [index,source] of affected.entries()){
    const destination=affected[1-index],post=next.posts.find(item=>item.id===source.id);
    post.scheduledAt=destination.scheduledAt;post.variants[0].scheduledAt=destination.scheduledAt;
    post.scheduleBinding=normalizeScheduleBinding({...structuredClone(destination.scheduleBinding),selectedAt:now,sourceRevision:snapshot.revision});
    entries.push({postId:post.id,channelId,title:post.title,text:post.variants[0].body,from:timing(source.scheduledAt,post.timezone),to:timing(post.scheduledAt,post.timezone),fromBinding:structuredClone(source.scheduleBinding),toBinding:structuredClone(post.scheduleBinding)});
  }
  validateScheduleChanges(next,snapshot,now);
  return {next,entries};
}
