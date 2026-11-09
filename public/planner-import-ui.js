import {IMPORT_MAX_BYTES,parsePlanningExport,previewPlanningImport,applyPlanningImport} from './planner-import.js';
export function createPlannerImportUI({dialog,getState,canOpen,save}){
 const input=dialog.querySelector('input'),status=dialog.querySelector('[data-import-status]'),list=dialog.querySelector('[data-import-list]'),confirm=dialog.querySelector('[data-import-confirm]'),close=dialog.querySelector('[data-import-close]');
 let preview=null,epoch=0,busy=false,attempted=false,returnFocus=null;
 function reset(){preview=null;confirm.disabled=true;list.replaceChildren();}
 function dismiss(){if(busy)return;epoch++;reset();dialog.close();returnFocus?.focus();}
 close.onclick=dismiss;dialog.addEventListener('cancel',event=>{event.preventDefault();dismiss();});
 input.onchange=async()=>{if(busy||attempted)return;reset();const generation=++epoch,file=input.files?.[0];if(!file)return;status.textContent='Datei wird lokal geprüft …';
  try{if(file.size>IMPORT_MAX_BYTES)throw Error('Datei ist größer als 1 MB.');const text=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());if(generation!==epoch||!dialog.open)return;const imported=parsePlanningExport(text);preview=previewPlanningImport(getState(),imported);
   status.textContent=`${preview.additions.length} neue Einträge, ${preview.duplicates.length} unverändert vorhanden und übersprungen.`;
   for(const p of preview.additions){const item=document.createElement('li');item.textContent=`${p.title||p.text.slice(0,90)} · ${p.status==='idea'?'Idee':p.status==='draft'?'Entwurf':'Geplant'} · ${p.channels.join(', ')||'ohne Kanäle'}${p.scheduledAt?' · '+p.scheduledAt+' '+p.timeZone:''}`;list.append(item);}
   confirm.disabled=!preview.additions.length;
  }catch(error){if(generation===epoch){reset();status.textContent=error.message||'Datei nicht lesbar. Nichts importiert.';}}
 };
 confirm.onclick=async()=>{if(busy||attempted||!preview?.additions.length)return;
  let next;try{next=applyPlanningImport(getState(),preview);}catch(error){reset();status.textContent=error.message;return;}
  busy=true;attempted=true;confirm.disabled=true;close.disabled=true;input.disabled=true;status.textContent='Import wird gespeichert …';
  try{await save(next,preview.expectedInstants);status.textContent='Import gespeichert. Bestehende Inhalte bleiben erhalten. Nichts veröffentlicht.';reset();}
  catch{reset();status.textContent='Import nicht bestätigt. Möglicherweise wurde gespeichert. Vor einem neuen Versuch: Seite neu laden und Einträge prüfen.';}
  finally{busy=false;close.disabled=false;}
 };
 return{open(){if(!canOpen()||busy)return;returnFocus=document.activeElement;reset();input.value='';input.disabled=attempted;status.textContent=attempted?'Vor einem weiteren Import die Seite neu laden und den gespeicherten Stand prüfen.':'Datei auswählen und Vorschau prüfen. Erst deine Bestätigung speichert.';dialog.showModal();close.focus();}};
}
