/** Pure validation and date handling; no credentials, network, or browser storage. */
export const LIMITS = Object.freeze({channels:20,posts:100,variants:300,body:20000,jsonBytes:1024*1024,mediaPerVariant:10,uploadBytes:20*1024*1024,mediaCount:100,mediaTotalBytes:200*1024*1024});
export const PLATFORMS = Object.freeze(['instagram','facebook','linkedin','tiktok','youtube','threads','bluesky','mastodon','pinterest','x','other']);
export class PlannerError extends Error {
  constructor(status, code, message, details) { super(message); this.status=status; this.code=code; this.details=details; }
}
function fail(message) { throw new PlannerError(400,'INVALID_STATE',message); }
function obj(value,label) { if(!value || typeof value!=='object' || Array.isArray(value)) fail(`${label}: Objekt erwartet.`); return value; }
function str(value,label,max=200,empty=true) { if(typeof value!=='string' || value.length>max || (!empty && !value.trim())) fail(`${label}: ungültiger Text (max. ${max} Zeichen).`); return value; }
function choice(value,choices,label) { if(!choices.includes(value)) fail(`${label}: ungültiger Wert.`); return value; }
function arr(value,label,max) { if(!Array.isArray(value)||value.length>max) fail(`${label}: höchstens ${max} Einträge.`); return value; }
export function validId(value,label='ID') { if(typeof value!=='string'|| !/^[A-Za-z0-9_-]{1,100}$/.test(value)) fail(`${label}: ungültige ID.`); return value; }
export function timezone(value='UTC') {
  str(value,'Zeitzone',100,false);if(/^[+-]/.test(value))fail('Bitte eine IANA-Zeitzone statt eines festen UTC-Offsets verwenden.');
  try { new Intl.DateTimeFormat('en',{timeZone:value}).format(); } catch { fail('Unbekannte IANA-Zeitzone.'); }
  return value;
}
export function instant(value,label='Zeitpunkt') {
  if(value==null || value==='') return null;
  if(typeof value!=='string'|| !/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/.test(value)) fail(`${label}: ISO-Zeitpunkt mit UTC oder Offset erwartet.`);
  const clock=value.slice(11,19).split(':');if(Number(clock[0])>23||Number(clock[1])>59||(clock.length>2&&Number(clock[2])>59))fail(`${label}: ungültige Uhrzeit.`);
  const date=new Date(value); if(!Number.isFinite(date.getTime())) fail(`${label}: ungültiges Datum.`);
  // Reject calendar overflow that Date.parse would silently normalize.
  const calendar=value.slice(0,10); const check=new Date(`${calendar}T00:00:00Z`);
  if(!Number.isFinite(check.getTime()) || check.toISOString().slice(0,10)!==calendar) fail(`${label}: ungültiger Kalendertag.`);
  return date.toISOString();
}
function httpsUrl(value) { if(!value) return null; str(value,'Veröffentlichungslink',2048); let u; try {u=new URL(value);}catch {fail('Ungültiger Veröffentlichungslink.');} if(u.protocol!=='https:'||u.username||u.password) fail('Veröffentlichungslink muss HTTPS ohne Zugangsdaten verwenden.'); return u.href; }
function unique(items,label) { const set=new Set(); for(const item of items){if(set.has(item))fail(`${label}: doppelte ID.`);set.add(item);}return set; }
export function validateState(input,now=new Date().toISOString()) {
  obj(input,'Planer');
  if(!Number.isSafeInteger(input.revision)||input.revision<0) fail('Eine gültige Revision ist erforderlich.');
  const s=obj(input.settings,'Einstellungen');
  const settings={timezone:timezone(s.timezone??'UTC'),locale:choice(s.locale??'de-DE',['de-DE','en-GB','en-US'],'Sprache')};
  const channels=arr(input.channels,'Kanäle',LIMITS.channels).map(c=>{
    obj(c,'Kanal');if(c.connectionStatus!=null&&c.connectionStatus!=='manual')fail('Externe Kanäle sind hier noch nicht verbunden.');
    if(c.enabled!=null&&typeof c.enabled!=='boolean')fail('Kanal.enabled muss boolesch sein.');
    const color=c.color??'#64748b';if(!/^#[0-9a-f]{6}$/i.test(color))fail('Ungültige Kanalfarbe.');
    return {id:validId(c.id),platform:choice(c.platform,PLATFORMS,'Plattform'),name:str(c.name,'Kanalname',100,false),handle:str(c.handle??'','Handle',150),color,enabled:c.enabled??true,connectionStatus:'manual'};
  });
  const channelIds=unique(channels.map(c=>c.id),'Kanäle');
  let variantCount=0; const allVariantIds=[];
  const posts=arr(input.posts,'Beiträge',LIMITS.posts).map(p=>{
    obj(p,'Beitrag');const tz=timezone(p.timezone??settings.timezone);
    const scheduledAt=instant(p.scheduledAt);const stage=choice(p.stage??'draft',['idea','draft','planned','archived'],'Beitragsphase');
    if(stage==='planned'&&!scheduledAt) fail('Geplante Beiträge brauchen einen Zeitpunkt.');
    const variants=arr(p.variants,'Varianten',LIMITS.channels).map(v=>{
      obj(v,'Variante'); const id=validId(v.id);allVariantIds.push(id);variantCount++;
      const channelId=validId(v.channelId);if(!channelIds.has(channelId))fail('Eine Variante verweist auf einen unbekannten Kanal.');
      const status=choice(v.status??'draft',['draft','ready','planned','published','failed'],'Kanalstatus');
      const scheduled=instant(v.scheduledAt??scheduledAt);const publishedAt=instant(v.publishedAt);
      if(status==='planned'&&!scheduled)fail('Geplante Varianten brauchen einen Zeitpunkt.');
      if(status==='published'&&!publishedAt)fail('Manuell veröffentlichte Varianten brauchen ein Veröffentlichungsdatum.');
      if(status!=='published'&&(publishedAt||v.publishedUrl))fail('Veröffentlichungsdaten sind nur bei Status published erlaubt.');
      const mediaIds=arr(v.mediaIds??[],'Medien',LIMITS.mediaPerVariant).map(m=>validId(m,'Medien-ID'));unique(mediaIds,'Medien');
      return {id,channelId,body:str(v.body??p.body??'','Variantentext',LIMITS.body),format:choice(v.format??'post',['post','story','reel','video','carousel','article'],'Format'),status,scheduledAt:scheduled,timezone:timezone(v.timezone??tz),publishedAt,publishedUrl:httpsUrl(v.publishedUrl),statusNote:str(v.statusNote??'','Statusnotiz',1000),mediaIds};
    });
    unique(variants.map(v=>v.channelId),'Kanalvarianten');
    const tags=arr(p.tags??[],'Tags',20).map(t=>str(t,'Tag',60,false));
    return {id:validId(p.id),title:str(p.title??'','Titel',200),body:str(p.body??'','Beitragstext',LIMITS.body),stage,tags,cover:p.cover==null?null:choice(p.cover,['sunrise','forms','studio','nature'],'Titelbild'),scheduledAt,timezone:tz,createdAt:instant(p.createdAt)??now,updatedAt:now,variants};
  });
  unique(posts.map(p=>p.id),'Beiträge');unique(allVariantIds,'Varianten');if(variantCount>LIMITS.variants) fail(`Höchstens ${LIMITS.variants} Varianten.`);
  return {revision:input.revision,settings,channels,posts};
}
/** Resolve datetime-local in an IANA zone. DST gaps and overlaps are not silently guessed. */
export function resolveLocalTime(local,timeZone,disambiguation='reject') {
  timezone(timeZone);choice(disambiguation,['reject','earlier','later'],'Zeitauflösung');
  if(typeof local!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(local))fail('Lokales Datum muss YYYY-MM-DDTHH:mm verwenden.');
  const parsed=new Date(local+':00Z');if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,16)!==local)fail('Ungültiges lokales Datum.');
  const format=new Intl.DateTimeFormat('sv-SE',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const wall=t=>format.format(new Date(t)).replace(' ','T');
  // Collect possible offsets around the selected date, then test exact wall-time matches.
  const offsets=new Set(); const wallAsUtc=parsed.getTime();
  for(let delta=-36;delta<=36;delta+=6){const t=wallAsUtc+delta*3600000;offsets.add(new Date(wall(t)+':00Z').getTime()-t);}
  const matches=[...offsets].map(offset=>wallAsUtc-offset).filter(t=>wall(t)===local).sort((a,b)=>a-b);
  if(matches.length===0) throw new PlannerError(400,'DST_GAP','Diese lokale Uhrzeit existiert wegen der Zeitumstellung nicht.');
  if(matches.length>1&&disambiguation==='reject') throw new PlannerError(400,'DST_AMBIGUOUS','Diese Uhrzeit kommt zweimal vor. Bitte früheren oder späteren Zeitpunkt wählen.',{candidates:matches.map(t=>new Date(t).toISOString())});
  return new Date(disambiguation==='later'?matches.at(-1):matches[0]).toISOString();
}
