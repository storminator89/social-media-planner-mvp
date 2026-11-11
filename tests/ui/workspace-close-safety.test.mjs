import {createComposerMedia} from '../../public/composer-media.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createWorkspaceClient} from '../../public/workspace-client.js';
import {createWorkspaceController} from '../../public/workspace-controller.js';
import {createEditorTiming} from '../../public/editor-timing.js';
import {restoredWorkspacePayload,workspaceHasOmissions} from '../../public/workspace-restore.js';
import {createEditorWorkspaceApi} from '../../modules/workspaces/workspace-api.mjs';
import {setup as storageSetup} from '../workspaces/support.mjs';
import {timers,deferred} from './workspace-fixtures.mjs';

// Actual app handlers and getter, real client/API/repository/SQLite. DOM only is
// synthetic; no browser, external request, upload or canonical post save occurs.
const root=process.env.WORKSPACE_CLOSE_REVIEW_BASE;
const app=readFileSync(root?`${root}/public/app.js`:new URL('../../public/app.js',import.meta.url),'utf8');
const ui=readFileSync(root?`${root}/public/workspace-ui.js`:new URL('../../public/workspace-ui.js',import.meta.url),'utf8');
function actual(name){const start=app.search(new RegExp(`(?:async )?function ${name}\\(`));assert.ok(start>=0,name);const next=app.slice(start+1).search(/\n(?:async )?function /);return app.slice(start,next<0?undefined:start+1+next);}
const clickCode=app.slice(app.indexOf("document.addEventListener('click',async event=>"),app.indexOf("\n$('#composer-form').addEventListener('submit'"));
const getterCode=ui.slice(ui.indexOf('get hasUnsavedLocalInput()'),ui.indexOf(',destroy(){',ui.indexOf('get hasUnsavedLocalInput()')));
const owned={id:'image-1',url:'/api/planner/media/image-1',alt:'Original alt',name:'My image.png',type:'image/png'};
const clone=value=>structuredClone(value);
async function harness(t,{kind='none',available=true}={}){
 const storage=storageSetup();t.after(()=>storage.db.sql.close());
 const handler=createEditorWorkspaceApi({repository:storage.repo,siteOrigin:'https://planner.example',authenticateRequest:()=> 'alice'});
 const behavior={mode:'normal'},requests=[],gate=deferred(),ready=deferred();t.after(()=>gate.resolve());
 const client=createWorkspaceClient({fetcher:async(path,options)=>{
  requests.push({method:options.method,path,body:options.body});
  if(options.method==='PUT'&&behavior.mode==='reject')return new Response(JSON.stringify({error:{code:'WORKSPACE_UNAVAILABLE'}}),{status:503,headers:{'Content-Type':'application/json'}});
  const response=await handler(new Request('https://planner.example'+path,{...options,headers:{...options.headers,Origin:'https://planner.example'}}));
  if(options.method==='PUT'&&behavior.mode==='delay'){ready.resolve();await gate.promise;}
  if(options.method==='PUT'&&behavior.mode==='lost')throw Error('Synthetic lost response after commit');
  return response;
 }});
 const fields=new Map();
 const $=selector=>{if(!fields.has(selector))fields.set(selector,{dataset:{},value:'',hidden:false,open:false,innerHTML:'',textContent:'',classList:{toggle(){}},focus(){},setAttribute(){}});return fields.get(selector)};
 $('#composer').open=true;$('#preview-channel').value='instagram';$('#post-zone').value='Europe/Berlin';$('#post-date').value='2027-01-12';$('#post-time').value='10:00';
 let click,unload,closed=0,warnings=0,uuid=0,captures=0;
 const observers=new Set(),clock=timers(),controller=createWorkspaceController({client,onChange:s=>{for(const observer of [...observers])observer(s)},uuid:()=>`close-review-${String(++uuid).padStart(16,'0')}`,setTimer:clock.setTimer,clearTimer:clock.clearTimer});t.after(()=>controller.destroy());
 const getterContext=vm.createContext({isVideoMedia:m=>['video/mp4','video/webm'].includes(m?.type),videoWorkspaceVersion:2,videoSelectionController:null,videoPreviewURLs:{clear(){}},savedAltEdit:null,cancelSavedAlt(){},composerFileDrop:{reset(){}},splitPending:false,closeDraftSplit(){},updateDraftSplitAvailability(){},controller,workspaceHasOmissions,disposed:false,available,carouselMode:false,carouselPreparing:false,carouselEditorOpen:false});
 const workspaceUI=vm.runInContext(`({${getterCode}})`,getterContext);
 const composerImages=createComposerMedia();composerImages.reset(kind==='owned'?[clone(owned)]:kind==='local'?[{dataUrl:'data:image/png;base64,T0xE',alt:'Local',name:'local.png',type:'image/png'}]:[]);
 const c=vm.createContext({isVideoMedia:m=>['video/mp4','video/webm'].includes(m?.type),videoWorkspaceVersion:2,videoSelectionController:null,videoPreviewURLs:{clear(){}},composerImages,savedAltEdit:null,cancelSavedAlt(){},composerFileDrop:{reset(){}},splitPending:false,closeDraftSplit(){},updateDraftSplitAvailability(){},structuredClone,composerMedia:kind==='owned'?clone(owned):kind==='local'?{dataUrl:'data:image/png;base64,T0xE',alt:'Local',name:'local.png',type:'image/png'}:null,composerCover:kind==='cover'?'forms':null,composerMissingMedia:false,composerTiming:createEditorTiming(),composerBaseText:'Initial body',composerVariantTexts:{},composerLabelState:{title:'',tags:[],baseline:''},activeTextTarget:'base',workspaceRestoring:false,saving:false,mediaLoading:false,mediaGeneration:0,mediaBatchGeneration:null,queuePanel:null,state:{channels:[]},imageStudio:{hasPendingWork:false},postingTimesUI:null,initialIdeaEditor:'',ideaEditorSnapshot:()=>'',CHANNELS:[{id:'instagram',name:'Instagram',limit:2200,handle:''}],$: $, $$:()=>[{value:'instagram',checked:true}],
  document:{querySelectorAll:()=>[],addEventListener(type,handler){assert.equal(type,'click');click=handler}},window:{addEventListener(type,handler){assert.equal(type,'beforeunload');unload=handler}},
  updateSaveAvailability(){},hasTextVariant:()=>false,effectiveText:post=>post.text,cover:()=>'',updateVisualPresentation(){},characterCount:v=>v.length,inheritedChannels:()=>['instagram'],updateVariantSummary(){},renderTimingStatus(){},
  closeComposer(){closed++;$('#composer').open=false;controller.close()},showInfo(){warnings++},workspaceUI});
 workspaceUI.captureChanged=()=>{captures++;controller.changed(clone(c.captureWorkspacePayload()))};
 for(const name of ['editorPost','editorSnapshot','currentComposerRawTags','captureWorkspacePayload','renderPreview','renderMediaEditor','refreshMediaFocus','invalidatePendingImageBatch','handleTextInput','askDiscard'])vm.runInContext(actual(name),c);
 vm.runInContext(clickCode,c);
 const unloadCode=app.match(/window\.addEventListener\('beforeunload',e=>\{.*?\}\);/);assert.ok(unloadCode);vm.runInContext(unloadCode[0],c);
 c.initialEditor=c.editorSnapshot();
 const initial=clone(c.captureWorkspacePayload());
 const restored=await client.save({workspaceId:'close-review-workspace',expectedRevision:0,writeId:'close-review-initial-write',sourcePostId:'post-1',basePlannerRevision:7,payload:initial});
 assert.equal(controller.open({sourcePostId:'post-1',basePlannerRevision:7,payload:initial},restored),true);requests.length=0;
 const canonicalState=()=>JSON.stringify({profiles:storage.db.sql.prepare('SELECT * FROM planner_profiles ORDER BY owner_id').all(),posts:storage.db.sql.prepare('SELECT * FROM planner_posts ORDER BY owner_id,id').all(),media:storage.db.sql.prepare('SELECT * FROM planner_media ORDER BY owner_id,id').all()});
 const baselineCanonical=canonicalState();
 const warnUnload=()=>{let warned=false;unload({preventDefault(){warned=true}});return warned};
 return {c,controller,workspaceUI,getterContext,clock,client,storage,requests,behavior,gate,ready,initial,fields,baselineCanonical,canonicalState,warnUnload,get closed(){return closed},get warnings(){return warnings},get captures(){return captures},get puts(){return requests.filter(r=>r.method==='PUT').length},remove:()=>click({target:{closest:()=>({dataset:{action:'remove-media'}})}}),async read(){return client.read('close-review-workspace')},async autoSave(){assert.equal(clock.size,1);const completed=new Promise(resolve=>{const done=s=>{if(s.phase!=='saving'){observers.delete(done);resolve()}};observers.add(done)});await clock.fire();await completed;assert.equal(controller.snapshot.pendingWrite,false,JSON.stringify(controller.snapshot))}};
}

for(const kind of ['owned','local','cover'])test(`ordinary ${kind} removal is captured through actual renderPreview and keeps canonical rows untouched`,async t=>{
 const h=await harness(t,{kind});await h.remove();assert.equal(h.captures,1);assert.equal(h.controller.snapshot.dirty,true);assert.equal(h.workspaceUI.hasUnsavedLocalInput,true);
 h.c.askDiscard();assert.equal(h.closed,0);assert.equal(h.warnings,1);assert.equal(h.warnUnload(),true);
 await h.autoSave();const saved=await h.read(),payload=restoredWorkspacePayload(saved);assert.deepEqual(payload.mediaItems,[]);assert.equal(payload.cover,null);assert.equal(workspaceHasOmissions(payload),false);assert.equal(h.puts,1);
 assert.equal(h.workspaceUI.hasUnsavedLocalInput,false);h.c.askDiscard();assert.equal(h.closed,1);assert.equal(h.canonicalState(),h.baselineCanonical);
});

test('image add-save-remove back to initial snapshot warns until absence is confirmed and restores without the image',async t=>{
 const h=await harness(t);h.c.composerImages.reset([clone(owned)]);h.c.composerMedia=h.c.composerImages.selected;h.c.renderPreview();await h.autoSave();assert.equal((await h.read()).payload.mediaItems[0].id,'image-1');
 await h.remove();assert.equal(h.c.editorSnapshot(),h.c.initialEditor);assert.equal(h.controller.snapshot.dirty,true);assert.equal(h.workspaceUI.hasUnsavedLocalInput,true);assert.equal(h.warnUnload(),true);
 h.c.askDiscard();assert.equal(h.closed,0);assert.equal(h.warnings,1);assert.equal(h.clock.size,1);
 await h.autoSave();assert.deepEqual(restoredWorkspacePayload(await h.read()).mediaItems,[]);assert.equal(h.puts,2);assert.equal(h.workspaceUI.hasUnsavedLocalInput,false);assert.equal(h.warnUnload(),false);
 h.c.askDiscard();assert.equal(h.closed,1);assert.equal(h.canonicalState(),h.baselineCanonical);
});

test('text edit-save-revert back to initial snapshot warns until exact reverted text is confirmed',async t=>{
 const h=await harness(t);h.c.$('#post-text').value='Temporary saved text';h.c.handleTextInput();await h.autoSave();
 h.c.$('#post-text').value='Initial body';h.c.handleTextInput();assert.equal(h.c.editorSnapshot(),h.c.initialEditor);assert.equal(h.workspaceUI.hasUnsavedLocalInput,true);assert.equal(h.warnUnload(),true);
 h.c.askDiscard();assert.equal(h.closed,0);assert.equal(h.warnings,1);await h.autoSave();assert.equal(restoredWorkspacePayload(await h.read()).text,'Initial body');assert.equal(h.puts,2);
 assert.equal(h.warnUnload(),false);h.c.askDiscard();assert.equal(h.closed,1);assert.equal(h.canonicalState(),h.baselineCanonical);
});

test('older in-flight save followed by reversion is unsafe even when dirty is false, and late receipt schedules current absence',async t=>{
 const h=await harness(t);h.behavior.mode='delay';h.c.composerImages.reset([clone(owned)]);h.c.composerMedia=h.c.composerImages.selected;h.c.renderPreview();const pending=h.controller.save();await h.ready.promise;
 await h.remove();assert.equal(h.c.editorSnapshot(),h.c.initialEditor);assert.equal(h.controller.snapshot.dirty,false);assert.equal(h.controller.snapshot.pendingWrite,true);
 assert.equal(h.workspaceUI.hasUnsavedLocalInput,true);assert.equal(h.warnUnload(),true);h.c.askDiscard();assert.equal(h.closed,0);assert.equal(h.warnings,1);
 h.behavior.mode='normal';h.gate.resolve();await pending;assert.equal(h.controller.snapshot.dirty,true);assert.equal(h.workspaceUI.hasUnsavedLocalInput,true);
 await h.autoSave();assert.deepEqual((await h.read()).payload.mediaItems,[]);assert.equal(h.puts,2);assert.equal(h.warnUnload(),false);h.c.askDiscard();assert.equal(h.closed,1);
});

for(const mode of ['reject','lost'])test(`uncertain ${mode} save keeps close/unload warning without retry; exact readback alone may clear it`,async t=>{
 const h=await harness(t);h.c.composerImages.reset([clone(owned)]);h.c.composerMedia=h.c.composerImages.selected;h.c.renderPreview();await h.autoSave();await h.remove();h.behavior.mode=mode;await h.controller.save();
 assert.equal(h.workspaceUI.hasUnsavedLocalInput,true);assert.equal(h.warnUnload(),true);h.c.askDiscard();assert.equal(h.closed,0);assert.equal(h.clock.size,0);assert.equal(h.puts,2);
 h.behavior.mode='normal';await h.controller.reconcile();assert.equal(h.puts,2);assert.equal(h.workspaceUI.hasUnsavedLocalInput,mode==='reject');
 assert.equal((await h.read()).payload.mediaItems.length===0,mode==='lost');assert.equal(h.canonicalState(),h.baselineCanonical);
});

for(const available of [true,false])test(`unchanged initial editor still closes without extra prompt (workspace available=${available})`,async t=>{
 const h=await harness(t,{available});if(!available)h.controller.pause();assert.equal(h.workspaceUI.hasUnsavedLocalInput,false);assert.equal(h.warnUnload(),false);
 h.c.askDiscard();assert.equal(h.closed,1);assert.equal(h.warnings,0);assert.equal(h.puts,0);
});

test('explicit discard remains possible and teardown cannot report an open dirty editor',async t=>{
 const h=await harness(t);h.c.composerImages.reset([clone(owned)]);h.c.composerMedia=h.c.composerImages.selected;h.c.renderPreview();await h.autoSave();await h.remove();h.c.askDiscard();assert.equal(h.closed,0);
 h.c.closeComposer();assert.equal(h.closed,1);assert.equal(h.clock.size,0);assert.equal(h.workspaceUI.hasUnsavedLocalInput,false);assert.equal(h.warnUnload(),false);assert.equal((await h.read()).payload.mediaItems[0].id,'image-1');
 h.getterContext.disposed=true;assert.equal(h.workspaceUI.hasUnsavedLocalInput,false);assert.equal(h.puts,1);
});
test('matching local-image checkpoint still warns on actual Close and beforeunload',async t=>{
 const h=await harness(t,{kind:'local'});assert.equal(h.controller.snapshot.dirty,false);assert.equal(h.controller.canCloseSafely,false);assert.equal(h.workspaceUI.hasUnsavedLocalInput,true);assert.equal(h.warnUnload(),true);h.c.askDiscard();assert.equal(h.closed,0);assert.equal(h.warnings,1);assert.throws(()=>restoredWorkspacePayload(h.controller.snapshot.workspace),/Lokale Mediendateien/);
});
