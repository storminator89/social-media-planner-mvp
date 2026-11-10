import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {canvasPoint,cropDragPosition,textOverlayContainsPoint,validCanvasRect} from '../../public/image-studio-drag.js';
import {cropGeometry,textOverlayLayout} from '../../public/image-studio-model.js';
import {studioHarness} from './image-studio-harness.mjs';
const rect={left:10,top:20,width:600,height:400};
const start={x:50,y:50};
const image=()=>new File(['fixture'],'photo.png',{type:'image/png'});
const get=(h,id)=>h.controls.get('#studio-'+id);
const value=(h,id)=>Number(get(h,id).value);
const edit=async(h,id,v,event='change')=>{get(h,id).value=String(v);await get(h,'image-tools').fire(event,{target:get(h,id)});};
const pointer=(h,event,extra={})=>get(h,'canvas').fire(event,{pointerId:1,clientX:300,clientY:180,button:0,buttons:1,isPrimary:true,timeStamp:100,...extra});
async function prepared(run,options={}){const h=studioHarness(options.onApply||(()=>assert.fail('Unexpected Apply')),options);try{await h.studio.open();await h.select(image());await run(h);}finally{h.restore();}}

test('crop math follows visual pixels across ratios, rotations, flips, zoom and responsive rectangles',()=>{
 for(const ratio of [0,1,.8,9/16,16/9])for(const rotation of [0,90,180,270])for(const flip of [false,true])for(const zoom of [1,1.05,2,3])for(const width of [180,600,1200]){
  const g=cropGeometry(1200,800,{ratio,rotation,zoom}),r={...rect,width,height:width*g.sh/g.sw},next=cropDragPosition({...g,flip},r,start,12,-8);
  assert.ok(next&&next.x>=0&&next.x<=100&&next.y>=0&&next.y<=100);
  if(g.w===g.sw)assert.equal(next.x,50);else{assert.ok(next.x<=50);const visual=(50-next.x)/100*(g.w-g.sw)/g.sw*r.width;if(next.x>0)assert.ok(Math.abs(visual-12)<=.00051*(g.w-g.sw)/g.sw*r.width);}
  if(g.h===g.sh)assert.equal(next.y,50);else assert.ok(next.y>=50);
 }
});
test('one-axis overflow, native tenth steps, edge clamps and Original no-op',()=>{
 const g=cropGeometry(1200,800,{ratio:1});assert.deepEqual(cropDragPosition(g,rect,start,30,40),{x:40,y:50});
 assert.deepEqual(cropDragPosition(g,rect,start,100000,-100000),{x:0,y:50});
 assert.deepEqual(cropDragPosition(cropGeometry(1200,800),rect,start,30,40),start);
 assert.deepEqual(cropDragPosition(cropGeometry(1200,800,{zoom:3}),rect,start,1,0),{x:49.9,y:50});
 const portrait=cropGeometry(800,1200,{ratio:1});assert.deepEqual(cropDragPosition(portrait,rect,start,30,20),{x:50,y:40});
});
test('geometry helpers reject nonfinite, zero, negative or inconsistent values',()=>{
 const g=cropGeometry(1200,800,{ratio:1});
 for(const invalid of [NaN,Infinity,-Infinity]){
  for(const key of ['w','h','sw','sh'])assert.equal(cropDragPosition({...g,[key]:invalid},rect,start,1,1),null);
  for(const key of ['left','top','width','height'])assert.equal(cropDragPosition(g,{...rect,[key]:invalid},start,1,1),null);
  assert.equal(cropDragPosition(g,rect,{x:invalid,y:50},1,1),null);assert.equal(cropDragPosition(g,rect,start,invalid,1),null);
 }
 for(const invalid of [0,-1]){assert.equal(validCanvasRect({...rect,width:invalid}),false);assert.equal(cropDragPosition({...g,sw:invalid},rect,start,1,1),null);}
 assert.equal(cropDragPosition({...g,sw:g.w+1},rect,start,1,1),null);
 assert.equal(cropDragPosition(g,rect,{x:-1,y:50},1,1),null);assert.equal(cropDragPosition(g,rect,{x:50,y:101},1,1),null);
 assert.equal(cropDragPosition(null,rect,start,1,1),null);
});
test('canvas points honor responsive rect offsets and reject outside and invalid pixels',()=>{
 assert.deepEqual(canvasPoint(rect,1200,800,310,220),{x:600,y:400});
 for(const args of [[1200,800,9,20],[1200,800,611,20],[1200,800,10,421],[0,800,10,20],[1200,Infinity,10,20],[1200,800,NaN,20]])assert.equal(canvasPoint(rect,...args),null);
});
test('text hit testing includes real background bounds or glyph bounds without an invisible full-width band',()=>{
 const ctx={measureText:s=>({width:s.length*10})},layout=textOverlayLayout(ctx,1200,800,{text:'Text',background:true});
 const point={x:layout.box.x+1,y:layout.box.y+1};assert.equal(textOverlayContainsPoint(layout,point,ctx.measureText),true);
 assert.equal(textOverlayContainsPoint(layout,{...point,x:layout.box.x-1},ctx.measureText),false);
 const noBG={...layout,background:null};assert.equal(textOverlayContainsPoint(noBG,point,ctx.measureText),false);
 assert.equal(textOverlayContainsPoint(noBG,{x:layout.x,y:layout.box.y+layout.padding+1},ctx.measureText),true);
 const metrics=()=>({width:40,actualBoundingBoxLeft:20,actualBoundingBoxRight:20,actualBoundingBoxAscent:-8,actualBoundingBoxDescent:42});
 assert.equal(textOverlayContainsPoint(noBG,{x:layout.x,y:layout.box.y+layout.padding+9},metrics),true);
 assert.equal(textOverlayContainsPoint(noBG,{x:layout.x,y:layout.box.y+layout.padding+1},metrics),false);
});

test('actual Studio moves only existing crop controls, draws inverse translation and creates one undo step',()=>prepared(async h=>{
 await edit(h,'ratio',1);const translations=[];h.context.translate=(...args)=>translations.push(args);
 await pointer(h,'pointerdown');for(const x of [310,320,330])await pointer(h,'pointermove',{clientX:x});await pointer(h,'pointerup');
 assert.equal(value(h,'x'),40);assert.equal(value(h,'y'),50);assert.ok(translations.some(([x,y])=>x===-160&&y===0));
 assert.deepEqual(get(h,'canvas').captureCalls,[1]);assert.deepEqual(get(h,'canvas').releaseCalls,[1]);
 await h.action('undo');assert.equal(value(h,'x'),50);assert.equal(value(h,'ratio'),1);await h.action('redo');assert.equal(value(h,'x'),40);
 await h.action('undo');await h.action('undo');assert.equal(value(h,'ratio'),0);
}));
for(const rotation of [0,90,180,270])for(const flip of [false,true])test(`actual Studio visual drag at rotation ${rotation}, flip ${flip}`,()=>prepared(async h=>{
 for(let i=0;i<rotation;i+=90)await h.action('rotate');if(flip)await h.action('flip');await edit(h,'zoom',2);
 await pointer(h,'pointerdown');await pointer(h,'pointermove',{clientX:360,clientY:220});await pointer(h,'pointerup');assert.equal(value(h,'x'),40);assert.equal(value(h,'y'),40);
}));
test('Original has no crop gesture and does not alter scale, crop, history or capture',()=>prepared(async h=>{
 const canvas=get(h,'canvas');await pointer(h,'pointerdown');await pointer(h,'pointermove',{clientX:400});await pointer(h,'pointerup');
 assert.equal(canvas.width,1200);assert.equal(canvas.height,800);assert.equal(value(h,'zoom'),1);assert.equal(value(h,'x'),50);assert.equal(canvas.captureCalls.length,0);assert.equal(h.controls.get('[data-studio="undo"]').disabled,true);assert.equal(canvas['data-draggable'],undefined);
}));
test('text overlay wins only inside its actual painted bounds; padding outside pans crop',()=>prepared(async h=>{
 await edit(h,'ratio',1);await edit(h,'text','Text');const c=get(h,'canvas');c.getBoundingClientRect=()=>({left:0,top:0,width:400,height:400});
 await pointer(h,'pointerdown',{clientX:200,clientY:300});await pointer(h,'pointermove',{clientX:220,clientY:250});await pointer(h,'pointerup');
 assert.ok(value(h,'text-y')<75);assert.equal(value(h,'x'),50);await h.action('undo');assert.equal(value(h,'text-y'),75);
 await pointer(h,'pointerdown',{clientX:1,clientY:300});await pointer(h,'pointermove',{clientX:21,clientY:300});await pointer(h,'pointerup');assert.equal(value(h,'x'),40);assert.equal(value(h,'text-y'),75);
}));
test('text without background does not take crop gestures in the blank lateral band',()=>prepared(async h=>{
 await edit(h,'ratio',1);await edit(h,'text','Text');get(h,'text-background').checked=false;await get(h,'image-tools').fire('change',{target:get(h,'text-background')});
 const c=get(h,'canvas');c.getBoundingClientRect=()=>({left:0,top:0,width:400,height:400});
 await pointer(h,'pointerdown',{clientX:40,clientY:300});await pointer(h,'pointermove',{clientX:60,clientY:300});await pointer(h,'pointerup');assert.equal(value(h,'x'),40);assert.equal(value(h,'text-y'),75);
}));
for(const ending of ['pointerup','pointercancel','lostpointercapture'])test(`${ending} retains last crop once and ignores foreign pointer endings`,()=>prepared(async h=>{
 await edit(h,'ratio',1);await pointer(h,'pointerdown');await pointer(h,'pointermove',{clientX:330});await pointer(h,ending,{pointerId:2});await pointer(h,'pointermove',{clientX:360});await pointer(h,ending);await pointer(h,'pointermove',{clientX:450});await pointer(h,ending);
 assert.equal(value(h,'x'),30);assert.equal(get(h,'canvas').releaseCalls.length,1);await h.action('undo');assert.equal(value(h,'x'),50);await h.action('redo');assert.equal(value(h,'x'),30);
}));
test('right, middle, nonprimary, nonfinite, outside and second pointers cannot hijack a drag',()=>prepared(async h=>{
 await edit(h,'ratio',1);
 for(const props of [{button:2},{button:1},{isPrimary:false},{pointerId:NaN},{pointerId:-1},{clientX:NaN},{clientX:-1}]){await pointer(h,'pointerdown',props);await pointer(h,'pointermove',{clientX:330});assert.equal(value(h,'x'),50);}
 await pointer(h,'pointerdown');await pointer(h,'pointerdown',{pointerId:2,clientX:450});await pointer(h,'pointermove',{pointerId:2,clientX:550});await pointer(h,'pointermove',{clientX:330});await pointer(h,'pointerup');assert.equal(value(h,'x'),40);assert.deepEqual(get(h,'canvas').captureCalls,[1]);
}));
test('zero or nonfinite rect and failed capture never acquire a gesture',()=>prepared(async h=>{
 await edit(h,'ratio',1);const c=get(h,'canvas');for(const width of [0,-1,NaN,Infinity]){c.getBoundingClientRect=()=>({...rect,width});await pointer(h,'pointerdown');await pointer(h,'pointermove',{clientX:330});assert.equal(value(h,'x'),50);}
 c.getBoundingClientRect=()=>rect;c.setPointerCapture=()=>{throw Error('Not active');};await pointer(h,'pointerdown');await pointer(h,'pointermove',{clientX:330});assert.equal(value(h,'x'),50);assert.equal(c['data-dragging'],undefined);
}));
for(const id of ['zoom','ratio','x','text-y'])test(`${id} input interrupts old drag without restoring stale controls or undo state`,()=>prepared(async h=>{
 await edit(h,'ratio',1);await pointer(h,'pointerdown');await pointer(h,'pointermove',{clientX:330});const next={zoom:2,ratio:.8,x:80,'text-y':30}[id];await edit(h,id,next,'input');await pointer(h,'pointermove',{clientX:500});await pointer(h,'pointercancel');assert.equal(value(h,id),next);
 await h.action('undo');assert.equal(value(h,'x'),40);assert.equal(value(h,id),id==='ratio'?1:id==='zoom'?1:id==='x'?40:75);await h.action('undo');assert.equal(value(h,'x'),50);
}));
test('unannounced control mutation and responsive resize terminate old geometry instead of jumping',()=>prepared(async h=>{
 await edit(h,'ratio',1);await pointer(h,'pointerdown');await pointer(h,'pointermove',{clientX:330});get(h,'zoom').value='2';await pointer(h,'pointermove',{clientX:500});assert.equal(value(h,'x'),40);assert.equal(value(h,'zoom'),2);
 await edit(h,'zoom',1);await pointer(h,'pointerdown');await pointer(h,'pointermove',{clientX:360});const before=value(h,'x');get(h,'canvas').getBoundingClientRect=()=>({left:0,top:0,width:300,height:300});await pointer(h,'pointermove',{clientX:450});assert.equal(value(h,'x'),before);
 await pointer(h,'pointerdown',{clientX:150});await pointer(h,'pointermove',{clientX:180});await pointer(h,'pointerup');assert.equal(value(h,'x'),Math.max(0,before-20));
}));
test('ordinary slider input grouping, no-op drags and redo branching remain independent',()=>prepared(async h=>{
 await edit(h,'ratio',1);await edit(h,'x',60,'input');await edit(h,'x',70,'input');await edit(h,'x',70);await h.action('undo');assert.equal(value(h,'x'),50);
 await pointer(h,'pointerdown');await pointer(h,'pointerup');assert.equal(h.controls.get('[data-studio="redo"]').disabled,false);
 await h.action('redo');assert.equal(value(h,'x'),70);await pointer(h,'pointerdown');await pointer(h,'pointermove',{clientX:330});await pointer(h,'pointerup');assert.equal(value(h,'x'),60);await h.action('undo');assert.equal(value(h,'x'),70);await edit(h,'x',80);assert.equal(h.controls.get('[data-studio="redo"]').disabled,true);
}));
test('busy transition stops capture and old gesture cannot resume after busy clears',async()=>{let busy=false;await prepared(async h=>{
 await edit(h,'ratio',1);busy=true;await pointer(h,'pointerdown');busy=false;await pointer(h,'pointermove',{clientX:330});assert.equal(value(h,'x'),50);
 await pointer(h,'pointerdown');await pointer(h,'pointermove',{clientX:330});busy=true;await pointer(h,'pointermove',{clientX:360});busy=false;await pointer(h,'pointermove',{clientX:450});assert.equal(value(h,'x'),40);await h.action('undo');assert.equal(value(h,'x'),50);
 },{isBusy:()=>busy});});
test('close/reopen and replacement detach old pointer events from the new scene',()=>prepared(async h=>{
 await edit(h,'ratio',1);await pointer(h,'pointerdown');await pointer(h,'pointermove',{clientX:330});await h.action('close');assert.equal(get(h,'canvas').captured.size,0);await pointer(h,'pointermove',{clientX:450});await h.studio.open();await h.select(image());await edit(h,'ratio',1);await pointer(h,'pointermove',{clientX:450});assert.equal(value(h,'x'),50);
 await pointer(h,'pointerdown',{timeStamp:200});await pointer(h,'pointerup',{timeStamp:100});await pointer(h,'pointermove',{clientX:330,timeStamp:210});assert.equal(value(h,'x'),40);
 await h.select(image());await pointer(h,'pointermove',{clientX:450,timeStamp:220});await pointer(h,'pointercancel',{timeStamp:230});assert.equal(value(h,'x'),50);assert.equal(value(h,'ratio'),0);assert.equal(h.controls.get('[data-studio="undo"]').disabled,true);
}));
test('failed replacement leaves last edit undoable but never revives its old gesture',()=>prepared(async h=>{
 await edit(h,'ratio',1);await pointer(h,'pointerdown');await pointer(h,'pointermove',{clientX:330});h.deferImages();await h.select(image());assert.equal(h.dialog['aria-busy'],'true');await pointer(h,'pointermove',{clientX:450});h.images.at(-1).onerror();await new Promise(setImmediate);await pointer(h,'pointermove',{clientX:500});assert.equal(value(h,'x'),40);await h.action('undo');assert.equal(value(h,'x'),50);
}));
test('opening video picker ends a gesture and rejects new canvas pointers while picker is open',async()=>{let opened=false;await prepared(async h=>{
 await edit(h,'ratio',1);await pointer(h,'pointerdown');await pointer(h,'pointermove',{clientX:330});await h.action('video-still');await pointer(h,'pointerdown');await pointer(h,'pointermove',{clientX:450});assert.equal(value(h,'x'),40);opened=false;await pointer(h,'pointermove',{clientX:500});assert.equal(value(h,'x'),40);
 },{createStillPicker:()=>({open(){opened=true;},close(){opened=false;},get isOpen(){return opened;}})});});
test('draw error disables Apply, releases drag, and Reset recovers without auto-applying',()=>prepared(async h=>{
 await edit(h,'ratio',1);await pointer(h,'pointerdown');const draw=h.context.drawImage;h.context.drawImage=()=>{throw Error('Drawing failed');};await pointer(h,'pointermove',{clientX:330});assert.equal(h.controls.get('[data-studio="apply"]').disabled,true);assert.equal(get(h,'canvas').captured.size,0);assert.equal(get(h,'canvas')['data-draggable'],undefined);assert.match(get(h,'status').textContent,/Drawing failed/);
 h.context.drawImage=draw;await h.action('reset');assert.equal(h.controls.get('[data-studio="apply"]').disabled,false);assert.equal(value(h,'x'),50);assert.match(get(h,'status').textContent,/aktualisiert/);
}));
test('Apply finishes a live drag and exports those existing controls once with unchanged JPG/alt contract',async()=>{let received=0;await prepared(async h=>{
 await edit(h,'ratio',1);get(h,'alt').value='Motiv';await pointer(h,'pointerdown');await pointer(h,'pointermove',{clientX:330});const translations=[];h.context.translate=(...args)=>translations.push(args);await h.action('apply');assert.equal(received,1);assert.ok(translations.some(([x,y])=>x===-160&&y===0));assert.equal(h.dialog.open,false);assert.equal(get(h,'canvas').captured.size,0);
 },{onApply(file,alt){received++;assert.equal(file.type,'image/jpeg');assert.equal(file.name,'photo-bearbeitet.jpg');assert.equal(alt,'Motiv');}});});
test('touch policy is confined to draggable canvas and native crop ranges declare tenth steps',async()=>{
 const source=await readFile(new URL('../../public/image-studio.js',import.meta.url),'utf8'),css=await readFile(new URL('../../public/image-studio.css',import.meta.url),'utf8');
 for(const id of ['x','y'])assert.match(source,new RegExp(`id="studio-${id}" type="range" min="0" max="100" step="0.1"`));
 assert.match(css,/#studio-canvas\[data-draggable="true"\]\{touch-action:none;/);assert.match(css,/#studio-canvas\{touch-action:auto;/);assert.doesNotMatch(css,/(?:\.media-studio|\.studio-stage)\s*\{[^}]*touch-action:none/);
});
test('floating-point Original overflow never creates a drag, cursor, new crop or Undo',()=>prepared(async h=>{
 h.images[0].naturalWidth=1000;h.images[0].naturalHeight=755;await h.action('reset');const c=get(h,'canvas');await pointer(h,'pointerdown');await pointer(h,'pointermove',{clientX:301,clientY:181});await pointer(h,'pointerup');assert.equal(value(h,'x'),50);assert.equal(value(h,'y'),50);assert.equal(c['data-draggable'],undefined);assert.equal(c.captureCalls.length,0);assert.equal(h.controls.get('[data-studio="undo"]').disabled,true);
 assert.deepEqual(cropDragPosition(cropGeometry(1000,755),rect,start,1,1),start);
}));
test('another modal focus prevents new drags and ends capture before focus returns',()=>prepared(async h=>{
 await edit(h,'ratio',1);const focus=document.activeElement;document.activeElement={id:'other-modal'};await pointer(h,'pointerdown');await pointer(h,'pointermove',{clientX:330});assert.equal(value(h,'x'),50);
 document.activeElement=focus;await pointer(h,'pointerdown');await pointer(h,'pointermove',{clientX:330});document.activeElement={id:'other-modal'};await h.dialog.fire('focusout',{relatedTarget:document.activeElement});assert.equal(get(h,'canvas').captured.size,0);assert.equal(get(h,'canvas')['data-draggable'],undefined);
 document.activeElement=focus;await h.dialog.fire('focusin');await pointer(h,'pointermove',{clientX:450});assert.equal(value(h,'x'),40);await h.action('undo');assert.equal(value(h,'x'),50);
}));
for(const action of ['rotate','flip','reset','undo','redo'])test(`${action} ends the old drag before its own existing action`,()=>prepared(async h=>{
 await edit(h,'ratio',1);await pointer(h,'pointerdown');await pointer(h,'pointermove',{clientX:330});await h.action(action);const state=['x','y','ratio','zoom'].map(id=>value(h,id)),width=get(h,'canvas').width,height=get(h,'canvas').height;await pointer(h,'pointermove',{clientX:500});await pointer(h,'pointercancel');assert.deepEqual(['x','y','ratio','zoom'].map(id=>value(h,id)),state);assert.equal(get(h,'canvas').width,width);assert.equal(get(h,'canvas').height,height);assert.equal(get(h,'canvas').captured.size,0);
 if(action==='undo')assert.equal(value(h,'x'),50);if(action==='reset')assert.equal(value(h,'ratio'),0);
}));
test('a queued control render is flushed before drag and cannot paint after a newer close',()=>prepared(async h=>{
 const scheduled=new Map();let next=0;globalThis.requestAnimationFrame=fn=>{scheduled.set(++next,fn);return next;};globalThis.cancelAnimationFrame=id=>scheduled.delete(id);
 await edit(h,'zoom',2,'input');assert.equal(scheduled.size,1);await pointer(h,'pointerdown');assert.equal(scheduled.size,0);await pointer(h,'pointermove',{clientX:330});assert.equal(value(h,'x'),45);await pointer(h,'pointerup');
 await edit(h,'zoom',3,'input');assert.equal(scheduled.size,1);await h.action('close');assert.equal(scheduled.size,0);assert.equal(get(h,'canvas').width,0);
}));
test('releasing the left button or losing primary ownership commits once and never resumes',()=>prepared(async h=>{
 await edit(h,'ratio',1);for(const props of [{buttons:0},{buttons:3},{isPrimary:false}]){await pointer(h,'pointerdown');await pointer(h,'pointermove',{clientX:330});const before=value(h,'x');await pointer(h,'pointermove',{clientX:400,...props});await pointer(h,'pointermove',{clientX:500});assert.equal(value(h,'x'),before);await h.action('undo');assert.equal(value(h,'x'),50);}
}));
test('failed replacement and failed redraw cannot restore stale preview validity or enable Apply',()=>prepared(async h=>{
 await edit(h,'ratio',1);get(h,'alt').value='Original';await pointer(h,'pointerdown');await pointer(h,'pointermove',{clientX:330});await pointer(h,'pointerup');const old=h.images[0],draw=h.context.drawImage;h.context.drawImage=()=>{throw Error('Both renders failed');};await h.select(new File(['new'],'replacement.png',{type:'image/png'}));
 assert.equal(get(h,'filename').textContent,'photo.png');assert.equal(get(h,'alt').value,'Original');assert.equal(value(h,'x'),40);assert.equal(h.controls.get('[data-studio="apply"]').disabled,true);assert.equal(get(h,'canvas')['data-draggable'],undefined);assert.equal(h.controls.get('[data-studio="undo"]').disabled,false);
 h.context.drawImage=draw;await h.action('undo');assert.equal(value(h,'x'),50);assert.equal(h.controls.get('[data-studio="apply"]').disabled,false);assert.equal(h.draws.at(-1),old);assert.match(get(h,'status').textContent,/aktualisiert/);
}));
test('moves with unchanged position or only along a non-overflow axis keep redo and do not add Undo',()=>prepared(async h=>{
 await edit(h,'ratio',1);await edit(h,'x',70);await h.action('undo');assert.equal(value(h,'x'),50);await pointer(h,'pointerdown');await pointer(h,'pointermove');await pointer(h,'pointermove',{clientY:240});await pointer(h,'pointerup');assert.equal(h.controls.get('[data-studio="redo"]').disabled,false);await h.action('undo');assert.equal(value(h,'ratio'),0);
}));
test('focus interruption with no drag does not discard a pending slider preview',()=>prepared(async h=>{
 const scheduled=new Map();let next=0;globalThis.requestAnimationFrame=fn=>{scheduled.set(++next,fn);return next;};globalThis.cancelAnimationFrame=id=>scheduled.delete(id);await edit(h,'zoom',2,'input');assert.equal(get(h,'canvas').width,1200);const focus=document.activeElement;document.activeElement={id:'other-modal'};await h.dialog.fire('focusout',{relatedTarget:document.activeElement});assert.equal(scheduled.size,1);for(const draw of scheduled.values())draw();scheduled.clear();document.activeElement=focus;await h.dialog.fire('focusin');assert.equal(get(h,'canvas').width,600);assert.equal(value(h,'zoom'),2);assert.equal(h.controls.get('[data-studio="apply"]').disabled,false);
}));
