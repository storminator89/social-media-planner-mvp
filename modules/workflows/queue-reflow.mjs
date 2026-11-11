/** Explicitly re-plan one complete future channel queue. No persistence or publishing. */
import {WorkflowError,withCivilTimeCache} from './workflows.mjs';
import {findNextPostingSlots,selectPostingSlot,validatePostScheduleBinding,validateScheduleChanges,scheduleLocalTime} from './posting-schedules.mjs';
const fail=(code,message)=>{throw new WorkflowError(code,message);};
const validId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(value);
const canonicalInstant=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
const timing=(instant,timezone)=>({instant,local:scheduleLocalTime(instant,timezone),timezone});

export function prepareQueueReflow(snapshot,options={}){
  return withCivilTimeCache(()=>prepareQueueReflowUncached(snapshot,options));
}

function prepareQueueReflowUncached(snapshot,{channelId,now=new Date().toISOString()}={}){
  if(!validId(channelId)||!Number.isSafeInteger(snapshot?.revision)||snapshot.revision<0||!Array.isArray(snapshot.posts)||!Array.isArray(snapshot.channels)||!canonicalInstant(now))fail('REFLOW_QUEUE_INVALID','Queue-Termine zuerst prüfen.');
  const channel=snapshot.channels.find(item=>item.id===channelId);
  if(!channel||channel.enabled!==true||!channel.postingSchedule||channel.postingSchedule.paused||!channel.postingSchedule.slots?.length)fail('REFLOW_CHANNEL_REQUIRED','Posting-Zeiten prüfen.');
  // UI filters never select the write set. Hidden incompatible future rows block it.
  const belongs=post=>post.variants?.some(v=>v.channelId===channelId)||post.scheduleBinding?.refs?.some(ref=>ref.channelId===channelId);
  const bound=snapshot.posts.filter(post=>post.scheduleBinding&&belongs(post));
  if(bound.some(post=>!canonicalInstant(post.scheduledAt)))fail('REFLOW_QUEUE_INVALID','Queue-Termine zuerst prüfen.');
  const affected=bound.filter(post=>Date.parse(post.scheduledAt)>Date.parse(now)).sort((a,b)=>Date.parse(a.scheduledAt)-Date.parse(b.scheduledAt)||(a.id<b.id?-1:a.id>b.id?1:0));
  if(!affected.length)fail('REFLOW_EMPTY','Keine zukünftigen Queue-Beiträge.');
  if(affected.length>100||new Set(affected.map(post=>post.id)).size!==affected.length)fail('REFLOW_QUEUE_INVALID','Queue-Termine zuerst prüfen.');
  for(const post of affected){
    const variant=post.variants?.[0];
    if(post.stage!=='planned'||post.variants.length!==1||variant.channelId!==channelId||variant.status!=='planned'||variant.scheduledAt!==post.scheduledAt||variant.timezone!==post.timezone||variant.format!=='post'||variant.publishedAt!==null||variant.publishedUrl!==null)fail('REFLOW_UNSUPPORTED','Mehrkanal-Beiträge oder eigene Varianten einzeln prüfen.');
    // Stale weekly rules are the reason for reflow, not a reason to reject it.
    validatePostScheduleBinding(post);
  }
  const next=structuredClone(snapshot),ids=new Set(affected.map(post=>post.id)),entries=[];
  // Release the entire selected set before searching. Otherwise old reservations
  // would occupy the new slots. These temporary drafts are never persisted.
  for(const post of next.posts)if(ids.has(post.id)){
    post.stage='draft';post.scheduledAt=null;post.scheduleBinding=null;
    post.variants[0].status='draft';post.variants[0].scheduledAt=null;
  }
  const anchorDay=Date.parse(scheduleLocalTime(now,channel.postingSchedule.timezone).slice(0,10)+'T00:00:00Z');
  for(const source of affected){
    const post=next.posts.find(item=>item.id===source.id);
    let cursor=now,chosen=null;
    while(!chosen){
      // Paging never extends the original civil-day horizon, including DST days.
      const cursorDay=Date.parse(scheduleLocalTime(cursor,channel.postingSchedule.timezone).slice(0,10)+'T00:00:00Z');
      const horizonDays=60-Math.round((cursorDay-anchorDay)/86400000);
      if(horizonDays<=0)break;
      const proposal=findNextPostingSlots(next,{postId:post.id,channelIds:[channelId],after:cursor,displayTimezone:post.timezone,limit:100,horizonDays});
      if(!proposal.suggestions.length)break;
      for(const candidate of proposal.suggestions){
        const selection=selectPostingSlot(next,proposal,candidate,{now});
        post.stage='planned';post.scheduledAt=selection.scheduledAt;post.scheduleBinding=selection.scheduleBinding;
        post.variants[0].status='planned';post.variants[0].scheduledAt=selection.scheduledAt;
        try{
          // Unchanged bindings retain their original minimum gaps. A slot can
          // satisfy today's rules yet conflict with an older preserved rule.
          validateScheduleChanges(next,snapshot,now);chosen=selection;break;
        }catch(error){
          post.stage='draft';post.scheduledAt=null;post.scheduleBinding=null;
          post.variants[0].status='draft';post.variants[0].scheduledAt=null;
          if(error.code!=='SLOT_TAKEN')throw error;
        }
      }
      if(!chosen)cursor=proposal.suggestions.at(-1).instant;
    }
    if(!chosen)fail('REFLOW_NO_SLOT','Nicht genug freie Termine in 60 Tagen.');
    entries.push({postId:post.id,channelId,title:post.title,text:post.variants[0].body,from:timing(source.scheduledAt,source.timezone),to:timing(post.scheduledAt,post.timezone)});
  }
  validateScheduleChanges(next,snapshot,now);
  const unchanged={fixed:snapshot.posts.filter(post=>!post.scheduleBinding&&post.stage==='planned'&&belongs(post)).length,past:bound.length-affected.length};
  return {next,entries,unchanged};
}
