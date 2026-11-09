import {calendarTime} from './calendar-model.js';
import {inspectScheduleBinding} from './workflows/posting-schedules.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const general={
  TARGETS_CHANGED:'Die ausgewählten Planungsziele passen nicht mehr zur Terminbindung.',
  INSTANT_CHANGED:'Die angezeigte Zeit passt nicht mehr zur Terminbindung.',
  POST_NOT_PLANNED:'Diese Terminbindung gehört nicht zu einem eingeplanten Beitrag.'
};

// Explanation only. The scheduling module remains authoritative for validation.
// No derived value is persisted or used as permission to replace a reservation.
export function planningGuidance(post,channels,{now=new Date(),needsReplan=false}={}){
  const issues=[],settings=new Map();
  const add=(code,text,channelId=null)=>issues.push({code,text,channelId});
  if(needsReplan)add('RECOVERY_REPLAN','Der wiederaufgenommene Termin muss bewusst neu gewählt werden. Die Arbeitsfassung reserviert keinen neuen Slot.');
  const diagnostic=inspectScheduleBinding(post,channels);
  for(const reason of diagnostic.reasons){
    const [code,channelId]=reason.split(':');
    const channel=channels.find(item=>item.id===channelId),name=channel?.name||'Betroffenes Planungsziel';
    if(code==='RULE_CHANGED'){
      const schedule=channel?.postingSchedule,ref=post.scheduleBinding?.refs?.find(item=>item.channelId===channelId);
      const slot=schedule?.slots?.find(item=>item.id===ref?.slotId),start=issues.length;
      if(schedule?.paused)add('PAUSED',`${name}: Neue Terminvorschläge sind pausiert. Das sagt diesen Termin nicht ab.`,channelId);
      if(!slot)add('SLOT_REMOVED',`${name}: Die gewählte Wochenzeit ist nicht mehr vorhanden.`,channelId);
      else if(ref&&(slot.time!==ref.local.slice(11)||slot.weekday!==new Date(ref.local.slice(0,10)+'T00:00:00Z').getUTCDay()))add('SLOT_CHANGED',`${name}: Die zugeordnete Wochenzeit wurde verändert.`,channelId);
      if(schedule&&ref){
        if(schedule.timezone!==ref.timezone)add('ZONE_CHANGED',`${name}: Die Zeitzone der Posting-Zeiten wurde von ${ref.timezone} auf ${schedule.timezone} geändert.`,channelId);
        if(schedule.minimumGapMinutes!==ref.minimumGapMinutes)add('GAP_CHANGED',`${name}: Der Mindestabstand zwischen Beiträgen wurde geändert.`,channelId);
        if(schedule.overlapChoice!==ref.overlapChoice)add('DST_RULE_CHANGED',`${name}: Die Regel für die doppelte Stunde bei der Zeitumstellung wurde geändert.`,channelId);
      }
      if(issues.length===start)add('RULE_CHANGED',`${name}: Die Posting-Zeiten passen nicht mehr zu dieser Terminbindung.`,channelId);
      if(channel&&channel.enabled!==false)settings.set(channel.id,{id:channel.id,name:channel.name});
    }else if(code==='SCHEDULE_MISSING'){
      add(code,`${name}: Es sind keine Posting-Zeiten mehr eingerichtet.`,channelId);
      if(channel&&channel.enabled!==false)settings.set(channel.id,{id:channel.id,name:channel.name});
    }else if(code==='CHANNEL_DISABLED')add(code,`${name}: Dieses Planungsziel ist deaktiviert. Der Termin wurde nicht automatisch entfernt.`,channelId);
    else if(code==='CHANNEL_MISSING')add(code,'Ein gebundenes Planungsziel ist nicht mehr vorhanden.',channelId);
    else add(code,general[code]||'Die Terminbindung lässt sich nicht verlässlich prüfen. Wähle den Termin bewusst neu.');
  }
  let instant=null,isPast=false;
  if(post.status==='scheduled'&&post.scheduledAt){
    try{instant=calendarTime(post,post.timeZone)?.instant||null;if(!Number.isFinite(Date.parse(instant)))throw Error();isPast=Date.parse(instant)<=now.getTime();}
    catch{add('TIME_INVALID','Die Zeitangabe ist ungültig oder wegen der Zeitumstellung nicht eindeutig. Prüfe Datum, Uhrzeit und Zeitzone.');}
  }
  const review=issues.length>0;
  if(isPast)add('PAST','Der vorgemerkte Zeitpunkt ist vorbei. Das bestätigt keine Veröffentlichung. Prüfe den Beitrag und plane ihn bei Bedarf neu.');
  return {kind:review?'review':isPast?'past':'none',instant,isPast,issues,settingsTargets:[...settings.values()]};
}

export function renderPlanningHint(post,channels,options={}){
  const result=planningGuidance(post,channels,options),id=esc('planning-hint-'+post.id);
  if(!result.issues.length)return `<span id="${id}" class="sr-only">Eingeplant. Kein Versandnachweis.</span>`;
  const title=result.kind==='review'?'Termin prüfen':'Termin vergangen';
  return `<span id="${id}" class="planning-row-hint ${result.kind}"><strong>${title}:</strong> ${esc(result.issues[0].text)}${result.issues.length>1?' Weitere Hinweise im Editor.':''}</span>`;
}

export function renderPlanningGuidance(post,channels,options={}){
  const result=planningGuidance(post,channels,options);
  if(!result.issues.length)return '';
  const title=result.kind==='review'?'Deinen Termin prüfen':'Dieser Zeitpunkt ist vorbei';
  return `<section class="planning-guidance ${result.kind}" aria-label="Planungshinweise"><h3>${title}</h3><ul>${result.issues.map(issue=>`<li>${esc(issue.text)}</li>`).join('')}</ul><p>Die Hinweise ändern keinen Termin. Erst bewusstes Einplanen speichert deine Eingabe; es wird nichts automatisch veröffentlicht.</p><div class="planning-guidance-actions"><button type="button" class="button subtle" data-action="find-posting-time">Freie Termine suchen</button>${result.settingsTargets.map(channel=>`<button type="button" class="button subtle" data-action="review-posting-times" data-review-channel="${esc(channel.id)}">${esc(channel.name)}: Posting-Zeiten prüfen</button>`).join('')}</div></section>`;
}
