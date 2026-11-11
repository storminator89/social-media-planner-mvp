/** Rotate existing queue reservations only. Pure canonical planning, no persistence. */
import {WorkflowError} from './workflows.mjs';
import {inspectScheduleBinding,normalizeScheduleBinding,scheduleLocalTime,validateScheduleChanges} from './posting-schedules.mjs';
const fail=(code,message)=>{throw new WorkflowError(code,message);};
const validId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(value);
const canonicalInstant=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
const timing=(instant,timezone)=>({instant,local:scheduleLocalTime(instant,timezone),timezone});

export function prepareQueuePriority(snapshot,{postId,channelId,now=new Date().toISOString()}={}){
  if(!validId(postId)||!validId(channelId)||!Number.isSafeInteger(snapshot?.revision)||snapshot.revision<0||!Array.isArray(snapshot.posts)||!Array.isArray(snapshot.channels)||!canonicalInstant(now))fail('PRIORITY_INPUT_INVALID','Queue erneut öffnen.');
  const selected=snapshot.posts.find(post=>post.id===postId);
  if(!selected||!canonicalInstant(selected.scheduledAt)||Date.parse(selected.scheduledAt)<=Date.parse(now)||!selected.scheduleBinding)fail('PRIORITY_POST_REQUIRED','Zukünftigen Queue-Beitrag wählen.');
  const channel=snapshot.channels.find(item=>item.id===channelId);
  if(!channel||channel.enabled!==true||!channel.postingSchedule||channel.postingSchedule.paused)fail('PRIORITY_CHANNEL_REQUIRED','Posting-Zeiten prüfen.');
  // Include every bound appointment in this channel, even if hidden by UI filters.
  // Unsupported appointments inside the affected prefix block the whole rotation.
  const queue=snapshot.posts.filter(post=>post.scheduleBinding&&(post.variants?.some(variant=>variant.channelId===channelId)||post.scheduleBinding.refs?.some(ref=>ref.channelId===channelId)));
  if(queue.some(post=>!canonicalInstant(post.scheduledAt)))fail('PRIORITY_QUEUE_INVALID','Queue-Termine prüfen.');
  const affected=queue.filter(post=>Date.parse(post.scheduledAt)>Date.parse(now)&&Date.parse(post.scheduledAt)<=Date.parse(selected.scheduledAt)).sort((a,b)=>a.scheduledAt<b.scheduledAt?-1:a.scheduledAt>b.scheduledAt?1:a.id<b.id?-1:1);
  if(!affected.some(post=>post.id===postId))fail('PRIORITY_POST_REQUIRED','Beitrag dieses Kanals wählen.');
  if(new Set(affected.map(post=>post.id)).size!==affected.length||new Set(affected.map(post=>post.scheduledAt)).size!==affected.length)fail('PRIORITY_QUEUE_INVALID','Queue-Termine prüfen.');
  for(const post of affected){
    const variant=post.variants?.[0];
    if(post.stage!=='planned'||post.variants.length!==1||variant.channelId!==channelId||variant.status!=='planned'||variant.scheduledAt!==post.scheduledAt||variant.timezone!==post.timezone||variant.format!=='post'||variant.publishedAt!==null||variant.publishedUrl!==null)fail('PRIORITY_UNSUPPORTED','Nur Einzelkanal-Queue-Beiträge möglich.');
    if(inspectScheduleBinding(post,snapshot.channels).state!=='current')fail('PRIORITY_QUEUE_INVALID','Queue-Termine zuerst prüfen.');
  }
  if(affected.length<2)fail('PRIORITY_UNCHANGED','Bereits an erster Queue-Position.');
  const next=structuredClone(snapshot),order=[selected,...affected.filter(post=>post.id!==postId)],entries=[];
  for(const [index,source] of order.entries()){
    const destination=affected[index],post=next.posts.find(item=>item.id===source.id);
    post.scheduledAt=destination.scheduledAt;post.variants[0].scheduledAt=destination.scheduledAt;
    post.scheduleBinding=normalizeScheduleBinding({...structuredClone(destination.scheduleBinding),selectedAt:now,sourceRevision:snapshot.revision});
    entries.push({postId:post.id,channelId,title:post.title,text:post.variants[0].body,from:timing(source.scheduledAt,post.timezone),to:timing(post.scheduledAt,post.timezone)});
  }
  validateScheduleChanges(next,snapshot,now);
  return {next,entries};
}
