import {normalizeState,zonedInstant,validatePost} from './model.js';
export const IMPORT_MAX_BYTES=1024*1024;
const fail=message=>{throw Error(message);};
const fields=(v,names,label)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!names.includes(k)))fail(label+': unbekanntes Format oder zusätzliche Felder.');};
const stable=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
function parseJSON(source){
 let i=0,nodes=0;const ws=()=>{while(/[\t\r\n ]/.test(source[i]??'')&&i<source.length)i++;};
 function string(){const start=i++;while(i<source.length){const c=source[i++];if(c==='"'){try{return JSON.parse(source.slice(start,i));}catch{fail('Ungültiges JSON: doppelte Felder, ungültige Zeichen oder zu komplexe Struktur.');}}if(c==='\\'){if(source[i]==='u')i+=5;else i++;}else if(c.charCodeAt(0)<32)fail('Ungültiges JSON: doppelte Felder, ungültige Zeichen oder zu komplexe Struktur.');}fail('Ungültiges JSON: doppelte Felder, ungültige Zeichen oder zu komplexe Struktur.');}
 function value(depth){if(depth>24||++nodes>10000)fail('Ungültiges JSON: doppelte Felder, ungültige Zeichen oder zu komplexe Struktur.');ws();const c=source[i];if(c==='"')return string();if(c==='{'){i++;ws();const result=Object.create(null),keys=new Set();if(source[i]==='}'){i++;return result;}while(true){ws();if(source[i]!=='"')fail('Ungültiges JSON: doppelte Felder, ungültige Zeichen oder zu komplexe Struktur.');const key=string();if(keys.has(key))fail('Ungültiges JSON: doppelte Felder, ungültige Zeichen oder zu komplexe Struktur.');keys.add(key);ws();if(source[i++]!==':')fail('Ungültiges JSON: doppelte Felder, ungültige Zeichen oder zu komplexe Struktur.');result[key]=value(depth+1);ws();const end=source[i++];if(end==='}')return result;if(end!==',')fail('Ungültiges JSON: doppelte Felder, ungültige Zeichen oder zu komplexe Struktur.');}}if(c==='['){i++;ws();const result=[];if(source[i]===']'){i++;return result;}while(true){result.push(value(depth+1));ws();const end=source[i++];if(end===']')return result;if(end!==',')fail('Ungültiges JSON: doppelte Felder, ungültige Zeichen oder zu komplexe Struktur.');}}for(const [token,out] of [['true',true],['false',false],['null',null]])if(source.startsWith(token,i)){i+=token.length;return out;}const match=source.slice(i).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);if(!match)fail('Ungültiges JSON: doppelte Felder, ungültige Zeichen oder zu komplexe Struktur.');i+=match[0].length;const n=Number(match[0]);if(!Number.isFinite(n))fail('Ungültiges JSON: doppelte Felder, ungültige Zeichen oder zu komplexe Struktur.');return n;}
 const result=value(0);ws();if(i!==source.length)fail('Ungültiges JSON: doppelte Felder, ungültige Zeichen oder zu komplexe Struktur.');return result;
}

export function parsePlanningExport(text){
 if(typeof text!=='string'||new TextEncoder().encode(text).length>IMPORT_MAX_BYTES)fail('Datei ist größer als 1 MB.');
 let raw;try{raw=parseJSON(text);}catch{fail('Die Datei enthält kein gültiges JSON.');}
 const queue=[[raw,0]];while(queue.length){const [v,depth]=queue.pop();if(depth>30)fail('Datei ist zu tief verschachtelt.');if(v&&typeof v==='object')for(const [k,x] of Object.entries(v)){if(['__proto__','constructor','prototype'].includes(k))fail('Unzulässiger Objektschlüssel.');queue.push([x,depth+1]);}}
 fields(raw,['schemaVersion','revision','channels','settings','posts','exportedAt'],'Export');
 if(![2,3].includes(raw.schemaVersion)||!Array.isArray(raw.posts)||raw.posts.length>100)fail('Nur Takt-Planungsexporte mit Schema 2 oder 3 und höchstens 100 Einträgen werden unterstützt.');
 fields(raw.settings,['timezone'],'Einstellungen');
 if(!Array.isArray(raw.channels)||raw.channels.length>20)fail('Ungültige Kanäle.');
 for(const c of raw.channels)fields(c,['id','platform','name','handle','color','enabled','connectionStatus','postingSchedule'],'Kanal');
 const mediaField=raw.schemaVersion===2?'media':'mediaItems';
 for(const p of raw.posts){
  if(p?.status==='archived')fail('Archivierte Beiträge werden nicht importiert. Nichts übernommen.');
  fields(p,['id','title','tags','text','variantTexts','channels','status','scheduleBinding','scheduledInstant','scheduledAt','timeZone','cover',mediaField,'channelMediaItems','createdAt','updatedAt'],'Eintrag');
  if(['id','title','tags','text','variantTexts','channels','status','scheduleBinding','scheduledInstant','scheduledAt','timeZone','cover',mediaField,'createdAt','updatedAt'].some(k=>!Object.hasOwn(p,k)))fail('Eintrag enthält unvollständige Daten.');
  if(typeof p.title!=='string'||!Array.isArray(p.tags))fail('Titel und Labels müssen ausdrücklich Text und Liste sein.');
  if(typeof p.timeZone!=='string'||p.timeZone.length>100)fail('Ungültige Zeitzone.');
  if(!/^[A-Za-z0-9_-]{1,100}$/.test(p.id||'')||typeof p.text!=='string'||p.text.length>20000)fail('Ungültige ID oder zu langer Text.');
  if(Object.hasOwn(p,'channelMediaItems')&&(!p.channelMediaItems||typeof p.channelMediaItems!=='object'||Array.isArray(p.channelMediaItems)||Object.values(p.channelMediaItems).some(items=>!Array.isArray(items)||items.length)))fail('Dieser Export enthält Kanalmedien. Import abgebrochen, nichts weggelassen.');
  if((raw.schemaVersion===2?p.media!==null:!Array.isArray(p.mediaItems)||p.mediaItems.length!==0)||p.cover!==null)fail('Dieser Export enthält Medien oder Titelbilder. JSON enthält keine verlässlich übertragbare Bildsicherung. Import abgebrochen, nichts weggelassen.');
  if(p.scheduleBinding!==null)fail('Gebundene Posting-Zeiten werden nicht importiert. Bestehende Slot-Bindungen dürfen nicht auf einen anderen Planer übertragen werden.');
  if(!p.variantTexts||typeof p.variantTexts!=='object'||Array.isArray(p.variantTexts)||Object.keys(p.variantTexts).some(k=>!p.channels?.includes(k)))fail('Ungültige oder nicht zugeordnete Kanalvarianten.');
  for(const k of ['createdAt','updatedAt'])if(typeof p[k]!=='string'||!/^\d{4}-\d\d-\d\dT/.test(p[k])||!Number.isFinite(Date.parse(p[k]))||new Date(p[k]).toISOString()!==p[k])fail('Erstellungs-/Änderungszeit fehlt oder ist ungültig.');
 }
 if(raw.exportedAt!==undefined&&(typeof raw.exportedAt!=='string'||!Number.isFinite(Date.parse(raw.exportedAt))))fail('Exportzeit ungültig.');
 const normalized=normalizeState(raw);
 for(const p of normalized.posts){const errors=validatePost(p,new Date(0));if(errors.length)fail(errors.join(' '));}
 if(normalized.posts.reduce((n,p)=>n+p.channels.length,0)>300)fail('Höchstens 300 Kanalvarianten werden unterstützt.');
 return normalized;
}
// The server regenerates updatedAt and loads variants by generated ID, not
// selected-channel order. Neither is authoring content. Keep every other field
// strict; this projection is never used for the full-state concurrency baseline.
function duplicateRecord(post){
 const {updatedAt,...record}=post;
 return stable({...record,channels:[...record.channels].sort(),scheduledInstant:record.status==='scheduled'?manualInstant(record):record.scheduledInstant});
}
function manualInstant(post){
 const resolved=zonedInstant(post.scheduledAt,post.timeZone).toISOString();
 if(post.scheduledInstant!==null&&resolved!==post.scheduledInstant)fail('Ein UTC-Termin lässt sich nicht unverändert wiederherstellen. Kein Import.');
 return resolved;
}
export function previewPlanningImport(current,imported){
 const existing=new Map(current.posts.map(p=>[p.id,p]));const additions=[],duplicates=[],conflicts=[],expectedInstants=Object.create(null);
 for(const post of imported.posts){
  const resolved=post.status==='scheduled'?manualInstant(post):null;
  const prior=existing.get(post.id);
  if(prior){if(duplicateRecord(prior)===duplicateRecord(post))duplicates.push(post.id);else conflicts.push(post.id);}
  else{const addition=structuredClone(post);if(post.status==='scheduled'){expectedInstants[post.id]=resolved;addition.scheduledInstant=null;}additions.push(addition);}
 }
 if(conflicts.length)fail(`${conflicts.length} ID-Konflikt(e): bestehende Einträge unterscheiden sich. Kein Überschreiben, kein Teilimport. Betroffene IDs: ${conflicts.slice(0,5).join(', ')}`);
 if(current.posts.length+additions.length>100||[...current.posts,...additions].reduce((n,p)=>n+p.channels.length,0)>300)fail('Der Import würde die Grenze von 100 Einträgen oder 300 Kanalvarianten überschreiten.');
 for(const p of additions)if(p.channels.some(id=>!current.channels.some(c=>c.id===id)))fail('Ein Importkanal ist im aktuellen Planer nicht vorhanden.');
 return {revision:current.revision,baseline:stable(current),additions,duplicates,expectedInstants};
}
export function applyPlanningImport(current,preview){
 if(current.revision!==preview.revision||stable(current)!==preview.baseline)fail('Der Planer wurde seit der Vorschau geändert. Bitte Vorschau neu erstellen.');
 return normalizeState({...structuredClone(current),posts:[...structuredClone(current.posts),...structuredClone(preview.additions)]});
}
