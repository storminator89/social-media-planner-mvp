import test from 'node:test';
import assert from 'node:assert/strict';
import {createQueueReflowUI} from '../../public/queue-reflow-ui.js';
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
  contains(node){return this.children.some(c=>c===node||c.contains(node));}
 }
 const nodes={};for(const key of ['list','status','close','confirm','close2','unchanged','title'])nodes[key]=new El(key==='list'?'ol':'button');
 const dialog=new El('dialog');dialog.append(...Object.values(nodes));dialog.querySelector=s=>nodes[s.match(/data-reflow-(.*)\]/)[1]];dialog.querySelectorAll=()=>[nodes.close,nodes.close2];
 const opener=new El('button'),fallback=new El('main'),outside=new El('input');globalThis.document={activeElement:opener,createElement:tag=>new El(tag)};t.after(()=>globalThis.document=previous);
 const state={revision:7,posts:[{id:'one',text:'A'},{id:'two',text:'B'}],channels:[{id:'bluesky',name:'Bluesky',enabled:true}]},context={view:'queue',channel:'bluesky',dirty:false,query:''};
 const date=n=>({instant:`2099-11-0${n}T09:00:00.000Z`,local:`2099-11-0${n}T10:00`,timezone:'Europe/Berlin'});
 const preview=()=>({token:'t'+prepares,revision:7,unchanged:{fixed:3,past:2},channelId:'bluesky',entries:['two','one'].map((postId,i)=>({postId,channelId:'bluesky',title:'<b>'+postId,text:'Exact '+postId+'\n<img src=x onerror=alert(1)>',from:date(i+1),to:date(2-i)}))});
 const ui=createQueueReflowUI({dialog,getState:()=>state,getContext:()=>context,canOpen:()=>allowed,prepare:(s,o)=>{prepares++;return options.prepare?options.prepare(s,o):preview();},save:async(s,p)=>{writes++;return options.save?options.save(s,p):{...s,revision:8};},cancel:p=>{cancels++;cancelled.push(p);},onSaved:r=>{applied++;options.onSaved?.(r);},fallbackFocus:()=>fallback});
 return {ui,dialog,nodes,state,context,opener,fallback,outside,get writes(){return writes;},get cancels(){return cancels;},get prepares(){return prepares;},cancelled,get applied(){return applied;},set allowed(v){allowed=v;},open:()=>ui.open('bluesky'),confirm:()=>nodes.confirm.onclick(),cancel:()=>nodes.close.onclick()};
}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
test('all affected posts remain in preview order with safe exact text, old/new dates and offsets; no implicit write',t=>{
 const h=harness(t);assert.equal(h.open(),true);assert.equal(h.prepares,1);assert.equal(h.writes,0);assert.equal(h.nodes.list.children.length,2);assert.match(h.nodes.list.children[0].textContent,/<b>twoExact two/);assert.match(h.nodes.list.textContent,/<img src=x onerror=alert\(1\)>/);assert.match(h.nodes.list.textContent,/Bisher:.*GMT\+01:00.*Europe\/Berlin/);assert.match(h.nodes.list.textContent,/Neu:/);assert.equal(document.activeElement,h.nodes.close);assert.equal(h.nodes.confirm.textContent,'Termine übernehmen');assert.equal(h.open(),false);
});
test('both Cancel buttons and Escape discard exactly once without saving and return focus',t=>{
 for(const method of ['close','close2','escape']){const h=harness(t);h.open();if(method==='escape')assert.equal(h.dialog.fire('cancel').prevented,true);else h.nodes[method].onclick();assert.equal(h.writes,0);assert.equal(h.cancels,1);assert.equal(h.dialog.open,false);assert.equal(document.activeElement,h.opener);h.dialog.fire('close');assert.equal(h.cancels,1);assert.equal(h.open(),true);assert.equal(h.prepares,2);}
});
test('full dirty state and context fingerprints invalidate at confirm or render; never writes',async t=>{
 for(const change of [h=>h.state.revision++,h=>h.state.posts[0].text='changed',h=>h.state.channels[0].enabled=false,h=>h.context.dirty=true,h=>h.context.query='new',h=>h.context.view='drafts',h=>h.allowed=false])for(const external of [true,false]){
  const h=harness(t);h.open();change(h);if(external)assert.equal(h.ui.checkState(),false);else await h.confirm();assert.equal(h.writes,0);assert.equal(h.cancels,1);assert.equal(h.nodes.confirm.disabled,true);assert.match(h.nodes.status.textContent,/Neu laden/);h.cancel();assert.equal(h.open(),false);
 }
});
test('busy latch prevents repeat confirms, dismissals and reopening; consumes one intent',async t=>{
 const wait=deferred(),h=harness(t,{save:()=>wait.promise});h.open();const pending=h.confirm();assert.equal(h.ui.pending,true);assert.equal(h.dialog['aria-busy'],'true');assert.ok(h.nodes.close.disabled&&h.nodes.close2.disabled&&h.nodes.confirm.disabled);assert.equal(h.cancel(),false);h.nodes.close2.onclick();h.dialog.fire('cancel');await h.confirm();assert.equal(h.open(),false);assert.equal(h.writes,1);assert.equal(h.cancels,0);assert.equal(h.dialog.open,true);wait.resolve({revision:8});await pending;assert.equal(h.ui.pending,false);assert.equal(h.applied,1);assert.match(h.nodes.status.textContent,/übernommen/);await h.confirm();assert.equal(h.writes,1);h.cancel();assert.equal(h.cancels,0);
});
test('unknown and conflicting outcomes lock until reload and never retry or claim no write',async t=>{
 for(const code of ['OFFLINE','INVALID_RESPONSE','REVISION_CONFLICT']){
  const h=harness(t,{save:async()=>{throw Object.assign(Error('lost'),{code});}});h.open();const before=structuredClone(h.state);await h.confirm();assert.equal(h.writes,1);assert.equal(h.cancels,1);assert.equal(h.applied,0);assert.deepEqual(h.state,before);assert.match(h.nodes.status.textContent,/Neu laden/);assert.doesNotMatch(h.nodes.status.textContent,/nicht gespeichert|Nichts/);assert.equal(h.nodes.list.children.length,2);h.cancel();assert.equal(h.open(),false);await h.confirm();assert.equal(h.writes,1);
 }
});
test('render failure after commit reports committed result but prevents retry',async t=>{
 const h=harness(t,{onSaved:()=>{throw Error('render');}});h.open();await h.confirm();assert.match(h.nodes.status.textContent,/Termine gespeichert. Ansicht neu laden/);assert.equal(h.writes,1);h.cancel();assert.equal(h.open(),false);
});
test('invalid and failed preparation cancels private preview, locks, and has zero writes',t=>{
 for(const prepare of [()=>{throw Error('invalid');},()=>({entries:[]}),()=>({token:'t',revision:7,unchanged:{fixed:3,past:2},channelId:'bluesky',entries:[{postId:'two',channelId:'bluesky',text:'X'}]})]){
  const h=harness(t,{prepare});assert.equal(h.open(),false);assert.equal(h.writes,0);assert.equal(h.cancels,1);assert.equal(h.nodes.confirm.disabled,true);h.cancel();assert.equal(h.open(),false);
 }
});
test('disconnected opener falls back; navigation or another dialog never loses focus',t=>{
 let h=harness(t);h.open();h.opener.isConnected=false;h.cancel();assert.equal(document.activeElement,h.fallback);
 h=harness(t);h.open();h.context.view='drafts';h.outside.focus();h.ui.checkState();h.cancel();assert.equal(document.activeElement,h.outside);
 h=harness(t);h.open();h.outside.focus();h.cancel();assert.equal(document.activeElement,h.outside);
});
test('queued native close event cannot discard newer preview or steal focus',t=>{
 const h=harness(t,{queued:true});h.open();h.cancel();assert.equal(h.cancels,1);h.outside.focus();assert.equal(h.open(),true);h.dialog.fire('close');assert.equal(h.cancels,1);assert.equal(h.nodes.confirm.disabled,false);assert.equal(document.activeElement,h.nodes.close);h.cancel();h.outside.focus();h.dialog.fire('close');assert.equal(document.activeElement,h.outside);assert.equal(h.cancels,2);
});
test('save completion does not steal focus after navigation or a new dialog',async t=>{
 const wait=deferred(),h=harness(t,{save:()=>wait.promise});h.open();const pending=h.confirm();h.context.view='drafts';h.outside.focus();wait.resolve({revision:8});await pending;assert.equal(document.activeElement,h.outside);assert.equal(h.applied,1);
});
test('external closure discards preview and rejects hidden confirmation',async t=>{
 const h=harness(t);h.open();h.dialog.close();assert.equal(h.cancels,1);await h.confirm();assert.equal(h.writes,0);
});

test('cancellation always carries the captured intent token, including failed saves',async t=>{
 const h=harness(t);h.open();h.cancel();assert.equal(h.cancelled[0].token,'t1');h.open();h.cancel();assert.equal(h.cancelled[1].token,'t2');
 const failed=harness(t,{save:async()=>{throw Error('unknown');}});failed.open();await failed.confirm();assert.equal(failed.cancelled[0].token,'t1');
});

test('known preview-domain failures show mapped status and permit a different valid preview without writes',async t=>{
 const problems={SLOT_TAKEN:'Termin bereits belegt.',PAST_TIME:'Zukünftige Termine wählen.',INVALID_BINDING:'Kanalzuordnung prüfen.',SCHEDULE_CHANGED:'Queue-Termine zuerst prüfen.',SCHEDULE_MISSING:'Queue-Termine zuerst prüfen.',CHANNEL_DISABLED:'Kanal zuerst aktivieren.',EXISTING_SCHEDULE_INVALID:'Queue-Termine zuerst prüfen.',REFLOW_LIMIT:'Speichergrenze erreicht.',INVALID_STATE:'Änderungen zuerst speichern.',REFLOW_EMPTY:'Keine zukünftigen Queue-Beiträge.',REFLOW_NO_SLOT:'Nicht genug freie Termine in 60 Tagen.',REFLOW_UNSUPPORTED:'Mehrkanal-Beiträge einzeln prüfen.',REFLOW_QUEUE_INVALID:'Queue-Termine zuerst prüfen.',REFLOW_CHANNEL_REQUIRED:'Posting-Zeiten prüfen.',REFLOW_STATE_CHANGED:'Änderungen zuerst speichern.',REVISION_CONFLICT:'Planung geändert. Neu laden.'};
 for(const [code,message] of Object.entries(problems)){
  const options={prepare:()=>{throw Object.assign(Error('<private raw error>'),{code});}},h=harness(t,options);
  assert.equal(h.open(),false);assert.equal(h.nodes.status.textContent,message);assert.equal(h.nodes.confirm.disabled,true);assert.equal(h.nodes.list.children.length,0);await h.confirm();assert.equal(h.writes,0);assert.equal(h.cancels,1);
  h.cancel();delete options.prepare;assert.equal(h.open(),true);assert.equal(h.nodes.confirm.disabled,false);assert.equal(h.writes,0);await h.confirm();assert.equal(h.writes,1);
 }
});
test('RELOAD_REQUIRED preview failure remains locked, maps exact label and never leaks raw details',t=>{
 const h=harness(t,{prepare:()=>{throw Object.assign(Error('<private raw error>'),{code:'RELOAD_REQUIRED'});}});
 assert.equal(h.open(),false);assert.equal(h.nodes.status.textContent,'Neu laden und Termine prüfen.');assert.equal(h.writes,0);h.cancel();assert.equal(h.open(),false);assert.equal(h.prepares,1);
});

test('own committed revision does not stale-lock completed dialog or subsequent previews',async t=>{
 let h;
 const options={onSaved:result=>{h.state.revision=result.revision;}};
 h=harness(t,options);h.open();await h.confirm();assert.equal(h.state.revision,8);assert.equal(h.ui.checkState(),true);assert.equal(h.nodes.status.textContent,'Termine übernommen.');h.cancel();
 options.prepare=(ui,{channelId})=>({token:'fresh',revision:ui.revision,unchanged:{fixed:0,past:0},channelId,entries:[{postId:'one',channelId,title:'Other post',text:'Exact other text',from:{instant:'2099-11-02T09:00:00Z',local:'2099-11-02T10:00',timezone:'Europe/Berlin'},to:{instant:'2099-11-01T09:00:00Z',local:'2099-11-01T10:00',timezone:'Europe/Berlin'}}]});
 assert.equal(h.ui.open('bluesky'),true);assert.equal(h.ui.checkState(),true);assert.equal(h.nodes.confirm.disabled,false);assert.equal(h.writes,1);
});
test('safe preparation error has no intent to stale-lock when context changes before dismissal',t=>{
 const options={prepare:()=>{throw Object.assign(Error('internal'),{code:'REFLOW_EMPTY'});}},h=harness(t,options);
 h.open();h.context.query='another row';h.state.revision++;assert.equal(h.ui.checkState(),true);assert.equal(h.nodes.status.textContent,'Keine zukünftigen Queue-Beiträge.');h.cancel();h.state.revision=7;delete options.prepare;assert.equal(h.open(),true);
});

function candidate(){
 const time={instant:'2099-11-01T09:00:00.000Z',local:'2099-11-01T10:00',timezone:'Europe/Berlin'};
 return {token:'intent',revision:7,channelId:'bluesky',unchanged:{fixed:3,past:2},entries:[{postId:'one',channelId:'bluesky',title:'Exact title',text:'Exact full text',from:{...time},to:{...time,instant:'2099-11-02T09:00:00.000Z',local:'2099-11-02T10:00'}}]};
}
test('100 records retain every full effective text and both complete timestamps without truncation',t=>{
 const value=candidate(),base=value.entries[0],long='Long <script>unsafe</script> text\n'.repeat(200);
 value.entries=Array.from({length:100},(_,i)=>({...base,postId:'post'+i,title:'Title '+i,text:long+i}));
 const h=harness(t,{prepare:()=>value});assert.equal(h.open(),true);assert.equal(h.nodes.title.textContent,'Queue neu einplanen');assert.equal(h.nodes.status.textContent,'100 Beiträge · Bluesky');assert.equal(h.nodes.unchanged.textContent,'Fest: 3 · Vergangen: 2 · Unverändert');assert.equal(h.nodes.list.children.length,100);
 for(let i=0;i<100;i++){
  const [title,text,from,to]=h.nodes.list.children[i].children;
  assert.equal(title.textContent,'Title '+i);assert.equal(text.textContent,long+i);assert.equal(from.dateTime,base.from.instant);assert.equal(to.dateTime,base.to.instant);
  assert.equal(from.textContent,'Bisher: 2099-11-01 10:00 · GMT+01:00 · Europe/Berlin');assert.equal(to.textContent,'Neu: 2099-11-02 10:00 · GMT+01:00 · Europe/Berlin');
 }
});
test('malformed candidate bindings, duplicate IDs, text fields, counters and timestamps fail closed',async t=>{
 const mutations=[p=>p.token='',p=>p.revision=8,p=>p.channelId='other',p=>p.entries=[],p=>p.entries={},p=>p.entries.push({...p.entries[0]}),p=>p.entries[0].postId=null,p=>p.entries[0].channelId='other',p=>p.entries[0].title=null,p=>p.entries[0].text={},p=>delete p.unchanged,p=>p.unchanged.fixed=-1,p=>p.unchanged.past=1.5,p=>delete p.entries[0].from,p=>p.entries[0].to.instant='2099-02-30T09:00:00.000Z',p=>p.entries[0].to.instant='bad',p=>p.entries[0].from.local='2099-11-01T11:00',p=>p.entries[0].to.timezone='Invalid/Zone',p=>p.entries[0].to.local='tomorrow'];
 for(const mutate of mutations){
  const value=candidate();mutate(value);const h=harness(t,{prepare:()=>value});assert.equal(h.open(),false);assert.equal(h.nodes.list.children.length,0);assert.equal(h.nodes.unchanged.textContent,'');assert.equal(h.nodes.confirm.disabled,true);await h.confirm();assert.equal(h.writes,0);assert.equal(h.cancels,1);h.cancel();assert.equal(h.open(),false);
 }
});
test('preview values are captured and cannot change between rendering and confirmation',async t=>{
 const value=candidate();let saved;
 const h=harness(t,{prepare:()=>value,save:async(s,p)=>{saved=p;return {...s,revision:8};}});
 h.open();value.entries[0].text='changed after preview';value.token='different';await h.confirm();assert.equal(saved.token,'intent');assert.equal(saved.entries[0].text,'Exact full text');
});

test('cancellation retains captured token if producer mutates its result',t=>{
 const value=candidate(),h=harness(t,{prepare:()=>value});h.open();value.token='mutated';h.cancel();assert.equal(h.cancelled[0].token,'intent');assert.equal(h.cancels,1);
});

test('preview count names the concrete channel with an ID fallback',t=>{
 const h=harness(t);h.open();assert.equal(h.nodes.status.textContent,'2 Beiträge · Bluesky');h.cancel();delete h.state.channels[0].name;h.open();assert.equal(h.nodes.status.textContent,'2 Beiträge · bluesky');
});
