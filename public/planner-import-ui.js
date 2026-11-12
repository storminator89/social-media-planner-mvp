import {decodeImportText} from './import-text.js';
import {PlannerClientError} from './data-client/client.mjs';
import {IMPORT_MAX_BYTES,parsePlanningExport,previewPlanningImport,applyPlanningImport} from './planner-import.js';
import {inspectDraftCSV,csvDraftState,validateCSVImportTimes} from './planner-csv.js';
import {savedImageCatalog,decodeSavedImage} from './saved-images.js';
import {isTimeZone,zonedInstant} from './model.js';
export function createPlannerImportUI({dialog,getState,canOpen,save,decodeImage=decodeSavedImage}){
 const input=dialog.querySelector('input'),status=dialog.querySelector('[data-import-status]'),list=dialog.querySelector('[data-import-list]'),confirm=dialog.querySelector('[data-import-confirm]'),close=dialog.querySelector('[data-import-close]');
 const csvOptions=dialog.querySelector('[data-csv-options]'),channel=dialog.querySelector('[data-csv-channel]'),template=dialog.querySelector('[data-csv-template]'),zoneField=dialog.querySelector('[data-csv-zone-field]'),zone=dialog.querySelector('[data-csv-zone]');
 let images=[],imageControls=[],decodeController=null;
 let preview=null,csvPreview=false,source=null,epoch=0,busy=false,attempted=false,returnFocus=null,rejectionMessage=null;
 function reset(){preview=null;csvPreview=false;confirm.disabled=true;list.replaceChildren();}
 function dismiss(){if(busy)return;decodeController?.abort();epoch++;source=null;reset();dialog.close();returnFocus?.focus();}
 close.onclick=dismiss;dialog.addEventListener('cancel',event=>{event.preventDefault();dismiss();});
 function renderCSVRows(rows,snapshot){
  list.replaceChildren();imageControls=[];const catalog=savedImageCatalog(snapshot);
  rows.forEach((row,index)=>{
   const item=document.createElement('li');let when='';if(row.postingTime){when=' · '+row.postingTime.replace('T',' ');if(zone?.value){when+=' '+zone.value;try{const instant=zonedInstant(row.postingTime,zone.value),offset=new Intl.DateTimeFormat('de-DE',{timeZone:zone.value,timeZoneName:'shortOffset'}).formatToParts(instant).find(part=>part.type==='timeZoneName').value;when+=' · '+offset;}catch{/* prepare reports invalid time */}}}
   item.textContent=`${index+1}. ${row.text||'Bildbeitrag'} · ${row.postingTime?'Geplant':'Entwurf'}${when}${row.tags.length?' · Labels: '+row.tags.join(', '):''}`;
   item.className='csv-media-row';if(!catalog.items.length){list.append(item);return;}
   const pick=document.createElement('select');pick.ariaLabel=`Bild für Eintrag ${index+1}`;const empty=document.createElement('option');empty.value='';empty.textContent='Ohne Bild';pick.append(empty);
   for(const entry of catalog.items){const option=document.createElement('option');option.value=entry.id;option.textContent=entry.media.name||entry.media.alt;pick.append(option);}
   pick.value=images[index]?.id||'';pick.disabled=busy||attempted||!catalog.items.length;imageControls.push(pick);item.append(pick);
   if(images[index]){const image=document.createElement('img');image.src=images[index].url;image.alt=images[index].alt;image.width=80;image.height=80;item.append(image);}
   pick.onchange=async()=>{
    if(busy||attempted)return;const selected=catalog.items.find(entry=>entry.id===pick.value)?.media??null,generation=++epoch;decodeController?.abort();decodeController=new AbortController();reset();status.textContent='Bild prüfen …';
    try{if(selected)await decodeImage(selected,{signal:decodeController.signal});if(generation!==epoch||!dialog.open)return;images[index]=selected;await prepare(generation);if(generation===epoch&&dialog.open)imageControls[index]?.focus();}
    catch(error){if(generation===epoch&&dialog.open){await prepare(generation);if(generation===epoch&&dialog.open){status.textContent=error.message||'Bild nicht verfügbar.';imageControls[index]?.focus();}}}
   };
   list.append(item);
  });
 }
 async function prepare(generation){
  try{const snapshot=structuredClone(getState()),csv=source.format==='csv';
   if(csv){const inspected=inspectDraftCSV(source.text,{allowEmptyText:true});if(inspected.issues.length){
    reset();if(zoneField)zoneField.hidden=true;status.textContent=inspected.issues.length===1?`Eintrag ${inspected.issues[0].entry} prüfen · nichts importiert`:`${inspected.issues.length} Einträge prüfen · nichts importiert`;
    for(const issue of inspected.issues){const item=document.createElement('li');item.textContent=issue.message;list.append(item);}return;
   }const rows=inspected.entries;renderCSVRows(rows,snapshot);const timed=rows.filter(row=>row.postingTime).length;if(zoneField)zoneField.hidden=!timed;
    if(!channel?.value||(timed&&!zone?.value)){status.textContent=timed?`${rows.length-timed} ${rows.length-timed===1?'Entwurf':'Entwürfe'} · ${timed} ${timed===1?'Termin':'Termine'}`:`${rows.length} ${rows.length===1?'Entwurf':'Entwürfe'}`;return;}
   }
   const imported=csv?await csvDraftState(snapshot,source.text,channel.value,{timezone:zone?.value||null,images}):parsePlanningExport(source.text);
   if(generation!==epoch||!dialog.open)return;
   const candidate=previewPlanningImport(snapshot,imported);if(csv)validateCSVImportTimes(candidate);applyPlanningImport(getState(),candidate);preview=candidate;csvPreview=csv;
   status.textContent=`${preview.additions.length} neu · ${preview.duplicates.length} bereits vorhanden`;
   if(!csv)for(const p of preview.additions){const item=document.createElement('li');let when=p.scheduledAt?' · '+p.scheduledAt.replace('T',' ')+' '+p.timeZone:'';
    if(csv&&p.scheduledAt){const instant=preview.expectedInstants[p.id],offset=new Intl.DateTimeFormat('de-DE',{timeZone:p.timeZone,timeZoneName:'shortOffset'}).formatToParts(new Date(instant)).find(part=>part.type==='timeZoneName').value;when+=' · '+offset;}
    item.textContent=`${csv?p.text:p.title||p.text.slice(0,90)} · ${p.status==='idea'?'Idee':p.status==='draft'?'Entwurf':'Geplant'} · ${p.channels.join(', ')||'ohne Kanäle'}${when}${csv&&p.tags.length?' · Labels: '+p.tags.join(', '):''}`;list.append(item);}
   confirm.textContent='Importieren';
   confirm.disabled=!preview.additions.length;
  }catch(error){if(generation===epoch){preview=null;confirm.disabled=true;if(source?.format!=='csv')reset();status.textContent=error.message||'Datei nicht lesbar. Nichts importiert.';}}
 }
 input.onchange=async()=>{if(busy||attempted)return;decodeController?.abort();images=[];reset();source=null;if(csvOptions)csvOptions.hidden=true;if(zoneField)zoneField.hidden=true;if(zone)zone.value='';const generation=++epoch,file=input.files?.[0];if(!file)return;status.textContent='Prüfen …';
  try{if(file.size>IMPORT_MAX_BYTES)throw Error('Datei ist größer als 1 MB.');const format=/\.csv$/i.test(file.name||'')?'csv':'json';const text=decodeImportText(await file.arrayBuffer(),{format});if(generation!==epoch||!dialog.open)return;
   source={text,format};if(csvOptions)csvOptions.hidden=format!=='csv';await prepare(generation);
  }catch(error){if(generation===epoch){preview=null;confirm.disabled=true;if(source?.format!=='csv')reset();status.textContent=error.message||'Datei nicht lesbar. Nichts importiert.';}}
 };
 if(channel)channel.onchange=async()=>{if(busy||attempted||source?.format!=='csv')return;reset();status.textContent='Prüfen …';await prepare(++epoch);};
 if(zone)zone.onchange=async()=>{if(busy||attempted||source?.format!=='csv')return;reset();status.textContent='Prüfen …';await prepare(++epoch);};
 if(template)template.onclick=()=>{if(busy)return;let url;try{url=URL.createObjectURL(new Blob(['\uFEFFText,Tags,Posting Time\r\n"Ein erster Beitrag","Kampagne",\r\n"Noch ein Beitrag mit zwei Zeilen:\nHier geht es weiter.","Kampagne,Tipps",\r\n'],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='takt-textentwuerfe.csv';document.body.append(a);try{a.click();}finally{a.remove();}}catch{status.textContent='Vorlage nicht heruntergeladen.';}finally{if(url)setTimeout(()=>URL.revokeObjectURL(url),1000);}};
 confirm.onclick=async()=>{if(busy||attempted||!preview?.additions.length)return;
  let next;try{next=applyPlanningImport(getState(),preview);if(csvPreview)validateCSVImportTimes(preview);}catch(error){reset();status.textContent=error.message;return;}
  busy=true;attempted=true;for(const control of imageControls)control.disabled=true;confirm.disabled=true;close.disabled=true;input.disabled=true;if(channel)channel.disabled=true;if(zone)zone.disabled=true;if(template)template.disabled=true;status.textContent='Import wird gespeichert …';
  try{await save(next,preview.expectedInstants,{requireFuture:csvPreview});status.textContent='Import gespeichert.';reset();}
  catch(error){reset();
   // These exact typed failures occur before the state write. Other failures,
   // including unreadable replies, do not prove that nothing saved.
   if(error instanceof PlannerClientError&&error.status===413&&error.code==='PAYLOAD_TOO_LARGE')rejectionMessage='Import zu groß. Nichts importiert.';
   if(error instanceof PlannerClientError&&error.status===400&&error.code==='IMPORT_TIME_ELAPSED')rejectionMessage='Termin vergangen. Nichts importiert.';
   status.textContent=rejectionMessage||'Unklar, ob gespeichert. Neu laden und Einträge prüfen.';
  }
  finally{busy=false;close.disabled=false;if(template)template.disabled=false;}
 };
 return{open(){if(!canOpen()||busy)return;returnFocus=document.activeElement;decodeController?.abort();images=[];epoch++;source=null;reset();input.value='';input.disabled=attempted;if(csvOptions)csvOptions.hidden=true;if(zoneField)zoneField.hidden=true;if(zone){zone.replaceChildren();const prompt=document.createElement('option');prompt.value='';prompt.textContent='Zeitzone wählen';zone.append(prompt);const zones=[...new Set(['UTC',getState().settings.timezone,...(Intl.supportedValuesOf?.('timeZone')||['Europe/Berlin','America/New_York','Asia/Tokyo'])])].filter(isTimeZone);for(const id of zones){const option=document.createElement('option');option.value=id;option.textContent=id;zone.append(option);}zone.value='';zone.disabled=attempted;}if(channel){channel.replaceChildren();const prompt=document.createElement('option');prompt.value='';prompt.textContent='Kanal wählen';channel.append(prompt);for(const c of getState().channels.filter(c=>c.enabled)){const option=document.createElement('option');option.value=c.id;option.textContent=c.name;channel.append(option);}channel.value='';channel.disabled=attempted;}confirm.textContent='Importieren';status.textContent=attempted?(rejectionMessage||'Neu laden und Einträge prüfen.'):'';dialog.showModal();close.focus();}};
}
