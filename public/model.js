import {normalizeMediaItems,normalizeChannelMediaItems,effectiveMediaItems,allReferencedMediaItems} from './workflows/media-items.mjs';
export {normalizeMediaItems,normalizeChannelMediaItems,effectiveMediaItems,allReferencedMediaItems} from './workflows/media-items.mjs';
import { normalizeEditorialMetadata, validateIdea } from './ideas.js';
import { effectiveText, selectedVariantTexts, channelTextChecks, searchableText } from './variants.js';
import { resolveLocalTime as resolveWorkflowTime } from './workflows/workflows.mjs';
import { normalizePostingSchedule, normalizeScheduleBinding, scheduleLocalTime, validatePostScheduleBinding } from './workflows/posting-schedules.mjs';
export const CHANNELS = [
  { id: 'instagram', name: 'Instagram', handle: '@studio.nord', limit: 2200, color: '#b54488', abbreviation: 'ig' },
  { id: 'linkedin', name: 'LinkedIn', handle: 'Studio Nord', limit: 3000, color: '#2866aa', abbreviation: 'in' },
  { id: 'bluesky', name: 'Bluesky', handle: '@studionord.example', limit: 300, color: '#1680d9', abbreviation: 'bs' },
  { id: 'mastodon', name: 'Mastodon', handle: 'kanoa.de · Planungsziel', limit: 500, color: '#6364ff', abbreviation: 'm' }
];
export const SCHEMA_VERSION = 3;
export function defaultTimeZone(){return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'}
export function isTimeZone(zone){if(typeof zone!=='string'||/^[+-]/.test(zone))return false;try{new Intl.DateTimeFormat('en',{timeZone:zone}).format();return typeof zone==='string'&&zone.length>0}catch{return false}}
function zoneParts(date,zone){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date);return Object.fromEntries(parts.filter(p=>p.type!=='literal').map(p=>[p.type,p.value]))}
export function zonedNow(zone,now=new Date()){const p=zoneParts(now,zone);return new Date(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`)}
export function zonedInstant(local,zone){
  if(!isTimeZone(zone)||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local||''))throw new Error('Wähle ein gültiges Datum, eine Uhrzeit und eine Zeitzone.');
  try { return new Date(resolveWorkflowTime(local.slice(0,10),local.slice(11),zone).instant); }
  catch(error){if(error.code==='DST_AMBIGUOUS')throw new Error('Diese Uhrzeit ist wegen der Zeitumstellung mehrdeutig. Wähle eine andere Zeit.');throw error;}
}
export function dateKey(date) { const d = new Date(date); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
export function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate()+n); return d; }
export function startOfWeek(date) { const d = new Date(date); d.setHours(0,0,0,0); d.setDate(d.getDate()-((d.getDay()+6)%7)); return d; }
export function localDateTime(date, time = '10:00') { return `${dateKey(date)}T${time}`; }
export function postDate(post) { return post.scheduledAt ? new Date(post.scheduledAt) : null; }
export function displayTitle(post) { const text = (post.text.trim()||(post.channels||[]).map(id=>effectiveText(post,id)).find(t=>t?.trim())||'').trim().split('\n')[0]; return text.length > 68 ? `${text.slice(0,65)}…` : text || 'Neuer Entwurf'; }
export function characterCount(text) { return Array.from(text).length; }
/** Validate the UI projection only. The adapter must still verify that a fixed
 * UTC instant came from its confirmed snapshot or its bounded Undo cache. */
function normalizePostSchedule(post) {
  if (!Object.hasOwn(post,'scheduleBinding') || !Object.hasOwn(post,'scheduledInstant')) throw new Error('Terminbindung und UTC-Zeitpunkt müssen ausdrücklich angegeben werden.');
  const scheduleBinding=normalizeScheduleBinding(post.scheduleBinding);
  const scheduledInstant=post.scheduledInstant;
  if (!isTimeZone(post.timeZone)) throw new Error('Wähle eine gültige IANA-Zeitzone.');
  if (post.status!=='scheduled') {
    if (post.scheduledAt!==null || scheduledInstant!==null || scheduleBinding!==null) throw new Error('Entwürfe und Ideen dürfen keine Terminangaben behalten.');
    return {scheduledAt:null,scheduledInstant:null,scheduleBinding:null,timeZone:post.timeZone};
  }
  if (typeof post.scheduledAt!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(post.scheduledAt)) throw new Error('Ein gespeicherter Termin ist ungültig.');
  if (scheduledInstant!==null) {
    if (typeof scheduledInstant!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(scheduledInstant) || !Number.isFinite(Date.parse(scheduledInstant)) || new Date(scheduledInstant).toISOString()!==scheduledInstant) throw new Error('Der gespeicherte UTC-Zeitpunkt ist ungültig.');
    if (scheduleLocalTime(scheduledInstant,post.timeZone)!==post.scheduledAt) throw new Error('Die gespeicherte Ortszeit stimmt nicht mit ihrem UTC-Zeitpunkt überein.');
  }
  if (scheduleBinding!==null) {
    if (scheduledInstant!==scheduleBinding.instant) throw new Error('Queue-Bindung und UTC-Zeitpunkt müssen übereinstimmen.');
    validatePostScheduleBinding({status:post.status,channels:post.channels,scheduledAt:scheduledInstant,scheduleBinding});
  } else if (scheduledInstant===null) {
    // New/manual times are always resolved afresh with the safe reject policy.
    zonedInstant(post.scheduledAt,post.timeZone);
  }
  return {scheduledAt:post.scheduledAt,scheduledInstant,scheduleBinding,timeZone:post.timeZone};
}
function normalizeChannelDefinitions(channels) {
  if (!Array.isArray(channels) || channels.length>20) throw new Error('Vollständige Kanaldefinitionen sind erforderlich.');
  const fields=['id','platform','name','handle','color','enabled','connectionStatus','postingSchedule'];
  const seen=new Set();
  return channels.map(channel=>{
    if (!channel || typeof channel!=='object' || Array.isArray(channel) || fields.some(key=>!Object.hasOwn(channel,key)) || Object.keys(channel).some(key=>!fields.includes(key))) throw new Error('Ein Kanal enthält fehlende oder unbekannte Felder.');
    if (!CHANNELS.some(c=>c.id===channel.id) || seen.has(channel.id) || channel.platform!==channel.id || typeof channel.name!=='string' || !channel.name.trim() || channel.name.length>100 || typeof channel.handle!=='string' || channel.handle.length>150 || typeof channel.color!=='string' || !/^#[0-9a-f]{6}$/i.test(channel.color) || typeof channel.enabled!=='boolean' || channel.connectionStatus!=='manual') throw new Error('Eine gespeicherte Kanaldefinition ist ungültig.');
    seen.add(channel.id);
    return {...channel,postingSchedule:normalizePostingSchedule(channel.postingSchedule)};
  });
}
export function validatePost(post, now = new Date()) {
  const errors = [];
  let schedule;
  try{schedule=normalizePostSchedule(post)}catch(error){errors.push(error.message)}
  try{if(Object.hasOwn(post,'media'))throw Error('Veraltetes Bildfeld.');for(const media of allReferencedMediaItems(post))if(!media.alt.trim())errors.push(media.type.startsWith('video/')?'Ergänze eine Beschreibung für das Video.':'Ergänze einen Alternativtext für jedes Bild.');}catch(error){errors.push(error.message)}
  if(post.status==='idea')return [...new Set([...errors,...validateIdea(post)])];
  try{normalizeEditorialMetadata(post)}catch(error){errors.push(error.message)}
  if (!post.text?.trim() && !(post.channels||[]).some(id=>effectiveText(post,id)?.trim())) errors.push('Schreibe zuerst einen Beitrag.');
  if (!Array.isArray(post.channels) || (post.status !== 'draft' && !post.channels.length)) errors.push('Wähle mindestens einen Kanal.');
  if (post.status === 'draft' && Array.isArray(post.channels) && !post.channels.length && post.mediaItems?.length) errors.push('Ein Bild braucht mindestens einen Zielkanal. Wähle zuerst einen Kanal.');
  for (const result of channelTextChecks(post,CHANNELS)) {
    if (result.unknown) errors.push('Ein ausgewählter Kanal ist ungültig.');
    else if(post.status==='scheduled') {
      if(result.empty) errors.push(`${result.name}: Ergänze einen Beitragstext.`);
      if(result.overLimit) errors.push(`${result.name}: maximal ${result.limit.toLocaleString('de-DE')} Zeichen (${result.count.toLocaleString('de-DE')} vorhanden).`);
    }
  }

  if (post.status === 'scheduled' && schedule) {
    const date=schedule.scheduledInstant===null?zonedInstant(schedule.scheduledAt,schedule.timeZone):new Date(schedule.scheduledInstant);
    if(date<=now)errors.push('Wähle einen Zeitpunkt in der Zukunft.');
  }
  return [...new Set(errors)];
}
export function createDemoState(now = new Date()) {
  const week = startOfWeek(addDays(now, 7));
  const timezone=defaultTimeZone();
  const entries = [
    ['Eine gute Woche beginnt mit einer guten Idee. ☀️\n\nWir nehmen euch mit hinter die Kulissen unseres Studios. Was steht bei euch diese Woche an?\n\n#StudioNord #KreativAlltag', ['instagram','linkedin'], 0, '09:00', 'sunrise'],
    ['Weniger Tabs. Mehr gute Ideen.\n\nUnser kleiner Workflow-Tipp: Erst Gedanken sammeln, dann Formate wählen. So bleibt mehr Raum für das Wesentliche.', ['linkedin'], 1, '10:30', null],
    ['Kleine Dinge, große Wirkung.\n\nNeue Formen, warme Farben und ein frischer Blick auf unseren Arbeitsplatz. Welches Detail inspiriert euch?\n\n#DesignInspiration', ['instagram'], 2, '12:00', 'forms'],
    ['Was macht einen guten Arbeitstag aus? Für uns: ein klarer Fokus, ein Spaziergang und ein ehrliches Gespräch. Und für euch?', ['bluesky'], 3, '09:00', null],
    ['Ein Blick hinter die Kulissen.\n\nDiese Woche haben wir an etwas Neuem gearbeitet. Hier ist ein kleiner Einblick in unseren Prozess. ✨', ['instagram','linkedin'], 4, '14:00', 'studio'],
    ['Zeit für frische Perspektiven. 🌿\n\nWir sammeln am Wochenende Inspiration draußen. Die besten Ideen kommen manchmal, wenn man nicht nach ihnen sucht.', ['instagram'], 6, '10:00', 'nature']
  ];
  const posts = entries.map((e,i) => ({id:`demo-${i+1}`,text:e[0],channels:e[1],scheduledAt:localDateTime(addDays(week,e[2]),e[3]),status:'scheduled',cover:e[4],mediaItems:[],createdAt:now.toISOString(),updatedAt:now.toISOString()}));
  posts.push({id:'demo-draft-1',text:'3 Dinge, die wir diesen Monat gelernt haben.\n\n1. Gute Fragen sind oft wertvoller als schnelle Antworten.\n2. Kleine Schritte bringen uns weiter.\n3. …',channels:['linkedin'],scheduledAt:null,status:'draft',cover:null,mediaItems:[],createdAt:now.toISOString(),updatedAt:now.toISOString()});
  posts.push({id:'demo-draft-2',text:'Eine neue Idee nimmt Form an.\n\nMehr dazu bald. ✨',channels:['instagram'],scheduledAt:null,status:'draft',cover:'forms',mediaItems:[],createdAt:now.toISOString(),updatedAt:now.toISOString()});
  const channels=CHANNELS.map(({id,name,handle,color})=>({id,platform:id,name,handle,color,enabled:true,connectionStatus:'manual',postingSchedule:null}));
  return {schemaVersion:SCHEMA_VERSION,revision:0,channels,settings:{timezone},posts:posts.map(p=>({...p,title:'',tags:[],timeZone:timezone,variantTexts:{},scheduleBinding:null,scheduledInstant:null}))};
}
export function normalizeState(value) {
  if (!value || ![2,SCHEMA_VERSION].includes(value.schemaVersion) || !Array.isArray(value.posts)) throw new Error('Die gespeicherten Planungsdaten haben ein unbekanntes Format.');
  if (!Number.isSafeInteger(value.revision) || value.revision<0) throw new Error('Eine bestätigte Planungsrevision ist erforderlich.');
  if (!isTimeZone(value.settings?.timezone)) throw new Error('Die gespeicherte IANA-Zeitzone ist ungültig.');
  const timezone=value.settings.timezone;
  const channels=normalizeChannelDefinitions(value.channels);
  const channelIds=new Set(channels.map(channel=>channel.id));
  const ids = new Set();
  const posts = value.posts.map(p => {
    if (!p || typeof p.id !== 'string' || ids.has(p.id) || typeof p.text !== 'string' || !Array.isArray(p.channels) || p.channels.some(id=>!channelIds.has(id)) || new Set(p.channels).size!==p.channels.length || !['idea','draft','scheduled','archived'].includes(p.status)) throw new Error('Die gespeicherten Planungsdaten sind beschädigt.');
    ids.add(p.id);
    const metadata=normalizeEditorialMetadata(p);
    if(Object.hasOwn(p,'media')&&Object.hasOwn(p,'mediaItems'))throw Error('Mehrdeutige Bildfelder.');
    let mediaItems;
    if(value.schemaVersion===2){if(!Object.hasOwn(p,'media')||Object.hasOwn(p,'mediaItems'))throw Error('Das alte Bildfeld fehlt.');mediaItems=normalizeMediaItems(p.media===null?[]:[p.media]);}
    else {if(Object.hasOwn(p,'media'))throw Error('Veraltetes Bildfeld.');mediaItems=normalizeMediaItems(p.mediaItems);}
    const channelMedia=Object.hasOwn(p,'channelMediaItems')?{channelMediaItems:normalizeChannelMediaItems(p.channelMediaItems,p.channels,mediaItems)}:{};
    if(p.status==='idea'&&(p.channels.length||p.scheduledAt||mediaItems.length||p.cover||Object.keys(p.variantTexts||{}).length))throw new Error('Eine Idee enthält noch nicht unterstützte Kanal-, Bild- oder Terminangaben.');
    const schedule=normalizePostSchedule(p);
    return {id:p.id,...metadata,text:p.text,variantTexts:selectedVariantTexts(p.variantTexts,p.channels),channels:[...new Set(p.channels)],status:p.status,...schedule,cover:['sunrise','forms','studio','nature'].includes(p.cover)?p.cover:null,mediaItems,...channelMedia,createdAt:p.createdAt||new Date().toISOString(),updatedAt:p.updatedAt||new Date().toISOString()};
  });
  return {schemaVersion:SCHEMA_VERSION,revision:value.revision,channels,settings:{timezone},posts};
}
export function filterPosts(posts,{channel='all',query='',status='all',tag=''}={}) {
  const needle=query.trim().toLocaleLowerCase('de');
  return posts.filter(p=>(channel==='all'||p.channels.includes(channel))&&(status==='all'||p.status===status)&&(tag===''||(p.tags||[]).includes(tag))&&(!needle||searchableText(p).toLocaleLowerCase('de').includes(needle)));
}
