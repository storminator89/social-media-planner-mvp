import test from 'node:test';
import assert from 'node:assert/strict';
import {findNextPostingSlots,selectPostingSlot} from '../../public/workflows/posting-schedules.mjs';
import {createQueueSwapUI} from '../../public/queue-swap-ui.js';
function harness(t,options={}){
 const previous=globalThis.document;let writes=0,cancels=0,prepares=0,applied=0,allowed=true,cancelled=[];
 class El{
  constructor(tag='div'){this.tagName=tag;this.children=[];this.events={};this.disabled=false;this.hidden=false;this.open=false;this.isConnected=true;this.text='';}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=nodes;this.text='';}
  set textContent(v){this.replaceChildren();this.text=String(v);}
  get textContent(){return this.text+this.children.map(n=>n.textContent).join('');}
  set innerHTML(v){assert.fail('Never parse content as HTML');}
  addEventListener(name,fn){this.events[name]=fn;}
  fire(name){const event={preventDefault(){this.prevented=true;}};this.events[name]?.(event);return event;}
  setAttribute(k,v){this[k]=String(v);}
  focus(){if(!this.disabled&&!this.hidden)document.activeElement=this;}
  showModal(){this.open=true;}
  close(){this.open=false;if(!options.queued)this.fire('close');}
  querySelectorAll(tag){return this.children.flatMap(c=>[...(c.tagName===tag?[c]:[]),...c.querySelectorAll(tag)]);}
  contains(node){return this.children.some(c=>c===node||c.contains(node));}
 }
 const nodes={};for(const key of ['list','status','close','confirm','close2','preview'])nodes[key]=new El(key==='list'?'ol':'button');
 const dialog=new El('dialog');dialog.append(...Object.values(nodes));dialog.querySelector=s=>nodes[s.match(/data-swap-(.*)\]/)[1]];dialog.querySelectorAll=()=>[nodes.close,nodes.close2];
 const opener=new El('button'),fallback=new El('main'),outside=new El('input');globalThis.document={activeElement:opener,createElement:tag=>new El(tag)};t.after(()=>globalThis.document=previous);
 const state={revision:7,posts:[],channels:[{id:'bluesky',name:'Bluesky',enabled:true,postingSchedule:{schemaVersion:1,timezone:'UTC',paused:false,minimumGapMinutes:0,overlapChoice:'reject',slots:Array.from({length:7},(_,weekday)=>({id:'day-'+weekday,weekday,time:'09:00'}))}}]},context={view:'queue',channel:'bluesky',dirty:false,query:''};
 for(const id of ['one','two','three']){const proposal=findNextPostingSlots(state,{postId:id,channelIds:['bluesky'],after:'2099-10-01T00:00:00.000Z',displayTimezone:'UTC',limit:1}),choice=selectPostingSlot(state,proposal,proposal.suggestions[0],{now:'2099-10-01T00:00:00.000Z'});state.posts.push({id,text:'Exact '+id,status:'scheduled',channels:['bluesky'],scheduledInstant:choice.scheduledAt,scheduledAt:choice.local,timeZone:'UTC',scheduleBinding:choice.scheduleBinding});}
 const date=n=>({instant:`2099-11-0${n}T09:00:00.000Z`,local:`2099-11-0${n}T10:00`,timezone:'Europe/Berlin'});
 const preview=()=>({token:'t'+prepares,revision:7,postIds:['one','two'],channelId:'bluesky',entries:['one','two'].map((postId,i)=>({postId,channelId:'bluesky',title:'<b>'+postId,text:'Exact '+postId+'\n<img src=x onerror=alert(1)>',from:date(i+1),to:date(2-i),fromBinding:state.posts[i].scheduleBinding,toBinding:state.posts[1-i].scheduleBinding}))});
 const ui=createQueueSwapUI({dialog,getState:()=>state,getContext:()=>context,canOpen:()=>allowed,prepare:(s,o)=>{prepares++;return options.prepare?options.prepare(s,o):preview();},save:async(s,p)=>{writes++;return options.save?options.save(s,p):{...s,revision:8};},cancel:p=>{cancels++;cancelled.push(p);},onSaved:r=>{applied++;options.onSaved?.(r);},fallbackFocus:()=>fallback});
 return {ui,dialog,nodes,state,context,opener,fallback,outside,get writes(){return writes;},get cancels(){return cancels;},get prepares(){return prepares;},cancelled,get applied(){return applied;},set allowed(v){allowed=v;},open:()=>ui.open(state.posts.map(p=>p.id),'bluesky'),choose:(i,checked=true)=>{const input=nodes.list.querySelectorAll('input')[i];input.checked=checked;input.fire('change');},preview:()=>nodes.preview.onclick(),confirm:()=>nodes.confirm.onclick(),cancel:()=>nodes.close.onclick()};
}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}

test('selection starts unchecked, exact two required, third disabled, preview safe and complete',t=>{
 const h=harness(t);assert.equal(h.open(),true);assert.equal(h.prepares,0);assert.ok(h.nodes.list.querySelectorAll('input').every(n=>!n.checked));assert.ok(h.nodes.preview.disabled);h.choose(0);assert.ok(h.nodes.preview.disabled);h.choose(1);assert.equal(h.nodes.preview.disabled,false);assert.equal(h.nodes.list.querySelectorAll('input')[2].disabled,true);h.preview();assert.equal(h.prepares,1);assert.equal(h.writes,0);assert.equal(h.nodes.list.children.length,2);assert.match(h.nodes.list.textContent,/Exact one/);assert.match(h.nodes.list.textContent,/Bisheriger Slot/);assert.match(h.nodes.list.textContent,/Neuer Slot/);assert.match(h.nodes.list.textContent,/Abstand 0 Min/);assert.match(h.nodes.list.textContent,/GMT\+1/);assert.equal(h.nodes.confirm.disabled,false);
});
test('pending save gates duplicate clicks, Escape and closure; commits only once',async t=>{
 const d=deferred(),h=harness(t,{save:()=>d.promise});h.open();h.choose(0);h.choose(1);h.preview();const pending=h.confirm();assert.ok(h.ui.pending);assert.equal(h.cancel(),false);h.dialog.fire('cancel');await h.confirm();assert.equal(h.writes,1);d.resolve({revision:8});await pending;assert.equal(h.applied,1);assert.equal(h.ui.checkState(),true);await h.confirm();assert.equal(h.writes,1);
});
test('stale state, filters, channel or time invalidates without writes',async t=>{
 for(const change of [h=>h.state.revision++,h=>h.state.posts[0].text='dirty',h=>h.context.query='filter',h=>h.context.channel='all',h=>h.allowed=false]){const h=harness(t);h.open();h.choose(0);h.choose(1);h.preview();change(h);await h.confirm();assert.equal(h.writes,0);assert.ok(h.nodes.confirm.disabled);assert.equal(h.cancels,1);}
 const h=harness(t);h.open();h.choose(0);h.choose(1);t.mock.timers.enable({apis:['Date'],now:Date.parse(h.state.posts[0].scheduledInstant)});h.preview();assert.equal(h.prepares,0);assert.ok(h.nodes.confirm.disabled);
});
test('cancel and queued closes discard only owned intents and restore appropriate focus',t=>{
 const h=harness(t,{queued:true});h.open();h.choose(0);h.choose(1);h.preview();h.cancel();assert.equal(h.cancels,1);assert.equal(document.activeElement,h.opener);h.open();h.dialog.fire('close');assert.equal(h.cancels,1);assert.equal(h.dialog.open,true);h.outside.focus();h.cancel();assert.equal(document.activeElement,h.outside);
});
test('unknown save locks with exact preview preserved and no automatic retry',async t=>{
 const h=harness(t,{save:()=>{throw Error('lost');}});h.open();h.choose(0);h.choose(1);h.preview();await h.confirm();assert.equal(h.writes,1);assert.equal(h.nodes.list.children.length,2);assert.match(h.nodes.status.textContent,/Neu laden/);h.cancel();assert.equal(h.open(),false);
});
test('malformed preview, duplicate entries and missing binding fail closed',t=>{
 for(const prepare of [()=>({}),()=>({token:'x',revision:7,postIds:['one','two'],channelId:'bluesky',entries:[]})]){const h=harness(t,{prepare});h.open();h.choose(0);h.choose(1);h.preview();assert.equal(h.writes,0);assert.ok(h.nodes.confirm.disabled);assert.equal(h.cancels,1);}
});
