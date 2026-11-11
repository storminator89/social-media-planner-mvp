import {preservationContext} from './preservation-context.mjs';
import {videoContext} from './video-context.mjs';
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
import {formatIdeaTags} from '../../public/workflows/ideas.mjs';
import {selectedVariantTexts} from '../../public/variants.js';
import {calendarTime} from '../../public/calendar-model.js';
import {proposeCalendarReschedule} from '../../public/calendar-reschedule.js';
import {findNextPostingSlots,selectPostingSlot} from '../../public/workflows/posting-schedules.mjs';
const base=process.env.CALENDAR_RESCHEDULE_REVIEW_BASE;
const app=readFileSync(base?`${base}/public/app.js`:new URL('../../public/app.js',import.meta.url),'utf8');
function actual(name){const start=app.search(new RegExp(`(?:async )?function ${name}\\(`));assert.ok(start>=0,name);const next=app.slice(start+1).search(/\n(?:async )?function /);return app.slice(start,next<0?undefined:start+next+1);}
const clone=structuredClone;
async function harness(t,{local='2027-01-31T10:15',postZone='Europe/Berlin',calendarZone='Europe/Berlin',bound=false,mode='normal'}={}){
 const env={DB:new D1TestAdapter(),BUCKET:new R2TestAdapter()};t.after(()=>env.DB.sql.close());
 const requests=[],repo=new PlannerRepository(env.DB);let faults=false,resolveWrite,started;const ready=new Promise(r=>started=r),gate=new Promise(r=>resolveWrite=r);t.after(()=>resolveWrite());
 const store=createTaktStore({timezone:calendarZone,channels:CHANNELS,client:createPlannerClient({fetcher:async(path,options={})=>{
  requests.push({path,method:options.method||'GET',body:options.body});
  if(faults&&options.method==='PUT'&&mode==='reject')return Response.json({error:{code:'UNAVAILABLE',message:'Fixture unavailable'}},{status:503});
  const result=await handlePlannerRequest(new Request('https://planner.example'+path,{...options,headers:{...options.headers,'oai-authenticated-user-id':'reschedule-review'}}),env);
  if(faults&&options.method==='PUT'&&mode==='lost')return new Response('lost-json',{status:200});
  if(faults&&options.method==='PUT'&&mode==='delay'){started();await gate;}return result;
 }})});
 let state=normalizeState(await store.load());
 const initial={id:'keep-post',scheduleBinding:null,scheduledInstant:null,title:'Keep title',tags:['Keep label','Literal, label'],text:'Keep body',variantTexts:{mastodon:'Keep variant',instagram:'Keep body'},channels:['mastodon','instagram'],status:'scheduled',scheduledAt:local,timeZone:postZone,cover:null,mediaItems:[{dataUrl:'data:image/png;base64,'+Buffer.from(png).toString('base64'),type:'image/png',name:'original.png',alt:'Original alt'}],createdAt:'2026-11-09T10:00:00.000Z'};
 state=normalizeState(await store.save({...state,posts:[initial]}));
 if(bound){
  state=normalizeState(await store.save({...state,channels:state.channels.map(c=>({...c,postingSchedule:{schemaVersion:1,timezone:postZone,paused:false,minimumGapMinutes:30,overlapChoice:'reject',slots:[{id:'sunday',weekday:0,time:'10:15'}]}}))}));
  const proposal=findNextPostingSlots(state,{postId:'keep-post',channelIds:initial.channels,after:'2027-01-30T00:00:00.000Z',displayTimezone:postZone}),selected=selectPostingSlot(state,proposal,proposal.suggestions[0],{now:'2027-01-30T00:00:00.000Z'});
  state=normalizeState(await store.save({...state,posts:[{...state.posts[0],scheduledAt:selected.local,scheduledInstant:selected.scheduledAt,scheduleBinding:selected.scheduleBinding}]}));
 }
 const post=state.posts[0],before=await repo.load('reschedule-review'),mediaBefore=clone([...env.BUCKET.data]);requests.length=0;faults=true;
 const fields=new Map(),raf=[],notices=[],workspaceEvents=[];let checks=[],otherDialog=false,modalNotices=[];
 const doc={activeElement:{isConnected:true,focus(){}},querySelector:()=>otherDialog?{}:null};
 function $(s){if(!fields.has(s)){const el={value:'',hidden:false,disabled:false,open:false,isConnected:true,scrollTop:0,dataset:{},setAttribute(){},scrollIntoView(){this.scrolled=true;},focus(){doc.activeElement=this;},showModal(){this.open=true;},close(){this.open=false;},classList:{toggle(){}}};Object.defineProperty(el,'innerHTML',{set(value){this.html=value;if(s==='#composer-channels')checks=[...value.matchAll(/value="([^"]+)" (checked)?/g)].map(([,value,checked])=>({value,checked:!!checked,disabled:false}));},get(){return this.html||'';}});fields.set(s,el);}return fields.get(s);}
 const $$=s=>s.includes('composer-channels')?(s.includes(':checked')?checks.filter(x=>x.checked):checks):[];
 const timing=createEditorTiming();
 const c=vm.createContext({...preservationContext(),...videoContext(),composerImages:createComposerMedia(),savedAltEdit:null,cancelSavedAlt(){},composerFileDrop:{reset(){}},savedTextPicker:null,postTemplatePicker:null,splitPending:false,closeDraftSplit(){},updateDraftSplitAvailability(){},store,state,normalizeState,validatePost,editedPostLabels,selectedVariantTexts,calendarTime,startOfWeek,dateKey,addDays,zonedNow,displayTitle,CHANNELS,Date,Promise,crypto,structuredClone,formatIdeaTags,
  composerTiming:timing,composerMedia:null,composerCover:null,composerMissingMedia:false,composerBaseText:'',composerVariantTexts:{},composerLabelState:null,activeTextTarget:'base',composerIdeaFingerprint:null,editingId:null,composerRestoredWorkspace:false,saving:false,mediaLoading:false,initialEditor:'',view:'calendar',range:'month',anchor:new Date('2027-01-15T12:00'),calendarStatus:'all',workspaceRestoring:false,workspacePlannerReading:false,composerGeneration:0,mediaGeneration:0,plannerLoaded:true,channel:'all',returnFocus:null,
  $,$$,document:doc,requestAnimationFrame:fn=>raf.push(fn),setComposerBusy(){},focusComposerErrors:el=>el.focus(),notify:x=>notices.push(x),currentZone:()=>calendarZone,render(){},renderMediaEditor(){},renderVariantTabs(){},renderPreview(){if($('#composer').open)c.workspaceUI.captureChanged();},populateZoneSelect:(el,value)=>{el.value=value;},refreshMastodonPlanningStatus(){},clearMastodonPlanningStatus(){},queuePanel:{reset(){},invalidate(){}},imageStudio:{close(){}},showInfo:(title,html)=>modalNotices.push([title,html]),
  workspaceUI:{editorOpened(data){workspaceEvents.push(['open',data,c.editorSnapshot()]);},captureChanged(){workspaceEvents.push(['changed',c.editorSnapshot()]);},editorClosed(){workspaceEvents.push(['close']);},beforePostSave(){workspaceEvents.push(['before']);},afterPostSave(){workspaceEvents.push(['after']);if(mode==='cleanup-late')c.composerBaseText='Late cleanup text';},retainNewerInput(){workspaceEvents.push(['retain']);},hasUnsavedLocalInput:false,canCloseSafely:false},
  esc:s=>String(s??'').replaceAll('"','&quot;').replaceAll('<','&lt;'),platform:()=>''});
 for(const name of ['renderComposerChannels','setComposerDate','currentComposerRawTags','editorSnapshot','openComposer','applyCalendarReschedule','calendarRescheduleBusy','askDiscard','closeComposer','savePost','persist'])vm.runInContext(actual(name),c);
 return {c,$,fields,requests,store,repo,env,post,before,mediaBefore,ready,resolveWrite,notices,workspaceEvents,modalNotices,raf,get otherDialog(){return otherDialog;},set otherDialog(v){otherDialog=v;},apply(day='2027-02-01'){return c.applyCalendarReschedule(post,proposeCalendarReschedule(post,day,calendarZone));}};
}
const writes=h=>h.requests.filter(r=>r.method==='PUT');
async function unchanged(h){assert.deepEqual(await h.repo.load('reschedule-review'),h.before);assert.deepEqual([...h.env.BUCKET.data],h.mediaBefore);assert.equal(writes(h).length,0);}
async function preserved(h){const after=await h.repo.load('reschedule-review'),old=h.before.posts[0],p=after.posts[0];for(const key of ['id','title','body','tags','createdAt','cover'])assert.deepEqual(p[key],old[key],key);for(const [i,v] of p.variants.entries()){for(const key of ['id','channelId','body','inheritsBody','status','format','mediaIds','createdAt','statusNote'])assert.deepEqual(v[key],old.variants[i][key],key);}assert.deepEqual(after.media,h.before.media);assert.deepEqual([...h.env.BUCKET.data],h.mediaBefore);assert.equal(h.requests.filter(r=>r.path==='/api/planner/media'&&r.method==='POST').length,0);return after;}

test('actual original composer baseline precedes unsaved proposal; cancel never writes planning',async t=>{const h=await harness(t);h.apply();assert.equal(h.$('#composer').open,true);const initial=JSON.parse(h.c.initialEditor),dirty=JSON.parse(h.c.editorSnapshot());assert.equal(initial.date,'2027-01-31');assert.equal(initial.planning.scheduledInstant,h.post.scheduledInstant);assert.equal(dirty.date,'2027-02-01');assert.equal(dirty.planning.scheduledInstant,null);assert.notEqual(h.c.editorSnapshot(),h.c.initialEditor);assert.equal(h.workspaceEvents[0][0],'open');assert.equal(h.workspaceEvents[0][2],h.c.initialEditor);assert.equal(h.workspaceEvents[1][0],'changed');assert.equal(dateKey(h.c.anchor),'2027-01-15');await unchanged(h);h.c.askDiscard();assert.equal(h.modalNotices.length,1);assert.equal(h.$('#composer').open,true);h.c.closeComposer();await unchanged(h);});
for(const [local,source,zone,day] of [['2027-01-31T10:15','Europe/Berlin','Europe/Berlin','2027-02-01'],['2026-12-31T10:15','Europe/Berlin','Europe/Berlin','2027-01-01'],['2027-01-01T06:30','Asia/Tokyo','America/Los_Angeles','2027-01-01'],['2026-12-31T18:30','America/Los_Angeles','Asia/Tokyo','2027-01-02']])test(`real save from calendar ${zone} preserves source zone ${source} and anchors ${day}`,async t=>{const h=await harness(t,{local,postZone:source,calendarZone:zone});h.apply(day);assert.equal(h.c.composerTiming.snapshot.scheduledInstant,null);await unchanged(h);await h.c.savePost('scheduled');const after=await preserved(h);assert.equal(after.revision,h.before.revision+1);assert.equal(writes(h).length,1);assert.equal(h.$('#composer').open,false);assert.equal(dateKey(h.c.anchor),day);assert.equal(h.c.state.posts[0].timeZone,source);assert.equal(calendarTime(h.c.state.posts[0],zone).local.slice(0,10),day);assert.equal(after.posts[0].scheduleBinding,null);});
test('consciously released binding is only a proposal until existing save path confirms',async t=>{const h=await harness(t,{bound:true});assert.ok(h.post.scheduleBinding);h.apply();const initial=JSON.parse(h.c.initialEditor);assert.deepEqual(initial.planning.scheduleBinding,h.post.scheduleBinding);assert.equal(h.c.composerTiming.snapshot.scheduleBinding,null);assert.equal(h.c.composerTiming.snapshot.scheduledInstant,null);await unchanged(h);await h.c.savePost('scheduled');const after=await preserved(h);assert.equal(after.posts[0].scheduleBinding,null);assert.equal(after.revision,h.before.revision+1);});
test('same-day helper and app no-op do not open editor or save',async t=>{const h=await harness(t,{bound:true});assert.equal(h.apply('2027-01-31'),false);assert.equal(h.$('#composer').open,false);assert.equal(h.workspaceEvents.length,0);await unchanged(h);});
for(const busy of ['saving','mediaLoading','workspacePlannerReading','workspaceRestoring','plannerLoaded','dialog'])test(`actual entry guard rejects ${busy}`,async t=>{const h=await harness(t);if(busy==='dialog')h.otherDialog=true;else h.c[busy]=busy!=='plannerLoaded';assert.equal(h.apply(),false);assert.equal(h.$('#composer').open,false);await unchanged(h);});
test('deferred focus cannot refocus closed composer or a later editor',async t=>{const h=await harness(t);h.apply();assert.equal(h.raf.length,1);h.c.closeComposer();const focused=h.c.document.activeElement;h.raf.shift()();assert.equal(h.c.document.activeElement,focused);h.apply();h.c.closeComposer();h.c.openComposer(h.post.id);const newerFocus=h.c.document.activeElement;h.raf.shift()();assert.equal(h.c.document.activeElement,newerFocus);h.raf.shift()();assert.equal(h.c.document.activeElement,h.$('#post-text'));});
test('rejected save retains proposal and source content without moving calendar',async t=>{const h=await harness(t,{mode:'reject'});h.apply();await h.c.savePost('scheduled');assert.equal(h.$('#composer').open,true);assert.equal(h.$('#post-date').value,'2027-02-01');assert.equal(dateKey(h.c.anchor),'2027-01-15');assert.deepEqual(await h.repo.load('reschedule-review'),h.before);assert.equal(writes(h).length,1);assert.equal(h.notices.some(n=>n.includes('eingeplant.')),false);});
test('CAS rejects stale move without merge/retry or data loss',async t=>{const h=await harness(t);h.apply();const remote=clone(h.before);remote.posts[0].body='Remote newer';await h.repo.save('reschedule-review',remote);const current=await h.repo.load('reschedule-review');await h.c.savePost('scheduled');assert.deepEqual(await h.repo.load('reschedule-review'),current);assert.equal(h.c.composerBaseText,'Keep body');assert.equal(h.$('#post-date').value,'2027-02-01');assert.equal(h.$('#composer').open,true);assert.equal(dateKey(h.c.anchor),'2027-01-15');assert.equal(writes(h).length,1);});
test('lost successful save response is not retried or reported as success',async t=>{const h=await harness(t,{mode:'lost'});h.apply();await h.c.savePost('scheduled');const after=await preserved(h);assert.equal(after.revision,h.before.revision+1);assert.equal(writes(h).length,1);assert.equal(h.$('#composer').open,true);assert.equal(h.c.state.revision,h.before.revision);assert.equal(h.c.state.posts[0].scheduledAt,h.post.scheduledAt);assert.equal(h.$('#post-date').value,'2027-02-01');assert.equal(dateKey(h.c.anchor),'2027-01-15');assert.equal(h.workspaceEvents.some(([type])=>type==='after'),false);assert.equal(h.notices.some(n=>n.includes('eingeplant.')),false);});
test('double save while pending sends exactly one write; late edits stay open',async t=>{const h=await harness(t,{mode:'delay'});h.apply();const pending=h.c.savePost('scheduled');await h.ready;await h.c.savePost('scheduled');h.c.composerBaseText='Late unsent text';h.resolveWrite();await pending;await preserved(h);assert.equal(writes(h).length,1);assert.equal(h.$('#composer').open,true);assert.equal(h.c.composerBaseText,'Late unsent text');assert.equal(dateKey(h.c.anchor),'2027-01-15');assert.equal(h.workspaceEvents.filter(([type])=>type==='retain').length,1);});
test('late input during workspace close remains open after confirmed save',async t=>{const h=await harness(t,{mode:'cleanup-late'});h.apply();await h.c.savePost('scheduled');await preserved(h);assert.equal(writes(h).length,1);assert.equal(h.$('#composer').open,true);assert.equal(h.c.composerBaseText,'Late cleanup text');assert.equal(h.workspaceEvents.filter(([type])=>type==='retain').length,1);});
test('opening a clean multi-channel draft refreshes split availability after clearing prior workspace context',async t=>{
 const h=await harness(t),c=h.c;
 const p=c.state.posts.find(p=>p.id===h.post.id);p.status='draft';p.scheduledAt=null;p.scheduledInstant=null;p.scheduleBinding=null;p.channels=['instagram','linkedin'];
 let priorWorkspace={id:'old-workspace'},observed=[];
 c.workspaceUI.editorOpened=()=>{priorWorkspace=null;};
 c.updateDraftSplitAvailability=()=>observed.push({workspace:priorWorkspace,revision:c.composerSavedRevision,open:h.$('#composer').open});
 c.openComposer(p.id);
 assert.deepEqual(observed,[{workspace:null,revision:c.state.revision,open:true}]);
});
