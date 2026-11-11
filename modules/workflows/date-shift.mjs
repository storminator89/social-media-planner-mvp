/** Explicit fixed-date campaign shifts. Calendar arithmetic, no allocation or publication. */
import {WorkflowError,resolveLocalTime} from './workflows.mjs';
import {scheduleLocalTime,validateScheduleChanges,normalizePostingSchedule} from './posting-schedules.mjs';
const fail=(code,message,detail={})=>{throw new WorkflowError(code,message,detail);};
const instant=value=>typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:00\.000Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
const timing=(value,timezone)=>({instant:value,local:scheduleLocalTime(value,timezone),timezone});
export function dateShiftProblem(post,now=new Date().toISOString()){
  if(!post||post.stage!=='planned')return 'Nur geplante Beiträge';
  if(post.scheduleBinding!==null)return 'Queue-gebunden: nicht verschiebbar';
  if(!instant(post.scheduledAt)||Date.parse(post.scheduledAt)<=Date.parse(now))return 'Nur zukünftige feste Termine mit Minutengenauigkeit';
  const variant=post.variants?.[0];
  if(post.variants?.length!==1)return 'Nur Einzelkanal-Beiträge';
  if(variant.status!=='planned'||variant.format!=='post'||variant.scheduledAt!==post.scheduledAt||variant.timezone!==post.timezone||variant.publishedAt!==null||variant.publishedUrl!==null)return 'Abweichende Kanalplanung: einzeln prüfen';
  try{scheduleLocalTime(post.scheduledAt,post.timezone);}catch{return 'Ungültige Zeitzone';}
  return null;
}
export function prepareDateShift(snapshot,{postIds,days,now=new Date().toISOString()}={}){
  if(!Array.isArray(postIds)||postIds.length<2||postIds.length>50||new Set(postIds).size!==postIds.length||postIds.some(id=>typeof id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(id))||!Number.isSafeInteger(days)||days===0||Math.abs(days)>365||!Number.isFinite(Date.parse(now))||!Number.isSafeInteger(snapshot?.revision)||!Array.isArray(snapshot?.posts))fail('SHIFT_INPUT_INVALID','Wähle 2 bis 50 Beiträge und −365 bis +365 ganze Tage, außer 0.');
  const next=structuredClone(snapshot),entries=[];
  for(const postId of postIds){
    const matches=next.posts.filter(post=>post.id===postId),post=matches[0];
    if(matches.length!==1)fail('SHIFT_POST_REQUIRED','Ausgewählter Beitrag fehlt.');
    const problem=dateShiftProblem(post,now);if(problem)fail('SHIFT_POST_REQUIRED',`${post.title||postId}: ${problem}`,{postId});
    const variant=post.variants[0],channel=snapshot.channels.find(c=>c.id===variant.channelId);
    if(!channel||!channel.enabled)fail('SHIFT_CHANNEL_REQUIRED','Kanal zuerst prüfen.',{postId});
    const from=timing(post.scheduledAt,post.timezone),civil=new Date(`${from.local.slice(0,10)}T00:00:00.000Z`);
    // Increment the civil date, never add elapsed 24-hour periods to an appointment.
    civil.setUTCDate(civil.getUTCDate()+days);
    const date=civil.toISOString().slice(0,10);
    if(!/^\d{4}-/.test(date))fail('SHIFT_INPUT_INVALID','Zieldatum außerhalb des gültigen Bereichs.');
    let target;try{target=resolveLocalTime(date,from.local.slice(11),post.timezone,'reject').instant;}catch(error){fail(error.code,`${post.title||postId}: ${error.message}`,{postId});}
    if(Date.parse(target)<=Date.parse(now))fail('PAST_TIME',`${post.title||postId}: Neuer Termin liegt nicht in der Zukunft.`,{postId});
    post.scheduledAt=target;variant.scheduledAt=target;
    entries.push({postId,channelId:variant.channelId,title:post.title,text:variant.body,from,to:timing(target,post.timezone)});
  }
  // Validate against the final batch, not the old selected positions. Include
  // fixed appointments and every planned variant; preserve existing queue gaps.
  for(const entry of entries){
    const channel=next.channels.find(c=>c.id===entry.channelId),gap=channel.postingSchedule?normalizePostingSchedule(channel.postingSchedule).minimumGapMinutes:0;
    for(const other of next.posts){
      if(other.id===entry.postId)continue;
      for(const variant of other.variants??[]){
        if(variant.channelId!==entry.channelId||variant.status!=='planned')continue;
        const at=variant.scheduledAt??other.scheduledAt;
        if(!Number.isFinite(Date.parse(at)))fail('EXISTING_SCHEDULE_INVALID','Vorhandenen Termin zuerst prüfen.',{postId:other.id});
        const reserved=other.scheduleBinding?.refs?.find(ref=>ref.channelId===entry.channelId)?.minimumGapMinutes??0;
        const distance=Math.abs(Date.parse(entry.to.instant)-Date.parse(at));
        if(distance===0||distance<Math.max(gap,reserved)*60000)fail('SLOT_TAKEN',`${entry.title||entry.postId}: Neuer Termin kollidiert mit einem Beitrag oder Mindestabstand.`,{postId:entry.postId,conflictingPostId:other.id});
      }
    }
  }
  validateScheduleChanges(next,snapshot,now);
  return {next,entries};
}
