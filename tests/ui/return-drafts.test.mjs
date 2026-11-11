import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createReturnDraftsUI,returnDraftProblem} from '../../public/return-drafts-ui.js';
const schedule={schemaVersion:1,timezone:'Europe/Berlin',paused:false,minimumGapMinutes:0,overlapChoice:'reject',slots:[{id:'mon',weekday:1,time:'10:00'}]};
const draft=(id,extra={})=>({id,title:'',text:'Saved '+id,channels:['bluesky'],variantTexts:{bluesky:'Exact '+id+'\n<img src=x onerror=alert(1)>'},status:'scheduled',scheduledAt:'2099-11-01T10:00',scheduledInstant:'2099-11-01T09:00:00.000Z',scheduleBinding:null,timeZone:'UTC',media:null,tags:[],createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z',...extra});
const base=()=>({schemaVersion:2,revision:7,settings:{timezone:'Europe/Berlin'},channels:[{id:'bluesky',name:'Bluesky',enabled:true,postingSchedule:structuredClone(schedule)}],posts:[draft('one'),draft('two'),draft('multi',{channels:['bluesky','linkedin']}),draft('none',{channels:[]})]});
function harness(t,{prepare,save,onSaved,canOpen}={}){
 const previous=globalThis.document;let writes=0,preparations=[],applied=[];const state=base(),context={view:'queue',channel:'all',query:'',postTag:'',revision:7};
 class El{
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.events={};this.disabled=false;this.hidden=false;this.open=false;this.isConnected=true;this.text='';}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=nodes;this.text='';}
  set textContent(v){this.replaceChildren();this.text=String(v);}
  get textContent(){return this.text+this.children.map(n=>n.textContent).join('');}
  set innerHTML(v){assert.fail('Batch UI must not parse user content as HTML');}
  addEventListener(name,fn){this.events[name]=fn;}
  fire(name){const event={preventDefault(){this.prevented=true;},target:this};this.events[name]?.(event);return event;}
  setAttribute(k,v){this[k]=String(v);}
  querySelectorAll(tag){return this.children.flatMap(c=>[...(c.tagName===tag.toUpperCase()?[c]:[]),...c.querySelectorAll(tag)]);}
  focus(){if(!this.disabled&&!this.hidden)document.activeElement=this;}
  showModal(){this.open=true;}
  close(){this.open=false;this.fire('close');}
 }
 const nodes={};for(const key of ['list','status','close','preview','confirm','back'])nodes[key]=new El(key==='list'?'ol':'button');
 const dialog=new El('dialog');dialog.querySelector=selector=>nodes[selector.match(/data-batch-(.*)\]/)[1]];
 const opener=new El('button'),fallback=new El('main');globalThis.document={activeElement:opener,createElement:tag=>new El(tag)};t.after(()=>globalThis.document=previous);
 const preview=(ui,{postIds})=>({token:'token-'+(preparations.length+1),revision:ui.revision,entries:postIds.map((id,i)=>({postId:id,channelId:'bluesky',text:ui.posts.find(p=>p.id===id).variantTexts.bluesky,title:'<b> & '+id,instant:`2099-11-0${i+1}T09:00:00.000Z`,local:`2099-11-0${i+1}T10:00`,timezone:'Europe/Berlin'}))});
 const ui=createReturnDraftsUI({dialog,getState:()=>state,getContext:()=>context,canOpen:canOpen||(()=>true),prepare:(s,o)=>{preparations.push(o.postIds);return prepare?prepare(s,o):preview(s,o);},save:async(s,p)=>{writes++;return save?save(s,p):{...s,revision:s.revision+1};},onSaved:result=>{applied.push(result);onSaved?.(result);},fallbackFocus:()=>fallback});
 return {ui,nodes,dialog,state,context,opener,fallback,get writes(){return writes;},preparations,applied,open:(ids=['one','two','multi','none'])=>ui.open(ids),select(index,checked=true){const input=nodes.list.querySelectorAll('input')[index];input.checked=checked;input.fire('change');return input;},preview:()=>nodes.preview.onclick(),confirm:()=>nodes.confirm.onclick(),cancel:()=>nodes.close.onclick()};
}
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
test('opens only the visible drafts unchecked with concise per-row blockers; no reads or writes',t=>{
 const h=harness(t);assert.equal(h.open(['two','none','multi']),true);assert.equal(h.dialog.open,true);assert.equal(h.preparations.length,0);assert.equal(h.writes,0);assert.equal(h.nodes.preview.disabled,true);assert.equal(document.activeElement,h.nodes.close);
 const inputs=h.nodes.list.querySelectorAll('input');assert.equal(inputs.length,3);assert.ok(inputs.every(i=>!i.checked));assert.equal(inputs[0].disabled,false);assert.equal(inputs[1].disabled,true);assert.equal(inputs[2].disabled,true);assert.match(h.nodes.list.textContent,/Einzelkanal/);assert.match(h.nodes.list.textContent,/Einzelkanal/);
 assert.equal(h.open(),false);h.cancel();assert.equal(document.activeElement,h.opener);
});
test('selection uses visible row order, preview shows each actual time/zone and exact safe text; one confirm',async t=>{
 const h=harness(t);h.open(['two','one']);h.select(1);h.select(0);h.preview();assert.deepEqual(h.preparations,[['two','one']]);assert.equal(h.writes,0);assert.equal(h.nodes.confirm.disabled,false);assert.equal(document.activeElement,h.nodes.back);assert.equal(h.nodes.list.querySelectorAll('time').length,2);assert.match(h.nodes.list.textContent,/Europe\/Berlin/);assert.match(h.nodes.list.textContent,/GMT\+1/);assert.match(h.nodes.list.textContent,/<img src=x onerror=alert\(1\)>/);await h.confirm();assert.equal(h.writes,1);assert.equal(h.applied.length,1);assert.match(h.nodes.status.textContent,/2 Beiträge als Entwürfe gespeichert/);assert.equal(document.activeElement,h.nodes.close);await h.confirm();assert.equal(h.writes,1);
});
test('changing selection clears old preview; unselected drafts never enter the confirmed plan',async t=>{
 const h=harness(t);h.open();h.select(0);h.preview();h.nodes.back.onclick();assert.equal(h.nodes.confirm.hidden,true);h.select(0,false);h.select(1);h.preview();assert.deepEqual(h.preparations,[['one'],['two']]);await h.confirm();assert.equal(h.writes,1);
});
test('selection and preview cancellation do not persist, Escape returns focus and reopen starts unchecked',t=>{
 const h=harness(t);h.open();h.select(0);h.preview();const event=h.dialog.fire('cancel');assert.equal(event.prevented,true);assert.equal(h.dialog.open,false);assert.equal(h.writes,0);assert.equal(document.activeElement,h.opener);h.open();assert.ok(h.nodes.list.querySelectorAll('input').every(i=>!i.checked));assert.equal(h.nodes.confirm.hidden,true);h.dialog.fire('close');assert.equal(h.nodes.preview.disabled,true);
});
test('stale full state or filter context invalidates selection at preview and confirm, with no write',async t=>{
 for(const atPreview of [true,false])for(const change of [h=>h.state.revision++,h=>h.state.posts[1].text='new',h=>h.state.channels[0].postingSchedule.paused=true,h=>h.context.channel='linkedin',h=>h.context.query='new',h=>h.context.view='drafts']){
  const h=harness(t);h.open();h.select(0);if(!atPreview)h.preview();change(h);if(atPreview)h.preview();else await h.confirm();assert.equal(h.writes,0);assert.equal(h.nodes.confirm.disabled,true);assert.match(h.nodes.status.textContent,/geändert/);
 }
});
test('busy disables every mutation/close, ignores doubleclick/Escape/back and never cancels or retries',async t=>{
 const wait=deferred(),h=harness(t,{save:()=>wait.promise});h.open();h.select(0);h.preview();const pending=h.confirm();assert.equal(h.ui.pending,true);assert.equal(h.dialog['aria-busy'],'true');assert.equal(h.nodes.close.disabled,true);assert.equal(h.nodes.confirm.disabled,true);assert.equal(h.nodes.back.disabled,true);assert.equal(h.nodes.preview.disabled,true);h.cancel();h.dialog.fire('cancel');h.nodes.back.onclick();await h.confirm();assert.equal(h.writes,1);assert.equal(h.dialog.open,true);assert.equal(h.open(),false);wait.resolve({...h.state,revision:8});await pending;assert.equal(h.ui.pending,false);assert.equal(h.writes,1);assert.equal(h.nodes.close.disabled,false);
});
test('uncertain/conflicting saves retain visible preview and state, freeze reopen and never claim no write',async t=>{
 for(const code of ['OFFLINE','INVALID_RESPONSE','REVISION_CONFLICT']){const h=harness(t,{save:async()=>{throw Object.assign(Error('lost'),{code});}}),held=structuredClone(h.state);h.open();h.select(0);h.preview();await h.confirm();assert.equal(h.writes,1);assert.deepEqual(h.state,held);assert.equal(h.applied.length,0);assert.match(h.nodes.status.textContent,/Neu laden/);assert.doesNotMatch(h.nodes.status.textContent,/Nichts|nicht gespeichert/);assert.equal(h.nodes.list.querySelectorAll('time').length,1);h.cancel();assert.equal(h.open(),false);await h.confirm();assert.equal(h.writes,1);}
});
test('render failure after a confirmed commit cannot be described as a failed write or retried',async t=>{
 const h=harness(t,{onSaved:()=>{throw Error('render failed');}});h.open();h.select(0);h.preview();await h.confirm();assert.equal(h.writes,1);assert.match(h.nodes.status.textContent,/Entwürfe gespeichert. Ansicht neu laden/);h.cancel();h.open();await h.confirm();assert.equal(h.writes,1);
});
test('a failed/incomplete preparation has zero writes and enables safe selection correction',t=>{
 for(const prepare of [()=>{throw Error('Kein freier Termin');},()=>({entries:[]})]){const h=harness(t,{prepare});h.open();h.select(0);h.preview();assert.equal(h.writes,0);assert.equal(h.nodes.confirm.disabled,true);assert.equal(h.nodes.preview.disabled,false);assert.equal(document.activeElement,h.nodes.status);}
});
test('disconnected opener falls back to a stable focus target',t=>{
 const h=harness(t);h.open();h.opener.isConnected=false;h.cancel();assert.equal(document.activeElement,h.fallback);
});
test('real Queue action captures exactly filtered visible IDs and opens unchecked selection',async()=>{
 const vm=await import('node:vm'),app=readFileSync(new URL('../../public/app.js',import.meta.url),'utf8');let handler,opened,options;
 const context=vm.createContext({document:{addEventListener:(name,fn)=>handler=fn},state:{},channel:'bluesky',query:'campaign',postTag:'label',queueStatus:'past',channelQueue:(state,filters)=>{options=filters;return{rows:[{id:'past-selected'},{id:'visible-fixed'}]};},returnDraftsUI:{open:ids=>opened=ids}});
 vm.runInContext(app.split('\n').find(line=>line.startsWith("document.addEventListener('click',async")),context);await handler({target:{closest:()=>({dataset:{action:'return-drafts'}})}});
 assert.deepEqual(JSON.parse(JSON.stringify(opened)),['past-selected','visible-fixed']);assert.deepEqual(JSON.parse(JSON.stringify(options)),{channel:'bluesky',query:'campaign',tag:'label',status:'past'});
 assert.match(app,/beforeunload[^\n]*returnDraftsUI\?\.pending/);assert.match(app,/keydown[^\n]*return-drafts-dialog/);assert.match(app,/returnDraftsUI\?\.checkState\(\)/);assert.match(app,/store\.cancelReturnDrafts\(preview\)/);
 const html=readFileSync(new URL('../../public/index.html',import.meta.url),'utf8');assert.match(html,/id="return-drafts-dialog" class="info-dialog draft-batch-dialog" aria-labelledby="return-drafts-title"/);
});
