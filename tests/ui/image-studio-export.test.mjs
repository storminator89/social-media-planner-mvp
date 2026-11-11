import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {studioHarness} from './image-studio-harness.mjs';
import {editedImageName,IMAGE_LIMIT,MEDIA_LOAD_TIMEOUT_MS} from '../../public/image-studio-model.js';
const field=(h,id)=>h.controls.get('#studio-'+id);
const image=(name='transparent.png')=>new File(['fixture'],name,{type:'image/png'});
const flush=()=>new Promise(setImmediate);
async function edit(h,id,value){field(h,id).value=value;await field(h,'image-tools').fire('change',{target:field(h,id)});}
async function prepared(run,onApply=()=>assert.fail('No Apply expected')){const h=studioHarness(onApply);try{await h.studio.open();await h.select(image());await run(h);}finally{h.restore();}}

test('format names remain sanitized and exactly match MIME extension',()=>{
 assert.equal(editedImageName('a.png'),'a-bearbeitet.jpg');
 assert.equal(editedImageName('../a.jpg','png'),'.. a-bearbeitet.png');
 for(const value of ['webp','PNG','',null])assert.throws(()=>editedImageName('x',value));
});
test('PNG preview paints no opaque backing, JPG paints white, checkerboard remains CSS-only',()=>prepared(async h=>{
 const fills=[];h.context.fillRect=function(...rect){fills.push({style:this.fillStyle,rect});};
 await edit(h,'format','png');assert.equal(fills.length,0);assert.equal(field(h,'canvas')['data-format'],'png');assert.match(field(h,'meta').textContent,/PNG-Ausgabe/);
 await edit(h,'format','jpeg');assert.deepEqual(fills,[{style:'#fff',rect:[0,0,1200,800]}]);
 fills.length=0;await edit(h,'format','png');await edit(h,'text','Transparent overlay');assert.ok(fills.length>0);assert.ok(fills.every(x=>x.style==='rgba(23,19,29,.78)'));
 const css=await readFile(new URL('../../public/image-studio.css',import.meta.url),'utf8');assert.match(css,/#studio-canvas\[data-format="png"\].*conic-gradient/);
 const js=await readFile(new URL('../../public/image-studio.js',import.meta.url),'utf8');assert.doesNotMatch(js,/conic-gradient|createPattern/);
}));
test('format participates in Undo, Redo, branching and undoable Reset without changing alt',()=>prepared(async h=>{
 field(h,'alt').value='Description';
 await edit(h,'format','png');await h.action('undo');assert.equal(field(h,'format').value,'jpeg');
 await h.action('redo');assert.equal(field(h,'format').value,'png');
 await h.action('reset');assert.equal(field(h,'format').value,'jpeg');await h.action('undo');assert.equal(field(h,'format').value,'png');
 await edit(h,'text','new branch');assert.equal(h.controls.get('[data-studio="redo"]').disabled,true);assert.equal(field(h,'alt').value,'Description');
}));
test('successful replacement and reopen reset output while failed decode and rendering retain PNG/history',()=>prepared(async h=>{
 await edit(h,'format','png');h.deferImages();await h.select(image('broken.png'));h.images.at(-1).onerror();await flush();assert.equal(field(h,'format').value,'png');
 h.deferImages(false);const draw=h.context.drawImage;let fail=true;h.context.drawImage=function(...args){if(fail){fail=false;throw Error('render');}return draw.apply(this,args);};
 await h.select(image('render.png'));assert.equal(field(h,'format').value,'png');await h.action('undo');assert.equal(field(h,'format').value,'jpeg');await h.action('redo');
 await h.select(image('next.png'));assert.equal(field(h,'format').value,'jpeg');assert.equal(h.controls.get('[data-studio="undo"]').disabled,true);
 await edit(h,'format','png');await h.action('close');assert.equal(field(h,'format').value,'jpeg');assert.equal(field(h,'canvas')['data-format'],undefined);await h.studio.open();await h.select(image());assert.equal(field(h,'format').value,'jpeg');
}));
test('PNG applies once with matching MIME/name/alt, JPG retains its quality ladder',async()=>{
 const received=[];await prepared(async h=>{
  await edit(h,'format','png');field(h,'alt').value='Transparent logo';const calls=[];field(h,'canvas').toBlob=(done,type,quality)=>{calls.push({type,quality});done(new Blob(['png'],{type}));};
  await h.action('apply');assert.deepEqual(calls,[{type:'image/png',quality:undefined}]);assert.equal(received[0][0].type,'image/png');assert.equal(received[0][0].name,'transparent-bearbeitet.png');assert.equal(received[0][1],'Transparent logo');
 },(...args)=>received.push(args));
 await prepared(async h=>{const qualities=[];field(h,'canvas').toBlob=(done,type,q)=>{assert.equal(type,'image/jpeg');qualities.push(q);done(new Blob([new Uint8Array(qualities.length<3?IMAGE_LIMIT+1:10)],{type}));};await h.action('apply');assert.deepEqual(qualities,[.9,.8,.65]);},()=>{});
});
for(const failure of ['oversize','empty','null','wrong-mime','throws'])test('PNG '+failure+' fails closed once without composer changes or JPEG fallback',()=>prepared(async h=>{
 await edit(h,'format','png');await edit(h,'text','Keep me');field(h,'alt').value='Keep alt';let calls=0;
 field(h,'canvas').toBlob=(done,type)=>{calls++;assert.equal(type,'image/png');if(failure==='throws')throw Error('encode failed');done(failure==='null'?null:new Blob([new Uint8Array(failure==='oversize'?IMAGE_LIMIT+1:failure==='empty'?0:10)],{type:failure==='wrong-mime'?'image/jpeg':type}));};
 await h.action('apply');assert.equal(calls,1);assert.equal(h.dialog.open,true);assert.equal(field(h,'format').value,'png');assert.equal(field(h,'text').value,'Keep me');assert.equal(field(h,'alt').value,'Keep alt');assert.equal(h.controls.get('[data-studio="apply"]').disabled,false);assert.equal(h.controls.get('[data-studio="undo"]').disabled,false);
}));
for(const ending of ['timeout','force-close'])test('PNG '+ending+' ignores late export and never leaks format into next image',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 await prepared(async h=>{
  await edit(h,'format','png');let finish;field(h,'canvas').toBlob=done=>{finish=done;};const pending=h.action('apply');await flush();
  assert.equal(field(h,'format').disabled,true);await h.action('undo');assert.equal(field(h,'format').value,'png');
  if(ending==='timeout')t.mock.timers.tick(MEDIA_LOAD_TIMEOUT_MS);else h.studio.close({force:true});await pending;
  if(ending==='timeout'){assert.match(field(h,'status').textContent,/PNG.*rechtzeitig/);assert.equal(field(h,'format').value,'png');await h.action('close');}
  await h.studio.open();await h.select(image('next.png'));finish(new Blob(['late'],{type:'image/png'}));await flush();assert.equal(field(h,'format').value,'jpeg');assert.equal(field(h,'filename').textContent,'next.png');
 });
});
test('unsupported format cannot be exported and can recover via real format choice',()=>prepared(async h=>{
 await edit(h,'format','webp');assert.equal(h.controls.get('[data-studio="apply"]').disabled,true);await h.action('apply');assert.match(field(h,'status').textContent,/JPG oder PNG/);await edit(h,'format','png');assert.equal(h.controls.get('[data-studio="apply"]').disabled,false);
}));
