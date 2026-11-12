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

test('all semantic row errors shown, no save; corrected replacement can import',async()=>{
 let writes=0;const h=harness(async()=>writes++);h.ui.open();
 await h.select('Text,Image URL,Posting Time\nFine,,\nBad,,01/02/2035 12:00\nImage,https://example.invalid/x,');
 assert.equal(h.nodes['[data-import-status]'].textContent,'2 Einträge prüfen · nichts importiert');
 assert.equal(h.nodes['[data-import-list]'].children.length,2);assert.match(h.nodes['[data-import-list]'].children[0].textContent,/Eintrag 2/);assert.match(h.nodes['[data-import-list]'].children[1].textContent,/Eintrag 3/);
 await h.channel();await h.nodes['[data-import-confirm]'].onclick();assert.equal(writes,0);assert.equal(h.nodes['[data-import-confirm]'].disabled,true);
 await h.select('Text\nFine\nCorrected');assert.equal(h.nodes['[data-import-confirm]'].disabled,false);assert.equal(h.nodes['[data-import-list]'].children.length,2);await h.nodes['[data-import-confirm]'].onclick();assert.equal(writes,1);
});
test('cancel and reopen cannot retain errors or allow stale save',async()=>{
 const h=harness(async()=>assert.fail('must not save'));h.ui.open();await h.select('Text,Posting Time\na,01/02/2035 12:00');h.nodes['[data-import-close]'].onclick();h.ui.open();assert.equal(h.nodes['[data-import-list]'].children.length,0);assert.equal(h.nodes['[data-import-status]'].textContent,'');assert.equal(h.nodes['[data-import-confirm]'].disabled,true);
});
test('structurally bad replacement clears old semantic errors',async()=>{
 const h=harness();h.ui.open();await h.select('Text,Posting Time\na,01/02/2035 12:00');await h.select('Text\n"oops');assert.equal(h.nodes['[data-import-list]'].children.length,0);assert.match(h.nodes['[data-import-status]'].textContent,/Anführungszeichen/);assert.equal(h.nodes['[data-import-confirm]'].disabled,true);
});
