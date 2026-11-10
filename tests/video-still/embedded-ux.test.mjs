import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createImageStudio} from '../../public/image-studio.js';
import {createVideoStillPicker} from '../../public/video-still-picker.js';
import {VIDEO_STILL_LIMITS} from '../../public/video-still-model.js';
const fixture = await readFile(new URL('./fixtures/reference-av.webm', import.meta.url));
const flush = () => new Promise(setImmediate);
// Real picker and image-editor modules, mocked native DOM/codec/pixels.
// Forked from the prior external combined-lifecycle probe, now targets this candidate.
function harness() {
 const originals = Object.fromEntries(['document','Image','requestAnimationFrame','cancelAnimationFrame'].map(key=>[key,globalThis[key]]));
 const dialogs=[],panels=[],images=[],videos=[],frames=[],revoked=[],created=[],applied=[];
 const originalCreate=URL.createObjectURL,originalRevoke=URL.revokeObjectURL;
 let autoImage=true,picker,seq=0;
 const context={fillRect(){},save(){},scale(){},translate(){},rotate(){},drawImage(){},restore(){},measureText(text){return {width:text.length*10};},fillText(){}};
 class Element {
  constructor(tag='div',id=''){this.tag=tag;this.id=id;this.value='';this.listeners={};this.controlsMap=new Map();this.children=[];this.isConnected=true;this.classes=new Set();this.classList={add:(c)=>this.classes.add(c),remove:(c)=>this.classes.delete(c),contains:(c)=>this.classes.has(c)};this.dataset={};this.disabled=false;this.checked=false;this.hidden=false;this.open=false;}
  addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}removeEventListener(name,fn){this.listeners[name]=(this.listeners[name]||[]).filter(x=>x!==fn);}
  async fire(name,event={}){for(const fn of [...(this.listeners[name]||[])])await fn({preventDefault(){},target:this,...event});}
  setAttribute(name,value){this[name]=value;}removeAttribute(name){if(name==='src')this.src='';else delete this[name];}
  append(child){this.children.push(child);child.parent=this;}remove(){this.isConnected=false;if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);}
  contains(target){for(let node=target;node;node=node.parent)if(node===this)return true;return false;}
  focus(){document.activeElement=this;}click(){}showModal(){this.open=true;}close(){this.open=false;}
  getContext(){return context;}toBlob(fn,type){queueMicrotask(()=>fn(new Blob(['pixels'],{type})));}
  querySelector(selector){return this.controlsMap.get(selector);}
  querySelectorAll(selector){if(selector.includes('data-')&&selector.includes('close'))return [this.controlsMap.get(selector)].filter(Boolean);return [...new Set(this.controlsMap.values())];}
  set innerHTML(html){this.html=html;for(const m of html.matchAll(/id="([^"]+)"/g))this.controlsMap.set('#'+m[1],new Element('control',m[1]));for(const m of html.matchAll(/data-(studio|video-still)="([^"]+)"/g)){const element=new Element('button');element.dataset[m[1]==='studio'?'studio':'videoStill']=m[2];this.controlsMap.set(`[data-${m[1]}="${m[2]}"]`,element);}for(const [key,val]of Object.entries({ratio:0,zoom:1,x:50,y:50,brightness:100,contrast:100,saturation:100,text:'','text-size':6,'text-y':75,'text-align':'center','text-tone':'light'})){const e=this.controlsMap.get('#studio-'+key);if(e)e.value=String(val);}for(const control of this.controlsMap.values())control.parent=this;}
 }
 class Video extends Element {
  constructor(){super('video');this.src='';this.paused=true;this.seeking=false;this.readyState=0;this.currentTime=0;this.duration=2;this.videoWidth=640;this.videoHeight=360;this.error=null;}
  pause(){this.paused=true;}
  load(){if(this.src){this.readyState=2;queueMicrotask(()=>{this.fire('loadedmetadata');this.fire('loadeddata');this.fire('canplay');});}else this.readyState=0;}
 }
 const doc=new Element('document');doc.activeElement=new Element('trigger');doc.body=new Element('body');doc.createElement=tag=>{if(tag==='video'){const v=new Video();videos.push(v);return v;}const e=new Element(tag);if(tag==='dialog')dialogs.push(e);if(tag==='section')panels.push(e);if(tag==='canvas')frames.push(e);return e;};
 globalThis.document=doc;globalThis.Image=class {constructor(){this.naturalWidth=640;this.naturalHeight=360;images.push(this);}set src(value){this.url=value;if(value&&autoImage)queueMicrotask(()=>this.onload?.());}};
 let rafSequence=0;const canceled=new Set();globalThis.requestAnimationFrame=fn=>{const id=++rafSequence;queueMicrotask(()=>{if(!canceled.has(id))fn();});return id;};globalThis.cancelAnimationFrame=id=>canceled.add(id);
 URL.createObjectURL=value=>{const url='blob:review-'+(++seq);created.push({url,value});return url;};URL.revokeObjectURL=url=>revoked.push(url);
 const studio=createImageStudio({onApply:(...args)=>applied.push(args),createStillPicker:config=>(picker=createVideoStillPicker(config))});
 const action=(dialog,prefix,action)=>dialog.fire('click',{target:{closest:()=>dialog.querySelector(`[data-${prefix}="${action}"]`)}});
 return {studio,dialogs,panels,images,videos,frames,revoked,created,applied,get picker(){return picker;},get editor(){return dialogs[0];},get dialog(){return panels[0];},deferImages(){autoImage=false;},resumeImages(){autoImage=true;},async chooseImage(name='original.png'){await dialogs[0].querySelector('#studio-file').fire('change',{target:{files:[new File(['pixels'],name,{type:'image/png'})],value:'x'}});await flush();},editorAction:name=>action(dialogs[0],'studio',name),pickerAction:name=>action(panels[0],'video-still',name),async chooseVideo(){await panels[0].querySelector('#video-still-file').fire('change',{target:{files:[new File([fixture],'synthetic.webm',{type:'video/webm'})],value:'x'}});await flush();},restore(){studio.close({force:true});Object.assign(globalThis,originals);URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke;}};
}
async function prepare(h){await h.studio.open();await h.chooseImage();h.editor.querySelector('#studio-alt').value='Retain original alt';await h.editorAction('rotate');await h.editorAction('video-still');await h.chooseVideo();assert.equal(h.dialog.querySelector('[data-video-still="capture"]').disabled,false);h.deferImages();}
for(const ending of ['timeout','picker-force-close','parent-force-close']) test(`combined actual modules: ${ending} cancels image adoption and late decode`, async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const h=harness();try {
  await prepare(h);const oldWidth=h.editor.querySelector('#studio-canvas').width;
  const pending=h.pickerAction('capture');await flush();const image=h.images.at(-1),late=image.onload;
  assert.equal(typeof late,'function');assert.equal(h.editor['aria-busy'],'true');assert.equal(h.dialog.querySelector('[data-video-still="close"]').disabled,true);
  if(ending==='timeout')t.mock.timers.tick(VIDEO_STILL_LIMITS.stageTimeoutMs);
  else if(ending==='picker-force-close')assert.equal(h.picker.close({force:true}),true);
  else h.studio.close({force:true});
  await pending;await flush();assert.equal(image.onload,null);assert.equal(image.onerror,null);assert.equal(image.url,'');assert.equal(h.editor['aria-busy'],'false');assert.equal(h.applied.length,0);
  late();await flush();assert.equal(h.applied.length,0);
  if(ending==='parent-force-close'){assert.equal(h.editor.open,false);assert.equal(h.picker.isOpen,false);assert.equal(h.editor.querySelector('#studio-canvas').width,0);}
  else {assert.equal(h.editor.open,true);assert.equal(h.editor.querySelector('#studio-filename').textContent,'original.png');assert.equal(h.editor.querySelector('#studio-alt').value,'Retain original alt');assert.equal(h.editor.querySelector('#studio-canvas').width,oldWidth);assert.equal(h.editor.querySelector('[data-studio="undo"]').disabled,false);}
  if(ending==='timeout') {assert.equal(h.picker.isOpen,true);h.resumeImages();await h.pickerAction('capture');assert.equal(h.picker.isOpen,false);assert.equal(h.editor.querySelector('#studio-filename').textContent,'video-standbild.png');assert.equal(h.applied.length,0);await h.editorAction('apply');assert.equal(h.applied.length,1);assert.equal(h.applied[0][0].type,'image/jpeg');}
  if(ending!=='timeout'){for(const v of h.videos){assert.equal(v.src,'');assert.equal(v.isConnected,false);}assert.ok(h.created.filter(x=>x.value.type==='video/webm').every(x=>h.revoked.includes(x.url)));}
 }finally{h.restore();}
});
test('combined actual modules: ordinary Escape cannot dismiss adoption, then success requires explicit JPG Apply',async()=>{const h=harness();try{await prepare(h);const pending=h.pickerAction('capture');await flush();await h.editor.fire('cancel');assert.equal(h.picker.isOpen,true);assert.equal(h.picker.close(),false);h.images.at(-1).onload();await pending;assert.equal(h.picker.isOpen,false);assert.equal(h.editor.open,true);assert.equal(h.applied.length,0);await h.editorAction('apply');assert.equal(h.applied.length,1);assert.equal(h.applied[0][0].type,'image/jpeg');}finally{h.restore();}});

test('embedded step uses one native modal, updates its accessible name and restores focus after Escape',async()=>{
 const h=harness();try{
  await h.studio.open();await h.chooseImage();await h.editorAction('rotate');
  const width=h.editor.querySelector('#studio-canvas').width,entry=h.editor.querySelector('[data-studio="video-still"]');entry.focus();
  await h.editorAction('video-still');
  assert.equal(h.dialogs.length,1);assert.equal(h.panels.length,1);assert.equal(h.dialog.tag,'section');assert.equal(h.dialog.parent,h.editor);
  assert.equal(h.editor.open,true);assert.equal(h.picker.isOpen,true);assert.equal(h.dialog.hidden,false);
  assert.equal(h.editor.classList.contains('studio-picking'),true);assert.equal(h.editor['aria-labelledby'],'video-still-title');
  assert.equal(document.activeElement,h.dialog.querySelector('[data-video-still="choose"]'));
  await h.chooseVideo();await h.editor.fire('cancel');
  assert.equal(h.picker.isOpen,false);assert.equal(h.dialog.hidden,true);assert.equal(h.editor.open,true);
  assert.equal(h.editor.classList.contains('studio-picking'),false);assert.equal(h.editor['aria-labelledby'],'studio-title');
  assert.equal(document.activeElement,entry);assert.equal(h.editor.querySelector('#studio-canvas').width,width);assert.equal(h.applied.length,0);
  assert.equal(h.editor.querySelector('[data-studio="undo"]').disabled,false);assert.equal(h.studio.hasPendingWork,true);
  for(const video of h.videos){assert.equal(video.src,'');assert.equal(video.isConnected,false);}
  await h.editor.fire('cancel');assert.equal(h.editor.open,false);assert.equal(h.studio.hasPendingWork,false);
 }finally{h.restore();}
});

test('successful capture returns to the same editor, focuses format and still requires explicit JPG Apply',async()=>{
 const h=harness();try{
  await h.studio.open();await h.chooseImage();await h.editorAction('video-still');await h.chooseVideo();h.videos[0].currentTime=1.2;
  await h.pickerAction('capture');
  assert.equal(h.dialogs.length,1);assert.equal(h.editor.open,true);assert.equal(h.picker.isOpen,false);assert.equal(h.dialog.hidden,true);
  assert.equal(h.editor['aria-labelledby'],'studio-title');assert.equal(document.activeElement,h.editor.querySelector('#studio-ratio'));
  assert.equal(h.editor.querySelector('#studio-filename').textContent,'video-standbild.png');assert.equal(h.applied.length,0);
  await h.editorAction('apply');assert.equal(h.applied.length,1);assert.equal(h.applied[0][0].type,'image/jpeg');assert.equal(h.editor.open,false);
 }finally{h.restore();}
});

test('hidden studio controls cannot change source or bypass the active picker step',async()=>{
 const h=harness();try{
  await h.studio.open();await h.chooseImage();const width=h.editor.querySelector('#studio-canvas').width;
  await h.editorAction('video-still');await h.chooseVideo();
  for(const action of ['apply','close','rotate','choose','video-still'])await h.editorAction(action);
  assert.equal(h.picker.isOpen,true);assert.equal(h.editor.open,true);assert.equal(h.editor.querySelector('#studio-canvas').width,width);assert.equal(h.applied.length,0);
  h.studio.close({force:true});assert.equal(h.picker.isOpen,false);assert.equal(h.editor.open,false);assert.equal(h.editor.classList.contains('studio-picking'),false);
  for(const video of h.videos)assert.equal(video.src,'');assert.equal(h.editor.querySelector('#studio-canvas').width,0);
 }finally{h.restore();}
});

test('failed frame decode keeps the active step and original image, then Back restores original focus and edits',async()=>{
 const h=harness();try{
  await prepare(h);const width=h.editor.querySelector('#studio-canvas').width;
  const pending=h.pickerAction('capture');await flush();h.images.at(-1).onerror();await pending;
  assert.equal(h.picker.isOpen,true);assert.equal(h.dialog.hidden,false);assert.equal(h.editor['aria-labelledby'],'video-still-title');assert.equal(h.applied.length,0);assert.equal(document.activeElement,h.dialog.querySelector('[data-video-still="capture"]'));
  assert.equal(h.editor.querySelector('#studio-alt').value,'Retain original alt');assert.equal(h.editor.querySelector('#studio-canvas').width,width);
  await h.pickerAction('close');assert.equal(h.picker.isOpen,false);assert.equal(h.editor.open,true);assert.equal(h.editor['aria-labelledby'],'studio-title');
 }finally{h.restore();}
});

test('repeated embedded opening never adds a modal or retains old video resources',async()=>{
 const h=harness();try{
  await h.studio.open();await h.chooseImage();
  for(let i=0;i<25;i++){
   await h.editorAction('video-still');await h.chooseVideo();await h.editor.fire('cancel');
   assert.equal(h.dialogs.length,1);assert.equal(h.panels.length,1);assert.equal(h.picker.isOpen,false);assert.equal(h.editor.open,true);
   assert.equal((document.listeners.securitypolicyviolation||[]).length,0);
  }
  assert.equal(h.applied.length,0);assert.equal(h.videos.length,25);
  for(const video of h.videos){assert.equal(video.src,'');assert.equal(video.isConnected,false);for(const listeners of Object.values(video.listeners))assert.equal(listeners.length,0);}
  assert.ok(h.created.filter(x=>x.value.type==='video/webm').every(x=>h.revoked.includes(x.url)));
 }finally{h.restore();}
});

test('footer stays outside scrollable content and native disclosure retains all codec/size warnings',async()=>{
 const css=await readFile(new URL('../../public/video-still-picker.css',import.meta.url),'utf8');
 const h=harness();try{
  await h.studio.open();await h.editorAction('video-still');const html=h.dialog.html;
  assert.match(html,/<div class="video-still-body">[\s\S]*<div id="video-still-preview"[\s\S]*<\/div>\s*<\/div>\s*<footer class="video-still-footer">/);
  assert.doesNotMatch(html,/<details/);assert.match(html,/MP4 \/ WebM · max. 8 MiB/);
  assert.doesNotMatch(html,/Browser, Codec und Sicherheitsrichtlinie/);assert.match(html,/role="status" aria-live="polite"/);
  assert.match(css,/\.video-still-body\{[^}]*min-height:0;overflow:auto/);assert.match(css,/\.video-still-footer\{flex-shrink:0/);
  assert.match(css,/:focus-visible/);assert.doesNotMatch(html,/video-still-policy|video-still-help|Lokaler Prototyp/);
 }finally{h.restore();}
});

test('short-height fallback preserves a whole-surface scroll escape instead of clipping fixed siblings',async()=>{
 const css=await readFile(new URL('../../public/video-still-picker.css',import.meta.url),'utf8');
 const fallback=css.slice(css.lastIndexOf('@media(max-height:480px)'));
 assert.match(fallback,/\.video-still-picker\[open\],section\.video-still-picker:not\(\[hidden\]\)\{display:block;overflow:auto\}/);
 assert.match(fallback,/\.video-still-body\{overflow:visible\}/);
 assert.doesNotMatch(fallback,/display:none|visibility:hidden|font-size|transform|position:fixed/);
 const h=harness();try{
  await h.studio.open();await h.editorAction('video-still');
  assert.equal(h.dialog.tag,'section');assert.equal(h.dialog.hidden,false);assert.equal(h.dialog.parent,h.editor);
  assert.match(h.dialog.html,/role="status" aria-live="polite" tabindex="0"/);
  assert.match(h.dialog.html,/MP4 \/ WebM · max. 8 MiB/);
  assert.equal(h.dialog.querySelector('[data-video-still="close"]').disabled,false);
  await h.editor.fire('cancel');assert.equal(h.editor.open,true);assert.equal(h.picker.isOpen,false);
 }finally{h.restore();}
});
