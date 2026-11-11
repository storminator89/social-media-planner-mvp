import {analyzeTailCuts,trimWebMTail,WebMFinalizationError} from './video-tail-packet-editor.mjs';
export function tailErrorMessage(error,fallback='Dieses WebM kann hier nicht gekürzt werden. Original unverändert.'){
 if(error instanceof WebMFinalizationError){
  if(['BYTE_LIMIT','OUT_OF_BUDGET'].includes(error.code))return 'Die Datei überschreitet die Grenze von 8 MiB. Original unverändert.';
  if(error.code==='TIMELINE_LIMIT')return 'Hier sind höchstens 16 Sekunden möglich. Original unverändert.';
  if(['INVALID_CUT','UNSAFE_CUT'].includes(error.code))return 'Bitte einen angebotenen Endzeitpunkt auswählen. Original unverändert.';
  if(error.code==='ABORTED')return 'Bearbeitung abgebrochen. Original unverändert.';
  return 'Dieses WebM kann hier nicht gekürzt werden. Original unverändert.';
 }
 return error?.message||fallback;
}
const LIMIT=8*1024*1024;
const yieldTask=()=>new Promise(resolve=>setTimeout(resolve,0));
const check=(signal,current)=>{if(signal?.aborted||!current())throw Error('Videoauswahl wurde geändert oder abgebrochen.');};
export async function readTailSource(media,{signal,current=()=>true,fetcher=fetch,timeout=15000}={}){
 if(!media||media.type!=='video/webm'||typeof media.alt!=='string'||media.alt.length>2000||typeof media.name!=='string'||media.name.length>255)throw Error('Nur ein WebM mit gültigen Metadaten kann geprüft werden.');
 check(signal,current);await yieldTask();check(signal,current);
 if(Object.hasOwn(media,'dataUrl')){
  if(media.id||media.url||typeof media.dataUrl!=='string'||media.dataUrl.length>32+Math.ceil(LIMIT/3)*4)throw Error('Lokales Video ist ungültig oder größer als 8 MiB.');
  const match=/^data:video\/webm;base64,([A-Za-z0-9+/]+={0,2})$/.exec(media.dataUrl);if(!match)throw Error('Ungültige lokale Videodaten.');
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
  if(response.status!==200||response.redirected||response.headers.has('content-range')||response.headers.get('content-type')?.split(';')[0].trim()!=='video/webm')throw Error('Originalvideo konnte nicht sicher gelesen werden.');
  const declared=response.headers.get('content-length');if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)<1||Number(declared)>LIMIT))throw Error('Originalvideo ist ungültig oder größer als 8 MiB.');
  if(!response.body?.getReader)throw Error('Originalvideo konnte nicht sicher gelesen werden.');reader=response.body.getReader();let size=0;const parts=[];
  while(true){check(signal,current);if(controller.signal.aborted)throw Error('Lesen abgebrochen.');const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>LIMIT)throw Error('Originalvideo ist größer als 8 MiB.');parts.push(value);}
  if(!size||(declared!==null&&size!==Number(declared)))throw Error('Originalvideo wurde nicht vollständig gelesen.');const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}check(signal,current);return bytes;
 })()]);}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);controller.abort();try{reader?.cancel()?.catch(()=>{});}catch{}}
}
export async function prepareTailEdit(bytes,cutNs,{signal,current=()=>true}={}){
 await yieldTask();check(signal,current);const result=trimWebMTail(bytes,{cutNs,signal});await yieldTask();check(signal,current);return result;
}
export function tailReplacement(result,source){
 if(source.type!=='video/webm'||typeof source.alt!=='string'||source.alt.length>2000||!(result.bytes instanceof Uint8Array)||result.bytes.length>LIMIT)throw Error('Ungültiges Schnittergebnis.');
 let binary='';for(let i=0;i<result.bytes.length;i+=32768)binary+=String.fromCharCode(...result.bytes.subarray(i,i+32768));
 return {type:'video/webm',name:source.name,alt:source.alt,dataUrl:'data:video/webm;base64,'+btoa(binary)};
}
export function createVideoTailEditor({onApply,onBusy=()=>{},document:doc=document,URL:urls=URL}={}){
 const dialog=doc.createElement('dialog');dialog.className='video-tail-dialog';dialog.setAttribute('aria-labelledby','video-tail-title');dialog.innerHTML=`<h2 id="video-tail-title">WebM-Ende kürzen</h2><p>Nur kompatible VP8/Opus-WebM · max. 8 MiB / 16 s · nur Ende</p><div class="video-tail-previews"><section><h3>Original</h3><video data-tail="source" controls playsinline preload="metadata"></video><a data-tail="download">Original herunterladen</a></section><section><h3>Geprüfter Ausschnitt</h3><video data-tail="output" controls playsinline preload="metadata"></video></section></div><label>Ende (Paketgrenze)<select data-tail="cut" disabled></select></label><p data-tail="detail"></p><p data-tail="status" role="status" aria-live="polite"></p><p>Schnitt an Paketgrenzen; letztes Bild ggf. kürzer. Übernehmen, dann Beitrag speichern.</p><div class="video-tail-actions"><button type="button" data-tail="cancel" class="button subtle">Abbrechen</button><button type="button" data-tail="apply" class="button primary" disabled>Ausschnitt übernehmen</button></div>`;doc.body.append(dialog);
 const $=name=>dialog.querySelector(`[data-tail="${name}"]`);let generation=0,controller=null,sourceURL=null,outputURL=null,source=null,bytes=null,result=null,current=null,working=false,decodedReady=false,outputRevision=0,returnFocus=null;
 const status=text=>{$('status').textContent=text;};
 function clearPlayer(name){const player=$(name);try{player.pause();player.removeAttribute('src');player.load();}catch{}}
 function clearOutput(){outputRevision++;decodedReady=false;result=null;$('apply').disabled=true;clearPlayer('output');if(outputURL)urls.revokeObjectURL(outputURL);outputURL=null;}
 function close(){generation++;controller?.abort();controller=null;clearOutput();clearPlayer('source');if(sourceURL)urls.revokeObjectURL(sourceURL);sourceURL=null;source=null;bytes=null;current=null;working=false;onBusy(false);if(dialog.open)dialog.close();if(returnFocus?.isConnected)returnFocus.focus();}
 async function generate(){const opened=generation,selected=$('cut').value;if(!bytes||!selected||working)return;const candidate=Number(selected);working=true;clearOutput();status('Ausschnitt wird geprüft …');$('cut').disabled=true;try{const prepared=await prepareTailEdit(bytes,candidate,{signal:controller.signal,current:()=>opened===generation&&dialog.open&&current()});if(opened!==generation)return;result=prepared;$('detail').textContent=`Neues Ende: ${prepared.cutSeconds.toFixed(6)} s.`;outputURL=urls.createObjectURL(new Blob([prepared.bytes],{type:'video/webm'}));$('output').src=outputURL;$('output').load();status('Vorschau bereit.');}catch(e){if(opened===generation){clearOutput();status(tailErrorMessage(e,'Ausschnitt konnte nicht erstellt werden.'));}}finally{if(opened===generation){working=false;$('cut').disabled=false;}}}
 $('output').addEventListener('loadeddata',()=>{const v=$('output');decodedReady=!!result&&v.getAttribute('src')===outputURL&&current?.()&&!(!Number.isFinite(v.duration)||Math.abs(v.duration-result.cutSeconds)>.02||v.videoWidth<1||v.videoHeight<1||v.videoWidth>1280||v.videoHeight>1280||v.videoWidth*v.videoHeight>921600);$('apply').disabled=!decodedReady||working;});
 $('output').addEventListener('error',()=>{outputRevision++;decodedReady=false;$('apply').disabled=true;status('Der Browser kann den Ausschnitt nicht wiedergeben. Das Original bleibt erhalten.');});
 // Native controls remain available, but only one modal stream may play.
 $('source').addEventListener('play',()=>{$('output').pause();});
 $('output').addEventListener('play',()=>{$('source').pause();});
 $('cut').addEventListener('change',()=>void generate());$('cancel').addEventListener('click',close);dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
 $('apply').addEventListener('click',async()=>{if(working||!result||$('apply').disabled||!current?.())return;const opened=generation,prepared=result,previewURL=outputURL,revision=outputRevision;const ready=()=>opened===generation&&dialog.open&&current?.()&&decodedReady&&result===prepared&&outputURL===previewURL&&outputRevision===revision&&$('output').getAttribute('src')===previewURL;working=true;$('apply').disabled=true;try{await yieldTask();check(controller?.signal,ready);const replacement=tailReplacement(prepared,source);await yieldTask();check(controller?.signal,ready);await onApply(replacement);if(opened===generation)close();}catch(e){if(opened===generation)status(tailErrorMessage(e,'Übernahme nicht bestätigt. Original bleibt erhalten.'));}finally{if(opened===generation){working=false;$('apply').disabled=!decodedReady||!result||!current?.();}}});
 return {close,get isOpen(){return dialog.open;},async open(media,{isCurrent=()=>true}={}){close();returnFocus=doc.activeElement;source=structuredClone(media);current=isCurrent;controller=new AbortController();const opened=++generation;onBusy(true);$('cut').innerHTML='';$('cut').disabled=true;$('detail').textContent='';status('Original wird geprüft …');dialog.showModal();try{bytes=await readTailSource(source,{signal:controller.signal,current:()=>opened===generation&&dialog.open&&current()});await yieldTask();check(controller.signal,()=>opened===generation&&dialog.open&&current());const analysis=analyzeTailCuts(bytes,{signal:controller.signal});await yieldTask();check(controller.signal,()=>opened===generation&&dialog.open&&current());sourceURL=urls.createObjectURL(new Blob([bytes],{type:'video/webm'}));$('source').src=sourceURL;$('download').href=sourceURL;$('download').download=source.name;const placeholder=doc.createElement('option');placeholder.value='';placeholder.textContent='Ende ausdrücklich auswählen';$('cut').append(placeholder);for(const cut of analysis.cuts){const option=doc.createElement('option');option.value=String(cut.cutNs);option.textContent=`${cut.cutSeconds.toFixed(6)} s`;$('cut').append(option);}$('cut').disabled=!analysis.cuts.length;status(analysis.cuts.length?'Ende auswählen.':'Für dieses Video ist kein sicherer kürzerer Endzeitpunkt verfügbar.');}catch(e){if(opened===generation)status(tailErrorMessage(e));}}};
}
