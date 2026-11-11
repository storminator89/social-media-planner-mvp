import {createComposerMedia} from '../../public/composer-media.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {splitDraftEligible,prepareDraftSplit,draftSplitMatches} from '../../public/channel-draft-split.js';
const source=readFileSync(new URL('../../public/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../../public/index.html',import.meta.url),'utf8');
function fn(name){const start=source.search(new RegExp(`(?:async )?function ${name}\\(`));assert.ok(start>=0,name);const end=source.slice(start+1).search(/\n(?:async )?function /);return source.slice(start,end<0?undefined:start+1+end);}
const post=()=>({id:'p',status:'draft',channels:['linkedin','instagram','bluesky'],scheduledAt:null,scheduledInstant:null,scheduleBinding:null,title:'Titel',tags:[' A ','A','A'],text:'Basis',variantTexts:{instagram:'',bluesky:'Eigen'},mediaItems:[{id:'m',url:'/api/planner/media/m',alt:'Alt',type:'image/jpeg',name:'alt.jpg'}]});
function context(extra={}){return {state:{revision:7,posts:[post()]},postId:'p',revision:7,savedRevision:7,editor:'saved',initialEditor:'saved',open:true,...extra};}
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
function harness(extra={}){
 const fields={};for(const key of ['composer','channel-split-dialog','split-draft','channel-split-count','channel-split-channels','channel-split-confirm','channel-split-cancel','post-text','form-errors','search'])fields['#'+key]={open:key==='composer',hidden:false,disabled:false,textContent:'',value:'',dataset:{},focus(){this.focused=true},showModal(){this.open=true},close(){this.open=false},setAttribute(k,v){this[k]=v}};
 const c={fields,$:id=>fields[id],document:{querySelector:()=>null},state:context().state,editingId:'p',store:null,composerSavedRevision:7,composerGeneration:2,initialEditor:'saved',currentEditor:'saved',editorSnapshot:()=>c.currentEditor,
  composerImages:createComposerMedia(),saving:false,splitPending:false,splitNeedsReload:false,workspacePlannerReading:false,workspaceRestoring:false,plannerLoaded:true,composerRestoredWorkspace:false,mediaLoading:false,composerMissingMedia:false,composerMedia:null,imageStudio:{hasPendingWork:false},workspaceUI:null,
  splitPreview:null,splitToken:0,composerIdeaFingerprint:null,view:'calendar',channel:'linkedin',query:'old',postTag:'old',CHANNELS:[{id:'linkedin',name:'LinkedIn'},{id:'instagram',name:'Instagram'},{id:'bluesky',name:'Bluesky'}],
  splitDraftEligible,prepareDraftSplit,draftSplitMatches,structuredClone,normalizeState:x=>x,messages:[],notify:m=>c.messages.push(m),setComposerBusy:()=>{},focusComposerErrors:el=>el.focus(),render:()=>{},closed:0,closeComposer:()=>{c.closed++;fields['#composer'].open=false},writes:[],retained:0,...extra};
 c.store=extra.store||{plannerRevision:7,splitDraft:async(ui,options)=>{c.writes.push({ui,options});return {...ui,revision:8}}};
 if(!extra.workspaceUI)c.workspaceUI={hasUnsavedLocalInput:false,controller:{snapshot:{}},beforePostSave(){},afterPostSave:async()=>{},retainNewerInput:()=>c.retained++};
 c.composerImages.reset(c.composerMedia?[c.composerMedia]:[]);vm.createContext(c);for(const name of ['draftSplitContext','updateDraftSplitAvailability','closeDraftSplit','openDraftSplit','retainSplitInput','confirmDraftSplit'])vm.runInContext(fn(name),c);
 return c;
}
function confirm(c){return c.confirmDraftSplit(c.fields['#channel-split-confirm'].dataset.splitToken)}
test('model permits only clean saved current multi-channel drafts without any planning data',()=>{
 assert.equal(splitDraftEligible(context()),true);
 for(const extra of [{busy:true},{restored:true},{localWorkspace:true},{pendingMedia:true},{open:false},{editor:'new'},{savedRevision:6},{revision:8},{postId:'missing'}])assert.equal(splitDraftEligible(context(extra)),false,JSON.stringify(extra));
 for(const extra of [{status:'idea'},{status:'scheduled'},{channels:['linkedin']},{channels:['linkedin','linkedin']},{scheduledAt:'2027-01-01T10:00'},{scheduledInstant:'2027-01-01T09:00:00.000Z'},{scheduleBinding:{}}])assert.equal(splitDraftEligible(context({state:{revision:7,posts:[{...post(),...extra}]}})),false);
});
test('capacity preflight is all or nothing, preview preserves channel order and never transforms UI metadata',()=>{
 const ctx=context(),before=structuredClone(ctx),preview=prepareDraftSplit(ctx,{generation:2,token:3});assert.deepEqual(ctx,before);assert.deepEqual(preview.channels,post().channels);
 const posts=Array.from({length:99},(_,i)=>({...post(),id:String(i),channels:i===0?post().channels:['linkedin']}));assert.equal(splitDraftEligible(context({postId:'0',state:{revision:7,posts}})),false);
 posts.pop();assert.equal(splitDraftEligible(context({postId:'0',state:{revision:7,posts}})),true);
});
test('preview stale checks include full state, source, revision, editor, generation and one-use token',()=>{
 const ctx=context(),preview=prepareDraftSplit(ctx,{generation:2,token:3});assert.equal(draftSplitMatches(preview,ctx,{generation:2,token:3}),true);
 for(const [changed,identity] of [[context({editor:'new'}),{generation:2,token:3}],[ctx,{generation:3,token:3}],[ctx,{generation:2,token:4}],[context({state:{...ctx.state,posts:[{...post(),title:'changed'}]}}),{generation:2,token:3}]])assert.equal(draftSplitMatches(preview,changed,identity),false);
});
test('actual dialog is concise, confirmation defaults to cancel, opening never writes',()=>{
 const c=harness();c.openDraftSplit();assert.equal(c.writes.length,0);assert.equal(c.fields['#channel-split-dialog'].open,true);assert.equal(c.fields['#channel-split-cancel'].focused,true);assert.equal(c.fields['#channel-split-count'].textContent,'3 einzelne Entwürfe');assert.equal(c.fields['#channel-split-channels'].textContent,'LinkedIn · Instagram · Bluesky');
 assert.match(html,/id="channel-split-dialog"[^>]*aria-labelledby="channel-split-title"[^>]*aria-describedby="channel-split-count channel-split-channels"/);
 assert.match(html,/id="split-draft"[^>]*hidden>Nach Kanälen aufteilen/);
});
test('actual context excludes missing store operation, workspace/restored/local media/studio/read conditions',()=>{
 for(const extra of [{workspacePlannerReading:true},{workspaceRestoring:true},{composerRestoredWorkspace:true},{mediaLoading:true},{composerMissingMedia:true},{composerMedia:{dataUrl:'data:image/jpeg;base64,x'}},{imageStudio:{hasPendingWork:true}},{workspaceUI:{hasUnsavedLocalInput:true}},{workspaceUI:{controller:{snapshot:{workspace:{}}}}},{workspaceUI:{controller:{snapshot:{phase:'checking'}}}},{document:{querySelector:()=>({})}},{store:{plannerRevision:7}}]){const c=harness(extra);c.openDraftSplit();assert.equal(c.splitPreview,null,JSON.stringify(extra));assert.equal(c.fields['#channel-split-dialog'].open,false);}
});
test('actual confirm makes exactly one canonical operation and opens unfiltered drafts only after success',async()=>{
 const c=harness();c.openDraftSplit();await confirm(c);assert.equal(c.writes.length,1);assert.equal(c.writes[0].options.postId,'p');assert.equal(c.writes[0].ui.revision,7);assert.equal(c.state.revision,8);assert.equal(c.closed,1);assert.equal(c.view,'drafts');assert.equal(c.channel,'all');assert.equal(c.query,'');assert.equal(c.postTag,'');assert.equal(c.fields['#channel-split-dialog'].open,false);
});
test('doubleclick and close/cancel during pending commit do not repeat, abort or compensate',async()=>{
 const held=deferred();let writes=0;const c=harness({store:{plannerRevision:7,splitDraft:()=>{writes++;return held.promise}}});c.openDraftSplit();const pending=confirm(c);await confirm(c);assert.equal(c.closeDraftSplit(),false);c.openDraftSplit();assert.equal(writes,1);assert.equal(c.saving,true);assert.equal(c.fields['#channel-split-confirm'].disabled,true);assert.equal(c.fields['#channel-split-cancel'].disabled,true);assert.equal(c.fields['#channel-split-dialog'].open,true);held.resolve({...c.state,revision:8});await pending;assert.equal(writes,1);assert.equal(c.saving,false);
});
test('closed/reopened confirmation rejects the previous token, even for the same source',async()=>{
 const c=harness();c.openDraftSplit();const old=c.fields['#channel-split-confirm'].dataset.splitToken;c.closeDraftSplit();await c.confirmDraftSplit(old);assert.equal(c.writes.length,0);c.openDraftSplit();assert.notEqual(c.fields['#channel-split-confirm'].dataset.splitToken,old);await c.confirmDraftSplit(old);assert.equal(c.writes.length,0);assert.equal(c.splitPreview,null);
});
test('stale editor, source metadata, or source revision at confirmation never writes',async()=>{
 for(const mutate of [c=>c.currentEditor='new',c=>c.state.posts[0].tags.push('new'),c=>c.state.revision++,c=>c.composerGeneration++,c=>c.composerRestoredWorkspace=true]){const c=harness();c.openDraftSplit();mutate(c);await confirm(c);assert.equal(c.writes.length,0);assert.equal(c.closed,0);assert.equal(c.fields['#channel-split-dialog'].open,false);}
});
test('failed/conflicting/uncertain operation leaves form and state intact and cannot reopen for retry',async()=>{
 for(const code of ['REVISION_CONFLICT','INVALID_RESPONSE','OFFLINE']){const c=harness({store:{plannerRevision:7,splitDraft:async()=>{throw Object.assign(Error('Bitte neu laden'),{code})}}});const original=structuredClone(c.state);c.openDraftSplit();await confirm(c);assert.deepEqual(c.state,original);assert.equal(c.closed,0);assert.equal(c.currentEditor,'saved');assert.equal(c.splitNeedsReload,true);assert.equal(c.fields['#form-errors'].focused,true);c.openDraftSplit();assert.equal(c.splitPreview,null);}
});
test('later editor input survives success as explicitly dirty NEW copy, never overwrites first single-channel draft',async()=>{
 const held=deferred();const c=harness({store:{plannerRevision:7,splitDraft:()=>held.promise}});c.openDraftSplit();const pending=confirm(c);c.currentEditor='newer';held.resolve({...c.state,revision:8});await pending;assert.equal(c.closed,0);assert.equal(c.editingId,null);assert.equal(c.initialEditor,'');assert.equal(c.composerRestoredWorkspace,true);assert.equal(c.retained,1);assert.equal(c.currentEditor,'newer');assert.equal(c.view,'calendar');
});
test('later editor input during separate workspace completion survives too',async()=>{
 const held=deferred();const c=harness();c.workspaceUI.afterPostSave=()=>held.promise;c.openDraftSplit();const pending=confirm(c);await Promise.resolve();c.currentEditor='after receipt';held.resolve();await pending;assert.equal(c.editingId,null);assert.equal(c.retained,1);assert.equal(c.closed,0);assert.equal(c.state.revision,8);
});
test('new composer generation cannot be closed or relabeled by earlier completion',async()=>{
 const held=deferred();const c=harness({store:{plannerRevision:7,splitDraft:()=>held.promise}});c.openDraftSplit();const pending=confirm(c);c.composerGeneration++;c.editingId='other';c.currentEditor='other';held.resolve({...c.state,revision:8});await pending;assert.equal(c.editingId,'other');assert.equal(c.closed,0);assert.equal(c.retained,0);
});
test('unload protects pending split, styles wrap action, and Escape cancellation is prevented while pending',()=>{
 assert.match(source,/beforeunload[\s\S]*if\(splitPending\|\|imageStudio.hasPendingWork/);
 assert.match(source,/channel-split-dialog'\).addEventListener\('cancel',event=>\{event.preventDefault\(\);closeDraftSplit\(\);\}/);
 const css=readFileSync(new URL('../../public/composer.css',import.meta.url),'utf8');assert.match(css,/#split-draft\{white-space:normal;overflow-wrap:anywhere\}/);
});
test('acknowledged commit with render or workspace cleanup exception never closes editor or claims failed write',async()=>{
 for(const stage of ['render','workspace']){const c=harness();if(stage==='render')c.render=()=>{throw Error('render')};else c.workspaceUI.afterPostSave=async()=>{throw Error('workspace')};c.openDraftSplit();await confirm(c);assert.equal(c.writes.length,1);assert.equal(c.state.revision,8);assert.equal(c.closed,0);assert.equal(c.editingId,null);assert.equal(c.initialEditor,'');assert.equal(c.retained,1);assert.equal(c.splitNeedsReload,true);assert.match(c.messages.at(-1),/Entwürfe gespeichert/);assert.doesNotMatch(c.messages.at(-1),/nicht bestätigt/);assert.equal(c.fields['#channel-split-dialog'].open,false);}
});
test('cancel returns focus to eligible trigger, stale editor falls back to visible text input',()=>{
 const c=harness();c.openDraftSplit();c.closeDraftSplit();assert.equal(c.fields['#split-draft'].focused,true);
 c.fields['#split-draft'].focused=false;c.openDraftSplit();c.currentEditor='dirty';c.closeDraftSplit();assert.equal(c.fields['#split-draft'].hidden,true);assert.equal(c.fields['#split-draft'].focused,false);assert.equal(c.fields['#post-text'].focused,true);
});
test('delayed native close event cannot consume a newly reopened preview',()=>{
 const c=harness();let nativeClose;c.fields['#channel-split-dialog'].addEventListener=(name,fn)=>{assert.equal(name,'close');nativeClose=fn};
 vm.runInContext(source.split('\n').find(line=>line.startsWith("$('#channel-split-dialog').addEventListener('close'")),c);
 c.openDraftSplit();c.closeDraftSplit();c.openDraftSplit();const preview=c.splitPreview,token=c.splitToken;nativeClose();assert.equal(c.splitPreview,preview);assert.equal(c.splitToken,token);
});
test('workspace status callback refreshes eligibility after previous workspace has cleared',()=>{
 const c=harness({workspaceUI:{controller:{snapshot:{workspace:{id:'old'}}},hasUnsavedLocalInput:false}});c.updateDraftSplitAvailability();assert.equal(c.fields['#split-draft'].hidden,true);
 c.workspaceUI.controller.snapshot.workspace=null;c.updateDraftSplitAvailability();assert.equal(c.fields['#split-draft'].hidden,false);
 const open=fn('openComposer');assert.ok(open.indexOf('updateDraftSplitAvailability();const openedGeneration')>open.indexOf('workspaceUI?.editorOpened'));
 assert.match(source,/onStatusChange:\(\)=>\{if\(\$\('#composer'\).open\)updateDraftSplitAvailability\(\);\}/);
 const workspaceSource=readFileSync(new URL('../../public/workspace-ui.js',import.meta.url),'utf8');assert.match(workspaceSource,/if\(dialog.open\)renderDialog\(\);onStatusChange\(\);/);
});
