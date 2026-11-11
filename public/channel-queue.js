import {calendarPosts,planningStatus} from './calendar-model.js';
import {filterPosts,dateKey} from './model.js';
import {inspectScheduleBinding} from './workflows/posting-schedules.mjs';

export const QUEUE_STATUSES=Object.freeze({planned:'Kommend',review:'Termin prüfen',past:'Vergangen',all:'Alle Termine'});
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// A civil display day, not a source-zone timestamp or a new posting time.
export function queueCalendarDay(value){
  if(typeof value!=='string'||!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value))return null;
  const day=new Date(`${value}T12:00`);
  return Number.isFinite(day.getTime())&&dateKey(day)===value?day:null;
}

// Read-only projection of confirmed planning. No queue jobs, writes or delivery evidence.
export function channelQueue(state,{channel='all',query='',tag='',status='planned',now=new Date()}={}){
  if(!Object.hasOwn(QUEUE_STATUSES,status))throw Error('Ungültiger Queue-Filter.');
  const zone=state.settings.timezone;
  const rows=calendarPosts(filterPosts(state.posts,{channel,query,tag,status:'scheduled'}),zone).map(post=>({
    ...post,planningStatus:planningStatus(post,{now,needsReview:!!post.scheduleBinding&&inspectScheduleBinding(post,state.channels).state==='needs_review'})
  }));
  return {
    channelName:channel==='all'?'Alle Planungsziele':state.channels.find(c=>c.id===channel)?.name||'Unbekanntes Planungsziel',
    zone,rows:rows.filter(post=>status==='all'||post.planningStatus.kind===status),
    counts:Object.fromEntries(Object.keys(QUEUE_STATUSES).map(key=>[key,key==='all'?rows.length:rows.filter(post=>post.planningStatus.kind===key).length])),
    draftCount:filterPosts(state.posts,{channel,status:'draft'}).length
  };
}

export function renderChannelQueue(state,{channel='all',query='',tag='',status='planned',now=new Date(),available=true,renderAgenda,actionsExpanded=false}={}){
  if(!available)return '<section class="queue-unavailable" role="status"><h2>Planung nicht verfügbar</h2><p>Die gespeicherte Planung konnte nicht geladen werden. Deshalb zeigen wir keine leere Queue oder bestätigten Zahlen.</p><p>Lade die Seite erneut, sobald die Verbindung wieder verfügbar ist.</p></section>';
  const model=channelQueue(state,{channel,query,tag,status,now});
  const filtered=!!query||!!tag;
  const suggestionsPaused=channel!=='all'&&state.channels.some(item=>item.id===channel&&item.postingSchedule?.paused===true);
  const heading={planned:'Deine nächsten Beiträge',review:'Termine zur Prüfung',past:'Vergangene Planung',all:'Deine gesamte Planung'}[status];
  const empty=filtered?'Keine passenden Beiträge.':status==='planned'?'Noch keine kommenden Beiträge.':status==='past'?'Keine vergangenen Termine.':status==='review'?'Keine Termine zur Prüfung.':'Noch keine eingeplanten Beiträge.';
  return `<section class="channel-queue" aria-label="Kanal-Queue"><header class="channel-queue-head"><div><span class="calendar-caption">${esc(model.channelName)} · Queue</span><h2>${heading}</h2>${suggestionsPaused?'<span class="queue-paused" role="status"><svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><path d="M2 1h2v8H2zm4 0h2v8H6z"/></svg> Vorschläge pausiert</span>':''}<p>Alle Zeiträume · ${esc(model.zone)}</p></div><details class="ui-disclosure channel-queue-actions" data-ui-actions="queue" ${actionsExpanded?'open':''}><summary>Queue-Aktionen</summary><div class="ui-disclosure-body">${channel!=='all'&&model.rows.filter(post=>queueSwapEligible(state,post,channel,now)).length>=2?'<button type="button" class="button subtle" data-action="queue-swap">Termine tauschen</button>':''}${model.rows.length?'<button type="button" class="button subtle" data-action="return-drafts">Als Entwürfe speichern</button>':''}${queueReflowAvailable(state,channel,now)?'<button type="button" class="button subtle" data-action="queue-reflow" aria-label="Gesamte Kanal-Queue neu einplanen">Neu einplanen</button>':''}<button type="button" class="button subtle" data-action="queue-drafts">Entwürfe ansehen (${model.draftCount})</button><button type="button" class="button subtle" data-action="queue-times">Posting-Zeiten</button></div></details></header><div class="queue-filter-row"><label for="queue-status">Planungsstatus</label><select id="queue-status">${Object.entries(QUEUE_STATUSES).map(([key,label])=>`<option value="${key}" ${status===key?'selected':''}>${label} (${model.counts[key]})</option>`).join('')}</select><p role="status">${model.rows.length} ${model.rows.length===1?'Beitrag':'Beiträge'}${filtered?' für deine Suche und Labels':''}</p>${filtered?'<button type="button" class="button subtle" data-action="queue-clear">Suche &amp; Labels zurücksetzen</button>':''}</div>${model.rows.length?renderAgenda(model.rows):`<p class="queue-empty">${empty}</p>`}</section>`;
}

// Availability only. The canonical adapter validates the complete affected prefix.
export function queuePriorityAvailable(state,post,channel,now=Date.now()){
  if(channel==='all'||post?.status!=='scheduled'||post.channels.length!==1||post.channels[0]!==channel||!post.scheduleBinding||!post.scheduledInstant||Date.parse(post.scheduledInstant)<=now)return false;
  if(!Number.isFinite(Date.parse(post.scheduledInstant))||inspectScheduleBinding(post,state.channels).state!=='current')return false;
  return state.posts.some(other=>other.id!==post.id&&other.scheduleBinding&&other.channels.includes(channel)&&Date.parse(other.scheduledInstant)>now&&Date.parse(other.scheduledInstant)<Date.parse(post.scheduledInstant));
}

// Availability is intentionally independent of search/labels and review status.
// The canonical workflow validates every future bound row, including hidden ones.
export function queueReflowAvailable(state,channel,now=new Date()){
  return channel!=='all'&&state.posts.some(post=>post.status==='scheduled'&&post.scheduleBinding&&post.channels.includes(channel)&&Number.isFinite(Date.parse(post.scheduledInstant))&&Date.parse(post.scheduledInstant)>Number(now));
}

export function queueSwapEligible(state,post,channel,now=Date.now()){
  const target=state.channels.find(item=>item.id===channel);
  return !!(channel!=='all'&&target?.enabled===true&&!target.postingSchedule?.paused&&post?.status==='scheduled'&&post.channels?.length===1&&post.channels[0]===channel&&post.scheduleBinding&&Number.isFinite(Date.parse(post.scheduledInstant))&&Date.parse(post.scheduledInstant)>Number(now)&&inspectScheduleBinding(post,state.channels).state==='current');
}
