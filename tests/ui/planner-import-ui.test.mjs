import test from 'node:test';import assert from 'node:assert/strict';
import {createPlannerImportUI} from '../../public/planner-import-ui.js';
import {createDemoState} from '../../public/model.js';
function harness(save=async()=>{}){
 const element=()=>({textContent:'',value:'',disabled:false,files:[],children:[],focus(){},replaceChildren(){this.children=[];},append(x){this.children.push(x);}});
 const nodes=Object.fromEntries(['input','[data-import-status]','[data-import-list]','[data-import-confirm]','[data-import-close]'].map(k=>[k,element()]));const dialog={open:false,querySelector:k=>nodes[k],events:{},addEventListener(k,fn){this.events[k]=fn;},showModal(){this.open=true;},close(){this.open=false;}};
 const state={...createDemoState(new Date('2030-01-01')),posts:[]};const imported=structuredClone(state);imported.posts=[{id:'one',title:'<img onerror=evil>',text:'text',tags:[],channels:['mastodon'],variantTexts:{},status:'draft',scheduleBinding:null,scheduledInstant:null,scheduledAt:null,timeZone:'UTC',cover:null,media:null,createdAt:'2030-01-01T00:00:00.000Z',updatedAt:'2030-01-01T00:00:00.000Z'}];
 globalThis.document={activeElement:element(),createElement:element};
 const ui=createPlannerImportUI({dialog,getState:()=>state,canOpen:()=>true,save});
 const file=()=>{const b=new TextEncoder().encode(JSON.stringify(imported));return{size:b.byteLength,arrayBuffer:async()=>b.buffer};};
 return{ui,dialog,nodes,state,file,imported};
}
test('preview reads locally and renders literal text; cancel writes nothing',async()=>{let saves=0;const h=harness(async()=>saves++);h.ui.open();h.nodes.input.files=[h.file()];await h.nodes.input.onchange();assert.equal(saves,0);assert.equal(h.nodes['[data-import-confirm]'].disabled,false);assert.match(h.nodes['[data-import-list]'].children[0].textContent,/<img onerror=evil>/);h.nodes['[data-import-close]'].onclick();assert.equal(h.dialog.open,false);assert.equal(saves,0);});
test('one explicit commit, double clicks blocked and uncertain write never retried after reopen',async()=>{let saves=0,reject;const h=harness(()=>{saves++;return new Promise((_,r)=>reject=r);});h.ui.open();h.nodes.input.files=[h.file()];await h.nodes.input.onchange();const first=h.nodes['[data-import-confirm]'].onclick();await h.nodes['[data-import-confirm]'].onclick();h.nodes['[data-import-close]'].onclick();assert.equal(h.dialog.open,true);assert.equal(saves,1);reject(Error('timeout'));await first;assert.match(h.nodes['[data-import-status]'].textContent,/Möglicherweise wurde gespeichert/);h.nodes['[data-import-close]'].onclick();h.ui.open();assert.equal(h.nodes.input.disabled,true);await h.nodes['[data-import-confirm]'].onclick();assert.equal(saves,1);});
test('stale file response and local revision change cannot commit',async()=>{let saves=0,resolve;const h=harness(async()=>saves++);h.ui.open();h.nodes.input.files=[{size:10,arrayBuffer:()=>new Promise(r=>resolve=r)}];const pending=h.nodes.input.onchange();h.nodes['[data-import-close]'].onclick();resolve(await h.file().arrayBuffer());await pending;assert.equal(h.nodes['[data-import-confirm]'].disabled,true);h.ui.open();h.nodes.input.files=[h.file()];await h.nodes.input.onchange();h.state.revision++;await h.nodes['[data-import-confirm]'].onclick();assert.equal(saves,0);assert.match(h.nodes['[data-import-status]'].textContent,/geändert/);});
test('invalid UTF8 and oversize files rejected before preview',async()=>{for(const f of [{size:2,arrayBuffer:async()=>new Uint8Array([0xc3,0x28]).buffer},{size:1024*1024+1,arrayBuffer:async()=>{throw Error('must not read');}}]){const h=harness();h.ui.open();h.nodes.input.files=[f];await h.nodes.input.onchange();assert.equal(h.nodes['[data-import-confirm]'].disabled,true);}});

// Exercise the actual global shortcut handler with focus on the dialog close button.
test('import dialog blocks global new-post and search shortcuts',async()=>{
 const {readFileSync}=await import('node:fs'),{runInNewContext}=await import('node:vm');const source=readFileSync(new URL('../../public/app.js',import.meta.url),'utf8');const start=source.indexOf("document.addEventListener('keydown',e=>{if(e.ctrlKey");const end=source.indexOf(";window.addEventListener('beforeunload'",start);let handler,calls=0;
 runInNewContext(source.slice(start,end),{document:{activeElement:{tagName:'BUTTON'},addEventListener:(name,fn)=>handler=fn},$:id=>({open:id==='#planner-import-dialog',focus:()=>calls++}),view:'calendar',openComposer:()=>calls++,openIdea:()=>calls++});
 for(const key of ['n','/'])handler({key,preventDefault(){calls++;}});assert.equal(calls,0);
});

test('late failure from an older selected file cannot erase a newer verified preview',async()=>{
 let reject,saves=0;const h=harness(async()=>saves++);h.ui.open();h.nodes.input.files=[{size:10,arrayBuffer:()=>new Promise((_,r)=>reject=r)}];const stale=h.nodes.input.onchange();h.nodes.input.files=[h.file()];await h.nodes.input.onchange();const text=h.nodes['[data-import-status]'].textContent;reject(Error('Old read failed'));await stale;assert.equal(h.nodes['[data-import-confirm]'].disabled,false);assert.equal(h.nodes['[data-import-status]'].textContent,text);assert.equal(h.nodes['[data-import-list]'].children.length,1);assert.equal(saves,0);
});
test('Cancel followed by reopening cannot revive an old file preview or write data',async()=>{
 let resolve,saves=0;const h=harness(async()=>saves++);h.ui.open();h.nodes.input.files=[{size:10,arrayBuffer:()=>new Promise(r=>resolve=r)}];const stale=h.nodes.input.onchange();h.dialog.events.cancel({preventDefault(){}});h.ui.open();resolve(await h.file().arrayBuffer());await stale;assert.equal(h.dialog.open,true);assert.equal(h.nodes['[data-import-confirm]'].disabled,true);assert.equal(h.nodes['[data-import-list]'].children.length,0);await h.nodes['[data-import-confirm]'].onclick();assert.equal(saves,0);
});
test('confirmed import also remains single-flight after closing and reopening, without treating success as a retry grant',async()=>{
 let saves=0;const h=harness(async()=>saves++);h.ui.open();h.nodes.input.files=[h.file()];await h.nodes.input.onchange();await h.nodes['[data-import-confirm]'].onclick();assert.equal(saves,1);assert.match(h.nodes['[data-import-status]'].textContent,/Import gespeichert/);h.nodes['[data-import-close]'].onclick();h.ui.open();assert.equal(h.nodes.input.disabled,true);await h.nodes.input.onchange();await h.nodes['[data-import-confirm]'].onclick();assert.equal(saves,1);
});

test('reloaded duplicate-only file ignores server timestamp and disables every confirmation without a save',async()=>{
 let saves=0;const h=harness(async()=>saves++);h.state.posts=structuredClone(h.imported.posts);h.state.posts[0].updatedAt='2030-02-02T00:00:00.000Z';h.ui.open();h.nodes.input.files=[h.file()];await h.nodes.input.onchange();
 assert.match(h.nodes['[data-import-status]'].textContent,/0 neue Einträge, 1 unverändert vorhanden und übersprungen/);assert.equal(h.nodes['[data-import-confirm]'].disabled,true);assert.equal(h.nodes['[data-import-list]'].children.length,0);await h.nodes['[data-import-confirm]'].onclick();await h.nodes['[data-import-confirm]'].onclick();assert.equal(saves,0);
});
