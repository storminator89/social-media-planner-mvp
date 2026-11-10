import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyMedia,cropGeometry,editedImageName,MEDIA_LOAD_TIMEOUT_MS,textOverlayLayout,paintTextOverlay,createEditHistory} from '../../public/image-studio-model.js';
test('supported media and strict bounded input',()=>{for(const type of ['image/jpeg','image/png','image/webp'])assert.equal(classifyMedia({type,size:10}),type.startsWith('video')?'video':'image');for(const type of ['image/svg+xml','text/html','video/mp4','video/webm','video/quicktime',''])assert.throws(()=>classifyMedia({type,size:10}));assert.throws(()=>classifyMedia({type:'video/mp4',size:20*1024*1024+1}));assert.throws(()=>classifyMedia({type:'image/png',size:0}));});
test('crop honors ratio, bounds, rotation, zoom and maximum output',()=>{for(const ratio of [0,1,.8,9/16,16/9])for(const rotation of [0,90,180,270])for(const zoom of [1,2,3]){const g=cropGeometry(4000,3000,{ratio,rotation,zoom,x:100,y:100});assert.ok(g.width<=2048&&g.height<=2048);assert.ok(g.sx>=0&&g.sy>=0&&g.sx+g.sw<=g.w+.01&&g.sy+g.sh<=g.h+.01);if(ratio)assert.ok(Math.abs(g.width/g.height-ratio)<.005);}assert.deepEqual(cropGeometry(100,200,{rotation:90}),{w:200,h:100,sx:0,sy:0,sw:200,sh:100,width:200,height:100});assert.throws(()=>cropGeometry(10000,10000));});

import {studioHarness} from './image-studio-harness.mjs';
test('actual studio applies transformed image with alt text, restores focus, resets on reopen',async()=>{const received=[];const h=studioHarness(async(...args)=>received.push(args));try{await h.studio.open();const returnTo=document.activeElement;assert.equal(h.dialog.open,true);assert.equal(h.controls.get('[data-studio="apply"]').disabled,true);await h.select(new File(['test'],'photo.png',{type:'image/png'}));assert.equal(h.controls.get('[data-studio="apply"]').disabled,false);await h.action('rotate');assert.equal(h.controls.get('#studio-canvas').width,800);h.controls.get('#studio-alt').value='Ein Testmotiv';await h.action('apply');assert.equal(received.length,1);assert.equal(received[0][0].type,'image/jpeg');assert.equal(received[0][1],'Ein Testmotiv');assert.equal(h.dialog.open,false);await h.studio.open();assert.equal(h.controls.get('[data-studio="apply"]').disabled,true);assert.equal(h.controls.get('#studio-canvas').hidden,true);await h.action('close');assert.equal(h.dialog.open,false);}finally{h.restore();}});
test('invalid replacement keeps current image and canceled selection never applies',async()=>{let writes=0;const h=studioHarness(async()=>writes++);try{await h.studio.open();await h.select(new File(['test'],'photo.png',{type:'image/png'}));await h.select(new File(['html'],'x.html',{type:'text/html'}));assert.match(h.controls.get('#studio-status').textContent,/Unterstützt/);assert.equal(h.controls.get('#studio-canvas').hidden,false);await h.action('close');assert.equal(writes,0);}finally{h.restore();}});
test('apply is single-flight and cannot be canceled into a late composer mutation',async()=>{let finish,writes=0;const h=studioHarness(()=>{writes++;return new Promise(r=>finish=r);});try{await h.studio.open();await h.select(new File(['test'],'photo.png',{type:'image/png'}));const pending=h.action('apply');await new Promise(setImmediate);await h.action('apply');await h.action('close');assert.equal(writes,1);assert.equal(h.dialog.open,true);finish();await pending;assert.equal(h.dialog.open,false);}finally{h.restore();}});


 test('reopening unsaved media decodes locally without CSP-blocked fetch of data URL',async()=>{const h=studioHarness(async()=>{});const oldFetch=globalThis.fetch;let requests=0;globalThis.fetch=async()=>{requests++;throw Error('connect-src self blocks data URL');};try{await h.studio.open({dataUrl:'data:image/png;base64,dGVzdA==',name:'local.png',alt:'Lokal'});assert.equal(requests,0);assert.equal(h.controls.get('#studio-canvas').hidden,false);assert.equal(h.controls.get('#studio-alt').value,'Lokal');}finally{globalThis.fetch=oldFetch;h.restore();}});

const flush=()=>new Promise(setImmediate);
const deferred=()=>{let resolve,reject;const promise=new Promise((ok,no)=>{resolve=ok;reject=no;});return {promise,resolve,reject};};
const png=()=>new Blob(['fixture'],{type:'image/png'});
const newImage=()=>new File([png()],'new.png',{type:'image/png'});

for(const stage of ['fetch','blob'])for(const ending of ['timeout','close','cancel']){
 test(`stalled existing-media ${stage}: ${ending} settles despite ignored abort and cannot replace a newer selection`,async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const upstream=deferred(),received=[];let signal,bodyReads=0,requests=0;
  const response={ok:true,blob(){bodyReads++;return stage==='blob'?upstream.promise:Promise.resolve(png());}};
  t.mock.method(globalThis,'fetch',(_url,options)=>{requests++;signal=options.signal;return stage==='fetch'?upstream.promise:Promise.resolve(response);});
  const h=studioHarness(async(...args)=>received.push(args));
  try{
   const pending=h.studio.open({url:'/api/planner/media/old',name:'old.png',alt:'Old'});await flush();
   assert.equal(h.dialog['aria-busy'],'true');
   await h.studio.open({url:'/api/planner/media/duplicate'});assert.equal(requests,1);
   if(ending==='timeout')t.mock.timers.tick(MEDIA_LOAD_TIMEOUT_MS);
   else if(ending==='close')await h.action('close');else await h.dialog.fire('cancel');
   await pending;
   assert.equal(signal.aborted,true);
   assert.equal(h.dialog['aria-busy'],'false');
   assert.equal(h.controls.get('[data-studio="choose"]').disabled,false);
   assert.equal(h.controls.get('[data-studio="apply"]').disabled,true);
   if(ending==='timeout'){assert.equal(h.dialog.open,true);assert.match(h.controls.get('#studio-status').textContent,/rechtzeitig/);}
   else{assert.equal(h.dialog.open,false);assert.equal(document.activeElement.id,'return');await h.studio.open();}
   await h.select(newImage());
   const draws=h.draws.length;
   upstream.resolve(stage==='fetch'?response:png());await flush();
   assert.equal(h.controls.get('#studio-filename').textContent,'new.png');
   assert.equal(h.controls.get('#studio-alt').value,'');
   assert.equal(h.controls.get('#studio-canvas').hidden,false);
   assert.equal(h.controls.get('[data-studio="apply"]').disabled,false);
   assert.equal(h.draws.length,draws);
   assert.equal(bodyReads,stage==='blob'?1:0);
   assert.equal(received.length,0);
   await h.action('apply');assert.equal(received.length,1);assert.equal(received[0][0].name,'new-bearbeitet.jpg');
  }finally{h.restore();}
 });
}

for(const ending of ['timeout','close','cancel']){
 test(`stalled image decode: ${ending} detaches handlers and ignores a queued old load`,async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const received=[],revoked=[];const originalRevoke=URL.revokeObjectURL.bind(URL);
  t.mock.method(URL,'revokeObjectURL',url=>{revoked.push(url);originalRevoke(url);});
  const h=studioHarness(async(...args)=>received.push(args));
  try{
   await h.studio.open();h.deferImages();await h.select(new File([png()],'old.png',{type:'image/png'}));
   const image=h.images[0],url=image.url,lateLoad=image.onload,lateError=image.onerror;
   assert.equal(h.dialog['aria-busy'],'true');
   if(ending==='timeout')t.mock.timers.tick(MEDIA_LOAD_TIMEOUT_MS);
   else if(ending==='close')await h.action('close');else await h.dialog.fire('cancel');
   await flush();
   assert.equal(image.onload,null);assert.equal(image.onerror,null);assert.equal(image.url,'');assert.ok(revoked.includes(url));
   assert.equal(h.dialog['aria-busy'],'false');assert.equal(h.controls.get('[data-studio="apply"]').disabled,true);
   if(ending==='timeout')assert.match(h.controls.get('#studio-status').textContent,/Bild.*rechtzeitig/);
   else{assert.equal(h.dialog.open,false);await h.studio.open();}
   h.deferImages(false);await h.select(newImage());const draws=h.draws.length;
   lateLoad();lateError();await flush();t.mock.timers.tick(MEDIA_LOAD_TIMEOUT_MS);await flush();
   assert.equal(h.controls.get('#studio-filename').textContent,'new.png');assert.equal(h.draws.length,draws);assert.equal(received.length,0);
   assert.equal(h.controls.get('[data-studio="apply"]').disabled,false);
   await h.action('apply');assert.equal(received[0][0].name,'new-bearbeitet.jpg');
  }finally{h.restore();}
 });
}

test('fetch, body read and image decode each receive an independent deadline',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const fetchResult=deferred(),body=deferred();let signal;
 t.mock.method(globalThis,'fetch',(_url,options)=>{signal=options.signal;return fetchResult.promise;});
 const h=studioHarness(async()=>{});h.deferImages();
 try{
  const pending=h.studio.open({url:'/api/planner/media/old',name:'existing.png',alt:'Existing'});await flush();
  t.mock.timers.tick(MEDIA_LOAD_TIMEOUT_MS-1);fetchResult.resolve({ok:true,blob:()=>body.promise});await flush();
  t.mock.timers.tick(MEDIA_LOAD_TIMEOUT_MS-1);assert.equal(h.dialog['aria-busy'],'true');assert.equal(signal.aborted,false);body.resolve(png());await flush();
  t.mock.timers.tick(MEDIA_LOAD_TIMEOUT_MS-1);assert.equal(h.dialog['aria-busy'],'true');h.images[0].onload();await pending;
  assert.equal(h.dialog['aria-busy'],'false');assert.equal(signal.aborted,false);
  assert.equal(h.controls.get('#studio-alt').value,'Existing');assert.equal(h.controls.get('[data-studio="apply"]').disabled,false);
  t.mock.timers.tick(MEDIA_LOAD_TIMEOUT_MS);await flush();assert.equal(h.controls.get('[data-studio="apply"]').disabled,false);
 }finally{h.restore();}
});

test('failed decode leaves the existing composer attachment untouched without Apply',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const existing={dataUrl:'data:image/png;base64,dGVzdA==',name:'existing.png',alt:'Keep this description'};
 let composerAttachment=existing,writes=0;
 const h=studioHarness(async(file,alt)=>{writes++;composerAttachment={file,alt};});h.deferImages();
 try{
  const pending=h.studio.open(existing);await flush();const lateLoad=h.images[0].onload;
  t.mock.timers.tick(MEDIA_LOAD_TIMEOUT_MS);await pending;
  assert.equal(composerAttachment,existing);assert.equal(writes,0);
  assert.equal(h.controls.get('[data-studio="apply"]').disabled,true);
  await h.action('close');lateLoad();await flush();
  assert.equal(composerAttachment,existing);assert.equal(writes,0);assert.equal(h.dialog.open,false);
 }finally{h.restore();}
});


test('text layout wraps complete words, bounds the box and scales dense text to fit',()=>{
 const ctx={measureText(text){return {width:Array.from(text).length*parseInt(this.font.slice(4))*0.6};}};
 for(const [w,h]of [[1200,800],[100,600],[1600,100],[32,32]])for(const y of [0,50,100]){
  const layout=textOverlayLayout(ctx,w,h,{text:'Eine klare Botschaft, die sichtbar im Bild bleibt. '.repeat(6),size:15,y});
  assert.ok(layout.box.x>=0&&layout.box.y>=0);assert.ok(layout.box.x+layout.box.width<=w);assert.ok(layout.box.y+layout.box.height<=h+.01);
  assert.ok(layout.lines.length*layout.lineHeight+layout.padding*2<=layout.box.height);
 }
 assert.equal(textOverlayLayout(ctx,100,100,{text:' '}),null);
 assert.throws(()=>textOverlayLayout(ctx,1,100,{text:'Text'}),/mindestens 32/);
 const layout=textOverlayLayout(ctx,200,150,{text:'Hallo Welt und hallo Takt',size:15});
 assert.ok(layout.lines.includes('Hallo Welt'));
});
test('overlay painter uses exactly its measured layout without inheriting image filters',()=>{
 const calls=[],ctx={save(){},restore(){},measureText(s){return {width:s.length*12};},fillRect(...a){calls.push(['background',...a]);},fillText(...a){calls.push(['text',...a]);}};
 const result=paintTextOverlay(ctx,500,300,{text:'Echte JPG-Pixel',tone:'dark',align:'right'});
 assert.equal(ctx.filter,'none');assert.equal(ctx.fillStyle,'#17131d');assert.equal(ctx.textAlign,'right');assert.equal(calls.length,2);assert.equal(calls[1][1],'Echte JPG-Pixel');assert.equal(calls[1][2],result.x);
});
test('edit history is bounded, deep-copies states and discards only the redo branch after a new edit',()=>{
 const h=createEditHistory(3),initial={v:0};h.reset(initial);initial.v=99;h.push({v:1});h.push({v:2});h.push({v:3});assert.deepEqual(h.undo(),{v:2});assert.deepEqual(h.undo(),{v:1});assert.equal(h.canUndo,false);assert.equal(h.canRedo,true);assert.deepEqual(h.redo(),{v:2});h.push({v:4});assert.equal(h.canRedo,false);assert.deepEqual(h.undo(),{v:2});
});
test('visible text, contrast and transforms are undoable, repeatable and baked in on Apply',async()=>{
 const received=[],h=studioHarness(async(...args)=>received.push(args));
 try{
  await h.studio.open();await h.select(newImage());const text=h.controls.get('#studio-text'),panel=h.controls.get('#studio-image-tools');
  text.value='Ein echtes Standbild';await panel.fire('input',{target:text});await panel.fire('change',{target:text});
  assert.equal(h.painted.at(-1)[0],'Ein echtes Standbild');
  h.controls.get('#studio-contrast').value='140';await panel.fire('change',{target:h.controls.get('#studio-contrast')});
  await h.action('rotate');assert.equal(h.controls.get('#studio-canvas').width,800);
  await h.action('undo');assert.equal(h.controls.get('#studio-canvas').width,1200);assert.equal(text.value,'Ein echtes Standbild');
  await h.action('undo');assert.equal(h.controls.get('#studio-contrast').value,100);
  await h.action('redo');assert.equal(h.controls.get('#studio-contrast').value,'140');
  await h.action('reset');assert.equal(text.value,'');await h.action('undo');assert.equal(text.value,'Ein echtes Standbild');
  const before=h.painted.length;await h.action('apply');assert.ok(h.painted.length>before);assert.equal(received[0][0].type,'image/jpeg');
 }finally{h.restore();}
});

test('excessive manual line breaks fail clearly instead of silently clipping text',()=>{
 const ctx={measureText(text){return {width:text.length};}};
 assert.throws(()=>textOverlayLayout(ctx,32,32,{text:'a\n'.repeat(140)}),/nicht vollständig/);
});
test('continuous input groups into one undo step and Undo becomes available before blur',async()=>{
 const h=studioHarness(async()=>{});
 try{
  await h.studio.open();await h.select(newImage());const text=h.controls.get('#studio-text'),panel=h.controls.get('#studio-image-tools');
  for(const value of ['H','Ha','Hallo']){text.value=value;await panel.fire('input',{target:text});}
  assert.equal(h.controls.get('[data-studio="undo"]').disabled,false);await h.action('undo');assert.equal(text.value,'');assert.equal(h.controls.get('[data-studio="undo"]').disabled,true);
  await h.action('redo');assert.equal(text.value,'Hallo');text.value='Neue Fassung';await panel.fire('input',{target:text});assert.equal(h.controls.get('[data-studio="redo"]').disabled,true);
 }finally{h.restore();}
});



test('a stalled JPG encoder times out without applying and permits closing',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let writes=0;const h=studioHarness(()=>writes++);
 try{
  await h.studio.open();await h.select(newImage());let finish;h.controls.get('#studio-canvas').toBlob=fn=>finish=fn;const pending=h.action('apply');await flush();assert.equal(h.dialog['aria-busy'],'true');
  t.mock.timers.tick(MEDIA_LOAD_TIMEOUT_MS);await pending;assert.equal(writes,0);assert.match(h.controls.get('#studio-status').textContent,/JPG.*rechtzeitig/);assert.equal(h.dialog['aria-busy'],'false');await h.action('close');finish(new Blob(['late'],{type:'image/jpeg'}));await flush();assert.equal(writes,0);assert.equal(h.dialog.open,false);
 }finally{h.restore();}
});
test('dragging the actual overlay changes visible position and is a single undo step',async()=>{
 const h=studioHarness(async()=>{});
 try{
  await h.studio.open();await h.select(newImage());const text=h.controls.get('#studio-text'),panel=h.controls.get('#studio-image-tools'),canvas=h.controls.get('#studio-canvas');text.value='Bewege mich';await panel.fire('input',{target:text});await panel.fire('change',{target:text});
  canvas.getBoundingClientRect=()=>({top:0,left:0,width:600,height:400});await canvas.fire('pointerdown',{clientX:300,clientY:300,pointerId:1,button:0,isPrimary:true});await canvas.fire('pointermove',{clientX:300,clientY:220,pointerId:1,buttons:1,isPrimary:true});await canvas.fire('pointerup',{pointerId:1});
  const moved=Number(h.controls.get('#studio-text-y').value);assert.ok(moved<75);await h.action('undo');assert.equal(Number(h.controls.get('#studio-text-y').value),75);await h.action('redo');assert.equal(Number(h.controls.get('#studio-text-y').value),moved);
 }finally{h.restore();}
});


test('invalid text layout disables Apply and fixing the text clears the error',async()=>{
 const h=studioHarness(()=>assert.fail('No Apply expected'));
 try{
  await h.studio.open();await h.select(newImage());h.images[0].naturalWidth=32;h.images[0].naturalHeight=32;const text=h.controls.get('#studio-text'),panel=h.controls.get('#studio-image-tools');text.value='a\n'.repeat(140);await panel.fire('input',{target:text});
  assert.equal(h.controls.get('[data-studio="apply"]').disabled,true);assert.match(h.controls.get('#studio-status').textContent,/nicht vollständig/);
  text.value='Kurz';await panel.fire('input',{target:text});assert.equal(h.controls.get('[data-studio="apply"]').disabled,false);assert.match(h.controls.get('#studio-status').textContent,/aktualisiert/);
 }finally{h.restore();}
});
test('a browser PNG fallback is never mislabeled or applied as JPEG',async()=>{
 const h=studioHarness(()=>assert.fail('No Apply expected'));
 try{
  await h.studio.open();await h.select(newImage());h.controls.get('#studio-canvas').toBlob=fn=>fn(new Blob(['png'],{type:'image/png'}));await h.action('apply');
  assert.match(h.controls.get('#studio-status').textContent,/keine JPG-Datei/);assert.equal(h.dialog.open,true);assert.equal(h.dialog['aria-busy'],'false');
 }finally{h.restore();}
});


test('Reset recovers from invalid text layout, clears its error and enables a real image Apply',async()=>{
 const received=[],h=studioHarness(async(...args)=>received.push(args));
 try{
  await h.studio.open();await h.select(newImage());h.images[0].naturalWidth=32;h.images[0].naturalHeight=32;const text=h.controls.get('#studio-text'),panel=h.controls.get('#studio-image-tools');text.value='a\n'.repeat(140);await panel.fire('input',{target:text});
  assert.equal(h.controls.get('[data-studio="apply"]').disabled,true);assert.match(h.controls.get('#studio-status').textContent,/nicht vollständig/);
  await h.action('reset');assert.equal(text.value,'');assert.equal(h.controls.get('[data-studio="apply"]').disabled,false);assert.doesNotMatch(h.controls.get('#studio-status').textContent,/nicht vollständig/);
  assert.match(h.controls.get('#studio-status').textContent,/aktualisiert/);await h.action('apply');assert.equal(received.length,1);assert.equal(received[0][0].type,'image/jpeg');assert.equal(h.dialog.open,false);
 }finally{h.restore();}
});
test('Close releases canvas dimensions and edit history rather than retaining rendered pixels',async()=>{
 const h=studioHarness(async()=>{});
 try{
  await h.studio.open();await h.select(newImage());const canvas=h.controls.get('#studio-canvas'),text=h.controls.get('#studio-text'),panel=h.controls.get('#studio-image-tools');text.value='Sitzungstext';h.controls.get('#studio-alt').value='Beschreibung';await panel.fire('input',{target:text});await h.action('rotate');
  assert.ok(canvas.width>0&&canvas.height>0);assert.equal(h.controls.get('[data-studio="undo"]').disabled,false);
  await h.action('close');assert.equal(canvas.width,0);assert.equal(canvas.height,0);assert.equal(text.value,'');assert.equal(h.controls.get('#studio-alt').value,'');assert.equal(h.controls.get('[data-studio="undo"]').disabled,true);assert.equal(h.controls.get('[data-studio="redo"]').disabled,true);
  await h.studio.open();await h.select(newImage());await h.action('undo');assert.equal(text.value,'');assert.equal(canvas.width,1200);assert.equal(h.controls.get('[data-studio="undo"]').disabled,true);
 }finally{h.restore();}
});
test('clearing edit history drops both undo and redo states and their input group',()=>{
 const h=createEditHistory();h.reset({text:''});h.push({text:'old'},'text');h.undo();assert.equal(h.canRedo,true);h.clear();assert.equal(h.canUndo,false);assert.equal(h.canRedo,false);assert.equal(h.undo(),undefined);assert.equal(h.redo(),undefined);h.reset({text:'new'});h.push({text:'newer'},'text');assert.deepEqual(h.undo(),{text:'new'});
});
test('image-only studio refuses videos through file selection, drop and existing data URL',async()=>{
 const h=studioHarness(()=>assert.fail('No Apply expected'));try{
  await h.studio.open();assert.doesNotMatch(h.dialog.html,/MP4|WebM|<video|studio-video-tools|capture-frame/);
  const video=new File(['test'],'video.mp4',{type:'video/mp4'});await h.select(video);assert.equal(h.controls.get('[data-studio="apply"]').disabled,true);assert.equal(h.images.length,0);
  await h.controls.get('#studio-stage').fire('drop',{dataTransfer:{files:[video]}});assert.equal(h.images.length,0);await h.action('close');
  await h.studio.open({dataUrl:'data:video/mp4;base64,dGVzdA==',name:'video.mp4'});assert.equal(h.images.length,0);assert.equal(h.controls.get('[data-studio="apply"]').disabled,true);
 }finally{h.restore();}
});
test('edited filenames are control-free and bounded to the existing API limit',()=>{
 for(const name of ['a.png','x'.repeat(400)+'.jpg','🧑'.repeat(400)+'.png','bad\r\n/path\\name.webp','']){const result=editedImageName(name);assert.ok(result.length<=255);assert.ok(result.isWellFormed());assert.match(result,/-bearbeitet\.jpg$/);assert.doesNotMatch(result,/[\\/\u0000-\u001f\u007f-\u009f]/);}
});
test('zero-byte JPEG does not get applied or destroy the editable image',async()=>{
 let applied=0;const h=studioHarness(()=>applied++);try{await h.studio.open();await h.select(newImage());h.controls.get('#studio-canvas').toBlob=fn=>fn(new Blob([],{type:'image/jpeg'}));await h.action('apply');assert.equal(applied,0);assert.equal(h.dialog.open,true);assert.equal(h.controls.get('[data-studio="apply"]').disabled,false);}finally{h.restore();}
});
test('failed adoption preserves local edits and alt for an explicit retry',async()=>{
 let accepted=false,calls=0;const h=studioHarness(()=>{calls++;if(!accepted)throw Error('Übernahme fehlgeschlagen');});try{await h.studio.open();await h.select(newImage());h.controls.get('#studio-text').value='Mein Bild';h.controls.get('#studio-alt').value='Mein Alt';await h.action('rotate');await h.action('apply');assert.equal(h.dialog.open,true);assert.equal(h.controls.get('#studio-text').value,'Mein Bild');assert.equal(h.controls.get('#studio-alt').value,'Mein Alt');assert.equal(h.controls.get('[data-studio="undo"]').disabled,false);accepted=true;await h.action('apply');assert.equal(calls,2);assert.equal(h.dialog.open,false);}finally{h.restore();}
});
test('forced parent close cancels pending encoding and late pixels cannot revive it',async()=>{
 let applied=0;const h=studioHarness(()=>applied++);try{await h.studio.open();await h.select(newImage());let finish;h.controls.get('#studio-canvas').toBlob=fn=>finish=fn;const pending=h.action('apply');await flush();h.studio.close({force:true});await pending;assert.equal(h.dialog.open,false);await h.studio.open();await h.select(newImage());const draws=h.draws.length;finish(new Blob(['late'],{type:'image/jpeg'}));await flush();assert.equal(applied,0);assert.equal(h.draws.length,draws);assert.equal(h.dialog.open,true);}finally{h.restore();}
});

test('closing after a replaced trigger uses the supplied focus fallback',async()=>{let focused=0;const h=studioHarness(async()=>{},{fallbackFocus:()=>focused++});try{const trigger=document.activeElement;await h.studio.open();await h.select(newImage());trigger.isConnected=false;await h.action('apply');assert.equal(focused,1);assert.equal(h.dialog.open,false);}finally{h.restore();}});
for(const failure of ['decode','timeout','dimensions'])test(`failed ${failure} replacement preserves previous image, overlay, alt and undo history`,async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const h=studioHarness(()=>{});try{
  await h.studio.open();await h.select(newImage());const text=h.controls.get('#studio-text'),alt=h.controls.get('#studio-alt');text.value='Keep this edit';alt.value='Keep this alt';await h.controls.get('#studio-image-tools').fire('input',{target:text});await h.action('rotate');const canvas=h.controls.get('#studio-canvas'),oldWidth=canvas.width,oldHeight=canvas.height,oldImage=h.images[0],oldURL=oldImage.url;
  h.deferImages();await h.select(new File(['invalid'],'replacement.png',{type:'image/png'}));assert.equal(text.value,'Keep this edit');assert.equal(alt.value,'Keep this alt');assert.equal(canvas.width,oldWidth);
  if(failure==='decode')h.images.at(-1).onerror();if(failure==='timeout')t.mock.timers.tick(MEDIA_LOAD_TIMEOUT_MS);if(failure==='dimensions'){h.images.at(-1).naturalWidth=10000;h.images.at(-1).naturalHeight=5000;h.images.at(-1).onload();}await flush();
  assert.equal(text.value,'Keep this edit');assert.equal(alt.value,'Keep this alt');assert.equal(canvas.width,oldWidth);assert.equal(canvas.height,oldHeight);assert.equal(h.controls.get('#studio-filename').textContent,'new.png');assert.equal(h.controls.get('[data-studio="undo"]').disabled,false);assert.equal(h.controls.get('[data-studio="apply"]').disabled,false);assert.equal(oldImage.url,oldURL);await h.action('undo');assert.equal(canvas.width,1200);
 }finally{h.restore();}
});
test('studio pending-work signal tracks selection and clears only on explicit close or apply',async()=>{
 const h=studioHarness(()=>{});try{assert.equal(h.studio.hasPendingWork,false);await h.studio.open();assert.equal(h.studio.hasPendingWork,false);h.deferImages();await h.select(newImage());assert.equal(h.studio.hasPendingWork,true);h.images[0].onload();await flush();assert.equal(h.studio.hasPendingWork,true);await h.action('apply');assert.equal(h.studio.hasPendingWork,false);await h.studio.open();assert.equal(h.studio.hasPendingWork,false);}finally{h.restore();}
});

function stillStub(){let config,opened=0,closed=[],pending=false;return {factory(options){config=options;return{open(){opened++;pending=true;},close(options){closed.push(options);pending=false;},get hasPendingWork(){return pending;}};},get config(){return config;},get opened(){return opened;},get closed(){return closed;}};}
test('isolated still picker is lazy and image adoption never applies a video or auto-applies JPG to composer',async()=>{const received=[],picker=stillStub(),h=studioHarness(async f=>received.push(f),{createStillPicker:options=>picker.factory(options)});try{await h.studio.open();assert.equal(picker.opened,0);await h.action('video-still');assert.equal(picker.opened,1);assert.equal(h.studio.hasPendingWork,true);assert.equal(await picker.config.onImage(new File(['video'],'raw.mp4',{type:'video/mp4'})),false);assert.equal(received.length,0);assert.equal(h.controls.get('[data-studio="apply"]').disabled,true);assert.equal(await picker.config.onImage(new File(['frame'],'standbild.png',{type:'image/png'})),true);assert.equal(received.length,0);assert.equal(h.controls.get('#studio-canvas').hidden,false);await h.action('apply');assert.equal(received.length,1);assert.equal(received[0].type,'image/jpeg');assert.match(received[0].name,/standbild/);}finally{h.restore();}});
test('failed still admission preserves existing image edits and alt; a deliberate retry can succeed',async()=>{const picker=stillStub(),h=studioHarness(async()=>{},{createStillPicker:options=>picker.factory(options)});try{await h.studio.open();await h.select(newImage());await h.action('rotate');h.controls.get('#studio-alt').value='Existing alt';h.controls.get('#studio-text').value='Existing text';await h.controls.get('#studio-image-tools').fire('change',{target:{id:'studio-text'}});const width=h.controls.get('#studio-canvas').width;await h.action('video-still');assert.equal(await picker.config.onImage(new File(['bad'],'invalid.webm',{type:'video/webm'})),false);assert.equal(h.controls.get('#studio-canvas').width,width);assert.equal(h.controls.get('#studio-alt').value,'Existing alt');assert.equal(h.controls.get('#studio-text').value,'Existing text');assert.equal(h.controls.get('#studio-filename').textContent,'new.png');assert.equal(await picker.config.onImage(new File(['frame'],'retry.png',{type:'image/png'})),true);assert.equal(h.controls.get('#studio-filename').textContent,'retry.png');}finally{h.restore();}});
test('failed still image decoding preserves the previous source and allows retry with updated generation',async()=>{const picker=stillStub(),h=studioHarness(async()=>{},{createStillPicker:options=>picker.factory(options)});try{await h.studio.open();await h.select(newImage());h.controls.get('#studio-alt').value='Retain';await h.action('video-still');h.deferImages();const pending=picker.config.onImage(new File(['frame'],'bad-frame.png',{type:'image/png'}));await flush();h.images.at(-1).onerror();assert.equal(await pending,false);assert.equal(h.controls.get('#studio-alt').value,'Retain');assert.equal(h.controls.get('#studio-filename').textContent,'new.png');h.deferImages(false);assert.equal(await picker.config.onImage(new File(['frame'],'good-frame.png',{type:'image/png'})),true);assert.equal(h.controls.get('#studio-filename').textContent,'good-frame.png');}finally{h.restore();}});
test('force closing image editor closes picker and discards a late pending still decode',async()=>{let writes=0;const picker=stillStub(),h=studioHarness(async()=>writes++,{createStillPicker:options=>picker.factory(options)});try{await h.studio.open();await h.select(newImage());await h.action('video-still');h.deferImages();const pending=picker.config.onImage(new File(['frame'],'late.png',{type:'image/png'}));const rejected=assert.rejects(pending,/geschlossen|geändert/);await flush();const image=h.images.at(-1),late=image.onload;h.studio.close({force:true});assert.ok(picker.closed.some(options=>options?.force===true));await rejected;late();await flush();assert.equal(h.dialog.open,false);assert.equal(h.studio.hasPendingWork,false);assert.equal(h.controls.get('#studio-canvas').width,0);assert.equal(writes,0);}finally{h.restore();}});
test('old picker callback cannot replace a newer image editor generation',async()=>{const picker=stillStub(),h=studioHarness(async()=>{},{createStillPicker:options=>picker.factory(options)});try{await h.studio.open();await h.action('video-still');const onImage=picker.config.onImage;await h.action('close');await h.studio.open();await h.select(newImage());await assert.rejects(onImage(new File(['frame'],'late.png',{type:'image/png'})),/geändert/);assert.equal(h.controls.get('#studio-filename').textContent,'new.png');}finally{h.restore();}});
test('picker adoption abort cancels the exact pending image decode and preserves prior edits',async()=>{const picker=stillStub(),h=studioHarness(async()=>{},{createStillPicker:options=>picker.factory(options)});try{await h.studio.open();await h.select(newImage());h.controls.get('#studio-alt').value='Keep this';await h.action('rotate');const width=h.controls.get('#studio-canvas').width;await h.action('video-still');h.deferImages();const controller=new AbortController(),pending=picker.config.onImage(new File(['frame'],'late.png',{type:'image/png'}),{signal:controller.signal}),rejected=assert.rejects(pending,/abgebrochen/);await flush();const late=h.images.at(-1).onload;controller.abort();await rejected;late();await flush();assert.equal(h.controls.get('#studio-filename').textContent,'new.png');assert.equal(h.controls.get('#studio-alt').value,'Keep this');assert.equal(h.controls.get('#studio-canvas').width,width);assert.equal(h.controls.get('[data-studio="apply"]').disabled,false);h.deferImages(false);assert.equal(await picker.config.onImage(new File(['frame'],'renewed.png',{type:'image/png'})),true);}finally{h.restore();}});
test('pre-aborted picker handoff cannot start image decode',async()=>{const picker=stillStub(),h=studioHarness(async()=>{},{createStillPicker:options=>picker.factory(options)});try{await h.studio.open();await h.action('video-still');const c=new AbortController();c.abort();await assert.rejects(picker.config.onImage(newImage(),{signal:c.signal}),/abgebrochen/);assert.equal(h.images.length,0);assert.equal(h.controls.get('[data-studio="apply"]').disabled,true);}finally{h.restore();}});
