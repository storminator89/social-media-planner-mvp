import {validateState} from './data-client/domain.mjs';
const statuses={draft:'Entwurf',ready:'Bereit',planned:'Eingeplant',published:'Als veröffentlicht markiert',failed:'Fehlgeschlagen'};
const formats={post:'Beitrag',story:'Story',reel:'Reel',video:'Video',carousel:'Karussell',article:'Artikel'};
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function readPostGroups(input){
 const data=validateState(input),channels=new Map(data.channels.map(c=>[c.id,c]));
 if(!Array.isArray(input.media)||input.media.length>100||input.media.some(m=>!m||typeof m.id!=='string'||typeof m.filename!=='string'||m.filename.length>1000)||new Set(input.media.map(m=>m.id)).size!==input.media.length)throw Error('Invalid media');
 const media=new Map(input.media.map(m=>[m.id,m]));
 return {revision:data.revision,posts:data.posts.filter(p=>p.variants.length).map(p=>({id:p.id,title:p.title||Array.from((p.body||p.variants.find(v=>v.body)?.body||'Beitrag').replace(/\s+/g,' ').trim()).slice(0,80).join(''),archived:p.stage==='archived',variants:p.variants.map(v=>({id:v.id,channel:channels.get(v.channelId).name,status:v.status,body:v.body,format:v.format,scheduledAt:v.scheduledAt,timezone:v.timezone,publishedAt:v.publishedAt,publishedUrl:v.publishedUrl,statusNote:v.statusNote,media:v.mediaIds.map(id=>({id,name:media.get(id)?.filename||'Medium nicht verfügbar'}))}))}))};
}
/** Pure view projection: never changes canonical data or write permissions. */
export function filterPostGroups(data,{query='',status=''}={}){
 const needle=String(query).trim().toLocaleLowerCase('de-DE');
 const posts=data.posts.flatMap(post=>{
  const titleMatches=post.title.toLocaleLowerCase('de-DE').includes(needle);
  const variants=post.variants.filter(v=>(!status||v.status===status)&&(!needle||titleMatches||[v.channel,v.body,v.statusNote,...v.media.map(m=>m.name)].some(value=>String(value??'').toLocaleLowerCase('de-DE').includes(needle))));
  return variants.length?[{...post,variants,totalVariants:post.variants.length}]:[];
 });
 return {...data,posts};
}
function time(value,zone){return value?`<time datetime="${escape(value)}">${escape(new Intl.DateTimeFormat('de-DE',{timeZone:zone,dateStyle:'medium',timeStyle:'short'}).format(new Date(value)))}</time><small>${escape(zone)}</small>`:'<span class="muted">Kein Termin</span>';}
export function renderPostGroups(data,{filtered=false}={}){
 if(!data.posts.length)return `<p class="empty">${filtered?'Keine Treffer.':'Noch keine Kanalbeiträge.'}</p>`;
 return data.posts.map(p=>`<article class="group"><h2>${escape(p.title)}${p.archived?'<span class="readonly">Archiv</span>':''}${p.totalVariants>p.variants.length?`<span class="readonly">${p.variants.length} / ${p.totalVariants} Kanäle</span>`:''}</h2><div class="variants">${p.variants.map(v=>`<details class="variant"><summary><span class="channel"><span class="channel-symbol" aria-hidden="true">${escape(v.channel.slice(0,1).toUpperCase())}</span>${escape(v.channel)}</span><span class="badge ${escape(v.status)}">${escape(statuses[v.status])}</span><span class="timing">${time(v.scheduledAt,v.timezone)}</span><span class="chevron" aria-hidden="true">⌄</span></summary><div class="variant-content"><span class="format">${escape(formats[v.format])}</span><p class="body">${escape(v.body)||'<span class="muted">Ohne Text</span>'}</p>${v.statusNote?`<p class="note">${escape(v.statusNote)}</p>`:''}${v.publishedAt?`<div class="published-time"><span>Veröffentlicht laut Eintrag</span>${time(v.publishedAt,v.timezone)}</div>`:''}${v.publishedUrl?`<a class="published-link" href="${escape(v.publishedUrl)}" target="_blank" rel="noopener noreferrer">Gespeicherter Link ↗</a>`:''}${v.media.length?`<ul class="media" aria-label="Medien in gespeicherter Reihenfolge">${v.media.map(m=>`<li><span aria-hidden="true">▧</span> ${escape(m.name)}</li>`).join('')}</ul>`:''}</div></details>`).join('')}</div></article>`).join('');
}
export function createPostGroupsReader({load,onState}){let generation=0;return {async refresh(){const own=++generation;onState({phase:'loading'});try{const data=readPostGroups(await load());if(own===generation)onState({phase:'ready',data});}catch{if(own===generation)onState({phase:'error'});}},cancel(){generation++;}};}
