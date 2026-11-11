import {duplicateTaktDraft} from './workflows/queue.mjs';
const KEY='takt.preserve-video-original.v1';
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().filter(k=>k!=='updatedAt').map(k=>[k,canonical(value[k])]));return value;}
function stateReceipt(state){if(!state||!Array.isArray(state.posts))return null;return {...state,posts:[...state.posts].sort((a,b)=>a.id.localeCompare(b.id))};}
const fail=message=>{throw Error(message);};
export function preservationReason({post,clean,restored,busy}){
 if(busy)return 'Bitte den laufenden Vorgang abwarten.';
 if(restored)return 'Arbeitsfassung zuerst speichern und erneut öffnen.';
 if(!post||post.mediaItems?.length!==1||!['video/mp4','video/webm'].includes(post.mediaItems[0]?.type)||!post.mediaItems[0]?.id||post.mediaItems[0]?.dataUrl)return 'Original zuerst als Beitrag speichern und erneut öffnen.';
 if(!clean)return 'Änderungen zuerst speichern und erneut öffnen.';
 return '';
}
/** Bounded tab-scoped operation receipts, never video bytes or original history. */
export function createOriginalPreservation({storage,save,id=()=>crypto.randomUUID()}){
 let attempts=[],blocked=false,busy=false,storageFailed=false;
 let raw;try{raw=storage.getItem(KEY);}catch{storageFailed=true;}
 try{if(raw){if(raw.length>1000000)throw Error();const parsed=JSON.parse(raw);if(parsed.version!==1||!Array.isArray(parsed.attempts)||parsed.attempts.length>20)throw Error();attempts=parsed.attempts;for(const a of attempts){if(!a.copy?.id||a.copy.id===a.source?.id||!Number.isSafeInteger(a.revision)||a.revision<0||preservationReason({post:a.source,clean:true})||preservationReason({post:a.copy,clean:true}))throw Error();}}}catch{blocked=true;}
 const matchesSource=(a,source)=>source?.id===a.source.id&&same(source.mediaItems,a.source.mediaItems);
 function status(state,source){
  if(storageFailed)return {kind:'storage-unavailable',message:'Sicherung nicht verfügbar: Browser-Speicher ist gesperrt.'};
  if(blocked)return {kind:'blocked',message:'Speicherstatus unklar. Bitte neu laden; nicht erneut sichern.'};
  for(const a of attempts){if(state.posts.some(p=>p.id===a.source.id)&&state.revision<=a.revision)return {kind:'blocked',message:'Speicherstatus unklar. Bitte neu laden und Entwürfe prüfen. Solange ungeklärt, nicht erneut speichern.'};}
  for(const a of attempts){
   // A different planner has no matching source. Never replay stored content into it.
   if(!state.posts.some(p=>p.id===a.source.id))continue;
   const copy=state.posts.find(p=>p.id===a.copy.id),confirmed=state.revision>a.revision&&copy&&same(copy,a.copy);
   if(!confirmed&&state.revision<=a.revision)return {kind:'blocked',message:'Speicherstatus unklar. Bitte neu laden und Entwürfe prüfen. Solange ungeklärt, nicht erneut speichern.'};
   if(matchesSource(a,source))return confirmed?{kind:'saved',copyId:copy.id,message:'Original als eigener Entwurf gespeichert.'}:{kind:'unavailable',message:'Der gesicherte Entwurf fehlt oder wurde geändert. Bitte Entwürfe prüfen. Diese Sicherung wird nicht wiederholt.'};
  }
  return {kind:'idle'};
 }
 function historical(state,sourceId){
  if(blocked||storageFailed)return null;
  for(const a of [...attempts].reverse()){
   if(a.source.id!==sourceId||state.revision<=a.revision)continue;
   const copy=state.posts.find(p=>p.id===a.copy.id);
   if(copy&&same(copy,a.copy))return {copyId:copy.id};
  }
  return null;
 }
 function isOriginalCopy(state,copyId){
  if(blocked||storageFailed)return false;
  return attempts.some(a=>a.copy.id===copyId&&state.revision>a.revision&&same(state.posts.find(p=>p.id===copyId),a.copy));
 }
 return {status,historical,isOriginalCopy,get busy(){return busy;},async preserve(context){
  const reason=preservationReason({...context,busy:busy||context.busy});if(reason)fail(reason);
  if(!Number.isSafeInteger(context.state?.revision)||!same(context.state.posts?.find(p=>p.id===context.post.id),context.post)||context.state.posts.some(p=>p.mediaItems?.some(m=>m.dataUrl)))fail('Gespeicherten Originalstand erneut öffnen.');
  const current=status(context.state,context.post);if(['blocked','unavailable','storage-unavailable'].includes(current.kind))fail(current.message);if(current.kind==='saved')return {state:context.state,...current};
  if(attempts.length>=20)fail('In diesem Tab sind bereits 20 Originalsicherungen vermerkt. Bitte vorhandene Entwürfe verwenden.');
  const source=structuredClone(context.post),copy=duplicateTaktDraft(source,{id:id()});
  copy.title=source.title?(source.title.length<=189?`${source.title} · Original`:source.title):'Originalvideo';
  const pending={revision:context.state.revision,source,copy},records=[...attempts,pending];
  const receipt=JSON.stringify({version:1,attempts:records});if(receipt.length>1000000)fail('Sicherung nicht gestartet: zu viele lokale Vorgangsvermerke.');
  // Persist BEFORE the request. A lost response can only reconcile this exact ID.
  try{storage.setItem(KEY,receipt);}catch{fail('Sicherung nicht gestartet: Browser-Speicher nicht verfügbar.');}
  attempts=records;busy=true;
  try{
   const intended={...structuredClone(context.state),posts:[...structuredClone(context.state.posts),structuredClone(copy)]};
   const expected=stateReceipt({...structuredClone(intended),revision:pending.revision+1});
   const result=await save(intended);
   if(!result||!same(stateReceipt(result),expected))fail('Speicherung nicht eindeutig bestätigt. Bitte neu laden.');
   return {state:result,kind:'saved',copyId:copy.id,message:'Original als eigener Entwurf gespeichert.'};
  }finally{busy=false;}
 }};
}
