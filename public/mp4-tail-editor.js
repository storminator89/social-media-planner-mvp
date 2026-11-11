import {analyzeMP4Tail as analyzeReferenceB,trimMP4Tail as trimReferenceB} from './mp4-tail/reference-tail.mjs';
import {analyzeMP4Tail as analyzeSimpleB,trimMP4Tail as trimSimpleB} from './mp4-tail/bframe-tail.mjs';
import {inspectLargeOriginalMP4} from './mp4-tail/vendor/composer-original-profile.js';
import {analyzeSilentStart,trimSilentStart} from './mp4-start/silent-start.mjs';
import {inspectMP4Tracks} from './mp4-tail/vendor/video-still-mp4-inspection.js';
import {analyzeMP4Tail,trimMP4Tail} from './mp4-tail/mp4-tail.mjs';
export function mp4TailErrorMessage(error,cutMode='tail'){
 const known=['Dieses MP4 enthält eine Tonspur. Anfang kürzen unterstützt nur Dateien ohne Tonspur. Original unverändert.','Die Datei überschreitet die Grenze von 8 MiB. Original unverändert.','Bitte einen angebotenen Endzeitpunkt auswählen. Original unverändert.','Zu viele Schnittgrenzen. Original unverändert.','Videoauswahl wurde geändert oder abgebrochen.'];
 if(cutMode==='tail'&&error?.message==='Only zero VFR composition/edit origin')return 'Dieses Video mit variabler Bildrate kann hier nicht gekürzt werden. Original unverändert.';
 if(known.includes(error?.message))return error.message;
 if(['Video konnte nicht rechtzeitig gelesen werden oder wurde abgebrochen.','Originalvideo konnte nicht sicher gelesen werden.','Originalvideo wurde nicht vollständig gelesen.','Originalvideo ist ungültig oder größer als 8 MiB.','Originalvideo ist größer als 8 MiB.','Lokales Video ist ungültig oder größer als 8 MiB.','Video ist größer als 8 MiB.','Ungültige private Videoreferenz.'].includes(error?.message))return error.message+' Original unverändert.';
 return cutMode==='start'?'Dieser MP4-Anfang kann hier nicht gekürzt werden. Original unverändert.':'Dieses MP4 kann hier nicht gekürzt werden. Original unverändert.';
}
function analyzeTailSource(bytes){
 try{return analyzeMP4Tail(bytes);}catch(error){
  // No general fallback: only the old profile's explicit reorder/CTS exclusions.
  if(!['Only constant unsigned CTS','Only I/P slices'].includes(error?.message))throw error;
  try{return {...analyzeSimpleB(bytes),simpleB:true};}catch(simpleError){
   // Only explicit older B-profile syntax exclusions may enter the full DPB gate.
   const allowed=['B-frame profile: weighted prediction','B-frame profile: only reference P/nonreference B','B-frame profile: reference list modification','B-frame profile: adaptive reference marking'];
   if(allowed.includes(simpleError?.message)){try{return {...analyzeReferenceB(bytes),referenceB:true};}catch{}}
   throw Error('Dieses MP4 kann hier nicht gekürzt werden. Original unverändert.');
  }
 }
}
export function analyzeMP4EditorSource(bytes,cutMode='tail'){
 if(!(bytes instanceof Uint8Array)||bytes.length<16||(typeof SharedArrayBuffer!=='undefined'&&bytes.buffer instanceof SharedArrayBuffer))throw Error('Ungültige Videodaten.');
 if(bytes.length>8*1024*1024)throw Error('Die Datei überschreitet die Grenze von 8 MiB. Original unverändert.');
 if(cutMode==='start'&&inspectMP4Tracks(bytes).tracks.some(t=>t.type===2))throw Error('Dieses MP4 enthält eine Tonspur. Anfang kürzen unterstützt nur Dateien ohne Tonspur. Original unverändert.');
 const raw=cutMode==='start'?analyzeSilentStart(bytes):analyzeTailSource(bytes),analysis=cutMode==='start'?{...raw,cuts:raw.starts}:{...raw,exactVFR:!!inspectLargeOriginalMP4(bytes).variableFrameRate};
 if(analysis.cuts.length>512)throw Error('Zu viele Schnittgrenzen. Original unverändert.');return analysis;
}
const LIMIT=8*1024*1024;
const yieldTask=()=>new Promise(resolve=>setTimeout(resolve,0));
const check=(signal,current)=>{if(signal?.aborted||!current())throw Error('Videoauswahl wurde geändert oder abgebrochen.');};
export async function readMP4TailSource(media,{signal,current=()=>true,fetcher=fetch,timeout=15000}={}){
 if(!media||media.type!=='video/mp4'||typeof media.alt!=='string'||media.alt.length>2000||typeof media.name!=='string'||media.name.length>255)throw Error('Nur ein MP4 mit gültigen Metadaten kann geprüft werden.');
 check(signal,current);await yieldTask();check(signal,current);
 if(Object.hasOwn(media,'dataUrl')){
  if(media.id||media.url||typeof media.dataUrl!=='string'||media.dataUrl.length>32+Math.ceil(LIMIT/3)*4)throw Error('Lokales Video ist ungültig oder größer als 8 MiB.');
  const match=/^data:video\/mp4;base64,([A-Za-z0-9+/]+={0,2})$/.exec(media.dataUrl);if(!match)throw Error('Ungültige lokale Videodaten.');
  let decoded;try{decoded=atob(match[1]);}catch{throw Error('Ungültige lokale Videodaten.');}if(!decoded.length||decoded.length>LIMIT)throw Error('Video ist größer als 8 MiB.');
  const bytes=Uint8Array.from(decoded,c=>c.charCodeAt(0));await yieldTask();check(signal,current);return bytes;
 }
 if(!/^[A-Za-z0-9_-]{1,100}$/.test(media.id)||media.url!==`/api/planner/media/${media.id}`)throw Error('Ungültige private Videoreferenz.');
 const controller=new AbortController();let reader,timer,rejectCancelled;
 const cancelled=new Promise((_,reject)=>{rejectCancelled=reject;});
 const abort=()=>{controller.abort();rejectCancelled(Error('Video konnte nicht rechtzeitig gelesen werden oder wurde abgebrochen.'));};
 signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();timer=setTimeout(abort,timeout);
 try{return await Promise.race([cancelled,(async()=>{
  const response=await fetcher(media.url,{method:'GET',credentials:'same-origin',mode:'same-origin',redirect:'error',cache:'no-store',signal:controller.signal});check(signal,current);if(controller.signal.aborted)throw Error('Lesen abgebrochen.');
  if(response.status!==200||response.redirected||response.headers.has('content-range')||response.headers.get('content-type')?.split(';')[0].trim()!=='video/mp4')throw Error('Originalvideo konnte nicht sicher gelesen werden.');
  const declared=response.headers.get('content-length');if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)<1||Number(declared)>LIMIT))throw Error('Originalvideo ist ungültig oder größer als 8 MiB.');
  if(!response.body?.getReader)throw Error('Originalvideo konnte nicht sicher gelesen werden.');reader=response.body.getReader();let size=0;const parts=[];
  while(true){check(signal,current);if(controller.signal.aborted)throw Error('Lesen abgebrochen.');const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>LIMIT)throw Error('Originalvideo ist größer als 8 MiB.');parts.push(value);}
  if(!size||(declared!==null&&size!==Number(declared)))throw Error('Originalvideo wurde nicht vollständig gelesen.');const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}check(signal,current);return bytes;
 })()]);}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);controller.abort();try{reader?.cancel()?.catch(()=>{});}catch{}}
}
export async function prepareMP4TailEdit(bytes,cutID,{signal,current=()=>true,cutMode='tail'}={}){
 await yieldTask();check(signal,current);let result;try{const model=analyzeMP4EditorSource(bytes,cutMode);const output=cutMode==='start'?trimSilentStart(bytes,cutID,{signal}):model.referenceB?trimReferenceB(bytes,cutID,{signal}):model.simpleB?trimSimpleB(bytes,cutID,{signal}):trimMP4Tail(bytes,cutID,{signal});result={...output,cutSeconds:cutMode==='start'?output.movieDuration/output.movieScale:output.cut.seconds,width:model.width,height:model.height};}catch(error){throw Error(mp4TailErrorMessage(error,cutMode));}await yieldTask();check(signal,current);return result;
}
export function mp4TailReplacement(result,source){
 if(source.type!=='video/mp4'||typeof source.alt!=='string'||source.alt.length>2000||!(result.bytes instanceof Uint8Array)||!result.bytes.length||result.bytes.length>LIMIT)throw Error('Ungültiges Schnittergebnis.');
 let binary='';for(let i=0;i<result.bytes.length;i+=32768)binary+=String.fromCharCode(...result.bytes.subarray(i,i+32768));
 return {type:'video/mp4',name:source.name,alt:source.alt,dataUrl:'data:video/mp4;base64,'+btoa(binary)};
}
export function createMP4StartEditor(options){return createMP4TailEditor({...options,cutMode:'start'});}
export function prepareMP4StartEdit(bytes,cutID,options){return prepareMP4TailEdit(bytes,cutID,{...options,cutMode:'start'});}
export function createMP4TailEditor({onApply,onBusy=()=>{},document:doc=document,URL:urls=URL,cutMode='tail'}={}){
 const startMode=cutMode==='start',title=startMode?'MP4-Anfang kürzen (ohne Ton)':'MP4-Ende kürzen',titleId=startMode?'mp4-start-title':'mp4-tail-title',boundary=startMode?'Anfang':'Ende',choose=boundary+' auswählen.';
 const scope=startMode?'Nur kompatible MP4 ohne Tonspur · H.264-I/P · konstante Bildrate · ohne Drehung · max. 8 MiB / 10 min':'Nur kompatible H.264-MP4 · I/P oder geprüfte B-Profile · auch variable Bildrate · kanonische 90°/180°/270° · max. 8 MiB / 10 min · nur Ende';
 const note=startMode?'Start nur an geprüften Schlüsselbildern. Tonspuren werden nicht entfernt.':'Schnitt vor Schlüsselbildern; letztes Bild ggf. kürzer.';
 const formatError=error=>mp4TailErrorMessage(error,cutMode);
 const dialog=doc.createElement('dialog');dialog.className='video-tail-dialog';dialog.setAttribute('aria-labelledby',titleId);dialog.innerHTML=`<h2 id="${titleId}">${title}</h2><p>${scope}</p><div class="video-tail-previews"><section><h3>Original</h3><video data-tail="source" controls playsinline preload="metadata"></video><a data-tail="download">Original herunterladen</a></section><section><h3>Geprüfter Ausschnitt</h3><video data-tail="output" controls playsinline preload="metadata"></video></section></div><label>${boundary} (geprüfte Grenze)<select data-tail="cut" disabled></select></label><p data-tail="detail"></p><p data-tail="status" role="status" aria-live="polite"></p><p><span data-tail="policy">${note}</span> Übernehmen ersetzt das aktuelle Video. Keine Originalhistorie. Danach Beitrag speichern.</p><div class="video-tail-actions"><button type="button" data-tail="cancel" class="button subtle">Abbrechen</button><button type="button" data-tail="apply" class="button primary" disabled>Ausschnitt übernehmen</button></div>`;doc.body.append(dialog);
 const $=name=>dialog.querySelector(`[data-tail="${name}"]`);let generation=0,controller=null,sourceURL=null,outputURL=null,source=null,bytes=null,result=null,current=null,working=false,decodedReady=false,outputRevision=0,selectionRevision=0,returnFocus=null;
 const status=text=>{$('status').textContent=text;};
 function clearPlayer(name){const player=$(name);try{player.pause();player.removeAttribute('src');player.load();}catch{}}
 function clearOutput(){$('detail').textContent='';outputRevision++;decodedReady=false;result=null;$('apply').disabled=true;clearPlayer('output');if(outputURL)urls.revokeObjectURL(outputURL);outputURL=null;}
 function close(){generation++;selectionRevision++;controller?.abort();controller=null;clearOutput();clearPlayer('source');if(sourceURL)urls.revokeObjectURL(sourceURL);sourceURL=null;$('download').hidden=true;$('download').removeAttribute('href');source=null;bytes=null;current=null;working=false;onBusy(false);if(dialog.open)dialog.close();if(returnFocus?.isConnected)returnFocus.focus();}
 async function generate(){const opened=generation,selected=$('cut').value,selection=++selectionRevision;clearOutput();if(!bytes||!selected){status(choose);return;}if(working)return;const candidate=selected;working=true;status('Ausschnitt wird geprüft …');$('cut').disabled=true;try{const prepared=await prepareMP4TailEdit(bytes,candidate,{cutMode,signal:controller.signal,current:()=>opened===generation&&selection===selectionRevision&&$('cut').value===selected&&dialog.open&&current()});if(opened!==generation||selection!==selectionRevision||$('cut').value!==selected)return;result=prepared;$('detail').textContent=startMode?`Ab ${prepared.cut.seconds.toFixed(6)} s · neue Dauer: ${prepared.cutSeconds.toFixed(6)} s.`:`Neues Ende: ${prepared.cutSeconds.toFixed(6)} s.`;outputURL=urls.createObjectURL(new Blob([prepared.bytes],{type:'video/mp4'}));$('output').src=outputURL;$('output').load();status('Vorschau wird geladen …');}catch(e){if(opened===generation){clearOutput();status(formatError(e));}}finally{if(opened===generation){working=false;$('cut').disabled=false;}}}
 function validatePreview(){const v=$('output');decodedReady=!!result&&v.getAttribute('src')===outputURL&&v.currentSrc===outputURL&&v.readyState>=2&&current?.()&&!(!Number.isFinite(v.duration)||Math.abs(v.duration-result.cutSeconds)>.001||v.videoWidth!==result.width||v.videoHeight!==result.height);$('apply').disabled=!decodedReady||working;if(decodedReady)status('Vorschau bereit.');else if(result&&v.readyState>=2)status('Die Ausschnitt-Vorschau konnte nicht bestätigt werden. Original unverändert.');}
 $('output').addEventListener('loadeddata',validatePreview);$('output').addEventListener('durationchange',validatePreview);$('output').addEventListener('resize',validatePreview);
 $('output').addEventListener('error',()=>{outputRevision++;decodedReady=false;$('apply').disabled=true;status('Der Browser kann den Ausschnitt nicht wiedergeben. Das Original bleibt erhalten.');});
 // Native controls remain available, but only one modal stream may play.
 $('source').addEventListener('play',()=>{$('output').pause();});
 $('output').addEventListener('play',()=>{$('source').pause();});
 $('cut').addEventListener('change',()=>void generate());$('cancel').addEventListener('click',close);dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
 $('apply').addEventListener('click',async()=>{if(working||!result||$('apply').disabled||!current?.())return;const opened=generation,prepared=result,previewURL=outputURL,revision=outputRevision,selectedCut=$('cut').value,selectedRevision=selectionRevision;const ready=()=>opened===generation&&dialog.open&&current?.()&&decodedReady&&result===prepared&&outputURL===previewURL&&outputRevision===revision&&selectionRevision===selectedRevision&&$('cut').value===selectedCut&&prepared.cut.id===selectedCut&&$('output').getAttribute('src')===previewURL&&$('output').currentSrc===previewURL&&$('output').readyState>=2&&Number.isFinite($('output').duration)&&Math.abs($('output').duration-prepared.cutSeconds)<=.001&&$('output').videoWidth===prepared.width&&$('output').videoHeight===prepared.height;working=true;$('apply').disabled=true;$('cut').disabled=true;try{await yieldTask();check(controller?.signal,ready);const replacement=mp4TailReplacement(prepared,source);await yieldTask();check(controller?.signal,ready);await onApply(replacement);if(opened===generation)close();}catch(e){if(opened===generation)status(formatError(e));}finally{if(opened===generation){working=false;$('cut').disabled=false;$('apply').disabled=!ready();}}});
 return {close,get isOpen(){return dialog.open;},async open(media,{isCurrent=()=>true}={}){close();returnFocus=doc.activeElement;source=structuredClone(media);current=isCurrent;controller=new AbortController();const opened=++generation;onBusy(true);$('cut').innerHTML='';$('cut').disabled=true;$('detail').textContent='';$('policy').textContent=note;status('Original wird geprüft …');dialog.showModal();try{bytes=await readMP4TailSource(source,{signal:controller.signal,current:()=>opened===generation&&dialog.open&&current()});await yieldTask();check(controller.signal,()=>opened===generation&&dialog.open&&current());const analysis=analyzeMP4EditorSource(bytes,cutMode);await yieldTask();check(controller.signal,()=>opened===generation&&dialog.open&&current());$('policy').textContent=analysis.referenceB?'Geprüftes B-Profil: vollständige gemeinsame Bild-/Tongrenzen.':analysis.simpleB?'Einfache B-Frames: vollständige Bild-/Tongrenzen vor Schlüsselbildern.':analysis.exactVFR?'Variable Bildrate: nur vollständige Bildgrenzen, bei Ton exakt gemeinsame Grenzen.':note;sourceURL=urls.createObjectURL(new Blob([bytes],{type:'video/mp4'}));$('source').src=sourceURL;$('download').href=sourceURL;$('download').download=source.name;$('download').hidden=false;const placeholder=doc.createElement('option');placeholder.value='';placeholder.textContent=boundary+' ausdrücklich auswählen';$('cut').append(placeholder);for(const cut of analysis.cuts){const option=doc.createElement('option');option.value=cut.id;option.textContent=`${cut.seconds.toFixed(6)} s`;$('cut').append(option);}$('cut').disabled=!analysis.cuts.length;status(analysis.cuts.length?choose:startMode?'Für dieses Video ist kein sicherer späterer Anfang verfügbar.':(analysis.exactVFR||analysis.simpleB||analysis.referenceB)?'Keine passende vollständige Schnittgrenze. Original unverändert.':'Für dieses Video ist kein sicherer kürzerer Endzeitpunkt verfügbar.');}catch(e){if(opened===generation)status(formatError(e));}}};
}
