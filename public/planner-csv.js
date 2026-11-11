import {IMPORT_MAX_BYTES} from './planner-import.js';
import {normalizeState,validatePost,zonedInstant,isTimeZone} from './model.js';
import {parseIdeaTags} from './workflows/ideas.mjs';

const fail=message=>{throw Error(message);};
const HEADERS=['Text','Tags','Image URL','Posting Time'];

// Bounded, strict CSV reader. Quoted commas/newlines/escaped quotes are data.
// No eval, formula expansion, remote media lookup or guessed date formats.
function records(source,delimiter){
 const rows=[];let row=[],cell='',quoted=false,closed=false,started=false;
 function field(){row.push(cell);if(row.length>HEADERS.length)fail('CSV enthält zu viele Spalten.');cell='';closed=false;started=false;}
 function record(){field();rows.push(row);row=[];if(rows.length>101)fail('CSV darf höchstens 100 Beiträge enthalten.');}
 for(let i=0;i<source.length;i++){
  const c=source[i];
  if(quoted){if(c==='"'){if(source[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;}
  else if(c===delimiter)field();
  else if(c==='\n'||c==='\r'){record();if(c==='\r'&&source[i+1]==='\n')i++;}
  else if(c==='"'){if(started||closed)fail('CSV: Anführungszeichen nur am Feldanfang verwenden.');quoted=true;started=true;}
  else{if(closed)fail('CSV: Nach einem Anführungszeichen fehlt ein Trennzeichen.');cell+=c;started=true;}
  if(cell.length>20000)fail('Ein CSV-Feld ist länger als 20.000 Zeichen.');
 }
 if(quoted)fail('CSV: Ein Anführungszeichen ist noch offen.');
 if(started||closed||row.length||cell.length)record();
 return rows;
}

export function parseDraftCSV(text){
 if(typeof text!=='string'||new TextEncoder().encode(text).length>IMPORT_MAX_BYTES)fail('Datei ist größer als 1 MB.');
 const source=text.replace(/^\uFEFF/,'');
 if(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(source))fail('CSV enthält unzulässige Steuerzeichen.');
 // Excel's semicolon separator is accepted only when the header identifies it.
 const first=source.split(/[\r\n]/,1)[0];
 const rows=records(source,!first.includes(',')&&first.includes(';')?';':',');
 const headers=rows.shift();
 if(!headers?.includes('Text')||new Set(headers).size!==headers.length||headers.some(h=>!HEADERS.includes(h)))fail('CSV-Spalten ungültig. Erlaubt: Text, Tags, Image URL, Posting Time. Text ist Pflicht.');
 if(!rows.length)fail('CSV enthält noch keine Beiträge.');
 return rows.map((cells,index)=>{
  const label=`Eintrag ${index+1}`;
  if(cells.length!==headers.length)fail(`${label}: Die Spaltenzahl stimmt nicht mit der Kopfzeile überein.`);
  const get=name=>cells[headers.indexOf(name)]??'';
  if(get('Image URL').trim())fail(`${label}: Bilder nicht unterstützt.`);
  const time=get('Posting Time');let postingTime;
  if(time.trim()){
   if(!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(time))fail(`${label}: Posting Time muss YYYY-MM-DD HH:mm verwenden.`);
   postingTime=time.replace(' ','T');
   try{zonedInstant(postingTime,'UTC');}catch{fail(`${label}: Datum oder Uhrzeit ist ungültig.`);}
  }
  const body=get('Text');if(!body.trim())fail(`${label}: Text fehlt.`);
  let tags;try{tags=parseIdeaTags(get('Tags'));}catch(error){fail(`${label}: ${error.message}`);}
  return {text:body,tags,...(postingTime?{postingTime}:{})};
 });
}

export async function csvDraftState(current,text,channelId,{now=new Date().toISOString(),timezone=null}={}){
 const state=normalizeState(structuredClone(current));
 if(!state.channels.some(c=>c.id===channelId&&c.enabled))fail('Aktiven Kanal wählen.');
 if(typeof now!=='string'||!Number.isFinite(Date.parse(now))||new Date(now).toISOString()!==now)fail('Importzeit ungültig.');
 const entries=parseDraftCSV(text),occurrences=new Map(),existing=new Map(state.posts.map(p=>[p.id,p]));
 let zone=null;
 if(entries.some(entry=>entry.postingTime)){
  if(!isTimeZone(timezone))fail('Zeitzone für die CSV-Termine wählen.');
  zone=new Intl.DateTimeFormat('en',{timeZone:timezone}).resolvedOptions().timeZone;
 }
 const posts=[];
 for(const entry of entries){
  let instant=null;
  if(entry.postingTime){try{instant=zonedInstant(entry.postingTime,zone).toISOString();}catch(error){fail(`Eintrag ${posts.length+1}: ${error.message}`);}}
  // The original draft identity is unchanged. Timed rows are distinct imports,
  // never instructions to change a previously imported draft or appointment.
  const identity=instant?['takt-csv-scheduled-1',channelId,entry.text,entry.tags,entry.postingTime,zone,instant]:['takt-csv-draft-1',channelId,entry.text,entry.tags];
  const bytes=new TextEncoder().encode(JSON.stringify(identity));
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  const occurrence=(occurrences.get(digest)||0)+1;occurrences.set(digest,occurrence);
  // Stable IDs make a repeated confirmed/uncertain import detectable after reload.
  // Repeated rows within one file remain distinct. Existing edited rows conflict.
  const id=`${instant?'csv-time':'csv'}-${digest}-${occurrence}`,prior=existing.get(id);
  const post={id,title:'',text:entry.text,tags:entry.tags,channels:[channelId],variantTexts:{},status:instant?'scheduled':'draft',scheduleBinding:null,scheduledAt:entry.postingTime??null,scheduledInstant:null,timeZone:instant?zone:prior?.timeZone||state.settings.timezone,cover:null,mediaItems:[],createdAt:prior?.createdAt||now,updatedAt:prior?.updatedAt||now};
  // Existing IDs still pass the strict duplicate/conflict comparison. Their
  // already elapsed times must not prevent a no-op reimport after reload.
  const errors=validatePost(post,new Date(prior?0:now));if(errors.length)fail(`Eintrag ${posts.length+1}: ${errors.join(' ')}`);posts.push(post);
 }
 return normalizeState({...state,posts});
}

export function validateCSVImportTimes(preview,now=new Date()){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))fail('Importzeit ungültig.');
 for(const post of preview.additions){
  if(post.status!=='scheduled')continue;
  const resolved=zonedInstant(post.scheduledAt,post.timeZone).toISOString();
  if(preview.expectedInstants[post.id]!==resolved)fail('CSV-Terminvorschau geändert. Erneut prüfen.');
  const errors=validatePost(post,now);if(errors.length)fail(errors.join(' '));
 }
}
