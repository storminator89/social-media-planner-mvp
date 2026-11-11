import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createPlannerClient} from '../../public/data-client/client.mjs';
import {createTaktStore} from '../../public/data-client/takt-adapter.mjs';
import {handlePlannerRequest} from '../../modules/data/api.mjs';
import {PlannerRepository} from '../../modules/data/repository.mjs';
import {D1TestAdapter,R2TestAdapter,fixture} from '../data/support.mjs';
import {normalizeState,CHANNELS} from '../../public/model.js';
import {createIdea,updateIdea,parseIdeaTags,formatIdeaTags} from '../../public/workflows/ideas.mjs';
import {validateIdea} from '../../public/ideas.js';

const source=readFileSync(process.env.IDEA_DELETE_REVIEW_SOURCE||new URL('../../public/app.js',import.meta.url),'utf8');
function actual(name){const start=source.search(new RegExp(`(?:async )?function ${name}\\(`));assert.ok(start>=0,name);const next=source.slice(start+1).search(/\n(?:async )?function /);return source.slice(start,next<0?undefined:start+1+next);}
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
const clone=value=>structuredClone(value);
async function harness(t){
 const env={DB:new D1TestAdapter(),BUCKET:new R2TestAdapter()};t.after(()=>env.DB.sql.close());const repo=new PlannerRepository(env.DB);await repo.save('synthetic-reviewer',fixture());
 const behavior={mode:'normal'},requests=[],ready=deferred(),gate=deferred();
 const store=createTaktStore({timezone:'Europe/Berlin',channels:CHANNELS,client:createPlannerClient({fetcher:async(path,options={})=>{
  requests.push({path,method:options.method||'GET',body:options.body});
  if(options.method==='PUT'&&behavior.mode==='conflict')return new Response(JSON.stringify({error:{code:'REVISION_CONFLICT',message:'Synthetic conflict'}}),{status:409});
  const response=await handlePlannerRequest(new Request('https://planner.example'+path,{...options,headers:{...options.headers,'oai-authenticated-user-id':'synthetic-reviewer'}}),env);
  if(options.method==='PUT'&&behavior.mode==='delay'){ready.resolve();await gate.promise;}
  if(options.method==='PUT'&&behavior.mode==='lost'){ready.resolve();throw Error('Synthetic lost response after commit');}
  if(options.method==='PUT'&&behavior.mode==='malformed')return new Response('{invalid',{status:200});
  return response;
 }})});
 let state=normalizeState(await store.load());const original=createIdea({id:'idea-original',title:'Original title',text:'Original note',tags:['A, B','Theme'],timezone:'Europe/Berlin',now:'2026-11-09T10:00:00.000Z'});state=normalizeState(await store.save({...state,posts:[...state.posts,original]}));requests.length=0;
 const fields={'#composer':{open:false},'#idea-dialog':{open:true,close(){this.open=false}},'#info-dialog':{open:false,close(){this.open=false}},'#idea-title':{value:original.title},'#idea-text':{value:original.text},'#idea-tags':{value:formatIdeaTags(original.tags)},'#idea-errors':{hidden:true,scrollIntoView(){},focus(){this.focused=true}},'#delete-idea':{hidden:false},'#idea-dialog-title':{textContent:'Idee bearbeiten'},'#search':{value:''},'#main':{focus(){}}};
 const notices=[],warnings=[],recovery=[],locks=[],prepared=[];let created=0,unload;
 const c=vm.createContext({splitPending:false,closeDraftSplit(){},updateDraftSplitAvailability(){},state,store,normalizeState,createIdea,updateIdea,parseIdeaTags,validateIdea,Date,Promise,structuredClone,crypto:{randomUUID:()=>`new-idea-${++created}`},currentZone:()=> 'Europe/Berlin',saving:false,editingIdeaId:original.id,initialIdeaEditor:'',ideaReturnFocus:null,view:'ideas',query:'',ideaTag:'',initialEditor:'',editorSnapshot:()=>'',imageStudio:{hasPendingWork:false},postingTimesUI:null,workspaceUI:null,$:s=>fields[s],$$:()=>[],setIdeaBusy:value=>locks.push(value),render(){},notify:(message,undo)=>notices.push({message,undo}),showInfo:(...args)=>warnings.push(args),showDeletedRecovery:post=>recovery.push(post),beginIdeaPost:id=>prepared.push(id),window:{addEventListener:(name,fn)=>{assert.equal(name,'beforeunload');unload=fn}}});
 for(const name of ['ideaEditorSnapshot','closeIdea','askDiscardIdea','saveIdea','deleteIdea','persist','restoreDeletedPost'])vm.runInContext(actual(name),c);
 c.initialIdeaEditor=c.ideaEditorSnapshot();const unloadSource=source.match(/window\.addEventListener\('beforeunload',e=>\{.*?\}\);/);assert.ok(unloadSource);vm.runInContext(unloadSource[0],c);
 const warning=()=>{let prevented=false;const event={preventDefault:()=>prevented=true};unload(event);return prevented};
 return {c,fields,notices,warnings,recovery,locks,prepared,requests,repo,env,behavior,ready,gate,original,warning,get puts(){return requests.filter(x=>x.method==='PUT').length},get created(){return created}};
}
const changes={title:h=>h.fields['#idea-title'].value='Late title',note:h=>h.fields['#idea-text'].value='Late last sentence',labels:h=>h.fields['#idea-tags'].value='"Late, tag", Campaign'};
for(const [name,change]of Object.entries(changes))test(`real delayed deletion retains newer ${name} as a dirty new idea without another write`,async t=>{
 const h=await harness(t),before=await h.repo.load('synthetic-reviewer');h.behavior.mode='delay';const p=h.c.deleteIdea();await h.ready.promise;assert.equal(h.c.saving,true);change(h);const newer=h.c.ideaEditorSnapshot();h.gate.resolve();await p;
 assert.equal(h.fields['#idea-dialog'].open,true);assert.equal(h.c.editingIdeaId,null);assert.equal(h.c.ideaEditorSnapshot(),newer);assert.notEqual(h.c.initialIdeaEditor,newer);assert.equal(h.fields['#delete-idea'].hidden,true);assert.equal(h.fields['#idea-dialog-title'].textContent,'Idee festhalten');assert.equal(h.puts,1);assert.equal(h.created,0);assert.equal(h.c.saving,false);assert.deepEqual(h.locks,[true,false]);assert.ok(h.warning());
 const after=await h.repo.load('synthetic-reviewer');assert.equal(after.posts.some(p=>p.id==='idea-original'),false);const prior=before.posts.find(p=>p.id==='post-1'),kept=after.posts.find(p=>p.id==='post-1');assert.equal(kept.body,prior.body);assert.equal(kept.scheduledAt,prior.scheduledAt);assert.deepEqual(kept.variants,prior.variants);assert.match(h.notices.at(-1).message,/Neuere Eingaben.*ungespeicherte neue Idee/);h.c.askDiscardIdea();assert.equal(h.warnings.length,1);assert.equal(h.fields['#idea-dialog'].open,true);assert.equal(h.requests.some(x=>x.path.includes('/media')),false);
});
test('reverting fields to the deleted baseline is still unsaved and warns on Close and unload',async t=>{
 const h=await harness(t),originalSnapshot=h.c.initialIdeaEditor;h.behavior.mode='delay';const p=h.c.deleteIdea();await h.ready.promise;changes.note(h);h.gate.resolve();await p;h.fields['#idea-text'].value=h.original.text;assert.equal(h.c.ideaEditorSnapshot(),originalSnapshot);assert.notEqual(h.c.initialIdeaEditor,originalSnapshot);assert.ok(h.warning());h.c.askDiscardIdea();assert.equal(h.warnings.length,1);assert.equal(h.fields['#idea-dialog'].open,true);h.c.closeIdea();assert.equal(h.warning(),false);assert.equal(h.puts,1);
});
for(const prepare of [false,true])test(`retained input saves explicitly under a new ID and prepares only when asked (${prepare})`,async t=>{
 const h=await harness(t);h.behavior.mode='delay';const p=h.c.deleteIdea();await h.ready.promise;changes.title(h);changes.note(h);changes.labels(h);h.gate.resolve();await p;h.behavior.mode='normal';await h.c.saveIdea(prepare);const after=await h.repo.load('synthetic-reviewer'),idea=after.posts.find(x=>x.stage==='idea');assert.equal(h.puts,2);assert.equal(h.created,1);assert.equal(idea.id,'new-idea-1');assert.equal(idea.title,'Late title');assert.equal(idea.body,'Late last sentence');assert.deepEqual(idea.tags,['Late, tag','Campaign']);assert.equal(after.posts.some(x=>x.id==='idea-original'),false);assert.equal(h.fields['#idea-dialog'].open,false);assert.deepEqual(h.prepared,prepare?['new-idea-1']:[]);
});
test('normal confirmed deletion still closes and provides working Undo without replacing another post',async t=>{
 const h=await harness(t),before=await h.repo.load('synthetic-reviewer');await h.c.deleteIdea();assert.equal(h.fields['#idea-dialog'].open,false);assert.equal(h.puts,1);assert.equal(typeof h.notices.at(-1).undo,'function');await h.notices.at(-1).undo();const after=await h.repo.load('synthetic-reviewer');assert.equal(h.puts,2);assert.equal(after.posts.length,before.posts.length);assert.equal(after.posts.find(p=>p.id==='idea-original').body,h.original.text);assert.equal(after.posts.find(p=>p.id==='post-1').body,before.posts.find(p=>p.id==='post-1').body);assert.match(h.notices.at(-1).message,/Idee wiederhergestellt/);
});
test('double delete and Close during pending request cannot duplicate writes or discard input',async t=>{
 const h=await harness(t);h.behavior.mode='delay';const p=h.c.deleteIdea();await h.ready.promise;await h.c.deleteIdea();h.c.askDiscardIdea();assert.equal(h.puts,1);assert.equal(h.fields['#idea-dialog'].open,true);changes.note(h);h.gate.resolve();await p;assert.equal(h.puts,1);assert.equal(h.fields['#idea-dialog'].open,true);await h.c.deleteIdea();assert.equal(h.puts,1);
});
for(const mode of ['conflict','lost','malformed'])test(`actual ${mode} result retains source identity and current fields without success or automatic retry`,async t=>{
 const h=await harness(t);h.behavior.mode=mode;changes.note(h);const snapshot=h.c.ideaEditorSnapshot();await h.c.deleteIdea();assert.equal(h.fields['#idea-dialog'].open,true);assert.equal(h.c.editingIdeaId,'idea-original');assert.equal(h.c.ideaEditorSnapshot(),snapshot);assert.equal(h.fields['#delete-idea'].hidden,false);assert.equal(h.puts,1);assert.equal(h.c.saving,false);assert.ok(h.warning());assert.equal(h.notices.some(x=>/Idee.*gelöscht/.test(x.message)),false);assert.equal(h.notices.some(x=>x.undo),false);const after=await h.repo.load('synthetic-reviewer');assert.equal(after.posts.some(x=>x.id==='idea-original'),mode==='conflict');
});
test('malformed late labels stay visible after deletion and an invalid explicit save cannot clear them',async t=>{
 const h=await harness(t);h.behavior.mode='delay';const p=h.c.deleteIdea();await h.ready.promise;h.fields['#idea-tags'].value='"not closed';h.gate.resolve();await p;h.behavior.mode='normal';await h.c.saveIdea();assert.equal(h.fields['#idea-tags'].value,'"not closed');assert.equal(h.fields['#idea-errors'].hidden,false);assert.equal(h.puts,1);assert.equal(h.c.editingIdeaId,null);assert.equal(h.fields['#idea-dialog'].open,true);assert.ok(h.warning());
});
test('unsaved input deliberately present before deletion is not mistaken for newer input',async t=>{
 const h=await harness(t);changes.note(h);await h.c.deleteIdea();assert.equal(h.fields['#idea-dialog'].open,false);assert.equal(h.puts,1);assert.equal(h.created,0);assert.equal(typeof h.notices.at(-1).undo,'function');
});

test('late-input deletion announces unsaved state inside the still-open dialog and focuses it',async t=>{
 const h=await harness(t);h.behavior.mode='delay';const pending=h.c.deleteIdea();await h.ready.promise;changes.note(h);h.gate.resolve();await pending;
 const notice=h.fields['#idea-errors'];assert.equal(h.fields['#idea-dialog'].open,true);assert.equal(notice.hidden,false);assert.equal(notice.focused,true);assert.match(notice.textContent,/gespeicherte Idee wurde gelöscht/);assert.match(notice.textContent,/ungespeicherte neue Idee/);assert.equal(h.puts,1);
 const html=readFileSync(new URL('../../public/index.html',import.meta.url),'utf8');assert.match(html,/id="idea-errors"[^>]*role="alert"[^>]*aria-label="Hinweis zur Idee"[^>]*tabindex="-1"/);
});
