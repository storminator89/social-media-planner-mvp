import {isSavedImage} from './saved-images.js';
const LIMIT=2*1024*1024;
/** Read only the canonical private image route. Never transform/re-encode pixels. */
export async function copySavedImage(media,alt,{signal,fetcher=fetch,FileClass=File,timeout=15000}={}){
 if(!isSavedImage(media))throw Error('Ungültige gespeicherte Bildreferenz.');
 if(typeof alt!=='string'||!alt.trim()||alt.length>500)throw Error('Bitte beschreibe das Bild mit höchstens 500 Zeichen.');
 const controller=new AbortController();const abort=()=>controller.abort();
 signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
 const timer=setTimeout(abort,timeout);let reader;
 let rejectAbort;const aborted=new Promise((_resolve,reject)=>{rejectAbort=reject;});
 const interrupted=()=>rejectAbort(Error('Das Bild konnte nicht rechtzeitig gelesen werden oder die Änderung wurde abgebrochen.'));
 controller.signal.addEventListener('abort',interrupted,{once:true});
 try{
  return await Promise.race([aborted,(async()=>{
  if(controller.signal.aborted)throw Error('Bildbeschreibung abgebrochen.');
  const response=await fetcher(media.url,{method:'GET',credentials:'same-origin',mode:'same-origin',redirect:'error',cache:'no-store',signal:controller.signal});
  if(!response.ok||response.status!==200||response.redirected||response.headers.has('content-range'))throw Error('Das gespeicherte Bild konnte nicht geladen werden.');
  const type=response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if(type!==media.type)throw Error('Das gespeicherte Bild hat ein unerwartetes Dateiformat.');
  const length=response.headers.get('content-length');if(length!==null&&(!/^\d+$/.test(length)||Number(length)>LIMIT))throw Error('Das gespeicherte Bild ist zu groß.');
  if(!response.body?.getReader)throw Error('Das gespeicherte Bild konnte nicht sicher gelesen werden.');
  reader=response.body.getReader();const chunks=[];let size=0;
  while(true){if(controller.signal.aborted)throw Error('Bildbeschreibung abgebrochen.');const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>LIMIT)throw Error('Das gespeicherte Bild ist zu groß.');chunks.push(value);}
  if(controller.signal.aborted)throw Error('Bildbeschreibung abgebrochen.');
  if(!size)throw Error('Das gespeicherte Bild ist leer.');
  if(length!==null&&size!==Number(length))throw Error('Das gespeicherte Bild wurde nicht vollständig gelesen.');
  const file=new FileClass(chunks,media.name,{type:media.type});
  const bytes=new Uint8Array(await file.slice(0,12).arrayBuffer());
  const valid=type==='image/png'?bytes.length>=8&&[137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b):type==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:type==='image/webp'&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
  if(!valid)throw Error('Das gespeicherte Bild hat eine ungültige Dateisignatur.');
  return file;
  })()]);
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);controller.signal.removeEventListener('abort',interrupted);controller.abort();try{reader?.cancel()?.catch(()=>{});}catch{} }
}
