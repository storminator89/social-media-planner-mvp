import {createVideoStillPicker} from './video-still-picker.js';
import {clipboardImage,isPasteTextTarget} from './image-studio-paste.js';
import {canvasPoint,cropDragPosition,cropOverflow,textOverlayContainsPoint,validCanvasRect} from './image-studio-drag.js';
import {classifyMedia,cropGeometry,fitGeometry,editedImageName,IMAGE_LIMIT,MEDIA_LOAD_TIMEOUT_MS,paintTextOverlay,createEditHistory} from './image-studio-model.js';

// This editor never uploads or publishes. Only an explicitly applied processed
// image replaces only the deliberately selected composer slot.
export function createImageStudio({onApply,isBusy=()=>false,fallbackFocus=()=>{},createStillPicker=createVideoStillPicker,carousel=null}){
 const dialog=document.createElement('dialog');dialog.id='media-studio';dialog.className='media-studio';dialog.setAttribute('aria-labelledby','studio-title');
 dialog.innerHTML=`<div class="studio-head"><div><h2 id="studio-title">Bild bearbeiten</h2></div><button type="button" class="icon-button" data-studio="close" aria-label="Bildeditor schließen">✕</button></div>
 <nav id="studio-carousel" class="studio-carousel" aria-label="Bilder im Beitrag" hidden><button type="button" class="button subtle" data-studio="previous">Vorheriges Bild</button><span id="studio-position" role="status" aria-live="polite"></span><button type="button" class="button subtle" data-studio="next">Nächstes Bild</button></nav>
 <div id="studio-switch" class="studio-switch" role="group" aria-label="Änderungen übernehmen?" hidden><strong>Änderungen übernehmen?</strong><button type="button" class="button primary" data-studio="switch-apply">Übernehmen und wechseln</button><button type="button" class="button subtle" data-studio="switch-discard">Verwerfen und wechseln</button><button type="button" class="button subtle" data-studio="switch-stay">Hier bleiben</button></div>
 <div class="studio-layout"><div class="studio-main"><div class="studio-toolbar"><button type="button" class="button subtle" data-studio="choose">Datei auswählen</button><button type="button" class="button subtle" data-studio="video-still">Standbild aus Video</button><div class="studio-history"><button type="button" class="button subtle" data-studio="undo" disabled aria-label="Letzte Bildbearbeitung rückgängig machen">↶</button><button type="button" class="button subtle" data-studio="redo" disabled aria-label="Bildbearbeitung wiederholen">↷</button></div><span id="studio-filename">JPG, PNG oder WebP</span><input id="studio-file" type="file" accept="image/jpeg,image/png,image/webp" hidden></div>
 <div id="studio-stage" class="studio-stage" role="group" tabindex="0" aria-label="Bildfläche"><div id="studio-empty" class="studio-empty"><span class="studio-empty-icon" aria-hidden="true">▧</span><h3>Bild auswählen</h3><small>JPG, PNG, WebP bis 20 MB</small></div><canvas id="studio-canvas" hidden aria-label="Vorschau des bearbeiteten Bildes"></canvas></div>
 <p id="studio-meta" class="studio-meta"></p><p id="studio-status" role="status" aria-live="polite"></p></div>
 <aside class="studio-tools"><div id="studio-image-tools" hidden><div class="studio-section"><span class="studio-step">01 · FORMAT</span><label for="studio-format">Ausgabeformat</label><select id="studio-format"><option value="jpeg">JPG</option><option value="png">PNG · transparent</option></select><label for="studio-fit">Bildanpassung</label><select id="studio-fit"><option value="crop">Zuschneiden</option><option value="contain">Ganzes Bild</option></select><label for="studio-ratio">Seitenverhältnis</label><select id="studio-ratio"><option value="0">Original</option><option value="1">Quadrat · 1:1</option><option value="0.8">Portrait · 4:5</option><option value="0.5625">Story · 9:16</option><option value="1.7777777778">Querformat · 16:9</option><option value="custom">Eigenes Format</option></select><div id="studio-custom-size" hidden><label for="studio-width">Breite (px)</label><input id="studio-width" type="number" min="1" max="2048" step="1" inputmode="numeric"><label for="studio-height">Höhe (px)</label><input id="studio-height" type="number" min="1" max="2048" step="1" inputmode="numeric"></div><div class="studio-actions"><button type="button" class="button subtle" data-studio="rotate">↻ Drehen</button><button type="button" class="button subtle" data-studio="flip" aria-pressed="false">↔ Spiegeln</button></div><label for="studio-zoom">Zoom <output id="studio-zoom-value">1×</output></label><input id="studio-zoom" type="range" min="1" max="3" step="0.05" value="1"><label for="studio-x">Ausschnitt horizontal</label><input id="studio-x" type="range" min="0" max="100" step="0.1" value="50"><label for="studio-y">Ausschnitt vertikal</label><input id="studio-y" type="range" min="0" max="100" step="0.1" value="50"></div><div class="studio-section"><span class="studio-step">02 · FEINSCHLIFF</span><label for="studio-brightness">Helligkeit <output id="studio-brightness-value">100%</output></label><input id="studio-brightness" type="range" min="50" max="150" value="100"><label for="studio-contrast">Kontrast <output id="studio-contrast-value">100%</output></label><input id="studio-contrast" type="range" min="50" max="150" value="100"><label for="studio-saturation">Sättigung <output id="studio-saturation-value">100%</output></label><input id="studio-saturation" type="range" min="0" max="200" value="100"><button type="button" class="studio-reset" data-studio="reset">Bearbeitung zurücksetzen</button></div><div class="studio-section"><span class="studio-step">03 · TEXT IM BILD</span><label for="studio-text">Text einblenden</label><textarea id="studio-text" rows="3" maxlength="280" placeholder="Deine Botschaft im Bild"></textarea><label for="studio-text-size">Textgröße <output id="studio-text-size-value">6%</output></label><input id="studio-text-size" type="range" min="3" max="15" value="6"><label for="studio-text-y">Textposition</label><input id="studio-text-y" type="range" min="0" max="100" value="75"><label for="studio-text-align">Ausrichtung</label><select id="studio-text-align"><option value="left">Links</option><option value="center" selected>Zentriert</option><option value="right">Rechts</option></select><label for="studio-text-tone">Textfarbe</label><select id="studio-text-tone"><option value="light">Weiß</option><option value="dark">Dunkel</option></select><label class="studio-check"><input id="studio-text-background" type="checkbox" checked> Kontrastfläche hinter dem Text</label></div><div class="studio-section"><span class="studio-step">04 · ZUGÄNGLICHKEIT</span><label for="studio-alt">Bildbeschreibung</label><textarea id="studio-alt" rows="3" maxlength="500" placeholder="Was ist auf dem Bild zu sehen?"></textarea></div></div>
 <div id="studio-intro" class="studio-section"></div></aside></div>
 <footer class="studio-footer"><div><button type="button" class="button subtle" data-studio="close">Abbrechen</button><button type="button" class="button subtle" data-studio="apply-next" hidden disabled>Übernehmen und nächstes Bild</button><button type="button" class="button primary" data-studio="apply" disabled>Bild übernehmen</button></div></footer>`;
 document.body.append(dialog);
 const $=s=>dialog.querySelector(s),canvas=$('#studio-canvas'),apply=$('[data-studio="apply"]');
 let customInitialized=false,source=null,kind=null,file=null,objectURL=null,generation=0,rotation=0,flip=false,returnFocus=null,working=false,applying=false,raf=0,cancelLoad=null,overlay=null,drag=null,previewValid=true,videoPicker=null,pickerGeneration=0;
 let sequence=null,currentKey=null,currentMedia=null,baseline=null,baselineAlt="",originalFile=null,pendingKey=null;
 const history=createEditHistory(),editIDs=['format','fit','ratio','width','height','zoom','x','y','brightness','contrast','saturation','text','text-size','text-y','text-align','text-tone'];
 const status=message=>{$('#studio-status').textContent=message;};
 function output(){const format=$('#studio-format').value;if(!['jpeg','png'].includes(format))throw Error('Wähle JPG oder PNG als Ausgabeformat.');return {format,mime:'image/'+format,label:format==='png'?'PNG':'JPG'};} 
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
 function busy(value,lockClose=false){if(value)finishDrag();working=value;applying=value&&lockClose;dialog.setAttribute('aria-busy',String(value));for(const control of dialog.querySelectorAll('button,input,select,textarea'))control.disabled=value;for(const button of dialog.querySelectorAll('[data-studio="close"]'))button.disabled=applying;apply.disabled=value||!kind||(kind==='image'&&!previewValid);updateSizeControls();updateHistory();updateDragSurface();updateCarousel();}
 function release(){sequence=null;currentKey=null;currentMedia=null;baseline=null;originalFile=null;pendingKey=null;$('#studio-switch').hidden=true;finishDrag(false);generation++;videoPicker?.close({force:true});cancelLoad?.();cancelLoad=null;cancelAnimationFrame(raf);if(objectURL)URL.revokeObjectURL(objectURL);objectURL=null;source=null;kind=null;file=null;overlay=null;drag=null;canvas.width=0;canvas.height=0;canvas.removeAttribute('data-format');$('#studio-format').value='jpeg';$('#studio-fit').value='crop';$('#studio-ratio').value='0';$('#studio-width').value='';$('#studio-height').value='';$('#studio-custom-size').hidden=true;customInitialized=false;history.clear();$('#studio-text').value='';$('#studio-alt').value='';previewValid=true;}
 function editState(){return {rotation,flip,customInitialized,values:Object.fromEntries(editIDs.map(id=>[id,$('#studio-'+id).value])),background:$('#studio-text-background').checked};}
 function updateHistory(){
  for(const [action,allowed]of [['undo',history.canUndo],['redo',history.canRedo]]){
   const button=$('[data-studio="'+action+'"]'),disabled=working||kind!=='image'||!allowed;
   // A disabled focused button can send focus to body, rejecting the next drag.
   if(disabled&&document.activeElement===button&&canDrag())$('#studio-stage').focus({preventScroll:true});
   button.disabled=disabled;
  }
 }
 function commitEdit(group=null){if(kind==='image'){history.push(editState(),group);updateHistory();}}
 function restoreEdit(state){customInitialized=state.customInitialized===true;rotation=state.rotation;flip=state.flip;for(const [id,value]of Object.entries(state.values))$('#studio-'+id).value=value;$('#studio-text-background').checked=state.background;$('[data-studio="flip"]').setAttribute('aria-pressed',String(flip));safeDraw();updateHistory();}
 function reset(recover=false){customInitialized=false;rotation=0;flip=false;for(const [id,value]of Object.entries({format:'jpeg',fit:'crop',ratio:0,width:'',height:'',zoom:1,x:50,y:50,brightness:100,contrast:100,saturation:100,text:'','text-size':6,'text-y':75,'text-align':'center','text-tone':'light'}))$('#studio-'+id).value=value;$('#studio-text-background').checked=true;$('[data-studio="flip"]').setAttribute('aria-pressed','false');if(recover)safeDraw();else draw();}
 function safeDraw(){updateSizeControls();try{const recovering=!previewValid;draw();apply.disabled=working||!kind;if(recovering)status('Vorschau aktualisiert. Die Ausgabe enthält die sichtbare Bearbeitung.');}catch(error){previewValid=false;overlay=null;canvas.hidden=true;$('#studio-meta').textContent='Keine gültige Ausgabe.';canvas.removeAttribute('data-draggable');status(error.message||'Die Vorschau konnte nicht erstellt werden.');apply.disabled=true;}updateCarousel();}
 function updateSizeControls(){const custom=$('#studio-ratio').value==='custom';$('#studio-custom-size').hidden=!custom;for(const id of ['zoom','x','y'])$('#studio-'+id).disabled=working||$('#studio-fit').value==='contain';}
 function prepareSizeEdit(target){
  if(target.id==='studio-ratio'&&target.value==='custom'&&!customInitialized&&source){
   customInitialized=true;const g=($('#studio-fit').value==='contain'?fitGeometry:cropGeometry)(source.naturalWidth,source.naturalHeight,{rotation,zoom:$('#studio-zoom').value});
   // Start with native, bounded dimensions; explicit user dimensions never change.
   $('#studio-width').value=String(Math.max(1,Math.floor(g.sw*Math.min(1,2048/Math.max(g.sw,g.sh)))));
   $('#studio-height').value=String(Math.max(1,Math.floor(g.sh*Math.min(1,2048/Math.max(g.sw,g.sh)))));
  }
 }
 function geometry(){return ($('#studio-fit').value==='contain'?fitGeometry:cropGeometry)(source.naturalWidth,source.naturalHeight,{rotation,ratio:$('#studio-ratio').value,outputWidth:$('#studio-width').value,outputHeight:$('#studio-height').value,zoom:$('#studio-zoom').value,x:$('#studio-x').value,y:$('#studio-y').value});}
 function draw(){updateSizeControls();if(kind!=='image'||!source)return;previewValid=false;const g=geometry(),out=output();canvas.width=g.width;canvas.height=g.height;canvas.setAttribute('data-format',out.format);const ctx=canvas.getContext('2d');if(out.format==='jpeg'){ctx.fillStyle='#fff';ctx.fillRect(0,0,g.width,g.height);}ctx.save();ctx.filter=`brightness(${$('#studio-brightness').value}%) contrast(${$('#studio-contrast').value}%) saturate(${$('#studio-saturation').value}%)`;if($('#studio-fit').value==='contain'){ctx.translate(g.dx,g.dy);ctx.scale(g.scale,g.scale);}else{ctx.scale(g.width/g.sw,g.height/g.sh);ctx.translate(-g.sx,-g.sy);}ctx.translate(g.w/2,g.h/2);ctx.rotate(rotation*Math.PI/180);ctx.scale(flip?-1:1,1);ctx.drawImage(source,-source.naturalWidth/2,-source.naturalHeight/2);ctx.restore();overlay=paintTextOverlay(ctx,g.width,g.height,{text:$('#studio-text').value,size:$('#studio-text-size').value,y:$('#studio-text-y').value,align:$('#studio-text-align').value,tone:$('#studio-text-tone').value,background:$('#studio-text-background').checked});$('#studio-text-size-value').textContent=overlay?overlay.fontSize+' px':$('#studio-text-size').value+'%';$('#studio-meta').textContent=`${source.naturalWidth} × ${source.naturalHeight} px → ${g.width} × ${g.height} px · ${out.label}-Ausgabe`;
 for(const id of ['brightness','contrast','saturation'])$('#studio-'+id+'-value').textContent=$('#studio-'+id).value+'%';$('#studio-zoom-value').textContent=Number($('#studio-zoom').value).toFixed(2)+'×';previewValid=true;canvas.hidden=false;updateDragSurface(g);}
 function show(){const image=kind==='image';canvas.hidden=!image||!previewValid;$('#studio-empty').hidden=!!kind;$('#studio-intro').hidden=!!kind;$('#studio-image-tools').hidden=!image;apply.hidden=false;apply.textContent='Bild übernehmen';apply.disabled=!kind||working||(kind==='image'&&!previewValid);updateHistory();updateCarousel();}
 async function load(next,alt='',validate=()=>true,onAdopt=()=>true){
  if(working)return;try{classifyMedia(next);}catch(e){status(e.message);return;}
  finishDrag();const token=++generation,previous={source,kind,edit:editState()};let nextURL=null,adopted=false,staged=false;
  cancelAnimationFrame(raf);busy(true);status('Datei wird geprüft …');
  try{
   nextURL=URL.createObjectURL(next);const img=new Image();
   await waitForLoad(()=>new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('Dieses Bild kann nicht gelesen werden.'));img.src=nextURL;}),'Das Bild konnte nicht rechtzeitig geladen werden.',error=>{img.onload=null;img.onerror=null;if(error)img.src='';});
   if(token!==generation)return;if(!validate())throw Error("Die Bildfolge wurde inzwischen geändert. Öffne den Bildeditor erneut.");cropGeometry(img.naturalWidth,img.naturalHeight);
   // The previous source, controls, history and URL survive until the new image
   // has decoded, passed the size bound and rendered successfully.
   staged=true;source=img;kind='image';reset();if(!onAdopt())throw Error('Die Bildfolge wurde inzwischen geändert. Öffne den Bildeditor erneut.');
   const oldURL=objectURL;objectURL=nextURL;file=next;adopted=true;overlay=null;drag=null;
   $('#studio-filename').textContent=next.name;$('#studio-alt').value=alt;history.reset(editState());baseline=JSON.stringify(editState());baselineAlt=alt;
   if(oldURL)URL.revokeObjectURL(oldURL);
   status('Bereit. Passe dein Bild an und übernimm es bewusst in den Beitrag.');
  }catch(e){if(token===generation){
   if(staged&&!adopted){source=previous.source;kind=previous.kind;restoreEdit(previous.edit);}
   status(e.message);if(!kind)$('#studio-meta').textContent='Keine Datei übernommen.';
  }}finally{
   if(nextURL&&!adopted)URL.revokeObjectURL(nextURL);
   if(token===generation){busy(false);show();$('#studio-file').value='';$('[data-studio="choose"]').focus();}
  }
  return adopted&&token===generation;
 }
 function close({force=false}={}){if(applying&&!force)return;release();busy(false);dialog.close();if(returnFocus?.isConnected)returnFocus.focus();else fallbackFocus();}
 function validSequence(){if(!sequence)return false;const snapshot=carousel?.snapshot();return !!snapshot&&snapshot.key===currentKey&&snapshot.items.length===sequence.length&&snapshot.items.every((item,index)=>item.key===sequence[index])&&snapshot.items.find(item=>item.key===currentKey)?.media===currentMedia;}
 function updateCarousel(){const index=sequence?.indexOf(currentKey)??-1;$('#studio-carousel').hidden=!sequence;$('#studio-position').textContent=sequence?`Bild ${index+1} von ${sequence.length}`:'';for(const [action,allowed]of [['previous',index>0],['next',!!sequence&&index<sequence.length-1],['apply-next',!!sequence&&index<sequence.length-1&&kind==='image'&&previewValid]]){const button=$('[data-studio="'+action+'"]');button.disabled=working||!!pendingKey||!allowed;if(action==='apply-next')button.hidden=!sequence||sequence.length<2;}}
 async function requestSwitch(key){if(!validSequence()){status('Die Bildfolge wurde inzwischen geändert. Öffne den Bildeditor erneut.');return;}if(kind==='image'&&(file!==originalFile||baseline!==JSON.stringify(editState())||baselineAlt!==$('#studio-alt').value)){pendingKey=key;$('#studio-switch').hidden=false;updateCarousel();$('[data-studio="switch-stay"]').focus();return;}await switchImage(key);}
 async function switchImage(key){if(!sequence||!validSequence()){status('Die Bildfolge wurde inzwischen geändert. Öffne den Bildeditor erneut.');return false;}const media=carousel.snapshot().items.find(item=>item.key===key)?.media;if(!media)return false;const accepted=await loadMedia(media,()=>validSequence(),()=>carousel.select(key));if(!accepted)return false;currentKey=key;currentMedia=media;originalFile=file;updateCarousel();$('#studio-stage').focus();return true;}
 async function applyImage(closeAfter){
 if(isBusy())return false;if(sequence&&!validSequence()){status("Die Bildfolge wurde inzwischen geändert. Öffne den Bildeditor erneut.");return false;}const token=generation;busy(true,true);status('Bild wird vorbereitet …');
 try{let result=null;const unchanged=!!sequence&&file===originalFile&&baseline===JSON.stringify(editState());if(!unchanged){draw();const out=output();let blob;for(const quality of out.format==='png'?[undefined]:[.9,.8,.65,.5,.35]){blob=await waitForLoad(()=>new Promise(resolve=>canvas.toBlob(resolve,out.mime,quality)),`Das ${out.label} konnte nicht rechtzeitig erzeugt werden.`);if(token!==generation)return;if(blob&&blob.type!==out.mime)throw Error(`Dein Browser konnte keine ${out.label}-Datei erzeugen.`);if(blob&&blob.size>0&&blob.size<=IMAGE_LIMIT)break;}if(!blob||!blob.size)throw Error(`Das ${out.label} konnte nicht erzeugt werden. Versuche es erneut.`);if(blob.size>IMAGE_LIMIT)throw Error('Das Ergebnis ist größer als 2 MB. Wähle einen kleineren Ausschnitt.');
 result=new File([blob],editedImageName(file.name,out.format),{type:out.mime});}const alt=$('#studio-alt').value;if(token!==generation)return;if(sequence&&!validSequence())throw Error("Die Bildfolge wurde inzwischen geändert. Öffne den Bildeditor erneut.");await onApply(result,alt,{unchanged});if(token!==generation)return false;if(sequence){currentMedia=carousel.snapshot()?.items.find(item=>item.key===currentKey)?.media;baseline=JSON.stringify(editState());baselineAlt=alt;originalFile=file;}busy(false);if(closeAfter)close();else status("Bild übernommen.");return true;
 }catch(e){if(token===generation){status(e.message||'Das Bild konnte nicht übernommen werden.');busy(false);apply.focus();}return false;}
 }
 async function loadMedia(media,validate=()=>true,onAdopt=()=>true){const src=media.dataUrl||(/^\/api\/planner\/media\/[A-Za-z0-9_-]+$/.test(media.url||'')?media.url:null);if(!src){status('Das vorhandene Medium konnte nicht geladen werden.');return false;}const token=generation;busy(true);try{let blob;if(media.dataUrl){const match=/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]*={0,2})$/.exec(src);if(!match||match[2].length>28*1024*1024)throw Error();const bytes=atob(match[2]);blob=new Blob([Uint8Array.from(bytes,c=>c.charCodeAt(0))],{type:match[1]});}else{const controller=new AbortController(),message='Das vorhandene Medium konnte nicht rechtzeitig geladen werden.',abort=error=>{if(error)controller.abort();};const response=await waitForLoad(()=>fetch(src,{signal:controller.signal,credentials:'same-origin',cache:'no-store',redirect:'error'}),message,abort);if(token!==generation){controller.abort();return false;}if(!response.ok){controller.abort();throw Error();}blob=await waitForLoad(()=>response.blob(),message,abort);}if(token!==generation)return false;busy(false);return await load(new File([blob],media.name||'bild',{type:blob.type}),media.alt||'',validate,onAdopt);}catch(e){if(token===generation){busy(false);status(e.name==='TimeoutError'?e.message:'Das vorhandene Medium konnte nicht geladen werden.');}return false;}}
 dialog.addEventListener('cancel',e=>{if(e.target!==dialog)return;e.preventDefault();if(videoPicker?.isOpen){videoPicker.close();return;}if(pendingKey){pendingKey=null;$('#studio-switch').hidden=true;updateCarousel();$('#studio-stage').focus();return;}close();});
 dialog.addEventListener('click',async e=>{const action=e.target.closest('[data-studio]')?.dataset.studio;if(!action||videoPicker?.isOpen)return;
 if(action==='close'){close();return;}if(working)return;finishDrag();
 if(action==='choose')$('#studio-file').click();
 if(action==='video-still'){
  if(isBusy()||!dialog.open)return;
  videoPicker??=createStillPicker({host:dialog,onOpen:()=>{canvas.removeAttribute('data-draggable');dialog.classList.add('studio-picking');dialog.setAttribute('aria-labelledby','video-still-title');},onClose:({accepted})=>{dialog.classList.remove('studio-picking');dialog.setAttribute('aria-labelledby','studio-title');if(accepted&&dialog.open)$('#studio-ratio').focus();updateDragSurface();},isBusy:()=>working||isBusy()||!dialog.open,fallbackFocus:()=>{if(dialog.open)$('[data-studio="video-still"]').focus();},onImage:async(next,{signal}={})=>{
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
 if(action==='previous'||action==='next'){const index=sequence?.indexOf(currentKey);const key=sequence?.[index+(action==='previous'?-1:1)];if(key)await requestSwitch(key);return;}
 if(action==='switch-stay'){pendingKey=null;$('#studio-switch').hidden=true;updateCarousel();$('#studio-stage').focus();return;}
 if(action==='switch-apply'||action==='switch-discard'){const key=pendingKey;if(!key)return;pendingKey=null;$('#studio-switch').hidden=true;if(action==='switch-apply'&&!await applyImage(false))return;await switchImage(key);return;}
 if(action==='apply-next'){const key=sequence?.[sequence.indexOf(currentKey)+1];if(key&&await applyImage(false))await switchImage(key);return;}
 if(action==='apply'&&kind==='image')await applyImage(true);
 });
 $('#studio-file').addEventListener('change',e=>{const next=e.target.files[0];e.target.value='';if(next)load(next);});
 dialog.addEventListener('paste',e=>{
  if(e.defaultPrevented||!dialog.open||working||isBusy()||videoPicker?.isOpen)return;
  // Native text editing and other modal steps keep their own paste behavior.
  if(isPasteTextTarget(document.activeElement)||(e.composedPath?.()||[e.target]).some(isPasteTextTarget))return;
  // The composer remains modal underneath this editor. Focus, not the number
  // or DOM order of :modal dialogs, identifies the current native paste owner.
  if(!dialog.contains(document.activeElement))return;
  try{const next=clipboardImage(e.clipboardData);if(!next)return;e.preventDefault();void load(next);}
  catch(error){e.preventDefault();status(error.message);}
 });
 $('#studio-image-tools').addEventListener('input',e=>{if(e.target.id==='studio-alt'||working)return;finishDrag();prepareSizeEdit(e.target);cancelAnimationFrame(raf);raf=requestAnimationFrame(safeDraw);commitEdit(e.target.id);});
 $('#studio-image-tools').addEventListener('change',e=>{if(e.target.id!=='studio-alt'&&!working){finishDrag();prepareSizeEdit(e.target);cancelAnimationFrame(raf);safeDraw();commitEdit();}});
 // Finish interruptions at the last visible edit, never restore an old snapshot
 // over a newer input. Close discards the scene; every other finish is one Undo.
 function finishDrag(commit=true){
  const current=drag;if(!current)return;cancelAnimationFrame(raf);raf=0;drag=null;canvas.removeAttribute('data-dragging');
  try{canvas.releasePointerCapture?.(current.pointer);}catch{}
  if(commit&&current.generation===generation&&current.source===source&&dialog.open&&kind==='image'){history.push(current.lastState);updateHistory();}
 }
 function updateDragSurface(g=null){
  canvas.removeAttribute('data-draggable');if(!canDrag())return;
  try{g??=geometry();const overflow=cropOverflow(g);if(overflow&&(overflow.x||overflow.y||overlay))canvas.setAttribute('data-draggable','true');}catch{}
 }
 function canDrag(){return dialog.open&&dialog.contains(document.activeElement)&&!working&&!isBusy()&&!videoPicker?.isOpen&&kind==='image'&&!!source&&previewValid;}
 dialog.addEventListener('focusout',e=>{if(!dialog.contains(e.relatedTarget)){finishDrag();canvas.removeAttribute('data-draggable');}});
 dialog.addEventListener('focusin',()=>updateDragSurface());
 function sameRect(a,b){return validCanvasRect(b)&&['left','top','width','height'].every(key=>a[key]===b[key]);}
 function textHit(point){
  const ctx=canvas.getContext('2d');ctx.save();
  try{if(!overlay)return false;ctx.font=`700 ${overlay.fontSize}px system-ui, sans-serif`;ctx.textAlign=overlay.align;ctx.textBaseline='top';return textOverlayContainsPoint(overlay,point,line=>ctx.measureText(line));}finally{ctx.restore();}
 }
 canvas.addEventListener('pointerdown',e=>{
  if(drag||!canDrag()||e.button!==0||e.isPrimary!==true||!Number.isInteger(e.pointerId)||e.pointerId<0)return;
  cancelAnimationFrame(raf);safeDraw();if(!canDrag())return;
  const rect=canvas.getBoundingClientRect(),point=canvasPoint(rect,canvas.width,canvas.height,e.clientX,e.clientY);if(!point)return;
  const g=geometry(),start={x:Number($('#studio-x').value),y:Number($('#studio-y').value)};
  if(!cropDragPosition(g,rect,start,0,0))return;
  const mode=textHit(point)?'text':'crop',height=overlay?rect.height*(canvas.height-overlay.padding*2-overlay.box.height)/canvas.height:0;
  if(mode==='text'?(height<=0||!Number.isFinite(height)):(!cropOverflow(g).x&&!cropOverflow(g).y))return;
  commitEdit();
  drag={pointer:e.pointerId,generation,source,mode,rect:{left:rect.left,top:rect.top,width:rect.width,height:rect.height},g,start,x:e.clientX,y:e.clientY,textY:Number($('#studio-text-y').value),height,lastState:editState(),time:e.timeStamp};
  try{canvas.setPointerCapture(e.pointerId);}catch{finishDrag(false);return;}
  canvas.setAttribute('data-dragging','true');e.preventDefault();
 });
 canvas.addEventListener('pointermove',e=>{
  if(!drag||drag.pointer!==e.pointerId||(Number.isFinite(e.timeStamp)&&e.timeStamp<drag.time))return;
  if(!canDrag()||drag.generation!==generation||drag.source!==source||e.buttons!==1||e.isPrimary!==true||!sameRect(drag.rect,canvas.getBoundingClientRect())||JSON.stringify(editState())!==JSON.stringify(drag.lastState)){finishDrag();updateDragSurface();return;}
  if(!Number.isFinite(e.clientX)||!Number.isFinite(e.clientY))return;
  if(drag.mode==='text'){const next=Math.round(Math.min(100,Math.max(0,drag.textY+(e.clientY-drag.y)/drag.height*100)));if(next!==Number($('#studio-text-y').value))$('#studio-text-y').value=String(next);}
  else{if($('#studio-fit').value==='contain'){finishDrag();return;}const next=cropDragPosition(drag.g,drag.rect,drag.start,e.clientX-drag.x,e.clientY-drag.y);if(!next){finishDrag();return;}if(next.x!==Number($('#studio-x').value))$('#studio-x').value=String(next.x);if(next.y!==Number($('#studio-y').value))$('#studio-y').value=String(next.y);}
  safeDraw();drag.lastState=editState();e.preventDefault();if(!previewValid)finishDrag();
 });
 for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,e=>{if(drag&&drag.pointer===e.pointerId&&!(Number.isFinite(e.timeStamp)&&e.timeStamp<drag.time))finishDrag();});
 dialog.addEventListener('dragover',e=>e.preventDefault());dialog.addEventListener('drop',e=>e.preventDefault());
 const stage=$('#studio-stage');stage.addEventListener('dragover',e=>{e.preventDefault();stage.classList.add('drag-over');});stage.addEventListener('dragleave',()=>stage.classList.remove('drag-over'));stage.addEventListener('drop',e=>{e.preventDefault();stage.classList.remove('drag-over');if(e.dataTransfer.files.length!==1){status('Bitte wähle genau eine Datei.');return;}load(e.dataTransfer.files[0]);});
 return {open:async(media=null,{carousel:enableCarousel=false}={})=>{if(isBusy()||dialog.open)return;returnFocus=document.activeElement;release();if(enableCarousel){const snapshot=carousel?.snapshot();if(snapshot){sequence=snapshot.items.map(item=>item.key);currentKey=snapshot.key;currentMedia=media;}}busy(false);show();status('');$('#studio-filename').textContent='JPG, PNG oder WebP';$('#studio-meta').textContent='';dialog.showModal();$('[data-studio="choose"]').focus();if(media&&await loadMedia(media,()=>!sequence||validSequence()))originalFile=file;updateCarousel();},close,get hasPendingWork(){return !!dialog.open&&(working||kind==='image'||!!videoPicker?.hasPendingWork);}};
}
