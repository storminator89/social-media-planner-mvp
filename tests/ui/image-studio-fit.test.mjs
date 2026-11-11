import test from 'node:test';
import assert from 'node:assert/strict';
import {fitGeometry,cropGeometry} from '../../public/image-studio-model.js';
import {studioHarness} from './image-studio-harness.mjs';
const field=(h,id)=>h.controls.get('#studio-'+id);
const image=()=>new File(['fixture'],'fit.png',{type:'image/png'});
const flush=()=>new Promise(setImmediate);
async function edit(h,id,value){field(h,id).value=String(value);await field(h,'image-tools').fire('change',{target:field(h,id)});}
async function prepared(run,onApply=()=>assert.fail('Unexpected Apply')){const h=studioHarness(onApply);try{await h.studio.open();await h.select(image());await run(h);}finally{h.restore();}}
const pointer=(h,type,extra={})=>field(h,'canvas').fire(type,{pointerId:1,clientX:300,clientY:180,button:0,buttons:1,isPrimary:true,timeStamp:100,...extra});

test('full landscape fits portrait canvas without cropping; exact custom permits blank space',()=>{
 const preset=fitGeometry(1600,900,{ratio:.8});
 assert.deepEqual([preset.width,preset.height,preset.drawWidth,preset.drawHeight,preset.dx,preset.dy],[1600,2000,1600,900,0,550]);
 const custom=fitGeometry(1600,900,{ratio:'custom',outputWidth:800,outputHeight:1000});
 assert.deepEqual([custom.width,custom.height,custom.drawWidth,custom.drawHeight,custom.dx,custom.dy],[800,1000,800,450,0,275]);
 assert.throws(()=>cropGeometry(1600,900,{ratio:'custom',outputWidth:800,outputHeight:1000}),/Ausschnitt/);
 assert.deepEqual([cropGeometry(1600,900,{ratio:.8}).sw,cropGeometry(1600,900,{ratio:.8}).sh],[720,900]);
});
test('fit geometry is centered, uniform, uncropped and never enlarges image pixels',()=>{
 for(const [w,h] of [[1600,900],[900,1600],[8000,5000],[1,1],[1,40000000],[40000000,1],[3,7],[17,2048]]){
  for(const rotation of [0,90,180,270])for(const ratio of [0,1,.8,9/16,16/9,'custom']){
   const g=fitGeometry(w,h,{rotation,ratio,outputWidth:2048,outputHeight:13,zoom:3,x:0,y:100});
   assert.ok(g.width>=1&&g.width<=2048&&Number.isInteger(g.width));assert.ok(g.height>=1&&g.height<=2048&&Number.isInteger(g.height));
   assert.ok(g.scale>0&&g.scale<=1);assert.equal(g.sw,g.w);assert.equal(g.sh,g.h);assert.equal(g.sx,0);assert.equal(g.sy,0);
   assert.equal(g.drawWidth/g.w,g.scale);assert.ok(Math.abs(g.drawHeight/g.h-g.scale)<1e-15);
   assert.ok(g.dx>=0&&g.dy>=0);assert.ok(g.drawWidth<=g.width+1e-9&&g.drawHeight<=g.height+1e-9);
   assert.equal(g.dx*2+g.drawWidth,g.width);assert.equal(g.dy*2+g.drawHeight,g.height);
   assert.deepEqual(g,fitGeometry(w,h,{rotation,ratio,outputWidth:2048,outputHeight:13}));
  }
 }
 const tiny=fitGeometry(1,1,{ratio:'custom',outputWidth:2048,outputHeight:2048});
 assert.equal(tiny.drawWidth,1);assert.equal(tiny.drawHeight,1);
});
test('invalid custom sizes and source bounds fail without silent size clamping',()=>{
 for(const v of ['',0,-1,1.2,2049,Infinity,NaN,'bad'])for(const axis of ['outputWidth','outputHeight'])
  assert.throws(()=>fitGeometry(1600,900,{ratio:'custom',outputWidth:800,outputHeight:1000,[axis]:v}),/ganze Zahlen/);
 for(const [w,h]of [[0,1],[-1,1],[Infinity,1],[NaN,1],[8000,5001]])assert.throws(()=>fitGeometry(w,h));
});
test('mode has independent crop values, history, reset, close and failed-load recovery',()=>prepared(async h=>{
 await edit(h,'zoom',2);await edit(h,'x',20);await edit(h,'fit','contain');
 for(const id of ['zoom','x','y'])assert.equal(field(h,id).disabled,true);
 await h.action('undo');assert.equal(field(h,'fit').value,'crop');assert.equal(field(h,'zoom').disabled,false);
 await h.action('redo');assert.equal(field(h,'fit').value,'contain');
 h.deferImages();await h.select(image());h.images.at(-1).onerror();await flush();assert.equal(field(h,'fit').value,'contain');assert.equal(field(h,'zoom').disabled,true);
 h.deferImages(false);const draw=h.context.drawImage;let fail=true;h.context.drawImage=function(...args){if(fail){fail=false;throw Error('render');}return draw.apply(this,args);};
 await h.select(image());assert.equal(field(h,'fit').value,'contain');
 await edit(h,'fit','crop');assert.equal(field(h,'zoom').value,'2');assert.equal(field(h,'x').value,'20');
 await edit(h,'fit','contain');await h.action('reset');assert.equal(field(h,'fit').value,'crop');
 await h.action('undo');assert.equal(field(h,'fit').value,'contain');
 await h.select(image());assert.equal(field(h,'fit').value,'crop');
 await edit(h,'fit','contain');await h.action('close');assert.equal(field(h,'fit').value,'crop');
}));
test('mode switching terminates crop gestures and stale events cannot pan fit',()=>prepared(async h=>{
 await edit(h,'ratio',1);field(h,'stage').focus();await pointer(h,'pointerdown');await pointer(h,'pointermove',{clientX:330});
 const x=field(h,'x').value;await edit(h,'fit','contain');await pointer(h,'pointermove',{clientX:390});await pointer(h,'pointerup');
 assert.equal(field(h,'x').value,x);assert.equal(field(h,'canvas')['data-draggable'],undefined);
 const captures=field(h,'canvas').captureCalls.length;
 await pointer(h,'pointerdown');await pointer(h,'pointermove',{clientX:390});await pointer(h,'pointerup');
 assert.equal(field(h,'canvas').captureCalls.length,captures);assert.equal(field(h,'x').value,x);
}));
test('text remains canvas-based and draggable in fit padding, with Undo',()=>prepared(async h=>{
 await edit(h,'fit','contain');await edit(h,'ratio',1);await edit(h,'text','Text');
 const canvas=field(h,'canvas');canvas.getBoundingClientRect=()=>({left:0,top:0,width:400,height:400});field(h,'stage').focus();
 await pointer(h,'pointerdown',{clientX:200,clientY:300});await pointer(h,'pointermove',{clientX:220,clientY:250});await pointer(h,'pointerup');
 assert.ok(Number(field(h,'text-y').value)<75);assert.equal(Number(field(h,'x').value),50);
 await h.action('undo');assert.equal(Number(field(h,'text-y').value),75);assert.equal(field(h,'fit').value,'contain');
}));
for(const format of ['jpeg','png'])test(format+' fit render transform, filter isolation and failed export preserve exact canvas',async()=>{
 let applied=0;await prepared(async h=>{
  await edit(h,'fit','contain');await edit(h,'ratio','custom');await edit(h,'width',800);await edit(h,'height',1000);
  await edit(h,'format',format);await edit(h,'brightness',50);await h.action('rotate');await h.action('flip');
  const calls=[];let filter='none';Object.defineProperty(h.context,'filter',{get:()=>filter,set:v=>{filter=v;calls.push(['filter',v]);}});
  for(const name of ['fillRect','save','translate','scale','rotate','drawImage','restore'])h.context[name]=(...args)=>{calls.push([name,...args]);if(name==='restore')filter='none';};
  await edit(h,'contrast',70);const canvas=field(h,'canvas');assert.deepEqual([canvas.width,canvas.height],[800,1000]);
  const g=fitGeometry(1200,800,{rotation:90,ratio:'custom',outputWidth:800,outputHeight:1000});
  assert.ok(calls.some(c=>c[0]==='translate'&&c[1]===g.dx&&c[2]===g.dy));
  assert.ok(calls.some(c=>c[0]==='scale'&&c[1]===g.scale&&c[2]===g.scale));
  assert.ok(calls.some(c=>c[0]==='scale'&&c[1]===-1&&c[2]===1));
  if(format==='jpeg')assert.ok(calls.findIndex(c=>c[0]==='fillRect')<calls.findIndex(c=>c[0]==='filter'));
  else assert.equal(calls.some(c=>c[0]==='fillRect'),false);
  let fail=true;canvas.toBlob=(done,mime)=>done(fail?null:new Blob(['fit'],{type:mime}));
  await h.action('apply');assert.equal(applied,0);assert.equal(field(h,'fit').value,'contain');assert.equal(field(h,'zoom').disabled,true);
  assert.deepEqual([canvas.width,canvas.height],[800,1000]);fail=false;await h.action('apply');assert.equal(applied,1);
 },()=>applied++);
});
