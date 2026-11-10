import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {clipboardImage,isPasteTextTarget} from '../../public/image-studio-paste.js';
import {MEDIA_LOAD_TIMEOUT_MS} from '../../public/image-studio-model.js';
import {studioHarness} from './image-studio-harness.mjs';

const flush=()=>new Promise(setImmediate);
const image=(name='paste.png',type='image/png')=>new File(['pixels'],name,{type});
const item=(file)=>({kind:'file',type:file?.type||'image/png',getAsFile:()=>file});
const data=(file=image())=>({items:[item(file)],files:[file]});
const textItem=(type='text/plain')=>({kind:'string',get type(){assert.fail('Never inspect string MIME');},getAsString(){assert.fail('Never read string payload');},getAsFile(){assert.fail('Never read string as file');}});
async function paste(h,clipboardData,options={}){
 let prevented=0;
 await h.dialog.fire('paste',{target:h.controls.get('#studio-stage'),clipboardData,preventDefault(){prevented++;},...options});
 await flush();return prevented;
}
function snapshot(h){
 return {filename:h.controls.get('#studio-filename').textContent,meta:h.controls.get('#studio-meta').textContent,width:h.controls.get('#studio-canvas').width,height:h.controls.get('#studio-canvas').height,hidden:h.controls.get('#studio-canvas').hidden,controls:Object.fromEntries(['ratio','zoom','x','y','brightness','contrast','saturation','text','text-size','text-y','text-align','text-tone','alt'].map(id=>[id,h.controls.get('#studio-'+id).value])),background:h.controls.get('#studio-text-background').checked,undo:h.controls.get('[data-studio="undo"]').disabled,redo:h.controls.get('[data-studio="redo"]').disabled,apply:h.controls.get('[data-studio="apply"]').disabled};
}
async function edited(h){
 await h.studio.open();await h.select(image('original.png'));
 const text=h.controls.get('#studio-text');text.value='Keep visible text';h.controls.get('#studio-alt').value='Keep alt';
 await h.controls.get('#studio-image-tools').fire('change',{target:text});await h.action('rotate');await h.action('flip');await h.action('undo');
 assert.equal(h.controls.get('[data-studio="undo"]').disabled,false);assert.equal(h.controls.get('[data-studio="redo"]').disabled,false);
 return snapshot(h);
}

for(const type of ['image/jpeg','image/png','image/webp'])for(const representation of ['items','files','both'])test(`clipboard image uses ${type} from ${representation} without double-counting`,()=>{
 const file=image('source',type),payload=data(file);
 if(representation==='files')delete payload.items;if(representation==='items')delete payload.files;
 assert.equal(clipboardImage(payload),file);
});
test('image with HTML, plain text and URI strings never reads any string representation',()=>{
 const file=image();const payload={items:[textItem('text/html'),item(file),textItem(),textItem('text/uri-list')],files:[file],getData(){assert.fail('No string extraction');}};
 assert.equal(clipboardImage(payload),file);
});
for(const payload of [null,{}, {items:[],files:[]},{items:[textItem()],files:[]},{items:[textItem('text/html'),textItem('text/uri-list')]}])test('text-only, HTML/URL-only and absent payloads have no image action',()=>assert.equal(clipboardImage(payload),null));
test('file-list fallback can coexist with opaque string items',()=>{const file=image();assert.equal(clipboardImage({items:[textItem()],files:[file]}),file);});
for(const payload of [
 {items:[{kind:'file',getAsFile(){assert.fail('Do not partially extract');}},{kind:'file',getAsFile(){assert.fail('Do not partially extract');}}],files:[]},
 {items:[item(image())],files:[image(),image()]},
 {items:[item(image()),item(new File(['text'],'note.txt',{type:'text/plain'}))]},
 {files:[image(),image()]}
])test('multiple files reject the entire selection before extracting a first file',()=>assert.throws(()=>clipboardImage(payload),/genau ein Bild/));
for(const getAsFile of [()=>null,()=>{throw Error('Clipboard unavailable');},undefined])test('null or unavailable getAsFile fails instead of falling back to another representation',()=>{
 assert.throws(()=>clipboardImage({items:[{kind:'file',type:'image/png',getAsFile}],files:[image()]}),/Zwischenablage.*nicht gelesen/);
});
for(const type of ['image/gif','image/svg+xml','text/html','text/plain','video/mp4','application/octet-stream',''])test(`unsupported clipboard MIME ${type||'(empty)'} is rejected`,()=>assert.throws(()=>clipboardImage(data(image('misleading.png',type))),/Unterstützt/));
for(const size of [0,-1,NaN,Infinity,20*1024*1024+1])test(`invalid clipboard byte size ${size} is rejected`,()=>assert.throws(()=>clipboardImage(data({type:'image/png',size})),/ungültig|höchstens 20 MB/));
test('20 MiB inclusive remains the existing input bound',()=>{const file={type:'image/png',size:20*1024*1024};assert.equal(clipboardImage(data(file)),file);});
test('inconsistent file-item MIME is not silently accepted',()=>{const file=image();assert.throws(()=>clipboardImage({items:[{...item(file),type:'text/html'}],files:[file]}),/Unterstützt/);});
test('empty item MIME can rely on the supplied file MIME',()=>{const file=image();assert.equal(clipboardImage({items:[{...item(file),type:''}],files:[file]}),file);});

test('native paste loads one local image and waits for explicit Apply',async t=>{
 const received=[],h=studioHarness((...args)=>received.push(args));t.mock.method(globalThis,'fetch',()=>assert.fail('Paste never fetches'));
 try{
  await h.studio.open();const file=image('clipboard.webp','image/webp');
  assert.equal(await paste(h,{items:[textItem('text/html'),item(file),textItem()],files:[file],getData(){assert.fail('Never read text');}}),1);
  assert.equal(h.images.length,1);assert.equal(h.controls.get('#studio-filename').textContent,'clipboard.webp');assert.equal(h.controls.get('#studio-canvas').hidden,false);assert.equal(received.length,0);
  h.controls.get('#studio-alt').value='Pasted image';await h.action('apply');assert.equal(received.length,1);assert.equal(received[0][0].type,'image/jpeg');assert.equal(received[0][0].name,'clipboard-bearbeitet.jpg');assert.equal(received[0][1],'Pasted image');
 }finally{h.restore();}
});
test('pure text and remote HTML/URL payloads leave editor and default paste untouched',async()=>{
 const h=studioHarness(()=>assert.fail('No Apply'));try{
  const before=await edited(h),message=h.controls.get('#studio-status').textContent;
  for(const clipboardData of [null,{}, {items:[textItem()],files:[]},{items:[textItem('text/html'),textItem('text/uri-list')]}])assert.equal(await paste(h,clipboardData),0);
  assert.deepEqual(snapshot(h),before);assert.equal(h.controls.get('#studio-status').textContent,message);assert.equal(h.images.length,1);
 }finally{h.restore();}
});
for(const targetName of ['studio-text','studio-alt','studio-ratio','studio-zoom','studio-file'])for(const location of ['target','focus','path'])test(`native paste in ${targetName}, identified by ${location}, stays native`,async()=>{
 const h=studioHarness(()=>assert.fail('No Apply'));try{
  const before=await edited(h),target=h.controls.get('#'+targetName),stage=h.controls.get('#studio-stage');
  let inspected=0;const clipboardData={get items(){inspected++;throw Error('Must not inspect');}};
  if(location==='focus')target.focus();else stage.focus();
  const options=location==='target'?{target}:location==='path'?{target:stage,composedPath:()=>[target,stage,h.dialog]}:{};
  assert.equal(await paste(h,clipboardData,options),0);assert.equal(inspected,0);assert.deepEqual(snapshot(h),before);
 }finally{h.restore();}
});
for(const target of [{isContentEditable:true},{closest:()=>({contentEditable:'plaintext-only'})},{closest:()=>({contentEditable:'true'})},{closest:()=>({contentEditable:'false'})}])test('contenteditable targets and nested content are conservatively left to native paste',async()=>{
 assert.equal(isPasteTextTarget(target),true);const h=studioHarness(()=>assert.fail('No Apply'));try{await h.studio.open();assert.equal(await paste(h,data(),{target}),0);assert.equal(h.images.length,0);}finally{h.restore();}
});
for(const reason of ['prevented','closed','app-busy','loading','applying','video-step','other-modal'])test(`blocked ${reason} studio never inspects or consumes clipboard`,async()=>{
 let appBusy=false,videoOpen=false,finishApply;const h=studioHarness(()=>new Promise(resolve=>finishApply=resolve),{isBusy:()=>appBusy,createStillPicker:()=>({open(){videoOpen=true;},close(){videoOpen=false;},get isOpen(){return videoOpen;}})});
 let pending;
 try{
  await h.studio.open();
  if(reason==='closed')h.studio.close();if(reason==='app-busy')appBusy=true;
  if(reason==='loading'){h.deferImages();await h.select(image());}
  if(reason==='applying'){await h.select(image());pending=h.action('apply');await flush();}
  if(reason==='video-step')await h.action('video-still');if(reason==='other-modal'){const top={open:true};h.otherModals.push(top);document.activeElement=top;}
  const before=snapshot(h),count=h.images.length;let inspected=0;
  assert.equal(await paste(h,{get items(){inspected++;throw Error('Must not inspect');}},{defaultPrevented:reason==='prevented'}),0);
  assert.equal(inspected,0);assert.equal(h.images.length,count);assert.deepEqual(snapshot(h),before);
 }finally{if(finishApply){finishApply();await pending;}h.restore();}
});
for(const invalid of [()=>({items:[item(image()),item(image())]}),()=>data(image('not-image.svg','image/svg+xml')),()=>({items:[item(null)]}),()=>data({type:'image/png',size:20*1024*1024+1}),()=>data(image('empty.png',''))])test('invalid paste keeps source, controls, alt and both undo/redo branches',async()=>{
 const h=studioHarness(()=>assert.fail('No Apply'));try{
  const before=await edited(h),source=h.draws.at(-1);assert.equal(await paste(h,invalid()),1);assert.deepEqual(snapshot(h),before);assert.equal(h.draws.at(-1),source);assert.equal(h.images.length,1);assert.ok(h.controls.get('#studio-status').textContent);
  await h.action('redo');assert.equal(h.controls.get('[data-studio="flip"]').getAttribute?.('aria-pressed')??h.controls.get('[data-studio="flip"]')['aria-pressed'],'true');await h.action('undo');assert.deepEqual(snapshot(h),before);
 }finally{h.restore();}
});
for(const failure of ['decode','timeout','oversize-pixels','zero-dimensions','render'])test(`failed paste ${failure} rolls back without replacing old source or history`,async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const received=[],revoked=[],h=studioHarness((...args)=>received.push(args));t.mock.method(URL,'revokeObjectURL',url=>revoked.push(url));
 try{
  const before=await edited(h),oldImage=h.images[0],oldURL=oldImage.url;h.deferImages();assert.equal(await paste(h,data()),1);
  const next=h.images.at(-1),newURL=next.url,late=next.onload,lateError=next.onerror;
  assert.equal(h.controls.get('#studio-alt').value,'Keep alt');assert.equal(h.controls.get('#studio-text').value,'Keep visible text');assert.equal(h.controls.get('#studio-canvas').width,before.width);
  if(failure==='decode')next.onerror();else if(failure==='timeout')t.mock.timers.tick(MEDIA_LOAD_TIMEOUT_MS);else{
   if(failure==='oversize-pixels'){next.naturalWidth=10000;next.naturalHeight=5000;}
   if(failure==='zero-dimensions')next.naturalWidth=0;
   if(failure==='render'){const original=h.context.drawImage;t.mock.method(h.context,'drawImage',function(img,...args){if(img===next)throw Error('Render failed');return original.call(this,img,...args);});}
   next.onload();
  }
  await flush();assert.deepEqual(snapshot(h),before);assert.equal(h.dialog['aria-busy'],'false');assert.equal(h.draws.at(-1),oldImage);assert.ok(revoked.includes(newURL));assert.ok(!revoked.includes(oldURL));assert.equal(received.length,0);
  late();lateError();await flush();assert.deepEqual(snapshot(h),before);await h.action('redo');await h.action('undo');assert.deepEqual(snapshot(h),before);
  h.deferImages(false);assert.equal(await paste(h,data(image('retry.png'))),1);assert.equal(h.controls.get('#studio-filename').textContent,'retry.png');assert.equal(h.controls.get('#studio-alt').value,'');assert.equal(h.controls.get('#studio-text').value,'');assert.equal(h.controls.get('[data-studio="undo"]').disabled,true);assert.equal(h.controls.get('[data-studio="redo"]').disabled,true);assert.ok(revoked.includes(oldURL));assert.equal(received.length,0);
 }finally{h.restore();}
});
for(const ending of ['close','cancel','force-close'])test(`pending paste ${ending} cancels and late decode cannot revive a reopened editor`,async t=>{
 const received=[],revoked=[],h=studioHarness((...args)=>received.push(args));t.mock.method(URL,'revokeObjectURL',url=>revoked.push(url));
 try{
  await edited(h);h.deferImages();await paste(h,data(image('late.png')));const pendingImage=h.images.at(-1),url=pendingImage.url,late=pendingImage.onload;
  if(ending==='close')await h.action('close');else if(ending==='cancel')await h.dialog.fire('cancel');else h.studio.close({force:true});await flush();
  assert.equal(h.dialog.open,false);assert.equal(pendingImage.onload,null);assert.equal(pendingImage.onerror,null);assert.equal(pendingImage.url,'');assert.ok(revoked.includes(url));assert.equal(received.length,0);
  await h.studio.open();h.deferImages(false);await paste(h,data());const before=snapshot(h);late();await flush();assert.deepEqual(snapshot(h),before);assert.equal(received.length,0);
 }finally{h.restore();}
});
test('repeated paste is single-flight, then explicit next paste replaces only after successful decode',async t=>{
 const received=[],revoked=[],h=studioHarness((...args)=>received.push(args));t.mock.method(URL,'revokeObjectURL',url=>revoked.push(url));
 try{
  await edited(h);h.deferImages();await paste(h,data(image('first.png')));const count=h.images.length;
  assert.equal(await paste(h,data(image('ignored.png'))),0);assert.equal(h.images.length,count);h.images.at(-1).onload();await flush();const first=h.images.at(-1),firstURL=first.url;
  await paste(h,data(image('second.png')));assert.equal(h.controls.get('#studio-filename').textContent,'first.png');assert.ok(!revoked.includes(firstURL));h.images.at(-1).onload();await flush();
  assert.equal(h.controls.get('#studio-filename').textContent,'second.png');assert.ok(revoked.includes(firstURL));assert.equal(received.length,0);
 }finally{h.restore();}
});
test('file chooser and drop still replace pasted images through the same local path',async()=>{
 const h=studioHarness(()=>assert.fail('No Apply'));try{
  await h.studio.open();await paste(h,data());await h.select(image('chosen.jpg','image/jpeg'));assert.equal(h.controls.get('#studio-filename').textContent,'chosen.jpg');
  await h.controls.get('#studio-stage').fire('drop',{dataTransfer:{files:[image('dropped.webp','image/webp')]}});await flush();assert.equal(h.controls.get('#studio-filename').textContent,'dropped.webp');assert.equal(h.images.length,3);
 }finally{h.restore();}
});
test('saved-media open remains same-origin and its image can then be explicitly replaced by paste',async t=>{
 const requests=[],h=studioHarness(()=>assert.fail('No Apply'));t.mock.method(globalThis,'fetch',async(url,options)=>{requests.push({url,options});return {ok:true,blob:async()=>new Blob(['saved'],{type:'image/png'})};});
 try{await h.studio.open({url:'/api/planner/media/saved-id',name:'saved.png',alt:'Saved description'});assert.equal(requests.length,1);assert.equal(h.controls.get('#studio-alt').value,'Saved description');await paste(h,data());assert.equal(requests.length,1);assert.equal(h.controls.get('#studio-filename').textContent,'paste.png');assert.equal(h.controls.get('#studio-alt').value,'');}finally{h.restore();}
});
test('paste is dialog-local, has no clipboard permission or string/remote import path and only adds a compact hint',async()=>{
 const source=await readFile(new URL('../../public/image-studio.js',import.meta.url),'utf8'),helper=await readFile(new URL('../../public/image-studio-paste.js',import.meta.url),'utf8');
 assert.equal((source.match(/addEventListener\('paste'/g)||[]).length,1);assert.match(source,/dialog.addEventListener\('paste'/);assert.doesNotMatch(source+helper,/navigator\.clipboard|clipboard-read|getAsString|getData\(|addEventListener\('(?:beforeinput|keydown)'/);
 assert.doesNotMatch(helper,/fetch\(|XMLHttpRequest|DOMParser|innerHTML/);assert.match(source,/<div id="studio-stage"[^>]*role="group"[^>]*tabindex="0"[^>]*aria-label="Bildfläche"/);assert.doesNotMatch(source,/Datei ablegen, auswählen oder einfügen/);
});

test('normal Composer to Studio flow accepts paste while both native dialogs remain modal',async()=>{
 const h=studioHarness(()=>assert.fail('No automatic Apply'));try{
  await h.studio.open();assert.deepEqual(document.querySelectorAll('dialog:modal').map(dialog=>dialog.id),['composer','media-studio']);
  assert.equal(h.dialog.contains(document.activeElement),true);assert.equal(await paste(h,data()),1);assert.equal(h.controls.get('#studio-filename').textContent,'paste.png');assert.equal(h.composer.open,true);
 }finally{h.restore();}
});
for(const order of ['before','after'])test(`a newer top modal blocks paste regardless of ${order} studio in DOM order, closing it restores paste`,async()=>{
 const h=studioHarness(()=>assert.fail('No automatic Apply'));try{
  const before=await edited(h),stage=h.controls.get('#studio-stage'),top={id:'info-dialog',open:true};
  const dialogs=order==='before'?[h.composer,top,h.dialog]:[h.composer,h.dialog,top];document.querySelectorAll=()=>dialogs;
  document.activeElement=top;let inspected=0;
  assert.equal(await paste(h,{get items(){inspected++;throw Error('Top modal owns paste');}}),0);assert.equal(inspected,0);assert.deepEqual(snapshot(h),before);
  top.open=false;stage.focus();assert.equal(await paste(h,data()),1);assert.equal(h.controls.get('#studio-filename').textContent,'paste.png');
 }finally{h.restore();}
});
test('paste cannot import while focus has returned to underlying composer or outside the studio',async()=>{
 const h=studioHarness(()=>assert.fail('No automatic Apply'));try{
  const before=await edited(h);for(const target of [h.composer,{id:'other-button'},null]){document.activeElement=target;let inspected=0;assert.equal(await paste(h,{get items(){inspected++;throw Error('Studio does not own focus');}}),0);assert.equal(inspected,0);assert.deepEqual(snapshot(h),before);}
 }finally{h.restore();}
});
