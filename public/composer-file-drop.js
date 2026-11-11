import {validateImageBatch} from './composer-image-batch.js';

const invalid=()=>Error('Bitte ziehe nur einzelne JPG-, PNG- oder WebP-Dateien hierher, keine Ordner oder gemischten Inhalte.');
export function isFileDrag(transfer){
 try{return Array.from(transfer?.types||[]).includes('Files')||Array.from(transfer?.items||[]).some(item=>item.kind==='file')||!!transfer?.files?.length;}catch{return false;}
}
// Read synchronously during drop: the browser clears its protected data store afterwards.
// Never traverse entries, fetch URLs, or silently keep only a supported subset.
export function snapshotDroppedImages(transfer,count){
 const files=Array.from(transfer?.files||[]),items=Array.from(transfer?.items||[]);
 if(!files.length||items.length!==files.length||Array.from(transfer.types||[]).some(type=>type!=='Files'))throw invalid();
 for(let i=0;i<items.length;i++){
  const item=items[i];
  if(item.kind!=='file')throw invalid();
  const entryReader=item.getAsEntry||item.webkitGetAsEntry;
  if(entryReader){const entry=entryReader.call(item);if(!entry||entry.isDirectory||!entry.isFile)throw invalid();}
  const file=item.getAsFile();
  if(!(file instanceof File)||!(files[i] instanceof File)||file.webkitRelativePath||files[i].webkitRelativePath)throw invalid();
  if(file.name!==files[i].name||file.size!==files[i].size||file.type!==files[i].type||file.lastModified!==files[i].lastModified)throw invalid();
 }
 validateImageBatch(files,count);
 return files;
}
export function installComposerFileDrop({dialog,indicator,canAccept,count,readBatch,status,document:doc=globalThis.document,window:win=globalThis.window}){
 const seen=new WeakSet(),deliveries=new WeakSet(),targets=new Set();
 let pending=false,generation=0;
 const clear=()=>{targets.clear();indicator.classList.remove('is-file-drag');};
 const feedback=message=>{status.textContent=message;status.hidden=!message;if(message)status.scrollIntoView?.({block:'nearest'});};
 const reset=()=>{clear();feedback('');generation++;pending=false;};
 const allowed=()=>dialog.open&&!pending&&canAccept()&&!doc.querySelector('dialog[open]:not(#composer)');
 const mark=()=>indicator.classList.toggle('is-file-drag',targets.size>0&&allowed());
 const drag=event=>{
  if(!isFileDrag(event.dataTransfer))return;
  event.preventDefault();event.stopPropagation();
  try{event.dataTransfer.dropEffect=allowed()?'copy':'none';}catch{}
  if(event.type==='dragenter')targets.add(event.target);
  mark();
 };
 const leave=event=>{
  targets.delete(event.target);
  if(!event.relatedTarget||!dialog.contains(event.relatedTarget))clear();else mark();
 };
 const drop=event=>{
  if(!isFileDrag(event.dataTransfer))return;
  event.preventDefault();event.stopPropagation();clear();
  if(seen.has(event))return;seen.add(event);
  if(!allowed())return;
  const transfer=event.dataTransfer;
  if(deliveries.has(transfer))return;deliveries.add(transfer);
  try{
   const files=snapshotDroppedImages(transfer,count());
   feedback('');pending=true;const ticket=++generation;
   const failed=()=>{if(ticket===generation&&dialog.open)feedback('Die Bilder konnten nicht übernommen werden. Bitte prüfe die aktuelle Auswahl.');};
   Promise.resolve(readBatch(files)).then(ok=>{if(ok===false)failed();},failed).finally(()=>{if(ticket===generation)pending=false;});
  }catch(error){pending=false;feedback(error.message||invalid().message);}
 };
 dialog.addEventListener('dragenter',drag);dialog.addEventListener('dragover',drag);dialog.addEventListener('dragleave',leave);dialog.addEventListener('drop',drop);
 dialog.addEventListener('close',clear);dialog.addEventListener('cancel',clear);
 win.addEventListener('dragend',clear);win.addEventListener('drop',clear);win.addEventListener('blur',clear);
 // Opening a nested modal or closing this one also clears an interrupted drag.
 const observer=new MutationObserver(()=>{if(!allowed())clear();});
 observer.observe(doc.body,{subtree:true,attributes:true,attributeFilter:['open','aria-busy']});
 return {clear,reset};
}
