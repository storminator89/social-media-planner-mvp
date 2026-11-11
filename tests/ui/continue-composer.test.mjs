import {preservationContext} from './preservation-context.mjs';
import {createComposerMedia} from '../../public/composer-media.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createPlannerClient} from '../../public/data-client/client.mjs';
import {createTaktStore} from '../../public/data-client/takt-adapter.mjs';
import {handlePlannerRequest} from '../../modules/data/api.mjs';
import {PlannerRepository} from '../../modules/data/repository.mjs';
import {D1TestAdapter,R2TestAdapter,png} from '../data/support.mjs';
import {CHANNELS,normalizeState,validatePost,startOfWeek,dateKey,addDays,zonedNow,displayTitle} from '../../public/model.js';
import {createEditorTiming} from '../../public/editor-timing.js';
import {editedPostLabels} from '../../public/post-labels.js';
import {selectedVariantTexts} from '../../public/variants.js';
import {calendarTime,calendarPosts,planningStatus} from '../../public/calendar-model.js';

// Actual save, period and month-render functions plus real adapter/API/SQLite.
// Only DOM, rendering entry and the explicitly selected transport fault are doubles.
const base=process.env.CALENDAR_ANCHOR_REVIEW_BASE;
const app=readFileSync(base?`${base}/public/app.js`:new URL('../../public/app.js',import.meta.url),'utf8');
function actual(name){const start=app.search(new RegExp(`(?:async )?function ${name}\\(`));assert.ok(start>=0,name);const next=app.slice(start+1).search(/\n(?:async )?function /);return app.slice(start,next<0?undefined:start+next+1);}
const clone=structuredClone;
async function harness(t,{local='2026-12-01T10:00',postZone='Europe/Berlin',calendarZone='Europe/Berlin',range='month',view='calendar',mode='normal',opted=true,completion=true}={}){
 const env={DB:new D1TestAdapter(),BUCKET:new R2TestAdapter()};t.after(()=>env.DB.sql.close());
 const requests=[],repo=new PlannerRepository(env.DB);let fault=false,resolveWrite,started;
 const ready=new Promise(resolve=>{started=resolve}),gate=new Promise(resolve=>{resolveWrite=resolve});t.after(()=>resolveWrite());
 const store=createTaktStore({timezone:calendarZone,channels:CHANNELS,client:createPlannerClient({fetcher:async(path,options={})=>{
  requests.push({path,method:options.method||'GET'});
  if(fault&&mode==='partial-upload'&&options.method==='POST'&&requests.filter(r=>r.method==='POST').length===2)return new Response(JSON.stringify({error:{code:'UNAVAILABLE',message:'Synthetic second upload failure'}}),{status:503});
  if(fault&&options.method==='PUT'&&mode==='reject')return new Response(JSON.stringify({error:{code:'UNAVAILABLE',message:'Synthetic unavailable'}}),{status:503});
  const result=await handlePlannerRequest(new Request('https://planner.example'+path,{...options,headers:{...options.headers,'oai-authenticated-user-id':'calendar-anchor-review'}}),env);
  if(fault&&options.method==='PUT'&&mode==='delay'){started();await gate;}return result;
 }})});
 let state=normalizeState(await store.load());
 const initial={id:'keep-post',scheduleBinding:null,scheduledInstant:null,title:'Keep title',tags:['Keep label'],text:'Keep body',variantTexts:{mastodon:'Keep variant'},channels:['mastodon'],status:'draft',scheduledAt:null,timeZone:postZone,cover:null,mediaItems:[{dataUrl:'data:image/png;base64,'+Buffer.from(png).toString('base64'),type:'image/png',name:'original.png',alt:'Original alt'}],createdAt:'2026-11-09T10:00:00.000Z'};
 state=normalizeState(await store.save({...state,posts:[initial]}));const post=state.posts[0],before=await repo.load('calendar-anchor-review'),mediaBefore=clone([...env.BUCKET.data]);requests.length=0;fault=true;
 const fields={'#continue-composer':{checked:opted},'#composer':{open:true},'#post-tags':{value:'Keep label'},'#post-date':{value:local.slice(0,10)},'#post-time':{value:local.slice(11)},'#post-zone':{value:postZone},'#form-errors':{hidden:true},'#search':{value:''},'#variant-announcement':{textContent:''}};
 const composerImages=createComposerMedia();composerImages.reset(post.mediaItems);const timing=createEditorTiming();timing.open(post);let closes=0,retains=0,cleanups=0;const opens=[];const notices=[];
 const c=vm.createContext({...preservationContext(),document:{querySelector:()=>null},workspacePlannerReading:false,workspaceRestoring:false,splitPending:false,splitNeedsReload:false,imageStudio:{hasPendingWork:false},composerGeneration:1,savedAltEdit:null,cancelSavedAlt(){},store,state,normalizeState,validatePost,editedPostLabels,selectedVariantTexts,calendarTime,calendarPosts,planningStatus,startOfWeek,dateKey,addDays,zonedNow,displayTitle,CHANNELS,Date,Promise,crypto,structuredClone,
  composerImages,composerTiming:timing,composerMedia:composerImages.selected,composerCover:post.cover,composerMissingMedia:false,composerBaseText:post.text,composerVariantTexts:clone(post.variantTexts),composerLabelState:{title:post.title,tags:post.tags,raw:'Keep label',rendered:'Keep label',baseline:'Keep label'},activeTextTarget:'base',composerIdeaFingerprint:null,editingId:post.id,composerRestoredWorkspace:false,saving:false,mediaLoading:false,initialEditor:'',view,range,anchor:new Date('2026-10-15T12:00'),calendarStatus:'review',
  $:s=>fields[s],$$:()=>[{value:'mastodon'}],setComposerBusy(){},focusComposerErrors(){},notify:x=>notices.push(x),currentZone:()=>calendarZone,openComposer(...args){opens.push(args)},closeComposer(){closes++},render(){},workspaceUI:{beforePostSave(){},afterPostSave(){cleanups++;return completion},retainNewerInput(){retains++}},
  days:['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'],dateLabel:(d,o)=>new Intl.DateTimeFormat('de-DE',o).format(d),esc:s=>String(s??'').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;'),icon:()=>'',platform:()=>'',scheduleNeedsReview:()=>false,postLabelDescription:()=>'',renderAgenda:posts=>posts.map(p=>p.id).join(',')});
 for(const name of ['continueComposerBlocked','continueSavedPostMatches','currentComposerRawTags','editorSnapshot','savePost','persist','visiblePeriod','periodPosts','renderMonth'])vm.runInContext(actual(name),c);
 c.initialEditor=c.editorSnapshot();
 return {c,fields,opens,requests,store,repo,env,before,mediaBefore,ready,resolveWrite,notices,get closes(){return closes},get retains(){return retains},get cleanups(){return cleanups}};
}

test('opt-in schedules exactly once with original data and carries only channels and zone',async t=>{
 const h=await harness(t,{postZone:'Asia/Tokyo'});await h.c.savePost('scheduled');
 assert.equal(h.requests.filter(r=>r.method==='PUT').length,1);assert.equal(h.closes,1);assert.equal(h.opens.length,1);
 assert.deepEqual(JSON.parse(JSON.stringify(h.opens[0])),[null,null,false,{channels:['mastodon'],timeZone:'Asia/Tokyo'}]);
 const post=(await h.store.load()).posts[0];assert.equal(post.text,'Keep body');assert.equal(post.title,'Keep title');assert.deepEqual(post.tags,['Keep label']);assert.deepEqual(post.variantTexts,{mastodon:'Keep variant'});assert.ok(post.mediaItems[0].id);
});
for(const opts of [{opted:false},{opted:true,status:'draft'}])test('normal save and draft ignore continuation '+JSON.stringify(opts),async t=>{
 const h=await harness(t,opts);await h.c.savePost(opts.status||'scheduled');assert.equal(h.opens.length,0);assert.equal(h.closes,1);
});
for(const completion of [false,undefined,null])test('unconfirmed workspace completion never advances '+String(completion),async t=>{
 const h=await harness(t);h.c.workspaceUI.afterPostSave=()=>completion;await h.c.savePost('scheduled');assert.equal(h.closes,0);assert.equal(h.opens.length,0);assert.equal(h.c.editingId,'keep-post');assert.equal(h.requests.filter(r=>r.method==='PUT').length,1);
});
test('workspace exception retains submitted editor',async t=>{const h=await harness(t);h.c.workspaceUI.afterPostSave=()=>{throw Error('closure failed')};await h.c.savePost('scheduled');assert.equal(h.opens.length,0);assert.equal(h.closes,0);});
for(const flag of ['saving','mediaLoading','workspacePlannerReading','workspaceRestoring','splitPending','splitNeedsReload'])test('busy guard '+flag,async t=>{const h=await harness(t);h.c[flag]=true;await h.c.savePost('scheduled');assert.equal(h.requests.length,0);assert.equal(h.opens.length,0);});
test('pending studio or child dialog blocks before persistence',async t=>{const h=await harness(t);h.c.imageStudio.hasPendingWork=true;await h.c.savePost('scheduled');h.c.imageStudio.hasPendingWork=false;h.c.document.querySelector=()=>({open:true});await h.c.savePost('scheduled');assert.equal(h.requests.length,0);});
test('validation never advances or writes',async t=>{const h=await harness(t);h.fields['#post-date'].value='';await h.c.savePost('scheduled');assert.equal(h.requests.length,0);assert.equal(h.opens.length,0);});
test('double click is one save and one fresh composer',async t=>{const h=await harness(t,{mode:'delay'});const pending=h.c.savePost('scheduled');await h.ready;await h.c.savePost('scheduled');h.resolveWrite();await pending;assert.equal(h.requests.filter(r=>r.method==='PUT').length,1);assert.equal(h.opens.length,1);});
for(const mutation of ['text','generation','child','unchecked'])test('late '+mutation+' never advances',async t=>{const h=await harness(t,{mode:'delay'});const pending=h.c.savePost('scheduled');await h.ready;if(mutation==='text')h.c.composerBaseText='New unsent';if(mutation==='generation')h.c.composerGeneration++;if(mutation==='child')h.c.document.querySelector=()=>({});if(mutation==='unchecked')h.fields['#continue-composer'].checked=false;h.resolveWrite();await pending;assert.equal(h.opens.length,0);assert.equal(h.closes,0);});
test('late edit while workspace closes remains intact',async t=>{const h=await harness(t);h.c.workspaceUI.afterPostSave=()=>{h.c.composerBaseText='Late workspace edit';return true};await h.c.savePost('scheduled');assert.equal(h.opens.length,0);assert.equal(h.c.composerBaseText,'Late workspace edit');assert.equal(h.retains,1);});
test('CAS conflict does not continue or resend',async t=>{const h=await harness(t);await h.repo.save('calendar-anchor-review',clone(h.before));await h.c.savePost('scheduled');assert.equal(h.opens.length,0);assert.equal(h.closes,0);assert.equal(h.requests.filter(r=>r.method==='PUT').length,1);});
test('network rejection does not continue or retry',async t=>{const h=await harness(t,{mode:'reject'});await h.c.savePost('scheduled');assert.equal(h.opens.length,0);assert.equal(h.closes,0);assert.equal(h.requests.filter(r=>r.method==='PUT').length,1);});
for(const result of [null,{}, {revision:1,posts:[]}])test('unknown receipt never continues '+JSON.stringify(result),async t=>{const h=await harness(t);let writes=0;h.c.store={save:async()=>{writes++;return result}};await h.c.savePost('scheduled');assert.equal(writes,1);assert.equal(h.opens.length,0);assert.equal(h.closes,0);});
test('wrong acknowledged post does not continue',async t=>{const h=await harness(t);h.c.store={save:async next=>({...next,revision:next.revision+1,posts:[]})};await h.c.savePost('scheduled');assert.equal(h.opens.length,0);assert.equal(h.closes,0);});

test('actual fresh composer resets all carried editor state before workspace capture and focuses text',()=>{
 const fields=new Map(),nodes=[{value:'mastodon',checked:false},{value:'instagram',checked:true}],frames=[],captured=[];
 const $=key=>{if(!fields.has(key))fields.set(key,{value:'',hidden:false,open:false,textContent:'',innerHTML:'',showModal(){this.open=true},focus(){this.focused=true}});return fields.get(key)};
 const c=vm.createContext({...preservationContext(),composerImages:createComposerMedia(),$, $$:()=>nodes, state:{revision:4,posts:[]},saving:false,workspacePlannerReading:false,workspaceRestoring:false,composerGeneration:3,mediaGeneration:8,mediaLoading:true,editingId:'old',composerRestoredWorkspace:true,composerSavedRevision:1,composerIdeaFingerprint:'old',composerLabelState:{title:'Old'},composerVariantTexts:{mastodon:'old'},composerBaseText:'old',composerMedia:{id:'old'},composerCover:'old',composerMissingMedia:true,activeTextTarget:'mastodon',initialEditor:'old',returnFocus:null,channel:'instagram',CHANNELS,structuredClone,document:{activeElement:{}},store:{plannerRevision:4},savedTextPicker:null,postTemplatePicker:null,queuePanel:{reset(){c.queueReset=true}},composerTiming:createEditorTiming(),cancelSavedAlt(){},closeDraftSplit(){},platform:()=>'',esc:x=>x,formatIdeaTags:tags=>(tags||[]).join(', '),addDays,zonedNow,dateKey,currentZone:()=> 'Europe/Berlin',setComposerDate(date){$('#post-date').value=date;$('#post-time').value='10:00'},populateZoneSelect(el,zone){el.value=zone},renderMediaEditor(){},renderVariantTabs(){},renderPreview(){},editorSnapshot:()=> 'fresh snapshot',refreshMastodonPlanningStatus(){},updateDraftSplitAvailability(){},requestAnimationFrame:f=>frames.push(f),workspaceUI:{editorOpened(origin){captured.push({origin,date:$('#post-date').value,time:$('#post-time').value,zone:$('#post-zone').value,text:c.composerBaseText})}}});
 c.composerImages.reset([{id:'first',alt:'First'},{id:'second',alt:'Second'}]);c.composerTiming.select({scheduleBinding:null,scheduledInstant:'2026-12-01T00:00:00Z'});
 vm.runInContext(actual('renderComposerChannels')+'\n'+actual('openComposer'),c);c.openComposer(null,null,false,{channels:['mastodon'],timeZone:'Asia/Tokyo'});frames.forEach(f=>f());
 assert.equal(c.editingId,null);assert.equal(c.composerBaseText,'');assert.equal(c.composerIdeaFingerprint,null);assert.equal(c.composerMedia,null);assert.equal(c.composerImages.items.length,0);assert.equal(c.composerCover,null);assert.equal(c.composerLabelState.title,'');assert.equal(Object.keys(c.composerVariantTexts).length,0);assert.equal(c.composerLabelState.tags.length,0);assert.equal(c.composerMissingMedia,false);assert.equal(c.activeTextTarget,'base');assert.equal(c.composerTiming.snapshot.scheduleBinding,null);assert.equal(c.composerTiming.snapshot.scheduledInstant,null);assert.equal(c.queueReset,true);assert.equal($('#post-text').focused,true);assert.equal($('#media-file').value,'');assert.equal(c.initialEditor,'fresh snapshot');assert.equal(captured[0].date,'');assert.equal(captured[0].time,'');assert.equal(captured[0].zone,'Asia/Tokyo');assert.equal(captured[0].origin.sourcePostId,null);
 assert.match($('#composer-channels').innerHTML,/value="mastodon" checked/);assert.doesNotMatch($('#composer-channels').innerHTML,/value="instagram" checked/);
});
test('opt-in has accessible plain checkbox and no persistence or shortcut',()=>{const html=readFileSync(new URL('../../public/index.html',import.meta.url),'utf8');assert.match(html,/<label class="continue-composer-option"><input type="checkbox" id="continue-composer" aria-describedby="continue-composer-hint">Danach weiteren Beitrag erstellen/);assert.doesNotMatch(html,/id="continue-composer"[^>]*checked/);assert.doesNotMatch(app.replace(actual('originalPreservationController'),''),/sessionStorage|localStorage/);assert.doesNotMatch(readFileSync(new URL('../../public/preserve-video-original.js',import.meta.url),'utf8'),/continue-composer/);});

test('continuation receipt includes exact binding and explicit instant',()=>{const c=vm.createContext({...preservationContext(),state:{posts:[]}});vm.runInContext(actual('continueSavedPostMatches'),c);const p={id:'p',channels:[],variantTexts:{},mediaItems:[],scheduleBinding:{refs:[{channelId:'mastodon'}]},scheduledInstant:'2026-12-01T09:00:00Z'};c.state.posts=[clone(p)];assert.equal(c.continueSavedPostMatches(p),true);c.state.posts[0].scheduleBinding=null;assert.equal(c.continueSavedPostMatches(p),false);c.state.posts=[{...clone(p),scheduledInstant:'2026-12-01T10:00:00Z'}];assert.equal(c.continueSavedPostMatches(p),false);});
test('carousel continuation saves complete mixed list and full order before next editor',async t=>{
 const h=await harness(t),original=h.c.composerImages.items[0],second={dataUrl:'data:image/png;base64,'+Buffer.from(png).toString('base64'),type:'image/png',name:'second.png',alt:'Second image'};
 h.c.composerImages.reset([second,original]);h.c.composerMedia=h.c.composerImages.selected;await h.c.savePost('scheduled');
 assert.equal(h.opens.length,1);assert.equal(h.closes,1);const post=(await h.store.load()).posts[0];assert.equal(post.mediaItems.length,2);assert.deepEqual(post.mediaItems.map(item=>item.alt),['Second image','Original alt']);assert.equal(post.mediaItems[1].id,original.id);assert.ok(post.mediaItems[0].id);
});
test('carousel conflict retains all local and saved images in exact editor order',async t=>{
 const h=await harness(t),original=h.c.composerImages.items[0],second={dataUrl:'data:image/png;base64,'+Buffer.from(png).toString('base64'),type:'image/png',name:'second.png',alt:'Second image'};
 h.c.composerImages.reset([second,original]);h.c.composerMedia=h.c.composerImages.selected;const before=h.c.composerImages.items;await h.repo.save('calendar-anchor-review',clone(h.before));await h.c.savePost('scheduled');
 assert.equal(h.opens.length,0);assert.equal(h.closes,0);assert.deepEqual(h.c.composerImages.items,before);assert.equal(h.requests.filter(r=>r.method==='PUT').length,1);
});
test('carousel continuation receipt rejects missing, extra and reordered saved references',()=>{
 const c=vm.createContext({...preservationContext(),state:{posts:[]}});vm.runInContext(actual('continueSavedPostMatches'),c);const p={id:'p',channels:[],variantTexts:{},mediaItems:[{id:'a',alt:'Same'},{id:'b',alt:'Same'}]};
 c.state.posts=[clone(p)];assert.equal(c.continueSavedPostMatches(p),true);
 for(const items of [[p.mediaItems[0]],[...p.mediaItems,p.mediaItems[0]],[...p.mediaItems].reverse()]){c.state.posts=[{...p,mediaItems:items}];assert.equal(c.continueSavedPostMatches(p),false);}
});
test('second upload failure leaves whole carousel editable without planner write or continuation',async t=>{
 const h=await harness(t,{mode:'partial-upload'}),saved=h.c.composerImages.items[0];const image=alt=>({dataUrl:'data:image/png;base64,'+Buffer.from(png).toString('base64'),type:'image/png',name:alt+'.png',alt});
 h.c.composerImages.reset([image('First'),saved,image('Third')]);h.c.composerMedia=h.c.composerImages.selected;const before=h.c.composerImages.items;await h.c.savePost('scheduled');
 assert.equal(h.opens.length,0);assert.equal(h.closes,0);assert.deepEqual(h.c.composerImages.items,before);assert.equal(h.requests.filter(r=>r.method==='POST').length,2);assert.equal(h.requests.filter(r=>r.method==='PUT').length,0);assert.deepEqual((await h.repo.load('calendar-anchor-review')).posts,h.before.posts);
});
test('continuation accepts reordered unique channel membership and variant object keys only',()=>{
 const c=vm.createContext({...preservationContext(),state:{posts:[]}});vm.runInContext(actual('continueSavedPostMatches'),c);
 const p={id:'p',mediaItems:[{id:'a',alt:'A'},{id:'b',alt:'B'}],channels:['instagram','mastodon'],variantTexts:{instagram:'I',mastodon:'M'},scheduleBinding:{refs:[{channelId:'instagram',slotId:'s1'},{channelId:'mastodon',slotId:'s2'}]}};
 const saved={...clone(p),channels:['mastodon','instagram'],variantTexts:{mastodon:'M',instagram:'I'}};c.state.posts=[saved];assert.equal(c.continueSavedPostMatches(p),true);
 for(const channels of [['mastodon'],['mastodon','mastodon'],['instagram','linkedin'],['instagram','mastodon','linkedin'],null]){c.state.posts=[{...saved,channels}];assert.equal(c.continueSavedPostMatches(p),false);}
 for(const variantTexts of [{mastodon:'Changed',instagram:'I'},{mastodon:'M'},{...saved.variantTexts,linkedin:'Extra'},null]){c.state.posts=[{...saved,variantTexts}];assert.equal(c.continueSavedPostMatches(p),false);}
 c.state.posts=[{...saved,mediaItems:[...saved.mediaItems].reverse()}];assert.equal(c.continueSavedPostMatches(p),false);
 c.state.posts=[{...saved,scheduleBinding:{refs:[{channelId:'instagram',slotId:'changed'},{channelId:'mastodon',slotId:'s2'}]}}];assert.equal(c.continueSavedPostMatches(p),false);
});
test('multi-channel carousel continues through actual repository channel sorting',async t=>{
 const h=await harness(t);h.c.$$=()=>[{value:'instagram'},{value:'mastodon'}];h.c.composerVariantTexts={instagram:'IG text',mastodon:'Mastodon text'};
 h.c.composerImages.reset([h.c.composerImages.items[0],{dataUrl:'data:image/png;base64,'+Buffer.from(png).toString('base64'),type:'image/png',name:'second.png',alt:'Second'}]);h.c.composerMedia=h.c.composerImages.selected;await h.c.savePost('scheduled');
 assert.equal(h.opens.length,1);assert.equal(h.closes,1);const saved=(await h.store.load()).posts[0];assert.deepEqual([...saved.channels].sort(),['instagram','mastodon']);assert.deepEqual(saved.mediaItems.map(item=>item.alt),['Original alt','Second']);assert.deepEqual(saved.variantTexts,{instagram:'IG text',mastodon:'Mastodon text'});
});
