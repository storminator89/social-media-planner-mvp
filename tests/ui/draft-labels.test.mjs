import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDraftLabelsUI,exactLabel,parseAddedLabels} from '../../public/draft-labels-ui.js';
const schedule={schemaVersion:1,timezone:'Europe/Berlin',paused:false,minimumGapMinutes:0,overlapChoice:'reject',slots:[{id:'mon',weekday:1,time:'10:00'}]};
const draft=(id,extra={})=>({id,title:'',text:'Saved '+id,channels:['bluesky'],variantTexts:{bluesky:'Exact '+id+'\n<img src=x onerror=alert(1)>'},status:'draft',scheduledAt:null,scheduledInstant:null,scheduleBinding:null,timeZone:'UTC',media:null,tags:[],createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z',...extra});
const base=()=>({schemaVersion:2,revision:7,settings:{timezone:'Europe/Berlin'},channels:[{id:'bluesky',name:'Bluesky',enabled:true,postingSchedule:structuredClone(schedule)}],posts:[draft('one'),draft('two'),draft('multi',{channels:['bluesky','linkedin']}),draft('none',{channels:[]})]});
function harness(t,{prepare,save,onSaved,canOpen}={}){
 const previous=globalThis.document;let writes=0,preparations=[],applied=[];const state=base(),context={view:'drafts',channel:'all',query:'',postTag:'',revision:7};
 class El{
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.events={};this.disabled=false;this.hidden=false;this.open=false;this.isConnected=true;this.text='';}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=nodes;this.text='';}
  set textContent(v){this.replaceChildren();this.text=String(v);}
  get textContent(){return this.text+this.children.map(n=>n.textContent).join('');}
  set innerHTML(v){assert.fail('Batch UI must not parse user content as HTML');}
  addEventListener(name,fn){this.events[name]=fn;}
  fire(name){const event={preventDefault(){this.prevented=true;},target:this};this.events[name]?.(event);this['on'+name]?.(event);return event;}
  setAttribute(k,v){this[k]=String(v);}
  querySelectorAll(tag){return this.children.flatMap(c=>[...(c.tagName===tag.toUpperCase()?[c]:[]),...c.querySelectorAll(tag)]);}
  focus(){if(!this.disabled&&!this.hidden)document.activeElement=this;}
  showModal(){this.open=true;}
  close(){this.open=false;this.fire('close');}
 }
 const nodes={};for(const key of ['list','status','close','preview','confirm','back','fields','remove','add'])nodes[key]=new El(key==='list'?'ol':'button');
 const dialog=new El('dialog');dialog.querySelector=selector=>nodes[selector.match(/data-label-(.*)\]/)[1]];
 dialog.append(...Object.values(nodes));
 const opener=new El('button'),fallback=new El('main');globalThis.document={activeElement:opener,createElement:tag=>new El(tag)};t.after(()=>globalThis.document=previous);
 const preview=(ui,{postIds})=>({token:'token',revision:ui.revision,entries:postIds.map(id=>({postId:id,title:'Title '+id,text:'Text',before:[' A\r\nB ', 'e\u0301'],after:[' A\r\nB ', 'e\u0301','Winter'],changed:true}))});
 const ui=createDraftLabelsUI({dialog,cancel:()=>{},getState:()=>state,getContext:()=>context,canOpen:canOpen||(()=>true),prepare:(s,o)=>{preparations.push(o.postIds);return prepare?prepare(s,o):preview(s,o);},save:async(s,p)=>{writes++;return save?save(s,p):{...s,revision:s.revision+1};},onSaved:result=>{applied.push(result);onSaved?.(result);},fallbackFocus:()=>fallback});
 return {ui,nodes,dialog,state,context,opener,fallback,get writes(){return writes;},preparations,applied,open:(ids=['one','two','multi','none'])=>ui.open(ids),select(index,checked=true){const input=nodes.list.querySelectorAll('input')[index];input.checked=checked;input.fire('change');return input;},preview:()=>nodes.preview.onclick(),confirm:()=>nodes.confirm.onclick(),cancel:()=>nodes.close.onclick()};
}
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
test('changing selection clears old preview; unselected drafts never enter the confirmed plan',async t=>{
 const h=harness(t);h.open();h.select(0);h.preview();h.nodes.back.onclick();assert.equal(h.nodes.confirm.hidden,true);h.select(0,false);h.select(1);h.preview();assert.deepEqual(h.preparations,[['one'],['two']]);await h.confirm();assert.equal(h.writes,1);
});
test('selection and preview cancellation do not persist, Escape returns focus and reopen starts unchecked',t=>{
 const h=harness(t);h.open();h.select(0);h.preview();const event=h.dialog.fire('cancel');assert.equal(event.prevented,true);assert.equal(h.dialog.open,false);assert.equal(h.writes,0);assert.equal(document.activeElement,h.opener);h.open();assert.ok(h.nodes.list.querySelectorAll('input').every(i=>!i.checked));assert.equal(h.nodes.confirm.hidden,true);
});
test('stale full state or filter context invalidates selection at preview and confirm, with no write',async t=>{
 for(const atPreview of [true,false])for(const change of [h=>h.state.revision++,h=>h.state.posts[1].text='new',h=>h.state.channels[0].postingSchedule.paused=true,h=>h.context.channel='linkedin',h=>h.context.query='new',h=>h.context.view='queue']){
  const h=harness(t);h.open();h.select(0);if(!atPreview)h.preview();change(h);if(atPreview)h.preview();else await h.confirm();assert.equal(h.writes,0);assert.equal(h.nodes.confirm.disabled,true);assert.match(h.nodes.status.textContent,/geändert/);
 }
});
test('busy disables every mutation/close, ignores doubleclick/Escape/back and never cancels or retries',async t=>{
 const wait=deferred(),h=harness(t,{save:()=>wait.promise});h.open();h.select(0);h.preview();const pending=h.confirm();assert.equal(h.ui.pending,true);assert.equal(h.dialog['aria-busy'],'true');assert.equal(h.nodes.close.disabled,true);assert.equal(h.nodes.confirm.disabled,true);assert.equal(h.nodes.back.disabled,true);assert.equal(h.nodes.preview.disabled,true);h.cancel();h.dialog.fire('cancel');h.nodes.back.onclick();await h.confirm();assert.equal(h.writes,1);assert.equal(h.dialog.open,true);assert.equal(h.open(),false);wait.resolve({...h.state,revision:8});await pending;assert.equal(h.ui.pending,false);assert.equal(h.writes,1);assert.equal(h.nodes.close.disabled,false);
});
test('uncertain/conflicting saves retain visible preview and state, freeze reopen and never claim no write',async t=>{
 for(const code of ['OFFLINE','INVALID_RESPONSE','REVISION_CONFLICT']){const h=harness(t,{save:async()=>{throw Object.assign(Error('lost'),{code});}}),held=structuredClone(h.state);h.open();h.select(0);h.preview();await h.confirm();assert.equal(h.writes,1);assert.deepEqual(h.state,held);assert.equal(h.applied.length,0);assert.match(h.nodes.status.textContent,/Neu laden/);assert.doesNotMatch(h.nodes.status.textContent,/Nichts|nicht gespeichert/);assert.match(h.nodes.list.textContent,/Nachher:/);h.cancel();assert.equal(h.open(),false);await h.confirm();assert.equal(h.writes,1);}
});
test('render failure after a confirmed commit cannot be described as a failed write or retried',async t=>{
 const h=harness(t,{onSaved:()=>{throw Error('render failed');}});h.open();h.select(0);h.preview();await h.confirm();assert.equal(h.writes,1);assert.match(h.nodes.status.textContent,/Labels gespeichert. Ansicht neu laden/);h.cancel();h.open();await h.confirm();assert.equal(h.writes,1);
});
test('a failed/incomplete preparation has zero writes and enables safe selection correction',t=>{
 for(const prepare of [()=>{throw Error('Kein freier Termin');},()=>({entries:[]})]){const h=harness(t,{prepare});h.open();h.select(0);h.preview();assert.equal(h.writes,0);assert.equal(h.nodes.confirm.disabled,true);assert.equal(h.nodes.preview.disabled,false);assert.equal(document.activeElement,h.nodes.status);}
});
test('exact identities distinguish CRLF, whitespace, composed/decomposed Unicode and hostile labels',()=>{assert.equal(exactLabel(' A\r\nB '),'" A\\r\\nB "');assert.notEqual(exactLabel('é'),exactLabel('e\u0301'));assert.equal(exactLabel('<img>'),'"<img>"');});
test('all visible drafts including multi and no channel start unchecked; preview displays before/after',t=>{const h=harness(t);h.open(['two','multi','none']);assert.equal(h.nodes.list.querySelectorAll('input').length,3);assert.ok(h.nodes.list.querySelectorAll('input').every(i=>!i.checked&&!i.disabled));h.select(2);h.select(0);h.preview();assert.deepEqual(h.preparations,[['two','none']]);assert.match(h.nodes.list.textContent,/Vorher:/);assert.match(h.nodes.list.textContent,/Nachher:/);assert.match(h.nodes.list.textContent,/\\r\\n/);assert.equal(h.writes,0);});

test('new labels preserve quoted spaces, case and Unicode identity without normalizing existing labels',()=>{assert.deepEqual(parseAddedLabels('" A ",A,a,e\u0301,é,"comma,label",A'),[' A ','A','a','e\u0301','é','comma,label']);for(const value of ['A,','"open','"A"oops'])assert.throws(()=>parseAddedLabels(value));});
