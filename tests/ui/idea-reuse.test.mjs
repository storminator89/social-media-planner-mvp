import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createIdeaReuse} from '../../public/idea-reuse.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
function harness({save,onSaved}={}){
 const context={state:{revision:7,posts:[{id:'idea',status:'idea',title:'Exact',text:'Text',tags:[' A ']}]},view:'ideas',query:'',ideaTag:'',navigation:0,busy:false};
 const writes=[],busy=[],saved=[],notices=[];let failures=0;
 const ui=createIdeaReuse({getContext:()=>context,save:(state,options)=>{writes.push([structuredClone(state),options]);return save?save(state,options):Promise.resolve({state:{...state,revision:8},copyId:'fresh-draft'});},setBusy:value=>{busy.push(value);context.busy=value;},onSaved:(result,options)=>{saved.push([result,options]);onSaved?.(result,options);},onFailure:()=>failures++,notify:m=>notices.push(m)});
 return{ui,context,writes,busy,saved,notices,get failures(){return failures;}};
}
test('one saved idea is reused deliberately and only the returned fresh ID is handed to composer',async()=>{
 const h=harness();assert.equal(h.ui.available(),true);assert.equal(await h.ui.run('idea'),true);assert.equal(h.writes.length,1);assert.deepEqual(h.writes[0][1],{postId:'idea'});assert.equal(h.saved[0][0].copyId,'fresh-draft');assert.equal(h.saved[0][1].open,true);assert.deepEqual(h.busy,[true,false]);assert.match(h.notices[0],/Idee bleibt erhalten/);
});
test('in-flight doubleclick issues one write and leaves pending guard until receipt',async()=>{
 const gate=deferred(),h=harness({save:()=>gate.promise}),pending=h.ui.run('idea');assert.equal(h.ui.pending,true);assert.equal(h.ui.available(),false);assert.equal(await h.ui.run('idea'),false);assert.equal(h.writes.length,1);gate.resolve({state:h.context.state,copyId:'fresh'});await pending;assert.equal(h.ui.pending,false);assert.equal(h.saved.length,1);
});
for(const [name,change] of Object.entries({navigation:h=>h.context.navigation++,view:h=>h.context.view='archive',query:h=>h.context.query='new',label:h=>h.context.ideaTag='new',state:h=>h.context.state.posts[0].text='new'}))test('late '+name+' is preserved and does not open a composer',async()=>{
 const gate=deferred(),h=harness({save:()=>gate.promise}),pending=h.ui.run('idea');change(h);gate.resolve({state:{revision:8,posts:[]},copyId:'fresh'});await pending;assert.equal(h.saved[0][1].open,false);assert.equal(h.writes.length,1);
});
test('dirty/modal/pending context, wrong view, missing source and cap100 never start',async()=>{
 for(const setup of [h=>h.context.busy=true,h=>h.context.view='drafts',h=>h.context.state.posts[0].status='draft',h=>h.context.state.posts=Array.from({length:100},(_,i)=>({id:i?'other'+i:'idea',status:'idea'}))]){const h=harness();setup(h);assert.equal(await h.ui.run('idea'),false);assert.equal(h.writes.length,0);}
});
test('failed or uncertain write keeps state and locks action without automatic replay',async()=>{
 for(const code of ['OFFLINE','INVALID_RESPONSE','REVISION_CONFLICT']){const h=harness({save:async()=>{throw Object.assign(Error('Neu laden und prüfen.'),{code});}}),before=structuredClone(h.context.state);assert.equal(await h.ui.run('idea'),false);assert.equal(h.ui.locked,true);assert.equal(h.failures,1);assert.equal(h.saved.length,0);assert.deepEqual(h.context.state,before);assert.equal(await h.ui.run('idea'),false);assert.equal(h.writes.length,1);assert.deepEqual(h.busy,[true,false]);}
});
test('presentation failure after confirmed write stays committed and is never retried',async()=>{
 const h=harness({onSaved:()=>{throw Error('render');}});assert.equal(await h.ui.run('idea'),true);assert.equal(h.ui.locked,true);assert.equal(h.failures,0);assert.equal(h.notices[0],'Neuer Entwurf gespeichert. Ansicht neu laden.');await h.ui.run('idea');assert.equal(h.writes.length,1);
});
test('real delegated card action remains secondary with escaped identity and routes to its own controller',async()=>{
 const app=readFileSync(new URL('../../public/app.js',import.meta.url),'utf8');let handler,received;
 const context=vm.createContext({document:{addEventListener:(_name,fn)=>handler=fn},ideaReuseUI:{run:async id=>received=id}});vm.runInContext(app.split('\n').find(line=>line.startsWith("document.addEventListener('click',async")),context);await handler({target:{closest:()=>({dataset:{reuseIdea:'idea'}})}});assert.equal(received,'idea');
 assert.match(app,/Als Beitrag vorbereiten<\/button><button type="button" class="button subtle" data-reuse-idea="\$\{esc\(idea.id\)\}"/);
 assert.match(app,/beforeunload[^\n]*ideaReuseUI\?\.pending/);assert.match(app,/onFailure:[^\n]*store.mutationRequiresReload[^\n]*workspaceUI\?\.destroy/);
 assert.match(app,/onSaved:\(result,\{open\}\)[^\n]*openComposer\(result.copyId\)/);
 assert.match(app,/workspaceUI\?\.editorOpened\(\{sourcePostId:post\?\.id\|\|null,basePlannerRevision/);
 const css=readFileSync(new URL('../../public/editorial-library.css',import.meta.url),'utf8');assert.match(css,/\.idea-card-footer\{display:flex;flex-wrap:wrap;gap:6px\}/);assert.match(css,/\.idea-card-footer .button\{white-space:normal/);
});

test('actual app success wiring uses the fresh post as ordinary composer and workspace origin',()=>{
 const app=readFileSync(new URL('../../public/app.js',import.meta.url),'utf8'),fields=new Map(),origins=[],opened=[];
 const element=id=>{if(!fields.has(id))fields.set(id,{value:'',checked:false,hidden:false,open:false,style:{},setAttribute(){},showModal(){this.open=true;},focus(){}});return fields.get(id);};
 let options;
 const noop=()=>{};
 const fresh={id:'fresh',status:'draft',title:'Copied',text:'Exact copied text',tags:[' A '],channels:[],variantTexts:{},mediaItems:[],cover:null,scheduledAt:null,scheduledInstant:null,scheduleBinding:null,timeZone:'UTC'},idea={...fresh,id:'idea',status:'idea'};
 const ctx=vm.createContext({createIdeaReuse:value=>{options=value;return {available:()=>true};},state:{revision:8,posts:[idea,fresh]},store:{plannerRevision:8},view:'ideas',query:'',postTag:'',channel:'all',ideaTag:'',ideaReuseNavigation:0,ideaReuseUI:null,plannerLoaded:true,localFallback:false,saving:false,workspacePlannerReading:false,workspaceRestoring:false,mediaLoading:false,splitPending:false,
 workspaceUI:{controller:{snapshot:{}},editorOpened:origin=>origins.push(origin)},normalizeState:value=>value,render:noop,history:{replaceState:noop},$:element,$$:()=>[],window:{addEventListener:noop},notify:noop,document:{activeElement:null,querySelector:()=>null},
 structuredClone,videoWorkspaceVersion:2,cancelSavedAlt:noop,savedTextPicker:null,postTemplatePicker:null,closeDraftSplit:noop,composerSavedRevision:null,queuePanel:null,composerGeneration:0,mediaGeneration:0,returnFocus:null,editingId:null,composerChannelMedia:null,channelPreviewIndex:{},composerRestoredWorkspace:false,composerTiming:{open:noop},composerIdeaFingerprint:null,composerBaseText:'',composerVariantTexts:{},activeTextTarget:'base',formatIdeaTags:tags=>tags.join(', '),composerLabelState:null,composerMissingMedia:false,composerImages:{reset:noop,selected:null},composerMedia:null,composerCover:null,renderComposerChannels:noop,addDays:value=>value,zonedNow:()=>new Date(),currentZone:()=> 'UTC',setComposerDate:noop,dateKey:()=> '2026-01-01',populateZoneSelect:noop,renderMediaEditor:noop,renderVariantTabs:noop,renderPreview:noop,editorSnapshot:()=> 'snapshot',initialEditor:null,refreshMastodonPlanningStatus:noop,updateDraftSplitAvailability:noop,requestAnimationFrame:noop,
 });
 const begin=app.indexOf('ideaReuseUI=createIdeaReuse({'),end=app.indexOf('// The first render',begin);vm.runInContext(app.slice(begin,end),ctx);
 const start=app.indexOf('function openComposer('),finish=app.indexOf('\nfunction ',start+1);vm.runInContext(app.slice(start,finish),ctx);
 options.onSaved({state:{revision:8,posts:[idea,fresh]},copyId:'fresh'},{open:true});
 assert.equal(ctx.editingId,'fresh');assert.equal(ctx.composerIdeaFingerprint,null);assert.equal(ctx.composerBaseText,'Exact copied text');assert.deepEqual(JSON.parse(JSON.stringify(origins)),[{sourcePostId:'fresh',basePlannerRevision:8}]);assert.equal(ctx.state.posts.find(p=>p.id==='idea').status,'idea');
});

// Exercise the real app guard with the real workspace state machine. A terminal
// discard retains phase "closing" after close(), which is not an active write.
import {createWorkspaceController} from '../../public/workspace-controller.js';
import {payload as workspacePayload,saved as savedWorkspace,discarded as discardedWorkspace} from './workspace-fixtures.mjs';
function lifecycleHarness({save,discard,read}={}){
 const records={saved:null,discard:null},p=workspacePayload({title:'Copied draft',text:'Copied body',tags:[' Label '],rawTags:' Label ',baselineRenderedTags:' Label ',channels:[],variantTexts:{},date:'',time:'',timeZone:'UTC',activeTextTarget:'base',localMediaOmitted:false});
 let sequence=0;
 const controller=createWorkspaceController({setTimer:()=>1,clearTimer:()=>{},uuid:()=>`test-identifier-${String(++sequence).padStart(6,'0')}`,client:{
  save:async request=>{records.saved=request;return save?save(request):savedWorkspace(request);},
  discard:async request=>{records.discard=request;return discard?discard(request):discardedWorkspace(request);},
  read:async id=>read?read(id):savedWorkspace(records.saved)
 }});
 const workspaceUI={controller,get hasUnsavedLocalInput(){const s=controller.snapshot;return s.open&&(s.dirty||s.localOnly||s.pendingWrite);}};
 let options,writes=0;
 const state={revision:8,posts:[{id:'idea',status:'idea',title:'Original',text:'Original body',tags:[]},{id:'fresh',status:'draft',title:'Copied draft',text:'Copied body',tags:[' Label ']}]};
 const ctx=vm.createContext({state,view:'ideas',query:'',ideaTag:'',ideaReuseNavigation:0,ideaReuseUI:null,plannerLoaded:true,localFallback:false,saving:false,workspacePlannerReading:false,workspaceRestoring:false,mediaLoading:false,splitPending:false,
  workspaceUI,store:{mutationRequiresReload:false,reuseIdea:async()=>{writes++;return {state,copyId:'another-fresh'};}},document:{querySelector:()=>null},$$:()=>[],$:()=>({}),notify(){},createIdeaReuse:value=>{options=value;return createIdeaReuse(value);},normalizeState:value=>value,render(){},history:{replaceState(){}},openComposer(){},postTag:'',channel:'all'});
 const app=readFileSync(new URL('../../public/app.js',import.meta.url),'utf8'),start=app.indexOf('ideaReuseUI=createIdeaReuse({'),end=app.indexOf('// The first render',start);vm.runInContext(app.slice(start,end),ctx);
 return {ctx,controller,records,p,options,get writes(){return writes;},open(workspace=null){controller.open({sourcePostId:'fresh',basePlannerRevision:8,payload:workspace?.payload||p},workspace);},async autosave(){controller.changed({...p,text:'Edited copy'});await controller.save();return controller.snapshot.workspace;},available:()=>ctx.ideaReuseUI.available(),reuse:()=>ctx.ideaReuseUI.run('idea')};
}
for(const recovered of [false,true])test(`actual workspace ${recovered?'recovered':'ordinary'} successful save re-enables reuse without reloading`,async()=>{
 const h=lifecycleHarness();h.open();const workspace=await h.autosave();assert.equal(h.records.saved.sourcePostId,'fresh');
 if(recovered){h.controller.close();assert.equal(h.controller.snapshot.open,false);h.open(workspace);assert.equal(h.controller.snapshot.sourcePostId,'fresh');}
 h.controller.pause();assert.equal(await h.controller.completed(),true);const closed=h.controller.snapshot;assert.equal(closed.phase,'closing');assert.equal(closed.open,false);assert.equal(closed.pendingWrite,false);assert.equal(closed.workspace.state,'discarded');assert.equal(h.available(),true);assert.equal(await h.reuse(),true);assert.equal(h.writes,1);assert.equal(h.ctx.state.posts[0].status,'idea');h.controller.destroy();
});
test('actual no-workspace post save and clean or dirty cancelled editors do not leave a stale reuse lock',async()=>{
 for(const mode of ['no-workspace-save','clean-cancel','dirty-cancel','saved-workspace-close']){
  const h=lifecycleHarness();h.open();if(mode==='saved-workspace-close')await h.autosave();if(mode==='dirty-cancel'){h.controller.changed({...h.p,text:'Unsaved copy'});assert.equal(h.available(),false);}
  if(mode==='no-workspace-save'){h.controller.pause();assert.equal(await h.controller.completed(),true);}else h.controller.close();
  assert.equal(h.controller.snapshot.open,false);assert.equal(h.controller.snapshot.pendingWrite,false);assert.equal(h.available(),true,mode);h.controller.destroy();
 }
});
test('actual pending discard blocks reuse; closing while pending and late receipt cannot remove uncertainty',async()=>{
 const gate=deferred(),h=lifecycleHarness({discard:()=>gate.promise});h.open();await h.autosave();h.controller.pause();const completion=h.controller.completed();assert.equal(h.controller.snapshot.phase,'closing');assert.equal(h.controller.snapshot.open,true);assert.equal(h.controller.snapshot.pendingWrite,true);assert.equal(h.available(),false);assert.equal(await h.reuse(),false);assert.equal(h.writes,0);
 h.controller.close();assert.equal(h.controller.snapshot.open,false);assert.equal(h.controller.snapshot.phase,'uncertain');assert.equal(h.controller.snapshot.pendingWrite,true);assert.equal(h.available(),false);gate.resolve(discardedWorkspace(h.records.discard));await completion;assert.equal(h.available(),false);assert.equal(h.controller.snapshot.pendingWrite,true);h.controller.destroy();
});
test('actual confirmed pending discard permits reuse immediately after its exact receipt',async()=>{
 const gate=deferred(),h=lifecycleHarness({discard:()=>gate.promise});h.open();await h.autosave();h.controller.pause();const completion=h.controller.completed();assert.equal(h.available(),false);gate.resolve(discardedWorkspace(h.records.discard));assert.equal(await completion,true);assert.equal(h.available(),true);assert.equal(await h.reuse(),true);assert.equal(h.writes,1);h.controller.destroy();
});
test('actual lost save or discard remains fenced after editor close, including active reconciliation',async()=>{
 for(const operation of ['save','discard']){
  const check=deferred(),h=lifecycleHarness({[operation]:async()=>{throw Error('Lost reply');},read:()=>check.promise});h.open();await h.autosave();if(operation==='discard'){h.controller.pause();assert.equal(await h.controller.completed(),false);}
  assert.equal(h.controller.snapshot.phase,'uncertain');assert.equal(h.available(),false);h.controller.close();assert.equal(h.controller.snapshot.open,false);assert.equal(h.controller.snapshot.pendingWrite,true);assert.equal(h.available(),false);const reconciling=h.controller.reconcile();assert.equal(h.controller.snapshot.phase,'checking');assert.equal(h.available(),false);check.reject(Error('Still unknown'));await reconciling;assert.equal(h.available(),false);assert.equal(await h.reuse(),false);assert.equal(h.writes,0);h.controller.destroy();
 }
});
test('actual closed conflicting workspace and independent planner fence continue blocking reuse',async()=>{
 const h=lifecycleHarness({save:async()=>{throw Object.assign(Error('conflict'),{status:409});}});h.open();await h.autosave();assert.equal(h.controller.snapshot.phase,'conflict');assert.equal(h.controller.snapshot.pendingWrite,false);h.controller.close();assert.equal(h.available(),false);assert.equal(await h.reuse(),false);assert.equal(h.writes,0);h.controller.destroy();
 const clean=lifecycleHarness();clean.ctx.store.mutationRequiresReload=true;assert.equal(clean.available(),false);assert.equal(await clean.reuse(),false);assert.equal(clean.writes,0);clean.controller.destroy();
});
test('actual held workspace autosave blocks reuse while open and after interrupted close',async()=>{
 const gate=deferred(),h=lifecycleHarness({save:()=>gate.promise});h.open();h.controller.changed({...h.p,text:'New copy input'});const saving=h.controller.save();assert.equal(h.controller.snapshot.phase,'saving');assert.equal(h.controller.snapshot.pendingWrite,true);assert.equal(h.available(),false);assert.equal(await h.reuse(),false);h.controller.close();assert.equal(h.controller.snapshot.phase,'uncertain');assert.equal(h.available(),false);gate.resolve(savedWorkspace(h.records.saved));await saving;assert.equal(h.controller.snapshot.pendingWrite,true);assert.equal(h.available(),false);assert.equal(h.writes,0);h.controller.destroy();
});
