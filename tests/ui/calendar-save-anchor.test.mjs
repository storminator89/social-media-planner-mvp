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
async function harness(t,{local='2026-12-01T10:00',postZone='Europe/Berlin',calendarZone='Europe/Berlin',range='month',view='calendar',mode='normal'}={}){
 const env={DB:new D1TestAdapter(),BUCKET:new R2TestAdapter()};t.after(()=>env.DB.sql.close());
 const requests=[],repo=new PlannerRepository(env.DB);let fault=false,resolveWrite,started;
 const ready=new Promise(resolve=>{started=resolve}),gate=new Promise(resolve=>{resolveWrite=resolve});t.after(()=>resolveWrite());
 const store=createTaktStore({timezone:calendarZone,channels:CHANNELS,client:createPlannerClient({fetcher:async(path,options={})=>{
  requests.push({path,method:options.method||'GET'});
  if(fault&&options.method==='PUT'&&mode==='reject')return new Response(JSON.stringify({error:{code:'UNAVAILABLE',message:'Synthetic unavailable'}}),{status:503});
  const result=await handlePlannerRequest(new Request('https://planner.example'+path,{...options,headers:{...options.headers,'oai-authenticated-user-id':'calendar-anchor-review'}}),env);
  if(fault&&options.method==='PUT'&&mode==='delay'){started();await gate;}return result;
 }})});
 let state=normalizeState(await store.load());
 const initial={id:'keep-post',scheduleBinding:null,scheduledInstant:null,title:'Keep title',tags:['Keep label'],text:'Keep body',variantTexts:{mastodon:'Keep variant'},channels:['mastodon'],status:'draft',scheduledAt:null,timeZone:postZone,cover:null,mediaItems:[{dataUrl:'data:image/png;base64,'+Buffer.from(png).toString('base64'),type:'image/png',name:'original.png',alt:'Original alt'}],createdAt:'2026-11-09T10:00:00.000Z'};
 state=normalizeState(await store.save({...state,posts:[initial]}));const post=state.posts[0],before=await repo.load('calendar-anchor-review'),mediaBefore=clone([...env.BUCKET.data]);requests.length=0;fault=true;
 const fields={'#post-tags':{value:'Keep label'},'#post-date':{value:local.slice(0,10)},'#post-time':{value:local.slice(11)},'#post-zone':{value:postZone},'#form-errors':{hidden:true},'#search':{value:''}};
 const timing=createEditorTiming();timing.open(post);let closes=0,retains=0,cleanups=0;const notices=[];
 const c=vm.createContext({...preservationContext(),composerImages:createComposerMedia(),savedAltEdit:null,cancelSavedAlt(){},store,state,normalizeState,validatePost,editedPostLabels,selectedVariantTexts,calendarTime,calendarPosts,planningStatus,startOfWeek,dateKey,addDays,zonedNow,displayTitle,CHANNELS,Date,Promise,crypto,structuredClone,
  composerTiming:timing,composerMedia:clone(post.mediaItems[0]),composerCover:post.cover,composerMissingMedia:false,composerBaseText:post.text,composerVariantTexts:clone(post.variantTexts),composerLabelState:{title:post.title,tags:post.tags,raw:'Keep label',rendered:'Keep label',baseline:'Keep label'},activeTextTarget:'base',composerIdeaFingerprint:null,editingId:post.id,composerRestoredWorkspace:false,saving:false,mediaLoading:false,initialEditor:'',view,range,anchor:new Date('2026-10-15T12:00'),calendarStatus:'review',
  $:s=>fields[s],$$:()=>[{value:'mastodon'}],setComposerBusy(){},focusComposerErrors(){},notify:x=>notices.push(x),currentZone:()=>calendarZone,closeComposer(){closes++},render(){},workspaceUI:{beforePostSave(){},afterPostSave(){cleanups++},retainNewerInput(){retains++}},
  days:['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'],dateLabel:(d,o)=>new Intl.DateTimeFormat('de-DE',o).format(d),esc:s=>String(s??'').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;'),icon:()=>'',platform:()=>'',scheduleNeedsReview:()=>false,postLabelDescription:()=>'',renderAgenda:posts=>posts.map(p=>p.id).join(',')});
 c.composerImages.reset(post.mediaItems);c.composerMedia=c.composerImages.selected;
 for(const name of ['currentComposerRawTags','editorSnapshot','savePost','persist','visiblePeriod','periodPosts','renderMonth'])vm.runInContext(actual(name),c);
 c.initialEditor=c.editorSnapshot();
 return {c,fields,requests,store,repo,env,before,mediaBefore,ready,resolveWrite,notices,get closes(){return closes},get retains(){return retains},get cleanups(){return cleanups}};
}
async function assertPreserved(h,local,zone){
 const loaded=await h.store.load(),post=loaded.posts[0],raw=await h.repo.load('calendar-anchor-review'),old=h.before.posts[0];
 assert.equal(raw.revision,h.before.revision+1);assert.equal(post.scheduledAt,local);assert.equal(post.timeZone,zone);assert.equal(post.scheduledInstant,calendarTime(post,zone).instant);
 assert.equal(raw.posts[0].title,old.title);assert.equal(raw.posts[0].body,old.body);assert.deepEqual(raw.posts[0].tags,old.tags);assert.equal(raw.posts[0].variants[0].body,old.variants[0].body);assert.deepEqual(raw.posts[0].variants[0].mediaIds,old.variants[0].mediaIds);assert.deepEqual(raw.media,h.before.media);assert.deepEqual([...h.env.BUCKET.data],h.mediaBefore);
 assert.equal(h.requests.filter(r=>r.method==='PUT').length,1);assert.equal(h.requests.filter(r=>r.method==='POST'&&r.path==='/api/planner/media').length,0);assert.equal(h.closes,1);return post;
}
for(const date of ['2026-12-01','2027-01-01','2027-08-01','2027-02-01','2028-02-29','2027-12-31'])test(`actual scheduled save retains displayed month for ${date}`,async t=>{
 const local=date+'T10:00',h=await harness(t,{local});await h.c.savePost('scheduled');const post=await assertPreserved(h,local,'Europe/Berlin');
 assert.equal(dateKey(h.c.anchor),date);const period=h.c.visiblePeriod();assert.equal(dateKey(period.start),date.slice(0,7)+'-01');const projected=calendarPosts([post],'Europe/Berlin');assert.equal(h.c.periodPosts(projected).length,1);
 const html=h.c.renderMonth(projected),label=new Intl.DateTimeFormat('de-DE',{day:'numeric',month:'long'}).format(h.c.anchor);assert.match(html,new RegExp(`<section class="month-cell [^"]*" aria-label="${label}"[^>]*>[\\s\\S]*?data-post-id="keep-post"`));const cell=html.split(`<section `).find(x=>x.includes(`aria-label="${label}"`));assert.ok(cell);assert.doesNotMatch(cell.split('>')[0],/muted/);assert.equal(h.c.calendarStatus,'all');
});
for(const range of ['week','month'])test(`week/month switching after save retains the saved day from ${range}`,async t=>{
 const h=await harness(t,{range});await h.c.savePost('scheduled');assert.equal(dateKey(h.c.anchor),'2026-12-01');h.c.range='week';let p=h.c.visiblePeriod();assert.equal(dateKey(p.start),'2026-11-30');assert.equal(dateKey(p.end),'2026-12-06');h.c.range='month';p=h.c.visiblePeriod();assert.equal(dateKey(p.start),'2026-12-01');assert.equal(dateKey(p.end),'2026-12-31');
});
for(const [local,postZone,calendarZone,expected] of [['2026-12-01T00:30','Asia/Tokyo','Europe/Berlin','2026-11-30'],['2026-12-31T23:30','America/Los_Angeles','Asia/Tokyo','2027-01-01'],['2027-01-01T00:30','Asia/Tokyo','America/Los_Angeles','2026-12-31']])test(`anchor follows projected calendar date ${expected}, not source wall date`,async t=>{
 const h=await harness(t,{local,postZone,calendarZone});await h.c.savePost('scheduled');const post=await assertPreserved(h,local,postZone);assert.equal(calendarTime(post,calendarZone).local.slice(0,10),expected);assert.equal(dateKey(h.c.anchor),expected);assert.equal(dateKey(h.c.visiblePeriod().start),expected.slice(0,7)+'-01');
});
for(const view of ['drafts','ideas','list','queue','home'])test(`scheduled save keeps existing view transition from ${view}`,async t=>{const h=await harness(t,{view});await h.c.savePost('scheduled');assert.equal(h.c.view,['drafts','ideas'].includes(view)?'calendar':view);assert.equal(dateKey(h.c.anchor),'2026-12-01');});
test('draft save does not move the anchor or manufacture a schedule',async t=>{const h=await harness(t);await h.c.savePost('draft');assert.equal(dateKey(h.c.anchor),'2026-10-15');assert.equal(h.c.view,'drafts');assert.equal(h.c.state.posts[0].scheduledAt,null);assert.equal(h.c.state.posts[0].scheduledInstant,null);});
test('rejected save keeps previous anchor, view, editor and canonical data',async t=>{const h=await harness(t,{mode:'reject'});await h.c.savePost('scheduled');assert.equal(dateKey(h.c.anchor),'2026-10-15');assert.equal(h.c.view,'calendar');assert.equal(h.closes,0);assert.deepEqual(await h.repo.load('calendar-anchor-review'),h.before);assert.equal(h.requests.filter(r=>r.method==='PUT').length,1);});
test('CAS conflict never moves calendar or retries the save',async t=>{const h=await harness(t),remote=clone(h.before);remote.posts[0].body='Remote newer';await h.repo.save('calendar-anchor-review',remote);const current=await h.repo.load('calendar-anchor-review');await h.c.savePost('scheduled');assert.equal(dateKey(h.c.anchor),'2026-10-15');assert.equal(h.closes,0);assert.equal(h.requests.filter(r=>r.method==='PUT').length,1);assert.deepEqual(await h.repo.load('calendar-anchor-review'),current);});
test('newer edit during delayed save remains open without changing calendar',async t=>{const h=await harness(t,{mode:'delay'}),pending=h.c.savePost('scheduled');await h.ready;h.c.composerBaseText='Newer unsent text';h.resolveWrite();await pending;assert.equal(h.closes,0);assert.equal(h.retains,1);assert.equal(dateKey(h.c.anchor),'2026-10-15');assert.equal(h.c.composerBaseText,'Newer unsent text');assert.equal(h.requests.filter(r=>r.method==='PUT').length,1);});
