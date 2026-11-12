import test from 'node:test';import assert from 'node:assert/strict';
import {createPlannerImportUI} from '../../public/planner-import-ui.js';
import {createDemoState} from '../../public/model.js';
import {parseDraftCSV} from '../../public/planner-csv.js';
import {PlannerClientError} from '../../public/data-client/client.mjs';
function harness(save=async()=>{},decodeImage=async()=>{}){
 const element=()=>({textContent:'',value:'',disabled:false,hidden:false,files:[],children:[],focusCount:0,focus(){this.focusCount++},replaceChildren(){this.children=[]},append(x){this.children.push(x)}});
 const nodes=Object.fromEntries(['input','[data-import-status]','[data-import-list]','[data-import-confirm]','[data-import-close]','[data-csv-options]','[data-csv-channel]','[data-csv-template]','[data-csv-zone-field]','[data-csv-zone]'].map(k=>[k,element()]));
 const dialog={open:false,querySelector:k=>nodes[k],events:{},addEventListener(k,f){this.events[k]=f},showModal(){this.open=true},close(){this.open=false}};
 const state={...createDemoState(new Date('2030-01-01')),posts:[],settings:{timezone:'Europe/Berlin'}};
 const origin=element();globalThis.document={activeElement:origin,createElement:element};
 const ui=createPlannerImportUI({dialog,getState:()=>state,canOpen:()=>true,save,decodeImage});
 const file=(text='Text,Tags\nHello,Label',name='drafts.csv')=>{const b=new TextEncoder().encode(text);return{name,size:b.byteLength,arrayBuffer:async()=>b.buffer}};
 const select=async(text,name)=>{nodes.input.files=[file(text,name)];await nodes.input.onchange()};
 const channel=async(value='mastodon')=>{nodes['[data-csv-channel]'].value=value;await nodes['[data-csv-channel]'].onchange()};
 return{ui,nodes,dialog,state,origin,file,select,channel};
}

function addImage(h){const media={id:'saved-image',url:'/api/planner/media/saved-image',alt:'Blue square',name:'blue.png',type:'image/png'};h.state.posts=[{...createDemoState(new Date('2030-01-01')).posts[0],id:'source',text:'Source',status:'draft',scheduledAt:null,scheduledInstant:null,scheduleBinding:null,mediaItems:[media]}];return media;}
function pick(h,index=0){return h.nodes['[data-import-list]'].children[index].children.find(e=>e.ariaLabel===`Bild für Eintrag ${index+1}`);}
test('image-only row stays blocked until explicit valid selection; preview and one save preserve ID',async()=>{
 let saved,calls=0;const h=harness(async s=>{calls++;saved=s}),media=addImage(h);h.ui.open();await h.select('Text\n""');await h.channel();assert.equal(h.nodes['[data-import-confirm]'].disabled,true);const p=pick(h);p.value=media.id;await p.onchange();assert.equal(h.nodes['[data-import-confirm]'].disabled,false);assert.equal(pick(h).focusCount,1);await h.nodes['[data-import-confirm]'].onclick();await h.nodes['[data-import-confirm]'].onclick();assert.equal(calls,1);assert.deepEqual(saved.posts.at(-1).mediaItems,[media]);assert.equal(saved.posts.at(-1).text,'');
});
test('cancel during image decode cannot revive selection, and reopen clears images',async()=>{
 let release;const h=harness(async()=>assert.fail('no save'),()=>new Promise(r=>release=r)),media=addImage(h);h.ui.open();await h.select('Text\n""');await h.channel();const p=pick(h);p.value=media.id;const pending=p.onchange();h.nodes['[data-import-close]'].onclick();h.ui.open();release();await pending;assert.equal(h.nodes['[data-import-list]'].children.length,0);assert.equal(h.nodes['[data-import-confirm]'].disabled,true);
});
test('new file while decode pending cannot inherit old row image',async()=>{
 let release;const h=harness(async()=>{},()=>new Promise(r=>release=r)),media=addImage(h);h.ui.open();await h.select('Text\n""');await h.channel();const p=pick(h);p.value=media.id;const pending=p.onchange();await h.select('Text\nNew text');release();await pending;assert.equal(pick(h).value,'');assert.match(h.nodes['[data-import-list]'].children[0].textContent,/New text/);
});
test('failed decode retains prior selection and does not enable an empty image-only row',async()=>{
 const h=harness(async()=>assert.fail('no save'),async()=>{throw Error('Broken image')}),media=addImage(h);h.ui.open();await h.select('Text\n""');await h.channel();const p=pick(h);p.value=media.id;await p.onchange();assert.equal(pick(h).value,'');assert.equal(h.nodes['[data-import-confirm]'].disabled,true);assert.equal(h.nodes['[data-import-status]'].textContent,'Broken image');
});
test('late decode error cannot overwrite a newer preview during recovery hashing',async t=>{
 let reject,release,block=false,entered;const recovering=new Promise(r=>entered=r);const original=crypto.subtle.digest.bind(crypto.subtle);t.mock.method(crypto.subtle,'digest',async(...args)=>{const result=await original(...args);if(block){block=false;await new Promise(r=>{release=r;entered();});}return result;});
 const h=harness(async()=>{},()=>new Promise((_,r)=>reject=r)),media=addImage(h);h.ui.open();await h.select('Text\nCaption');await h.channel();const p=pick(h);p.value=media.id;const pending=p.onchange();block=true;reject(Error('Old failure'));await recovering;assert.equal(typeof release,'function');await h.select('Text\nNew file');release();await pending;assert.equal(h.nodes['[data-import-status]'].textContent,'1 neu · 0 bereits vorhanden');assert.match(h.nodes['[data-import-list]'].children[0].textContent,/New file/);
});
