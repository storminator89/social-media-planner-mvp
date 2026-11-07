import { resolveLocalTime as resolveWorkflowTime } from './workflows/workflows.mjs';
export const CHANNELS = [
  { id: 'instagram', name: 'Instagram', handle: '@studio.nord', limit: 2200, color: '#b54488', abbreviation: 'ig' },
  { id: 'linkedin', name: 'LinkedIn', handle: 'Studio Nord', limit: 3000, color: '#2866aa', abbreviation: 'in' },
  { id: 'bluesky', name: 'Bluesky', handle: '@studionord.example', limit: 300, color: '#1680d9', abbreviation: 'bs' }
];
export const STORAGE_KEY = 'takt-social-planner-v1';
export const SCHEMA_VERSION = 1;
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
export function displayTitle(post) { const text = post.text.trim().split('\n')[0]; return text.length > 68 ? `${text.slice(0,65)}…` : text || 'Neuer Entwurf'; }
export function characterCount(text) { return Array.from(text).length; }
export function validatePost(post, now = new Date()) {
  const errors = [];
  if (!post.text?.trim()) errors.push('Schreibe zuerst einen Beitrag.');
  if (!Array.isArray(post.channels) || !post.channels.length) errors.push('Wähle mindestens einen Kanal.');
  for (const id of post.channels || []) {
    const channel = CHANNELS.find(c => c.id === id);
    if (!channel) errors.push('Ein ausgewählter Kanal ist ungültig.');
    else if (characterCount(post.text || '') > channel.limit) errors.push(`${channel.name}: maximal ${channel.limit.toLocaleString('de-DE')} Zeichen.`);
  }
  if (post.media && !post.media.alt?.trim()) errors.push('Ergänze einen Alternativtext für dein Bild.');
  if (post.status === 'scheduled') {
    try {const date=zonedInstant(post.scheduledAt,post.timeZone||defaultTimeZone());if(date<=now)errors.push('Wähle einen Zeitpunkt in der Zukunft.')}catch(error){errors.push(error.message)}
  }
  return [...new Set(errors)];
}
export function createDemoState(now = new Date()) {
  const week = startOfWeek(addDays(now, 7));
  const entries = [
    ['Eine gute Woche beginnt mit einer guten Idee. ☀️\n\nWir nehmen euch mit hinter die Kulissen unseres Studios. Was steht bei euch diese Woche an?\n\n#StudioNord #KreativAlltag', ['instagram','linkedin'], 0, '09:00', 'sunrise'],
    ['Weniger Tabs. Mehr gute Ideen.\n\nUnser kleiner Workflow-Tipp: Erst Gedanken sammeln, dann Formate wählen. So bleibt mehr Raum für das Wesentliche.', ['linkedin'], 1, '10:30', null],
    ['Kleine Dinge, große Wirkung.\n\nNeue Formen, warme Farben und ein frischer Blick auf unseren Arbeitsplatz. Welches Detail inspiriert euch?\n\n#DesignInspiration', ['instagram'], 2, '12:00', 'forms'],
    ['Was macht einen guten Arbeitstag aus? Für uns: ein klarer Fokus, ein Spaziergang und ein ehrliches Gespräch. Und für euch?', ['bluesky'], 3, '09:00', null],
    ['Ein Blick hinter die Kulissen.\n\nDiese Woche haben wir an etwas Neuem gearbeitet. Hier ist ein kleiner Einblick in unseren Prozess. ✨', ['instagram','linkedin'], 4, '14:00', 'studio'],
    ['Zeit für frische Perspektiven. 🌿\n\nWir sammeln am Wochenende Inspiration draußen. Die besten Ideen kommen manchmal, wenn man nicht nach ihnen sucht.', ['instagram'], 6, '10:00', 'nature']
  ];
  const posts = entries.map((e,i) => ({id:`demo-${i+1}`,text:e[0],channels:e[1],scheduledAt:localDateTime(addDays(week,e[2]),e[3]),status:'scheduled',cover:e[4],media:null,createdAt:now.toISOString(),updatedAt:now.toISOString()}));
  posts.push({id:'demo-draft-1',text:'3 Dinge, die wir diesen Monat gelernt haben.\n\n1. Gute Fragen sind oft wertvoller als schnelle Antworten.\n2. Kleine Schritte bringen uns weiter.\n3. …',channels:['linkedin'],scheduledAt:null,status:'draft',cover:null,media:null,createdAt:now.toISOString(),updatedAt:now.toISOString()});
  posts.push({id:'demo-draft-2',text:'Eine neue Idee nimmt Form an.\n\nMehr dazu bald. ✨',channels:['instagram'],scheduledAt:null,status:'draft',cover:'forms',media:null,createdAt:now.toISOString(),updatedAt:now.toISOString()});
  return {schemaVersion:SCHEMA_VERSION,settings:{timezone:defaultTimeZone()},posts:posts.map(p=>({...p,timeZone:defaultTimeZone()}))};
}
export function normalizeState(value) {
  if (!value || value.schemaVersion !== SCHEMA_VERSION || !Array.isArray(value.posts)) throw new Error('Die gespeicherten Planungsdaten haben ein unbekanntes Format.');
  const timezone=isTimeZone(value.settings?.timezone)?value.settings.timezone:defaultTimeZone();
  const ids = new Set();
  const posts = value.posts.map(p => {
    if (!p || typeof p.id !== 'string' || ids.has(p.id) || typeof p.text !== 'string' || !Array.isArray(p.channels) || p.channels.some(id=>!CHANNELS.some(c=>c.id===id)) || !['draft','scheduled'].includes(p.status)) throw new Error('Die gespeicherten Planungsdaten sind beschädigt.');
    ids.add(p.id);
    if (p.status==='scheduled' && (!p.scheduledAt || !Number.isFinite(new Date(p.scheduledAt).getTime()))) throw new Error('Ein gespeicherter Termin ist ungültig.');
    let media=null;
    if(p.media){
      const metadata={alt:String(p.media.alt||''),name:String(p.media.name||'Bild'),type:String(p.media.type||'image/jpeg')};
      if(typeof p.media.dataUrl==='string'&&/^data:image\/(png|jpeg|webp);base64,/.test(p.media.dataUrl))media={...metadata,dataUrl:p.media.dataUrl};
      else if(typeof p.media.url==='string'&&/^\/api\/planner\/media\/[A-Za-z0-9_-]+$/.test(p.media.url))media={...metadata,id:String(p.media.id||p.media.url.split('/').pop()),url:p.media.url};
    }
    return {id:p.id,text:p.text,channels:[...new Set(p.channels)],status:p.status,scheduledAt:p.scheduledAt||null,timeZone:isTimeZone(p.timeZone)?p.timeZone:timezone,cover:['sunrise','forms','studio','nature'].includes(p.cover)?p.cover:null,media,createdAt:p.createdAt||new Date().toISOString(),updatedAt:p.updatedAt||new Date().toISOString()};
  });
  return {schemaVersion:SCHEMA_VERSION,settings:{timezone},posts};
}
export function filterPosts(posts,{channel='all',query='',status='all'}={}) {
  const needle=query.trim().toLocaleLowerCase('de');
  return posts.filter(p=>(channel==='all'||p.channels.includes(channel))&&(status==='all'||p.status===status)&&(!needle||p.text.toLocaleLowerCase('de').includes(needle)));
}
