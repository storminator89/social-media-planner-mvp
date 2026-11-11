import test from 'node:test';
import assert from 'node:assert/strict';
import {cropGeometry,IMAGE_LIMIT} from '../../public/image-studio-model.js';
import {studioHarness} from './image-studio-harness.mjs';
const field=(h,id)=>h.controls.get('#studio-'+id);
const image=()=>new File(['fixture'],'size.png',{type:'image/png'});
const flush=()=>new Promise(setImmediate);
async function edit(h,id,value,event='change'){field(h,id).value=String(value);await field(h,'image-tools').fire(event,{target:field(h,id)});}
async function prepared(run,onApply=()=>assert.fail('No Apply expected')){const h=studioHarness(onApply);try{await h.studio.open();await h.select(image());await run(h);}finally{h.restore();}}
async function size(h,w=600,hgt=400){await edit(h,'ratio','custom');await edit(h,'width',w);await edit(h,'height',hgt);}
const dims=g=>[g.width,g.height];

test('custom dimensions set exact output and crop ratio, presets remain automatic',()=>{
 assert.deepEqual(dims(cropGeometry(1200,800,{ratio:'custom',outputWidth:333,outputHeight:222})),[333,222]);
 assert.deepEqual(dims(cropGeometry(1200,800,{ratio:1,outputWidth:'bad',outputHeight:99999})),[800,800]);
 assert.deepEqual(dims(cropGeometry(8000,5000)),[2048,1280]);
 for(const rotation of [0,90,180,270])for(const zoom of [1,2,3]){
  const g=cropGeometry(2400,1800,{rotation,zoom,ratio:'custom',outputWidth:300,outputHeight:200,x:100,y:0});
  assert.deepEqual(dims(g),[300,200]);assert.ok(Math.abs(g.sw/g.sh-1.5)<1e-10);
  assert.equal(g.sx,g.w-g.sw);assert.equal(g.sy,0);assert.ok(g.sw>=300&&g.sh>=200);
 }
 assert.deepEqual(dims(cropGeometry(2048,2048,{ratio:'custom',outputWidth:2048,outputHeight:2048})),[2048,2048]);
 assert.deepEqual(dims(cropGeometry(3,3,{ratio:'custom',outputWidth:1,outputHeight:1,zoom:3})),[1,1]);
});
test('invalid dimensions and insufficient rotated/zoomed crop fail rather than clamp/upscale',()=>{
 for(const value of ['',0,-1,1.5,2049,Infinity,NaN,'abc']){
  for(const axis of ['outputWidth','outputHeight'])assert.throws(()=>cropGeometry(3000,3000,{ratio:'custom',outputWidth:100,outputHeight:100,[axis]:value}),/ganze Zahlen/);
 }
 assert.throws(()=>cropGeometry(1200,800,{ratio:'custom',outputWidth:1200,outputHeight:900}),/Ausschnitt ist zu klein/);
 assert.throws(()=>cropGeometry(1200,800,{rotation:90,ratio:'custom',outputWidth:1000,outputHeight:600}),/Ausschnitt ist zu klein/);
 assert.throws(()=>cropGeometry(1200,800,{zoom:3,ratio:'custom',outputWidth:401,outputHeight:267}),/Ausschnitt ist zu klein/);
});

test('only two dimension inputs, custom visibility, grouped input history, presets retain custom values',()=>prepared(async h=>{
 assert.equal((h.dialog.html.match(/type="number"/g)||[]).length,2);
 await edit(h,'ratio','custom');assert.equal(field(h,'custom-size').hidden,false);
 assert.deepEqual([field(h,'width').value,field(h,'height').value],['1200','800']);
 await edit(h,'width',6,'input');await edit(h,'width',60,'input');await edit(h,'width',600,'input');await edit(h,'width',600);
 await h.action('undo');assert.equal(field(h,'width').value,'1200');await h.action('redo');assert.equal(field(h,'width').value,'600');
 await edit(h,'height',400);await edit(h,'ratio',1);assert.equal(field(h,'custom-size').hidden,true);
 await edit(h,'ratio','custom');assert.deepEqual([field(h,'canvas').width,field(h,'canvas').height],[600,400]);
}));
test('invalid final fields hide stale preview and block export, recover without changing fields',()=>prepared(async h=>{
 await size(h);await edit(h,'width','');assert.equal(field(h,'canvas').hidden,true);assert.equal(h.controls.get('[data-studio="apply"]').disabled,true);
 await h.action('apply');assert.match(field(h,'status').textContent,/ganze Zahlen/);
 await edit(h,'width',1201);assert.match(field(h,'status').textContent,/Ausschnitt ist zu klein/);
 await edit(h,'width',600);assert.equal(field(h,'canvas').hidden,false);
 await edit(h,'zoom',3);assert.equal(field(h,'width').value,'600');assert.equal(h.controls.get('[data-studio="apply"]').disabled,true);
 await edit(h,'zoom',1);assert.equal(h.controls.get('[data-studio="apply"]').disabled,false);
}));
test('reset, failed replacement, successful new source and close have isolated dimension state',()=>prepared(async h=>{
 await size(h);await edit(h,'format','png');await edit(h,'text','Exact');field(h,'alt').value='Keep description';
 h.deferImages();await h.select(image());h.images.at(-1).onerror();await flush();assert.equal(field(h,'width').value,'600');
 h.deferImages(false);const draw=h.context.drawImage;let fail=true;h.context.drawImage=function(...args){if(fail){fail=false;throw Error('render');}return draw.apply(this,args);};
 await h.select(image());assert.equal(field(h,'width').value,'600');assert.equal(field(h,'ratio').value,'custom');
 await h.action('reset');assert.equal(field(h,'width').value,'');assert.equal(field(h,'custom-size').hidden,true);
 await h.action('undo');assert.equal(field(h,'width').value,'600');assert.equal(field(h,'alt').value,'Keep description');
 await h.select(image());assert.equal(field(h,'width').value,'');assert.equal(field(h,'ratio').value,0);
 await size(h);await h.action('close');assert.equal(field(h,'width').value,'');assert.equal(field(h,'height').value,'');assert.equal(field(h,'custom-size').hidden,true);
 await h.studio.open();await h.select(image());assert.equal(field(h,'width').value,'');
}));
for(const format of ['jpeg','png'])test('exact '+format+' uses same preview/export canvas with text; size cap never shrinks output',async()=>{
 let applied=0;await prepared(async h=>{
  await size(h,333,222);await edit(h,'format',format);await edit(h,'text','Same pixels');const canvas=field(h,'canvas');
  assert.deepEqual([canvas.width,canvas.height],[333,222]);const preview=h.painted.at(-1);
  let oversized=true,calls=0;canvas.toBlob=(done,mime)=>{calls++;assert.equal(mime,'image/'+format);assert.deepEqual([canvas.width,canvas.height],[333,222]);assert.deepEqual(h.painted.at(-1),preview);done(new Blob([new Uint8Array(oversized?IMAGE_LIMIT+1:10)],{type:mime}));};
  await h.action('apply');assert.equal(applied,0);assert.match(field(h,'status').textContent,/2 MB/);assert.deepEqual([canvas.width,canvas.height],[333,222]);assert.equal(calls,format==='png'?1:5);
  oversized=false;await h.action('apply');assert.equal(applied,1);
 },()=>{applied++;});
});
test('custom crop pointer pan stays exact and Undo restores pan without dimensions',()=>prepared(async h=>{
 await size(h,400,400);const canvas=field(h,'canvas');field(h,'stage').focus();
 await canvas.fire('pointerdown',{button:0,isPrimary:true,pointerId:1,clientX:300,clientY:200,timeStamp:1});
 await canvas.fire('pointermove',{buttons:1,isPrimary:true,pointerId:1,clientX:360,clientY:200,timeStamp:2});
 await canvas.fire('pointerup',{pointerId:1,timeStamp:3});assert.notEqual(field(h,'x').value,'50');
 assert.deepEqual([canvas.width,canvas.height],[400,400]);await h.action('undo');assert.equal(Number(field(h,'x').value),50);assert.equal(field(h,'width').value,'400');
}));
test('explicit empty custom fields survive preset roundtrip and history without silent defaulting',()=>prepared(async h=>{
 await size(h);await edit(h,'width','');await edit(h,'height','');await edit(h,'ratio',1);await edit(h,'ratio','custom');
 assert.equal(field(h,'width').value,'');assert.equal(field(h,'height').value,'');assert.equal(h.controls.get('[data-studio="apply"]').disabled,true);
 await h.action('undo');assert.equal(field(h,'ratio').value,'1');await h.action('redo');assert.equal(field(h,'width').value,'');
}));
