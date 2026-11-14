import test from 'node:test';
import assert from 'node:assert/strict';
import {findNextPostingSlots,selectPostingSlot} from '../../public/workflows/posting-schedules.mjs';
import {createDateShiftUI,dateShiftProblem} from '../../public/date-shift-ui.js';
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
 const nodes={};for(const key of ['list','status','close','confirm','back','preview','days'])nodes[key]=new El(key==='list'?'ol':'button');
 const dialog=new El('dialog');dialog.append(...Object.values(nodes));dialog.querySelector=s=>nodes[s.match(/data-shift-(.*)\]/)[1]];dialog.querySelectorAll=()=>[nodes.close,nodes.close2];
 const opener=new El('button'),fallback=new El('main'),outside=new El('input');globalThis.document={activeElement:opener,createElement:tag=>new El(tag)};t.after(()=>globalThis.document=previous);
 const state={revision:7,posts:[],channels:[{id:'bluesky',name:'Bluesky',enabled:true,postingSchedule:{schemaVersion:1,timezone:'UTC',paused:false,minimumGapMinutes:0,overlapChoice:'reject',slots:Array.from({length:7},(_,weekday)=>({id:'day-'+weekday,weekday,time:'09:00'}))}}]},context={view:'queue',channel:'bluesky',dirty:false,query:''};
 for(const [i,id] of ['one','two','three'].entries())state.posts.push({id,text:'Exact '+id,status:'scheduled',channels:['bluesky'],scheduledInstant:`2099-11-0${i+1}T09:00:00.000Z`,scheduledAt:`2099-11-0${i+1}T09:00`,timeZone:'UTC',scheduleBinding:null});
 const date=n=>({instant:`2099-11-0${n}T09:00:00.000Z`,local:`2099-11-0${n}T09:00`,timezone:'UTC'});
 const preview=()=>({token:'t'+prepares,revision:7,postIds:['one','two'],days:1,entries:['one','two'].map((postId,i)=>({postId,channelId:'bluesky',title:'<b>'+postId,text:'Exact '+postId+'<img src=x>',from:date(i+1),to:date(i+2)}))});
 const ui=createDateShiftUI({dialog,getState:()=>state,getContext:()=>context,canOpen:()=>allowed,prepare:(s,o)=>{prepares++;return options.prepare?options.prepare(s,o):preview();},save:async(s,p)=>{writes++;return options.save?options.save(s,p):{...s,revision:8};},cancel:p=>{cancels++;cancelled.push(p);},onSaved:r=>{applied++;options.onSaved?.(r);},fallbackFocus:()=>fallback});
 return {ui,dialog,nodes,state,context,opener,fallback,outside,get writes(){return writes;},get cancels(){return cancels;},get prepares(){return prepares;},cancelled,get applied(){return applied;},set allowed(v){allowed=v;},open:()=>ui.open(state.posts.map(p=>p.id)),choose:(i,checked=true)=>{const input=nodes.list.querySelectorAll('input')[i];input.checked=checked;input.fire('change');},preview:()=>nodes.preview.onclick(),confirm:()=>nodes.confirm.onclick(),cancel:()=>nodes.close.onclick()};
}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}


test('explicit unchecked visible IDs, two minimum, safe full preview and one atomic save',async t=>{const h=harness(t);assert.ok(h.open());assert.ok(h.nodes.list.querySelectorAll('input').every(n=>!n.checked));h.choose(0);assert.ok(h.nodes.preview.disabled);h.choose(1);assert.equal(h.nodes.preview.disabled,false);h.preview();assert.equal(h.writes,0);assert.equal(h.nodes.list.children.length,2);assert.match(h.nodes.list.textContent,/Bisher/);assert.match(h.nodes.list.textContent,/Neu/);assert.match(h.nodes.list.textContent,/UTC/);assert.match(h.nodes.list.textContent,/<img src=x>/);await h.confirm();await h.confirm();assert.equal(h.writes,1);});
test('offset limits and changes invalidate previews without writing',t=>{for(const value of ['0','366','-366','1.5','']){const h=harness(t);h.open();h.choose(0);h.choose(1);h.nodes.days.value=value;h.nodes.days.fire('input');h.preview();assert.equal(h.prepares,0);}const h=harness(t);h.open();h.choose(0);h.choose(1);h.preview();h.nodes.days.value='2';h.nodes.days.fire('input');assert.equal(h.cancels,1);assert.equal(h.writes,0);assert.ok(h.nodes.confirm.disabled);});
test('filters, source changes and elapsed source time invalidate',async t=>{for(const change of [h=>h.context.query='new',h=>h.state.revision++,h=>h.allowed=false]){const h=harness(t);h.open();h.choose(0);h.choose(1);h.preview();change(h);await h.confirm();assert.equal(h.writes,0);assert.equal(h.cancels,1);}const h=harness(t);h.open();h.choose(0);h.choose(1);t.mock.timers.enable({apis:['Date'],now:Date.parse(h.state.posts[0].scheduledInstant)});h.preview();assert.equal(h.prepares,0);});
test('pending prevents double save, Escape and close',async t=>{const d=deferred(),h=harness(t,{save:()=>d.promise});h.open();h.choose(0);h.choose(1);h.preview();const p=h.confirm();await h.confirm();assert.equal(h.cancel(),false);h.dialog.fire('cancel');assert.ok(h.dialog.open);assert.equal(h.writes,1);d.resolve({revision:8});await p;assert.equal(h.applied,1);});
test('unknown save and malformed preview lock without retry',async t=>{const h=harness(t,{save:()=>{throw Error('lost');}});h.open();h.choose(0);h.choose(1);h.preview();await h.confirm();assert.match(h.nodes.status.textContent,/Neu laden/);assert.equal(h.nodes.list.children.length,2);h.cancel();assert.equal(h.open(),false);const b=harness(t,{prepare:()=>({})});b.open();b.choose(0);b.choose(1);b.preview();assert.ok(b.nodes.confirm.disabled);assert.equal(b.cancels,1);});
test('known validation errors keep selection for correction',t=>{const h=harness(t,{prepare:()=>{throw Object.assign(Error('Ortszeit existiert nicht.'),{code:'DST_GAP'});}});h.open();h.choose(0);h.choose(1);h.preview();assert.match(h.nodes.status.textContent,/Ortszeit/);assert.equal(h.nodes.list.children.length,3);assert.equal(h.nodes.days.disabled,false);assert.equal(h.writes,0);});
test('queued close cannot discard reopened dialog or steal outside focus',t=>{const h=harness(t,{queued:true});h.open();h.choose(0);h.choose(1);h.preview();h.cancel();assert.equal(document.activeElement,h.opener);h.open();h.dialog.fire('close');assert.ok(h.dialog.open);h.outside.focus();h.cancel();assert.equal(document.activeElement,h.outside);});
test('exclusions explain queue, multichannel, past, precision and disabled channel',t=>{const h=harness(t);h.state.posts[0].scheduleBinding={};h.state.posts[1].channels.push('x');h.state.posts[2].scheduledInstant='2020-01-01T09:00:00.000Z';h.open();assert.ok(h.nodes.list.querySelectorAll('input').every(n=>n.disabled));assert.match(h.nodes.list.textContent,/Queue-Termin/);assert.match(h.nodes.list.textContent,/Einzelkanal/);assert.match(h.nodes.list.textContent,/Zukunft/);assert.match(dateShiftProblem({...h.state.posts[0],scheduleBinding:null,scheduledInstant:'2099-01-01T09:00:01.000Z'}),/Sekunden/);});
test('50 maximum, and zero eligible still explains exclusions',t=>{const h=harness(t);for(let i=3;i<51;i++)h.state.posts.push({...h.state.posts[0],id:'p'+i});h.open();for(let i=0;i<50;i++)h.choose(i);assert.ok(h.nodes.list.querySelectorAll('input')[50].disabled);h.choose(50);assert.equal(h.nodes.list.querySelectorAll('input')[50].checked,false);const b=harness(t);for(const p of b.state.posts)p.scheduleBinding={};assert.ok(b.open());assert.ok(b.nodes.preview.disabled);assert.match(b.nodes.list.textContent,/Queue-Termin/);});
test('calendar and list wire only visible IDs, context and atomic adapter methods',async()=>{const {readFile}=await import('node:fs/promises');const app=await readFile(new URL('../../public/app.js',import.meta.url),'utf8');assert.match(app,/case'date-shift':dateShiftUI\?\.open\(periodPosts\(relevantPosts\(\)\)\.map\(post=>post.id\)\)/);assert.match(app,/\['calendar','list'\]\.includes\(view\)/);assert.match(app,/getContext:\(\)=>\(\{view,channel,query,postTag,calendarStatus,range,anchor:dateKey\(anchor\),zone:currentZone\(\)\}\)/);assert.match(app,/store\.previewDateShift\(ui,options\)/);assert.match(app,/store\.shiftDates\(ui,preview\)/);});

test('explicit plus sign is accepted as a positive whole day offset',t=>{const h=harness(t);h.open();h.choose(0);h.choose(1);h.nodes.days.value='+1';h.nodes.days.fire('input');assert.equal(h.nodes.preview.disabled,false);h.preview();assert.equal(h.prepares,1);assert.equal(h.nodes.confirm.disabled,false);});


test('date shift keeps post bodies folded and titles compact without losing full text',t=>{
 const h=harness(t);const long='📅'.repeat(100)+'<img src=x>';h.state.posts[0].text=long;h.open();
 const row=h.nodes.list.children[0],disclosure=row.querySelectorAll('details')[0];
 assert.equal(disclosure.open,false);assert.equal(disclosure.children[0].tagName,'summary');
 assert.equal(disclosure.children[0].textContent,'Beitragstext');assert.equal(disclosure.children[1].textContent,long);
 assert.equal(Array.from(row.querySelectorAll('strong')[0].textContent).length,80);
 assert.ok(row.querySelectorAll('strong')[0].textContent.endsWith('…'));
 assert.equal(h.nodes.confirm.hidden,true);assert.equal(h.nodes.preview.hidden,false);
 h.choose(0);h.choose(1);h.preview();
 assert.equal(h.nodes.confirm.hidden,false);assert.equal(h.nodes.preview.hidden,true);
 for(const item of h.nodes.list.children){
  const folded=item.querySelectorAll('details')[0];assert.equal(folded.open,false);
  assert.match(folded.textContent,/<img src=x>/);
  assert.equal(item.querySelectorAll('time').length,2);
  assert.equal(folded.querySelectorAll('time').length,0);
 }
 assert.equal(h.writes,0);h.nodes.back.onclick();
 assert.equal(h.nodes.confirm.hidden,true);assert.equal(h.nodes.preview.hidden,false);
 assert.equal(h.writes,0);
});

test('date shift saving keeps confirmation stable but removes it after success',async t=>{
 const d=deferred(),h=harness(t,{save:()=>d.promise});h.open();h.choose(0);h.choose(1);h.preview();
 const p=h.confirm();assert.equal(h.nodes.confirm.hidden,false);assert.equal(h.nodes.confirm.disabled,true);assert.equal(h.nodes.preview.hidden,true);
 d.resolve({revision:8});await p;assert.equal(h.nodes.confirm.hidden,true);assert.equal(h.nodes.preview.hidden,true);
 assert.match(h.nodes.status.textContent,/Termine verschoben/);assert.equal(h.writes,1);
});
