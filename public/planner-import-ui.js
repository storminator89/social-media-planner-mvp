import {PlannerClientError} from './data-client/client.mjs';
import {IMPORT_MAX_BYTES,parsePlanningExport,previewPlanningImport,applyPlanningImport} from './planner-import.js';
import {parseDraftCSV,csvDraftState,validateCSVImportTimes} from './planner-csv.js';
import {isTimeZone} from './model.js';
export function createPlannerImportUI({dialog,getState,canOpen,save}){
 const input=dialog.querySelector('input'),status=dialog.querySelector('[data-import-status]'),list=dialog.querySelector('[data-import-list]'),confirm=dialog.querySelector('[data-import-confirm]'),close=dialog.querySelector('[data-import-close]');
 const csvOptions=dialog.querySelector('[data-csv-options]'),channel=dialog.querySelector('[data-csv-channel]'),template=dialog.querySelector('[data-csv-template]'),zoneField=dialog.querySelector('[data-csv-zone-field]'),zone=dialog.querySelector('[data-csv-zone]');
 let preview=null,csvPreview=false,source=null,epoch=0,busy=false,attempted=false,returnFocus=null,rejectionMessage=null;
 function reset(){preview=null;csvPreview=false;confirm.disabled=true;list.replaceChildren();}
 function dismiss(){if(busy)return;epoch++;source=null;reset();dialog.close();returnFocus?.focus();}
 close.onclick=dismiss;dialog.addEventListener('cancel',event=>{event.preventDefault();dismiss();});
 async function prepare(generation){
  try{const snapshot=structuredClone(getState()),csv=source.format==='csv';
   if(csv){const rows=parseDraftCSV(source.text),timed=rows.filter(row=>row.postingTime).length;if(zoneField)zoneField.hidden=!timed;
    if(!channel?.value||(timed&&!zone?.value)){status.textContent=timed?`${rows.length-timed} ${rows.length-timed===1?'Entwurf':'Entwürfe'} · ${timed} ${timed===1?'Termin':'Termine'}`:`${rows.length} ${rows.length===1?'Entwurf':'Entwürfe'}`;return;}
   }
   const imported=csv?await csvDraftState(snapshot,source.text,channel.value,{timezone:zone?.value||null}):parsePlanningExport(source.text);
   if(generation!==epoch||!dialog.open)return;
   const candidate=previewPlanningImport(snapshot,imported);if(csv)validateCSVImportTimes(candidate);applyPlanningImport(getState(),candidate);preview=candidate;csvPreview=csv;
   status.textContent=`${preview.additions.length} neu · ${preview.duplicates.length} bereits vorhanden`;
   for(const p of preview.additions){const item=document.createElement('li');let when=p.scheduledAt?' · '+p.scheduledAt.replace('T',' ')+' '+p.timeZone:'';
    if(csv&&p.scheduledAt){const instant=preview.expectedInstants[p.id],offset=new Intl.DateTimeFormat('de-DE',{timeZone:p.timeZone,timeZoneName:'shortOffset'}).formatToParts(new Date(instant)).find(part=>part.type==='timeZoneName').value;when+=' · '+offset;}
    item.textContent=`${csv?p.text:p.title||p.text.slice(0,90)} · ${p.status==='idea'?'Idee':p.status==='draft'?'Entwurf':'Geplant'} · ${p.channels.join(', ')||'ohne Kanäle'}${when}${csv&&p.tags.length?' · Labels: '+p.tags.join(', '):''}`;list.append(item);}
   confirm.textContent='Importieren';
   confirm.disabled=!preview.additions.length;
  }catch(error){if(generation===epoch){reset();status.textContent=error.message||'Datei nicht lesbar. Nichts importiert.';}}
 }
 input.onchange=async()=>{if(busy||attempted)return;reset();source=null;if(csvOptions)csvOptions.hidden=true;if(zoneField)zoneField.hidden=true;if(zone)zone.value='';const generation=++epoch,file=input.files?.[0];if(!file)return;status.textContent='Prüfen …';
  try{if(file.size>IMPORT_MAX_BYTES)throw Error('Datei ist größer als 1 MB.');const text=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());if(generation!==epoch||!dialog.open)return;
   const format=/\.csv$/i.test(file.name||'')?'csv':'json';source={text,format};if(csvOptions)csvOptions.hidden=format!=='csv';await prepare(generation);
  }catch(error){if(generation===epoch){reset();status.textContent=error.message||'Datei nicht lesbar. Nichts importiert.';}}
 };
 if(channel)channel.onchange=async()=>{if(busy||attempted||source?.format!=='csv')return;reset();status.textContent='Prüfen …';await prepare(++epoch);};
 if(zone)zone.onchange=async()=>{if(busy||attempted||source?.format!=='csv')return;reset();status.textContent='Prüfen …';await prepare(++epoch);};
 if(template)template.onclick=()=>{if(busy)return;let url;try{url=URL.createObjectURL(new Blob(['\uFEFFText,Tags,Posting Time\r\n"Ein erster Beitrag","Kampagne",\r\n"Noch ein Beitrag mit zwei Zeilen:\nHier geht es weiter.","Kampagne,Tipps",\r\n'],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='takt-textentwuerfe.csv';document.body.append(a);try{a.click();}finally{a.remove();}}catch{status.textContent='Vorlage nicht heruntergeladen.';}finally{if(url)setTimeout(()=>URL.revokeObjectURL(url),1000);}};
 confirm.onclick=async()=>{if(busy||attempted||!preview?.additions.length)return;
  let next;try{next=applyPlanningImport(getState(),preview);if(csvPreview)validateCSVImportTimes(preview);}catch(error){reset();status.textContent=error.message;return;}
  busy=true;attempted=true;confirm.disabled=true;close.disabled=true;input.disabled=true;if(channel)channel.disabled=true;if(zone)zone.disabled=true;if(template)template.disabled=true;status.textContent='Import wird gespeichert …';
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
 return{open(){if(!canOpen()||busy)return;returnFocus=document.activeElement;epoch++;source=null;reset();input.value='';input.disabled=attempted;if(csvOptions)csvOptions.hidden=true;if(zoneField)zoneField.hidden=true;if(zone){zone.replaceChildren();const prompt=document.createElement('option');prompt.value='';prompt.textContent='Zeitzone wählen';zone.append(prompt);const zones=[...new Set(['UTC',getState().settings.timezone,...(Intl.supportedValuesOf?.('timeZone')||['Europe/Berlin','America/New_York','Asia/Tokyo'])])].filter(isTimeZone);for(const id of zones){const option=document.createElement('option');option.value=id;option.textContent=id;zone.append(option);}zone.value='';zone.disabled=attempted;}if(channel){channel.replaceChildren();const prompt=document.createElement('option');prompt.value='';prompt.textContent='Kanal wählen';channel.append(prompt);for(const c of getState().channels.filter(c=>c.enabled)){const option=document.createElement('option');option.value=c.id;option.textContent=c.name;channel.append(option);}channel.value='';channel.disabled=attempted;}confirm.textContent='Importieren';status.textContent=attempted?(rejectionMessage||'Neu laden und Einträge prüfen.'):'';dialog.showModal();close.focus();}};
}
