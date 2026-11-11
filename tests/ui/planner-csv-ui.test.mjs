import test from 'node:test';import assert from 'node:assert/strict';
import {createPlannerImportUI} from '../../public/planner-import-ui.js';
import {createDemoState} from '../../public/model.js';
import {parseDraftCSV} from '../../public/planner-csv.js';
import {PlannerClientError} from '../../public/data-client/client.mjs';
function harness(save=async()=>{}){
 const element=()=>({textContent:'',value:'',disabled:false,hidden:false,files:[],children:[],focusCount:0,focus(){this.focusCount++},replaceChildren(){this.children=[]},append(x){this.children.push(x)}});
 const nodes=Object.fromEntries(['input','[data-import-status]','[data-import-list]','[data-import-confirm]','[data-import-close]','[data-csv-options]','[data-csv-channel]','[data-csv-template]','[data-csv-zone-field]','[data-csv-zone]'].map(k=>[k,element()]));
 const dialog={open:false,querySelector:k=>nodes[k],events:{},addEventListener(k,f){this.events[k]=f},showModal(){this.open=true},close(){this.open=false}};
 const state={...createDemoState(new Date('2030-01-01')),posts:[],settings:{timezone:'Europe/Berlin'}};
 const origin=element();globalThis.document={activeElement:origin,createElement:element};
 const ui=createPlannerImportUI({dialog,getState:()=>state,canOpen:()=>true,save});
 const file=(text='Text,Tags\nHello,Label',name='drafts.csv')=>{const b=new TextEncoder().encode(text);return{name,size:b.byteLength,arrayBuffer:async()=>b.buffer}};
 const select=async(text,name)=>{nodes.input.files=[file(text,name)];await nodes.input.onchange()};
 const channel=async(value='mastodon')=>{nodes['[data-csv-channel]'].value=value;await nodes['[data-csv-channel]'].onchange()};
 return{ui,nodes,dialog,state,origin,file,select,channel};
}
test('CSV requires explicit channel, preserves full literal preview, writes only once on confirmation',async()=>{
 let saves=0,snapshot;const h=harness(async s=>{saves++;snapshot=s});h.ui.open();await h.select('Text,Tags\n"<script>literal</script>\nsecond line",Label');
 assert.equal(h.nodes['[data-csv-options]'].hidden,false);assert.equal(h.nodes['[data-import-confirm]'].disabled,true);assert.equal(saves,0);assert.match(h.nodes['[data-import-status]'].textContent,/1 Entwurf/);
 await h.channel();assert.equal(h.nodes['[data-import-confirm]'].disabled,false);assert.match(h.nodes['[data-import-list]'].children[0].textContent,/<script>literal<\/script>\nsecond line/);assert.match(h.nodes['[data-import-list]'].children[0].textContent,/Labels: Label/);assert.equal(saves,0);
 await h.nodes['[data-import-confirm]'].onclick();await h.nodes['[data-import-confirm]'].onclick();assert.equal(saves,1);assert.equal(snapshot.posts[0].status,'draft');assert.deepEqual(snapshot.posts[0].channels,['mastodon']);assert.equal(snapshot.posts[0].scheduledInstant,null);
});
test('CSV cancel and reopen clear selected channel and preview, preserve source state and focus',async()=>{
 let saves=0;const h=harness(async()=>saves++),before=structuredClone(h.state);h.ui.open();await h.select();await h.channel();h.dialog.events.cancel({preventDefault(){}});assert.equal(h.dialog.open,false);assert.equal(h.origin.focusCount,1);assert.deepEqual(h.state,before);
 h.ui.open();assert.equal(h.nodes['[data-csv-channel]'].value,'');assert.equal(h.nodes['[data-import-confirm]'].disabled,true);assert.equal(h.nodes['[data-csv-options]'].hidden,true);assert.equal(saves,0);
});
test('disabled channels are omitted and cannot be smuggled through the selector',async()=>{
 const h=harness();h.state.channels.find(c=>c.id==='mastodon').enabled=false;h.ui.open();assert.equal(h.nodes['[data-csv-channel]'].children.some(x=>x.value==='mastodon'),false);await h.select();await h.channel();assert.equal(h.nodes['[data-import-confirm]'].disabled,true);assert.match(h.nodes['[data-import-status]'].textContent,/Aktiven Kanal/);
});
test('changing channel rebuilds an explicit preview and never reuses the old target',async()=>{
 let saved;const h=harness(async s=>saved=s);h.ui.open();await h.select();await h.channel('mastodon');await h.channel('linkedin');await h.nodes['[data-import-confirm]'].onclick();assert.deepEqual(saved.posts[0].channels,['linkedin']);
});
test('invalid CSV is rejected before asking for a channel and cannot partially save',async()=>{
 let saves=0;const h=harness(async()=>saves++);h.ui.open();await h.select('Text,Image URL\nGood,\nBad,https://example.invalid/a.png');assert.equal(h.nodes['[data-import-confirm]'].disabled,true);assert.match(h.nodes['[data-import-status]'].textContent,/Eintrag 2/);await h.channel();await h.nodes['[data-import-confirm]'].onclick();assert.equal(saves,0);
});
test('unknown file format never guesses CSV or JSON data',async()=>{
 const h=harness();h.ui.open();await h.select('Text\nHello','example.xlsx');assert.equal(h.nodes['[data-import-confirm]'].disabled,true);assert.match(h.nodes['[data-import-status]'].textContent,/JSON/);
});
test('CSV uncertain save locks file/channel/retry until reload, including after reopen',async()=>{
 let saves=0,reject;const h=harness(()=>{saves++;return new Promise((_,r)=>reject=r)});h.ui.open();await h.select();await h.channel();const pending=h.nodes['[data-import-confirm]'].onclick();h.nodes['[data-import-close]'].onclick();assert.equal(h.dialog.open,true);assert.equal(h.nodes.input.disabled,true);assert.equal(h.nodes['[data-csv-channel]'].disabled,true);await h.channel('linkedin');await h.nodes['[data-import-confirm]'].onclick();assert.equal(saves,1);reject(Error('Unknown'));await pending;assert.match(h.nodes['[data-import-status]'].textContent,/Unklar, ob gespeichert/);h.nodes['[data-import-close]'].onclick();h.ui.open();await h.select();await h.channel();await h.nodes['[data-import-confirm]'].onclick();assert.equal(saves,1);assert.equal(h.nodes.input.disabled,true);
});
test('CSV canonical revision change before confirmation blocks without a write',async()=>{
 let saves=0;const h=harness(async()=>saves++);h.ui.open();await h.select();await h.channel();h.state.revision++;await h.nodes['[data-import-confirm]'].onclick();assert.equal(saves,0);assert.match(h.nodes['[data-import-status]'].textContent,/geändert/);
});
test('late CSV digest cannot revive a preview after cancel',async t=>{
 const original=crypto.subtle.digest.bind(crypto.subtle);let release;const gate=new Promise(r=>release=r);t.mock.method(crypto.subtle,'digest',async(...args)=>{const result=await original(...args);await gate;return result});const h=harness();h.ui.open();await h.select();const pending=h.channel();h.nodes['[data-import-close]'].onclick();h.ui.open();release();await pending;assert.equal(h.nodes['[data-import-confirm]'].disabled,true);assert.equal(h.nodes['[data-import-list]'].children.length,0);
});
test('late digest cannot replace a newer chosen channel',async t=>{
 const original=crypto.subtle.digest.bind(crypto.subtle);let release,first=true;const gate=new Promise(r=>release=r);t.mock.method(crypto.subtle,'digest',async(...args)=>{const wait=first;first=false;const result=await original(...args);if(wait)await gate;return result});let saved;const h=harness(async s=>saved=s);h.ui.open();await h.select();const pending=h.channel('mastodon');await h.channel('linkedin');release();await pending;await h.nodes['[data-import-confirm]'].onclick();assert.deepEqual(saved.posts[0].channels,['linkedin']);
});
test('state changed during hashing cannot produce an apparently current preview',async t=>{
 const original=crypto.subtle.digest.bind(crypto.subtle);let release;const gate=new Promise(r=>release=r);t.mock.method(crypto.subtle,'digest',async(...args)=>{const result=await original(...args);await gate;return result});const h=harness();h.ui.open();await h.select();const pending=h.channel();h.state.revision++;release();await pending;assert.equal(h.nodes['[data-import-confirm]'].disabled,true);assert.match(h.nodes['[data-import-status]'].textContent,/geändert/);
});
test('CSV template downloads only synthetic content and releases its object URL even on click failure',async t=>{
 for(const throws of [false,true]){const h=harness();let blob,revoked,scheduled,removed=false;const link={click(){if(throws)throw Error('download denied')},remove(){removed=true}};document.createElement=()=>link;document.body={append(){}};t.mock.method(URL,'createObjectURL',b=>{blob=b;return 'blob:synthetic-template'});t.mock.method(URL,'revokeObjectURL',u=>revoked=u);t.mock.method(globalThis,'setTimeout',fn=>{scheduled=fn});h.nodes['[data-csv-template]'].onclick();assert.equal(link.download,'takt-textentwuerfe.csv');assert.equal(removed,true);assert.equal(parseDraftCSV(await blob.text()).length,2);assert.match(await blob.text(),/^Text,Tags,Posting Time|^\uFEFFText,Tags,Posting Time/);scheduled();assert.equal(revoked,'blob:synthetic-template');t.mock.restoreAll();}
});

test('timed CSV requires explicitly selected zone and previews local time, zone and offset with a draft',async()=>{
 let saved,options;const h=harness(async(s,expected,opts)=>{saved=s;options={expected,...opts}});h.ui.open();await h.select('Text,Posting Time\nDraft,\n"<img onerror=evil> Full text",2030-04-06 09:00');
 assert.equal(h.nodes['[data-csv-zone-field]'].hidden,false);assert.equal(h.nodes['[data-csv-zone]'].value,'');assert.equal(h.nodes['[data-import-status]'].textContent,'1 Entwurf · 1 Termin');await h.channel();assert.equal(h.nodes['[data-import-confirm]'].disabled,true);
 h.nodes['[data-csv-zone]'].value='Europe/Berlin';await h.nodes['[data-csv-zone]'].onchange();assert.equal(h.nodes['[data-import-confirm]'].disabled,false);assert.match(h.nodes['[data-import-list]'].children[1].textContent,/<img onerror=evil> Full text.*2030-04-06 09:00 Europe\/Berlin.*GMT\+2/);
 await h.nodes['[data-import-confirm]'].onclick();assert.deepEqual(saved.posts.map(p=>p.status),['draft','scheduled']);assert.equal(saved.settings.timezone,'Europe/Berlin');assert.equal(options.requireFuture,true);assert.equal(Object.values(options.expected)[0],'2030-04-06T07:00:00.000Z');
});
test('blank Posting Time does not require a zone; zone control is hidden',async()=>{
 const h=harness();h.ui.open();await h.select('Text,Posting Time\nDraft,');await h.channel();assert.equal(h.nodes['[data-csv-zone-field]'].hidden,true);assert.equal(h.nodes['[data-import-confirm]'].disabled,false);
});
test('changing explicit zone rebuilds UTC preview, changing file requires a new zone choice',async()=>{
 let saved,expected;const h=harness(async(s,e)=>{saved=s;expected=e});h.ui.open();await h.select('Text,Posting Time\nOne,2030-04-06 09:00');await h.channel();const zone=h.nodes['[data-csv-zone]'];zone.value='Europe/Berlin';await zone.onchange();zone.value='America/New_York';await zone.onchange();assert.match(h.nodes['[data-import-list]'].children[0].textContent,/America\/New_York.*GMT-4/);
 await h.select('Text,Posting Time\nOther,2030-04-06 09:00');assert.equal(zone.value,'');assert.equal(h.nodes['[data-import-confirm]'].disabled,true);zone.value='America/New_York';await zone.onchange();await h.nodes['[data-import-confirm]'].onclick();assert.equal(saved.posts[0].timeZone,'America/New_York');assert.equal(Object.values(expected)[0],'2030-04-06T13:00:00.000Z');assert.equal(saved.settings.timezone,'Europe/Berlin');
});
test('timed confirmation rechecks the advancing clock before save and invalidates expired preview',async t=>{
 t.mock.timers.enable({apis:['Date'],now:Date.parse('2030-01-01T00:00:00.000Z')});let saves=0;const h=harness(async()=>saves++);h.ui.open();await h.select('Text,Posting Time\nOne,2030-01-01 00:01');await h.channel();h.nodes['[data-csv-zone]'].value='UTC';await h.nodes['[data-csv-zone]'].onchange();assert.equal(h.nodes['[data-import-confirm]'].disabled,false);
 t.mock.timers.setTime(Date.parse('2030-01-01T00:01:00.000Z'));await h.nodes['[data-import-confirm]'].onclick();assert.equal(saves,0);assert.match(h.nodes['[data-import-status]'].textContent,/Zukunft/);assert.equal(h.nodes['[data-import-confirm]'].disabled,true);
});
test('cancel/reopen clears zone and late digest from older zone cannot replace current preview',async t=>{
 const original=crypto.subtle.digest.bind(crypto.subtle);let release,first=true;const gate=new Promise(r=>release=r);t.mock.method(crypto.subtle,'digest',async(...args)=>{const wait=first;first=false;const result=await original(...args);if(wait)await gate;return result});let saved;const h=harness(async s=>saved=s);h.ui.open();await h.select('Text,Posting Time\nOne,2030-04-06 09:00');await h.channel();const zone=h.nodes['[data-csv-zone]'];zone.value='Europe/Berlin';const pending=zone.onchange();zone.value='America/New_York';await zone.onchange();release();await pending;await h.nodes['[data-import-confirm]'].onclick();assert.equal(saved.posts[0].timeZone,'America/New_York');
 const fresh=harness();fresh.ui.open();await fresh.select('Text,Posting Time\nOne,2030-04-06 09:00');await fresh.channel();fresh.nodes['[data-csv-zone]'].value='UTC';await fresh.nodes['[data-csv-zone]'].onchange();fresh.nodes['[data-import-close]'].onclick();fresh.ui.open();assert.equal(fresh.nodes['[data-csv-zone]'].value,'');assert.equal(fresh.nodes['[data-csv-zone-field]'].hidden,true);assert.equal(fresh.nodes['[data-import-confirm]'].disabled,true);
});
test('pending timed write disables zone and rejects duplicate confirmation or dismiss',async()=>{
 let saves=0,release;const gate=new Promise(r=>release=r);const h=harness(async()=>{saves++;await gate});h.ui.open();await h.select('Text,Posting Time\nOne,2030-04-06 09:00');await h.channel();h.nodes['[data-csv-zone]'].value='UTC';await h.nodes['[data-csv-zone]'].onchange();const pending=h.nodes['[data-import-confirm]'].onclick();assert.equal(h.nodes['[data-csv-zone]'].disabled,true);h.nodes['[data-csv-zone]'].value='Europe/Berlin';await h.nodes['[data-csv-zone]'].onchange();await h.nodes['[data-import-confirm]'].onclick();h.dialog.events.cancel({preventDefault(){}});assert.equal(h.dialog.open,true);assert.equal(saves,1);release();await pending;
});

for(const [label,error,known] of [
 ['typed prewrite elapsed',new PlannerClientError('private details',400,'IMPORT_TIME_ELAPSED'),true],
 ['wrong status',new PlannerClientError('private details',500,'IMPORT_TIME_ELAPSED'),false],
 ['lookalike object',Object.assign(Error('private details'),{status:400,code:'IMPORT_TIME_ELAPSED'}),false],
 ['other validation',new PlannerClientError('private details',400,'INVALID_IMPORT_EXPECTATION'),false]
])test(`CSV elapsed error classification: ${label}`,async()=>{
 let saves=0;const h=harness(async()=>{saves++;throw error});h.ui.open();await h.select('Text,Posting Time\nOne,2030-04-06 09:00');await h.channel();h.nodes['[data-csv-zone]'].value='UTC';await h.nodes['[data-csv-zone]'].onchange();await h.nodes['[data-import-confirm]'].onclick();assert.equal(h.nodes['[data-import-status]'].textContent,known?'Termin vergangen. Nichts importiert.':'Unklar, ob gespeichert. Neu laden und Einträge prüfen.');assert.equal(h.nodes['[data-csv-zone]'].disabled,true);h.nodes['[data-import-close]'].onclick();h.ui.open();assert.equal(h.nodes['[data-csv-zone]'].disabled,true);await h.nodes['[data-import-confirm]'].onclick();assert.equal(saves,1);
});
