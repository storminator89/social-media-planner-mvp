import {createVideoStillPicker} from './video-still-picker.js';
import {classifyMedia,cropGeometry,editedImageName,IMAGE_LIMIT,MEDIA_LOAD_TIMEOUT_MS,paintTextOverlay,createEditHistory} from './image-studio-model.js';

// This editor never uploads or publishes. Only an explicitly applied processed
// image enters the composer's unchanged single-image workflow.
export function createImageStudio({onApply,isBusy=()=>false,fallbackFocus=()=>{},createStillPicker=createVideoStillPicker}){
 const dialog=document.createElement('dialog');dialog.id='media-studio';dialog.className='media-studio';dialog.setAttribute('aria-labelledby','studio-title');
 dialog.innerHTML=`<div class="studio-head"><div><span class="eyebrow">DEIN KREATIVRAUM</span><h2 id="studio-title">Bild bearbeiten</h2><p>Ausschnitt und Gestaltung.</p></div><button type="button" class="icon-button" data-studio="close" aria-label="Bildeditor schließen">✕</button></div>
 <div class="studio-layout"><div class="studio-main"><div class="studio-toolbar"><button type="button" class="button subtle" data-studio="choose">Datei auswählen</button><button type="button" class="button subtle" data-studio="video-still">Standbild aus Video</button><div class="studio-history"><button type="button" class="button subtle" data-studio="undo" disabled aria-label="Letzte Bildbearbeitung rückgängig machen">↶</button><button type="button" class="button subtle" data-studio="redo" disabled aria-label="Bildbearbeitung wiederholen">↷</button></div><span id="studio-filename">JPG, PNG oder WebP</span><input id="studio-file" type="file" accept="image/jpeg,image/png,image/webp" hidden></div>
 <div id="studio-stage" class="studio-stage"><div id="studio-empty" class="studio-empty"><span class="studio-empty-icon" aria-hidden="true">▧</span><h3>Bild auswählen</h3><p>Datei ablegen oder auswählen.</p><small>JPG, PNG, WebP bis 20 MB</small></div><canvas id="studio-canvas" hidden aria-label="Vorschau des bearbeiteten Bildes"></canvas></div>
 <p id="studio-meta" class="studio-meta">Die Datei bleibt bis zur Übernahme in diesem Browser.</p><p id="studio-status" role="status" aria-live="polite"></p></div>
 <aside class="studio-tools"><div id="studio-image-tools" hidden><div class="studio-section"><span class="studio-step">01 · FORMAT</span><label for="studio-ratio">Seitenverhältnis</label><select id="studio-ratio"><option value="0">Original</option><option value="1">Quadrat · 1:1</option><option value="0.8">Portrait · 4:5</option><option value="0.5625">Story · 9:16</option><option value="1.7777777778">Querformat · 16:9</option></select><div class="studio-actions"><button type="button" class="button subtle" data-studio="rotate">↻ Drehen</button><button type="button" class="button subtle" data-studio="flip" aria-pressed="false">↔ Spiegeln</button></div><label for="studio-zoom">Zoom <output id="studio-zoom-value">1×</output></label><input id="studio-zoom" type="range" min="1" max="3" step="0.05" value="1"><label for="studio-x">Ausschnitt horizontal</label><input id="studio-x" type="range" min="0" max="100" value="50"><label for="studio-y">Ausschnitt vertikal</label><input id="studio-y" type="range" min="0" max="100" value="50"></div><div class="studio-section"><span class="studio-step">02 · FEINSCHLIFF</span><label for="studio-brightness">Helligkeit <output id="studio-brightness-value">100%</output></label><input id="studio-brightness" type="range" min="50" max="150" value="100"><label for="studio-contrast">Kontrast <output id="studio-contrast-value">100%</output></label><input id="studio-contrast" type="range" min="50" max="150" value="100"><label for="studio-saturation">Sättigung <output id="studio-saturation-value">100%</output></label><input id="studio-saturation" type="range" min="0" max="200" value="100"><button type="button" class="studio-reset" data-studio="reset">Bearbeitung zurücksetzen</button></div><div class="studio-section"><span class="studio-step">03 · TEXT IM BILD</span><label for="studio-text">Text einblenden</label><textarea id="studio-text" rows="3" maxlength="280" placeholder="Deine Botschaft im Bild"></textarea><label for="studio-text-size">Textgröße <output id="studio-text-size-value">6%</output></label><input id="studio-text-size" type="range" min="3" max="15" value="6"><label for="studio-text-y">Textposition</label><input id="studio-text-y" type="range" min="0" max="100" value="75"><label for="studio-text-align">Ausrichtung</label><select id="studio-text-align"><option value="left">Links</option><option value="center" selected>Zentriert</option><option value="right">Rechts</option></select><label for="studio-text-tone">Textfarbe</label><select id="studio-text-tone"><option value="light">Weiß</option><option value="dark">Dunkel</option></select><label class="studio-check"><input id="studio-text-background" type="checkbox" checked> Kontrastfläche hinter dem Text</label><p>Der Text wird sichtbar in die JPG-Datei eingebrannt. Zum Verschieben im Bild ziehen oder den Regler nutzen. Lange Texte werden passend verkleinert.</p></div><div class="studio-section"><span class="studio-step">04 · ZUGÄNGLICHKEIT</span><label for="studio-alt">Bildbeschreibung</label><textarea id="studio-alt" rows="3" maxlength="500" placeholder="Was ist auf dem Bild zu sehen?"></textarea><p>Wird als Alternativtext übernommen. Export: JPG, maximal 2048 px und 2 MB. Transparenz wird weiß.</p></div></div>
 <div id="studio-intro" class="studio-section"><span class="studio-step">WENIGER KLICKS. MEHR WIRKUNG.</span><h3>Bild anpassen</h3><p>Zuschneiden, drehen, beschriften. „Bild übernehmen“ ersetzt das Editorbild.</p><p>Ein Bild je Beitrag. Danach Beitrag speichern. Kein Versand.</p></div></aside></div>
 <footer class="studio-footer"><span>Keine Veröffentlichung · Original bleibt unverändert</span><div><button type="button" class="button subtle" data-studio="close">Abbrechen</button><button type="button" class="button primary" data-studio="apply" disabled>Bild übernehmen</button></div></footer>`;
 document.body.append(dialog);
 const $=s=>dialog.querySelector(s),canvas=$('#studio-canvas'),apply=$('[data-studio="apply"]');
 let source=null,kind=null,file=null,objectURL=null,generation=0,rotation=0,flip=false,returnFocus=null,working=false,applying=false,raf=0,cancelLoad=null,overlay=null,drag=null,previewValid=true,videoPicker=null,pickerGeneration=0;
 const history=createEditHistory(),editIDs=['ratio','zoom','x','y','brightness','contrast','saturation','text','text-size','text-y','text-align','text-tone'];
 const status=message=>{$('#studio-status').textContent=message;};
 // Abort is best-effort. Settle independently so an ignored abort or a stalled
 // response body/decoder cannot leave the editor busy or revive an old load.
 function waitForLoad(start,message,cleanup=()=>{}){
  return new Promise((resolve,reject)=>{
   let settled=false;
   const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timeout);if(cancelLoad===cancel)cancelLoad=null;cleanup(error);if(error)reject(error);else resolve(value);};
   const cancel=()=>finish(Error('Auswahl verworfen.'));
   const timeout=setTimeout(()=>finish(Object.assign(Error(message),{name:'TimeoutError'})),MEDIA_LOAD_TIMEOUT_MS);
   cancelLoad=cancel;
   try{Promise.resolve(start()).then(value=>finish(null,value),error=>finish(error));}catch(error){finish(error);}
  });
 }
 function busy(value,lockClose=false){working=value;applying=value&&lockClose;dialog.setAttribute('aria-busy',String(value));for(const control of dialog.querySelectorAll('button,input,select,textarea'))control.disabled=value;for(const button of dialog.querySelectorAll('[data-studio="close"]'))button.disabled=applying;apply.disabled=value||!kind||(kind==='image'&&!previewValid);updateHistory();}
 function release(){generation++;videoPicker?.close({force:true});cancelLoad?.();cancelLoad=null;cancelAnimationFrame(raf);if(objectURL)URL.revokeObjectURL(objectURL);objectURL=null;source=null;kind=null;file=null;overlay=null;drag=null;canvas.width=0;canvas.height=0;history.clear();$('#studio-text').value='';$('#studio-alt').value='';previewValid=true;}
 function editState(){return {rotation,flip,values:Object.fromEntries(editIDs.map(id=>[id,$('#studio-'+id).value])),background:$('#studio-text-background').checked};}
 function updateHistory(){for(const [action,allowed]of [['undo',history.canUndo],['redo',history.canRedo]])$('[data-studio="'+action+'"]').disabled=working||kind!=='image'||!allowed;}
 function commitEdit(group=null){if(kind==='image'){history.push(editState(),group);updateHistory();}}
 function restoreEdit(state){rotation=state.rotation;flip=state.flip;for(const [id,value]of Object.entries(state.values))$('#studio-'+id).value=value;$('#studio-text-background').checked=state.background;$('[data-studio="flip"]').setAttribute('aria-pressed',String(flip));safeDraw();updateHistory();}
 function reset(recover=false){rotation=0;flip=false;for(const [id,value]of Object.entries({ratio:0,zoom:1,x:50,y:50,brightness:100,contrast:100,saturation:100,text:'','text-size':6,'text-y':75,'text-align':'center','text-tone':'light'}))$('#studio-'+id).value=value;$('#studio-text-background').checked=true;$('[data-studio="flip"]').setAttribute('aria-pressed','false');if(recover)safeDraw();else draw();}
 function safeDraw(){try{const recovering=!previewValid;draw();apply.disabled=working||!kind;if(recovering)status('Vorschau aktualisiert. Das JPG enthält die sichtbare Bearbeitung.');}catch(error){status(error.message||'Die Vorschau konnte nicht erstellt werden.');apply.disabled=true;}}
 function geometry(){return cropGeometry(source.naturalWidth,source.naturalHeight,{rotation,ratio:$('#studio-ratio').value,zoom:$('#studio-zoom').value,x:$('#studio-x').value,y:$('#studio-y').value});}
 function draw(){if(kind!=='image'||!source)return;previewValid=false;const g=geometry();canvas.width=g.width;canvas.height=g.height;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,g.width,g.height);ctx.save();ctx.filter=`brightness(${$('#studio-brightness').value}%) contrast(${$('#studio-contrast').value}%) saturate(${$('#studio-saturation').value}%)`;ctx.scale(g.width/g.sw,g.height/g.sh);ctx.translate(-g.sx,-g.sy);ctx.translate(g.w/2,g.h/2);ctx.rotate(rotation*Math.PI/180);ctx.scale(flip?-1:1,1);ctx.drawImage(source,-source.naturalWidth/2,-source.naturalHeight/2);ctx.restore();overlay=paintTextOverlay(ctx,g.width,g.height,{text:$('#studio-text').value,size:$('#studio-text-size').value,y:$('#studio-text-y').value,align:$('#studio-text-align').value,tone:$('#studio-text-tone').value,background:$('#studio-text-background').checked});$('#studio-text-size-value').textContent=overlay?overlay.fontSize+' px':$('#studio-text-size').value+'%';$('#studio-meta').textContent=`${source.naturalWidth} × ${source.naturalHeight} px → ${g.width} × ${g.height} px · JPG-Ausgabe`;
 for(const id of ['brightness','contrast','saturation'])$('#studio-'+id+'-value').textContent=$('#studio-'+id).value+'%';$('#studio-zoom-value').textContent=Number($('#studio-zoom').value).toFixed(2)+'×';previewValid=true;}
 function show(){const image=kind==='image';canvas.hidden=!image;$('#studio-empty').hidden=!!kind;$('#studio-intro').hidden=!!kind;$('#studio-image-tools').hidden=!image;apply.hidden=false;apply.textContent='Bild übernehmen';apply.disabled=!kind||working||(kind==='image'&&!previewValid);updateHistory();}
 async function load(next,alt=''){
  if(working)return;try{classifyMedia(next);}catch(e){status(e.message);return;}
  const token=++generation,previous={source,kind,edit:editState(),previewValid};let nextURL=null,adopted=false,staged=false;
  cancelAnimationFrame(raf);busy(true);status('Datei wird geprüft …');
  try{
   nextURL=URL.createObjectURL(next);const img=new Image();
   await waitForLoad(()=>new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('Dieses Bild kann nicht gelesen werden.'));img.src=nextURL;}),'Das Bild konnte nicht rechtzeitig geladen werden.',error=>{img.onload=null;img.onerror=null;if(error)img.src='';});
   if(token!==generation)return;cropGeometry(img.naturalWidth,img.naturalHeight);
   // The previous source, controls, history and URL survive until the new image
   // has decoded, passed the size bound and rendered successfully.
   staged=true;source=img;kind='image';reset();
   const oldURL=objectURL;objectURL=nextURL;file=next;adopted=true;overlay=null;drag=null;
   $('#studio-filename').textContent=next.name;$('#studio-alt').value=alt;history.reset(editState());
   if(oldURL)URL.revokeObjectURL(oldURL);
   status('Bereit. Passe dein Bild an und übernimm es bewusst in den Beitrag.');
  }catch(e){if(token===generation){
   if(staged&&!adopted){source=previous.source;kind=previous.kind;restoreEdit(previous.edit);previewValid=previous.previewValid;}
   status(e.message);if(!kind)$('#studio-meta').textContent='Keine Datei übernommen.';
  }}finally{
   if(nextURL&&!adopted)URL.revokeObjectURL(nextURL);
   if(token===generation){busy(false);show();$('#studio-file').value='';$('[data-studio="choose"]').focus();}
  }
  return adopted&&token===generation;
 }
 function close({force=false}={}){if(applying&&!force)return;release();busy(false);dialog.close();if(returnFocus?.isConnected)returnFocus.focus();else fallbackFocus();}
 dialog.addEventListener('cancel',e=>{e.preventDefault();if(videoPicker?.isOpen){videoPicker.close();return;}close();});
 dialog.addEventListener('click',async e=>{const action=e.target.closest('[data-studio]')?.dataset.studio;if(!action||videoPicker?.isOpen)return;
 if(action==='close'){close();return;}if(working)return;
 if(action==='choose')$('#studio-file').click();
 if(action==='video-still'){
  if(isBusy()||!dialog.open)return;
  videoPicker??=createStillPicker({host:dialog,onOpen:()=>{dialog.classList.add('studio-picking');dialog.setAttribute('aria-labelledby','video-still-title');},onClose:({accepted})=>{dialog.classList.remove('studio-picking');dialog.setAttribute('aria-labelledby','studio-title');if(accepted&&dialog.open)$('#studio-ratio').focus();},isBusy:()=>working||isBusy()||!dialog.open,fallbackFocus:()=>{if(dialog.open)$('[data-studio="video-still"]').focus();},onImage:async(next,{signal}={})=>{
   if(!dialog.open||working||isBusy()||pickerGeneration!==generation)throw Error('Der Bildeditor wurde inzwischen geändert. Öffne die Standbildauswahl erneut.');
   if(signal?.aborted)throw Error('Die Standbildübergabe wurde abgebrochen.');
   const before=generation,abort=()=>{if(generation===before+1)cancelLoad?.();};
   signal?.addEventListener('abort',abort,{once:true});
   try{
    const accepted=await load(next);
    if(dialog.open&&(generation===before||generation===before+1))pickerGeneration=generation;
    else throw Error('Der Bildeditor wurde inzwischen geschlossen oder geändert.');
    if(signal?.aborted)throw Error('Die Standbildübergabe wurde abgebrochen.');
    return accepted===true;
   }finally{signal?.removeEventListener('abort',abort);}
  }});
  pickerGeneration=generation;await videoPicker.open();return;
 }
 if(action==='rotate'){commitEdit();rotation=(rotation+90)%360;safeDraw();commitEdit();}
 if(action==='flip'){commitEdit();flip=!flip;$('[data-studio="flip"]').setAttribute('aria-pressed',String(flip));safeDraw();commitEdit();}
 if(action==='reset'&&kind==='image'){commitEdit();reset(true);commitEdit();}
 if(action==='undo'&&kind==='image'){commitEdit();if(history.canUndo)restoreEdit(history.undo());}
 if(action==='redo'&&kind==='image'&&history.canRedo)restoreEdit(history.redo());
 if(action==='apply'&&kind==='image'){
 if(isBusy())return;const token=generation;busy(true,true);status('Bild wird vorbereitet …');
 try{draw();let blob;for(const quality of [.9,.8,.65,.5,.35]){blob=await waitForLoad(()=>new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality)),'Das JPG konnte nicht rechtzeitig erzeugt werden.');if(token!==generation)return;if(blob&&blob.size>0&&blob.size<=IMAGE_LIMIT)break;}if(blob&&blob.type!=='image/jpeg')throw Error('Dein Browser konnte keine JPG-Datei erzeugen.');if(!blob||!blob.size||blob.size>IMAGE_LIMIT)throw Error('Das Ergebnis ist größer als 2 MB. Wähle einen kleineren Ausschnitt.');
 const result=new File([blob],editedImageName(file.name),{type:'image/jpeg'});const alt=$('#studio-alt').value;if(token!==generation)return;await onApply(result,alt);if(token!==generation)return;busy(false);close();
 }catch(e){if(token===generation){status(e.message||'Das Bild konnte nicht übernommen werden.');busy(false);}}
 }
 });
 $('#studio-file').addEventListener('change',e=>{const next=e.target.files[0];e.target.value='';if(next)load(next);});
 $('#studio-image-tools').addEventListener('input',e=>{if(e.target.id==='studio-alt'||working)return;cancelAnimationFrame(raf);raf=requestAnimationFrame(safeDraw);commitEdit(e.target.id);});
 $('#studio-image-tools').addEventListener('change',e=>{if(e.target.id!=='studio-alt'&&!working){safeDraw();commitEdit();}});
 canvas.addEventListener('pointerdown',e=>{
  if(working||kind!=='image'||!overlay)return;const rect=canvas.getBoundingClientRect(),point=(e.clientY-rect.top)*canvas.height/rect.height;
  if(point<overlay.box.y||point>overlay.box.y+overlay.box.height)return;
  commitEdit();drag={pointer:e.pointerId,y:e.clientY,value:Number($('#studio-text-y').value),height:rect.height*(canvas.height-overlay.padding*2-overlay.box.height)/canvas.height};canvas.setPointerCapture?.(e.pointerId);e.preventDefault();
 });
 canvas.addEventListener('pointermove',e=>{if(!drag||drag.pointer!==e.pointerId||working)return;if(drag.height>0)$('#studio-text-y').value=String(Math.round(Math.min(100,Math.max(0,drag.value+(e.clientY-drag.y)/drag.height*100))));safeDraw();});
 for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,()=>{if(drag){drag=null;commitEdit();}});
 dialog.addEventListener('dragover',e=>e.preventDefault());dialog.addEventListener('drop',e=>e.preventDefault());
 const stage=$('#studio-stage');stage.addEventListener('dragover',e=>{e.preventDefault();stage.classList.add('drag-over');});stage.addEventListener('dragleave',()=>stage.classList.remove('drag-over'));stage.addEventListener('drop',e=>{e.preventDefault();stage.classList.remove('drag-over');if(e.dataTransfer.files.length!==1){status('Bitte wähle genau eine Datei.');return;}load(e.dataTransfer.files[0]);});
 return {open:async(media=null)=>{if(isBusy()||dialog.open)return;returnFocus=document.activeElement;release();busy(false);show();status('');$('#studio-filename').textContent='JPG, PNG oder WebP';$('#studio-meta').textContent='Die Datei bleibt bis zur Übernahme in diesem Browser.';dialog.showModal();$('[data-studio="choose"]').focus();if(media){const src=media.dataUrl||(/^\/api\/planner\/media\/[A-Za-z0-9_-]+$/.test(media.url||'')?media.url:null);if(!src)return;const token=generation;busy(true);try{let blob;if(media.dataUrl){const match=/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]*={0,2})$/.exec(src);if(!match||match[2].length>28*1024*1024)throw Error();const bytes=atob(match[2]);blob=new Blob([Uint8Array.from(bytes,c=>c.charCodeAt(0))],{type:match[1]});}else{const controller=new AbortController(),message='Das vorhandene Medium konnte nicht rechtzeitig geladen werden. Wähle eine Datei aus.',abort=error=>{if(error)controller.abort();};const response=await waitForLoad(()=>fetch(src,{signal:controller.signal,credentials:'same-origin',cache:'no-store',redirect:'error'}),message,abort);if(token!==generation){controller.abort();return;}if(!response.ok){controller.abort();throw Error();}blob=await waitForLoad(()=>response.blob(),message,abort);}if(token!==generation)return;busy(false);await load(new File([blob],media.name||'bild',{type:blob.type}),media.alt||'');}catch(e){if(token===generation){busy(false);status(e.name==='TimeoutError'?e.message:'Das vorhandene Medium konnte nicht geladen werden. Wähle eine Datei aus.');}}}},close,get hasPendingWork(){return !!dialog.open&&(working||kind==='image'||!!videoPicker?.hasPendingWork);}};
}
