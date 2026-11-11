import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createArchiveDraftsUI,archiveDraftProblem} from '../../public/archive-drafts-ui.js';
const schedule={schemaVersion:1,timezone:'Europe/Berlin',paused:false,minimumGapMinutes:0,overlapChoice:'reject',slots:[{id:'mon',weekday:1,time:'10:00'}]};
const draft=(id,extra={})=>({id,title:'',text:'Saved '+id,channels:['bluesky'],variantTexts:{bluesky:'Exact '+id+'\n<img src=x onerror=alert(1)>'},status:'draft',scheduledAt:null,scheduledInstant:null,scheduleBinding:null,timeZone:'UTC',mediaItems:[],tags:[],createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z',...extra});
const base=()=>({schemaVersion:2,revision:7,settings:{timezone:'Europe/Berlin'},channels:[{id:'bluesky',name:'Bluesky',enabled:true,postingSchedule:structuredClone(schedule)}],posts:[draft('one'),draft('two'),draft('multi',{channels:['bluesky','linkedin']}),draft('none',{channels:[]})]});
function harness(t,{prepare,save,onSaved,canOpen}={}){
 const previous=globalThis.document;let writes=0,preparations=[],applied=[],cancelled=[];const state=base(),context={view:'drafts',channel:'all',query:'',postTag:'',revision:7};
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
 const preview=(ui,{postIds})=>({token:'token-'+(preparations.length+1),revision:ui.revision,entries:postIds.map(id=>{const p=ui.posts.find(p=>p.id===id);return{postId:id,title:p.title,text:p.text,tags:p.tags,channels:p.channels.map(channelId=>({channelId,text:p.variantTexts[channelId]??p.text,inheritsBody:!Object.hasOwn(p.variantTexts,channelId),mediaItems:p.mediaItems}))};})});
 const ui=createArchiveDraftsUI({dialog,getState:()=>state,getContext:()=>context,canOpen:canOpen||(()=>true),prepare:(s,o)=>{preparations.push(o.postIds);return prepare?prepare(s,o):preview(s,o);},save:async(s,p)=>{writes++;return save?save(s,p):{...s,revision:s.revision+1};},cancel:p=>cancelled.push(p),onSaved:result=>{applied.push(result);onSaved?.(result);},fallbackFocus:()=>fallback});
 return {ui,nodes,dialog,state,context,opener,fallback,get writes(){return writes;},preparations,applied,cancelled,open:(ids=['one','two','multi','none'])=>ui.open(ids),select(index,checked=true){const input=nodes.list.querySelectorAll('input')[index];input.checked=checked;input.fire('change');return input;},preview:()=>nodes.preview.onclick(),confirm:()=>nodes.confirm.onclick(),cancel:()=>nodes.close.onclick()};
}
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};

test('only requested visible rows open unchecked; multichannel and empty-channel drafts remain eligible',t=>{
 const h=harness(t);assert.equal(h.open(['two','none','multi']),true);const inputs=h.nodes.list.querySelectorAll('input');assert.equal(inputs.length,3);assert.ok(inputs.every(i=>!i.checked&&!i.disabled));assert.equal(h.nodes.preview.disabled,true);assert.equal(h.preparations.length,0);assert.equal(h.writes,0);assert.equal(document.activeElement,h.nodes.close);h.cancel();assert.equal(document.activeElement,h.opener);
});
test('full exact selected preview uses visible order, complete texts, all ordered images and explicit empty media/text',async t=>{
 const h=harness(t);h.state.posts[0].tags=[' Tag ','A'];h.state.posts[0].mediaItems=[{id:'b',url:'/api/planner/media/b',alt:'Second & <img>',name:'b.jpg',type:'image/jpeg'},{id:'a',url:'/api/planner/media/a',alt:'First',name:'a.jpg',type:'image/jpeg'}];h.state.posts[2].variantTexts.linkedin='';h.open(['multi','one','two']);h.select(1);h.select(0);h.preview();assert.deepEqual(h.preparations,[['multi','one']]);assert.equal(h.writes,0);assert.equal(h.nodes.confirm.textContent,'2 Entwürfe archivieren');assert.match(h.nodes.list.textContent,/Eigener Text: leer/);assert.match(h.nodes.list.textContent,/Keine Medien/);assert.match(h.nodes.list.textContent,/<img src=x onerror=alert\(1\)>/);assert.deepEqual(h.nodes.list.querySelectorAll('img').map(i=>i.src),['/api/planner/media/b','/api/planner/media/a']);assert.equal(document.activeElement,h.nodes.back);await h.confirm();assert.equal(h.writes,1);assert.equal(h.applied.length,1);assert.equal(h.nodes.status.textContent,'2 Entwürfe archiviert.');assert.equal(document.activeElement,h.nodes.close);await h.confirm();assert.equal(h.writes,1);
});
test('back revokes old preview; changed exact selection requires fresh preview and N confirmation',async t=>{
 const h=harness(t);h.open();h.select(0);h.preview();assert.equal(h.nodes.confirm.textContent,'1 Entwurf archivieren');h.nodes.back.onclick();assert.equal(h.cancelled.length,1);h.select(0,false);h.select(1);h.select(2);h.preview();assert.deepEqual(h.preparations,[['one'],['two','multi']]);assert.equal(h.nodes.confirm.textContent,'2 Entwürfe archivieren');await h.confirm();assert.equal(h.writes,1);
});
test('close, Escape, external close and reopen revoke preview and reset every checkbox without a write',t=>{
 for(const action of [h=>h.cancel(),h=>h.dialog.fire('cancel'),h=>h.dialog.close()]){const h=harness(t);h.open();h.select(0);h.preview();action(h);assert.equal(h.cancelled.length,1);assert.equal(h.dialog.open,false);assert.equal(h.writes,0);h.open();assert.ok(h.nodes.list.querySelectorAll('input').every(i=>!i.checked));assert.equal(h.nodes.confirm.hidden,true);assert.equal(h.nodes.preview.disabled,true);}
});
test('filter, navigation, selected or unrelated state and revision changes invalidate at preview and confirm',async t=>{
 for(const before of [true,false])for(const change of [h=>h.state.revision++,h=>h.state.posts[1].text+='!',h=>h.context.query='other',h=>h.context.channel='linkedin',h=>h.context.postTag='tag',h=>h.context.view='archive',h=>h.context.revision++]){const h=harness(t);h.open();h.select(0);if(!before)h.preview();change(h);if(before)h.preview();else await h.confirm();assert.equal(h.writes,0);assert.equal(h.nodes.confirm.disabled,true);assert.match(h.nodes.status.textContent,/geändert/);if(!before)assert.equal(h.cancelled.length,1);}
});
test('pending disables every control, Escape/back/doubleclick cannot restart; one write only',async t=>{
 const wait=deferred(),h=harness(t,{save:()=>wait.promise});h.open();h.select(0);h.preview();const pending=h.confirm();assert.equal(h.ui.pending,true);assert.equal(h.dialog['aria-busy'],'true');assert.ok(['close','back','confirm','preview'].every(key=>h.nodes[key].disabled));h.cancel();h.dialog.fire('cancel');h.nodes.back.onclick();await h.confirm();assert.equal(h.writes,1);assert.equal(h.dialog.open,true);assert.equal(h.open(),false);assert.equal(h.cancelled.length,0);wait.resolve({...h.state,revision:8});await pending;assert.equal(h.ui.pending,false);assert.equal(h.nodes.close.disabled,false);
});
test('unknown/conflicting result keeps the review visible, locks reopen, and never claims no write',async t=>{
 for(const code of ['OFFLINE','INVALID_RESPONSE','REVISION_CONFLICT']){const h=harness(t,{save:async()=>{throw Object.assign(Error('lost'),{code});}}),held=structuredClone(h.state);h.open();h.select(0);h.preview();const review=h.nodes.list.textContent;await h.confirm();assert.equal(h.writes,1);assert.deepEqual(h.state,held);assert.equal(h.applied.length,0);assert.match(h.nodes.status.textContent,/Neu laden/);assert.doesNotMatch(h.nodes.status.textContent,/Nichts|nicht gespeichert/);assert.equal(h.nodes.list.textContent,review);h.cancel();assert.equal(h.open(),false);await h.confirm();assert.equal(h.writes,1);}
});
test('render exception after confirmed commit reports committed state and does not retry',async t=>{
 const h=harness(t,{onSaved:()=>{throw Error('render');}});h.open();h.select(0);h.preview();await h.confirm();assert.equal(h.writes,1);assert.match(h.nodes.status.textContent,/Entwürfe archiviert. Ansicht neu laden/);h.cancel();h.open();await h.confirm();assert.equal(h.writes,1);
});
test('failed or incomplete preview permits correction with no writes and no lost selection controls',t=>{
 for(const prepare of [()=>{throw Error('Auswahl nicht möglich');},()=>({entries:[]})]){const h=harness(t,{prepare});h.open();h.select(0);h.preview();assert.equal(h.writes,0);assert.equal(h.nodes.confirm.disabled,true);assert.equal(h.nodes.preview.disabled,false);assert.equal(h.nodes.list.querySelectorAll('input').length,4);assert.equal(document.activeElement,h.nodes.status);}
});
test('non-drafts are blocked and source caps/duplicates/missing IDs cannot open',t=>{
 const h=harness(t);h.state.posts[0].status='scheduled';h.open();const input=h.nodes.list.querySelectorAll('input')[0];assert.equal(input.disabled,true);h.select(0);assert.equal(h.nodes.preview.disabled,true);h.cancel();for(const ids of [[],['missing'],['one','one'],Array.from({length:101},(_,i)=>String(i))])assert.equal(h.open(ids),false);assert.equal(h.writes,0);
});
test('disconnected opener returns focus to stable fallback',t=>{const h=harness(t);h.open();h.opener.isConnected=false;h.cancel();assert.equal(document.activeElement,h.fallback);});
test('real app captures exact currently filtered rows inside existing disclosure and guards pending/hotkeys/reload/workspace',async()=>{
 const vm=await import('node:vm'),app=readFileSync(new URL('../../public/app.js',import.meta.url),'utf8');let handler,opened;
 const context=vm.createContext({document:{addEventListener:(name,fn)=>handler=fn},relevantPosts:()=>[{id:'second',updatedAt:'2026-01-01'},{id:'first',updatedAt:'2026-01-02'}],archiveDraftsUI:{open:ids=>opened=ids}});vm.runInContext(app.split('\n').find(line=>line.startsWith("document.addEventListener('click',async")),context);await handler({target:{closest:()=>({dataset:{action:'archive-drafts'}})}});assert.deepEqual(JSON.parse(JSON.stringify(opened)),['first','second']);
 assert.match(app,/<summary>Mehrere bearbeiten<\/summary>[^\n]*data-action="archive-drafts"/);assert.match(app,/archiveDraftsUI\?\.checkState\(\)/);assert.match(app,/beforeunload[^\n]*archiveDraftsUI\?\.pending/);assert.match(app,/keydown[^\n]*archive-drafts-dialog/);assert.match(app,/store\.cancelArchiveDrafts\(preview\)/);assert.match(app,/if\(store.mutationRequiresReload\)\{workspaceUI\?\.destroy\(\);\$\('#open-workspaces'\).disabled=true;/);
 const html=readFileSync(new URL('../../public/index.html',import.meta.url),'utf8'),css=readFileSync(new URL('../../public/draft-batch.css',import.meta.url),'utf8');assert.match(html,/id="archive-drafts-dialog" class="info-dialog draft-batch-dialog" aria-labelledby="archive-drafts-title"/);assert.match(html,/Archivierte Beiträge zählen weiterhin zum Limit von 100 Beiträgen/);assert.match(css,/#archive-drafts-dialog .draft-batch-list p\{max-height:none/);
});

test('native close gap before queued close event cannot trigger a hidden confirm or preview',async t=>{
 const h=harness(t);h.open();h.select(0);h.preview();h.dialog.open=false;await h.confirm();assert.equal(h.writes,0);h.dialog.fire('close');assert.equal(h.cancelled.length,1);
 h.open();h.select(0);const count=h.preparations.length;h.dialog.open=false;h.preview();assert.equal(h.preparations.length,count);
});
test('success remains successful across subsequent state renders and new dialogs begin fresh',async t=>{
 const h=harness(t,{onSaved:result=>{h.state.revision=result.revision;h.state.posts[0].status='archived';}});h.open();h.select(0);h.preview();await h.confirm();assert.equal(h.nodes.status.textContent,'1 Entwurf archiviert.');assert.equal(h.ui.checkState(),true);assert.equal(h.nodes.status.textContent,'1 Entwurf archiviert.');h.cancel();h.open(['two']);assert.equal(h.nodes.status.textContent,'0 ausgewählt');h.state.revision++;assert.equal(h.ui.checkState(),false);
});
