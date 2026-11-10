import test from 'node:test';
import assert from 'node:assert/strict';
import {studioHarness} from './image-studio-harness.mjs';
const field=(h,id)=>h.controls.get('#studio-'+id),button=(h,id)=>h.controls.get(`[data-studio="${id}"]`);
const image=()=>new File(['fixture'],'photo.png',{type:'image/png'});
const edit=async(h,id,value)=>{field(h,id).value=String(value);await field(h,'image-tools').fire('change',{target:field(h,id)});};
async function drag(h){const c=field(h,'canvas'),event={pointerId:1,clientX:300,clientY:180,button:0,buttons:1,isPrimary:true,timeStamp:100};await c.fire('pointerdown',event);await c.fire('pointermove',{...event,clientX:330,timeStamp:101});await c.fire('pointerup',{...event,clientX:330,timeStamp:102});}
async function prepared(run,options={}){const h=studioHarness(()=>assert.fail('No Apply requested'),options);try{await h.studio.open();await h.select(image());await edit(h,'zoom',2);await run(h);}finally{h.restore();}}

test('first gesture after focused Redo reaches its end works without a preliminary canvas click',()=>prepared(async h=>{
 await drag(h);button(h,'undo').focus();await h.action('undo');button(h,'redo').focus();await h.action('redo');
 assert.equal(button(h,'redo').disabled,true);assert.equal(document.activeElement,field(h,'stage'));assert.deepEqual(field(h,'stage').focusOptions,{preventScroll:true});assert.equal(button(h,'redo').disabledFocusLosses||0,0);assert.equal(Number(field(h,'x').value),45);
 await drag(h);assert.equal(Number(field(h,'x').value),40);await h.action('undo');assert.equal(Number(field(h,'x').value),45);
}));
test('Undo at history start anchors focus before disabling; a subsequent crop gesture needs no extra click',async()=>{
 const h=studioHarness(()=>{});try{
  await h.studio.open();await h.select(image());await edit(h,'text','Text');button(h,'undo').focus();await h.action('undo');
  assert.equal(button(h,'undo').disabled,true);assert.equal(document.activeElement,field(h,'stage'));assert.equal(button(h,'undo').disabledFocusLosses||0,0);assert.deepEqual(field(h,'stage').focusOptions,{preventScroll:true});await edit(h,'zoom',2);await drag(h);assert.equal(Number(field(h,'x').value),45);
 }finally{h.restore();}
});
test('Undo while earlier crop state still exists retains focused enabled history button',()=>prepared(async h=>{
 await drag(h);button(h,'undo').focus();await h.action('undo');assert.equal(button(h,'undo').disabled,false);assert.equal(document.activeElement,button(h,'undo'));await drag(h);assert.equal(Number(field(h,'x').value),45);
}));
test('enabled Redo retains its focus until the final redo, then next drag works',()=>prepared(async h=>{
 await drag(h);await drag(h);await h.action('undo');await h.action('undo');button(h,'redo').focus();await h.action('redo');assert.equal(button(h,'redo').disabled,false);assert.equal(document.activeElement,button(h,'redo'));await h.action('redo');assert.equal(button(h,'redo').disabled,true);assert.equal(document.activeElement,field(h,'stage'));await drag(h);assert.equal(Number(field(h,'x').value),35);
}));
test('disabling Redo after a new crop branch keeps the active gesture and future drags usable',()=>prepared(async h=>{
 await drag(h);await h.action('undo');button(h,'redo').focus();await drag(h);assert.equal(button(h,'redo').disabled,true);assert.equal(document.activeElement,field(h,'stage'));await drag(h);assert.equal(Number(field(h,'x').value),40);
}));
test('foreign focus is never replaced when history changes and canvas still rejects that modal',()=>prepared(async h=>{
 await drag(h);await h.action('undo');const foreign={id:'foreign-modal'};document.activeElement=foreign;await h.action('redo');assert.equal(document.activeElement,foreign);assert.equal(button(h,'redo').disabled,true);await drag(h);assert.equal(Number(field(h,'x').value),45);
}));
test('external busy state must not transfer focus to stage from a history endpoint',async()=>{
 let busy=false;await prepared(async h=>{await drag(h);await h.action('undo');button(h,'redo').focus();busy=true;await h.action('redo');assert.equal(document.activeElement,document.body);assert.equal(field(h,'stage').focusOptions,undefined);busy=false;},{isBusy:()=>busy});
});
test('working load disables history without stage focus and a failed replacement preserves controls',()=>prepared(async h=>{
 await drag(h);button(h,'undo').focus();h.deferImages();await h.select(image());assert.equal(h.dialog['aria-busy'],'true');assert.equal(document.activeElement,document.body);assert.equal(field(h,'stage').focusOptions,undefined);h.images.at(-1).onerror();await new Promise(setImmediate);assert.equal(Number(field(h,'x').value),45);
}));
test('active picker does not hand focus to the canvas when history controls change',async()=>{
 let open=false;await prepared(async h=>{await drag(h);await h.action('undo');button(h,'redo').focus();await h.action('video-still');open=true;const pickerFocus={id:'picker-focus',parentElement:h.dialog};document.activeElement=pickerFocus;await h.action('redo');assert.equal(document.activeElement,pickerFocus);await drag(h);assert.equal(Number(field(h,'x').value),50);},{createStillPicker:()=>({open(){open=true;},close(){open=false;},get isOpen(){return open;}})});
});
test('Close never focuses the stage and keeps the existing return-focus behavior',()=>prepared(async h=>{
 await drag(h);button(h,'undo').focus();await h.action('close');assert.equal(h.dialog.open,false);assert.equal(document.activeElement.id,'return');assert.equal(field(h,'stage').focusOptions,undefined);
}));
test('format selection retains its focus and first direct drag works when native select retains focus',()=>prepared(async h=>{
 field(h,'ratio').focus();await edit(h,'ratio',1);assert.equal(document.activeElement,field(h,'ratio'));await drag(h);assert.ok(Number(field(h,'x').value)<50);
}));
