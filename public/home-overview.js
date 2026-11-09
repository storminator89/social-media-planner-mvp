import {calendarPosts,planningStatus} from './calendar-model.js';
import {inspectScheduleBinding} from './workflows/posting-schedules.mjs';
import {displayTitle} from './model.js';

// Read-only projection of confirmed planner data. No publication/status API calls.
export function homeOverview(state,now=new Date()){
 const upcoming=[],overdue=[],review=[];
 for(const post of calendarPosts(state.posts.filter(p=>p.status==='scheduled'),state.settings.timezone)){
  const needsReview=!!post.scheduleBinding&&inspectScheduleBinding(post,state.channels).state==='needs_review';
  const status=planningStatus(post,{needsReview,now});
  const item={...post,planningStatus:status};
  if(!post.calendarTime)review.push({...item,planningStatus:{kind:'review',label:'Termin prüfen'}});
  else (status.kind==='review'?review:status.kind==='past'?overdue:upcoming).push(item);
 }
 overdue.reverse();
 const drafts=state.posts.filter(p=>p.status==='draft').slice().sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||'')||a.id.localeCompare(b.id));
 return {upcoming,overdue,review,drafts};
}
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderHomeOverview(state,now=new Date(),{available=true,expanded=new Set()}={}){
 if(!available)return '<section class="home-unavailable" role="status"><h2>Planung nicht verfügbar</h2><p>Beiträge nicht geladen. Kein bestätigter Stand.</p><p>Bei verfügbarer Verbindung neu laden.</p></section>';
 const model=homeOverview(state,now),zone=state.settings.timezone;
 const formatter=new Intl.DateTimeFormat('de-DE',{timeZone:zone,weekday:'short',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
 const channelNames=post=>(post.channels||[]).map(id=>state.channels.find(c=>c.id===id)?.name||id).join(' · ');
 const row=post=>{
  const draft=post.status==='draft',instant=draft?post.updatedAt:post.calendarTime?.instant;
  const time=instant&&Number.isFinite(Date.parse(instant))?`${draft?'Bearbeitet ':''}${formatter.format(new Date(instant))}`:draft?'Ohne Änderungsdatum':'Zeitangabe prüfen';
  return `<li><button class="home-post" data-post-id="${esc(post.id)}"><span class="home-post-copy"><strong>${esc(displayTitle(post))}</strong><small>${esc(time)}</small>${channelNames(post)?`<span class="home-channels">${esc(channelNames(post))}</span>`:''}</span><span class="home-post-status ${draft?'draft':post.planningStatus.kind}">${draft?'Weiterbearbeiten':esc(post.planningStatus.label)}</span></button></li>`;
 };
 const section=(key,title,empty,description)=>{
  const all=model[key],shown=expanded.has(key)?all:all.slice(0,5);
  return `<section class="home-section" aria-labelledby="home-${key}"><div class="home-section-head"><h2 id="home-${key}">${title}</h2><span class="home-count">${shown.length<all.length?`${shown.length} von ${all.length}`:all.length}</span></div>${description?`<p class="home-section-note">${description}</p>`:''}${all.length?`<ul class="home-posts">${shown.map(row).join('')}</ul>`:`<p class="home-empty">${empty}</p>`}${all.length>5?`<button class="button subtle home-expand" data-home-expand="${key}" aria-expanded="${expanded.has(key)}">${expanded.has(key)?'Weniger anzeigen':`Alle ${all.length} anzeigen`}</button>`:''}</section>`;
 };
 return `<div class="home-overview"><div class="home-intro"><p>Deine gesamte gespeicherte Planung · <strong>${esc(zone)}</strong></p><p>Kalenderfilter gelten hier nicht. Planung ist kein Versandnachweis.</p></div><div class="home-columns"><div>${section('upcoming','Als Nächstes geplant','Noch keine Termine. Beitrag erstellen oder Entwurf planen.','')}${model.review.length?section('review','Termin prüfen','','Termine prüfen, etwa nach geänderten Posting-Zeiten.'):''}</div><div>${section('overdue','Überfällige Planung','Keine vergangenen Planungstermine.','Vergangen heißt nicht veröffentlicht. Offene Arbeit prüfen.')}${section('drafts','Entwürfe weiterbearbeiten','Noch keine Entwürfe. Idee oder Beitrag erstellen.','')}</div></div><div class="home-footer"><button class="button subtle" data-home-view="calendar">Kalender öffnen</button><button class="button subtle" data-home-view="drafts">Alle Entwürfe öffnen</button><button class="button subtle" data-action="new-idea">Idee festhalten</button></div></div>`;
}
