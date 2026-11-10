import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import {describeMastodonPlanningStatus as describe,refreshMastodonPlanningStatus as refresh,clearMastodonPlanningStatus as clear} from '../../public/mastodon-planning.js';
import {CHANNELS,normalizeState} from '../../public/model.js';
import {createTaktStore} from '../../modules/data/takt-adapter.mjs';
import {createPlannerClient} from '../../modules/data/client.mjs';
import {handlePlannerRequest} from '../../modules/data/api.mjs';
import {D1TestAdapter,R2TestAdapter,png} from '../data/support.mjs';
const profile={provider:'mastodon',instance:'https://kanoa.de',scope:'profile',canPublish:false,phase:'linked',account:'fixture'};
const publishing={phase:'linked',account:'fixture',canPublish:true,canStart:false};
test('planning availability does not imply publishing and permissions stay distinct',()=>{
 assert.ok(CHANNELS.find(c=>c.id==='mastodon'));assert.match(describe(profile,publishing),/Versandzugriff bestätigt/);
 for(const [p,v] of [[null,publishing],[{...profile,scope:'write:statuses'},publishing],[profile,{...publishing,account:'other'}],[profile,{...publishing,phase:'pending'}]])assert.doesNotMatch(describe(p,v),/Versandzugriff bestätigt/);
 assert.match(describe(profile,{...publishing,expired:true}),/abgelaufen/);assert.match(describe(profile,{...publishing,accountMismatch:true}),/nicht zum selben Konto/);assert.match(describe(null,null),/nicht verfügbar/);
});
test('status reads GET only and ignores late responses after close or newer open',async()=>{
 const output={textContent:''},root={querySelector:()=>output},pending=[],calls=[];
 const first=refresh(root,{fetchImpl:(url,options)=>{calls.push({url,options});return new Promise(resolve=>pending.push(resolve));}});
 clear();output.textContent='closed';pending.forEach(resolve=>resolve({ok:true,json:async()=>profile}));await first;assert.equal(output.textContent,'closed');
 await refresh(root,{fetchImpl:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>url.includes('/oauth/')?profile:publishing};}});
 assert.match(output.textContent,/Versandzugriff bestätigt/);assert.ok(calls.every(c=>c.options.method==='GET'&&c.url.endsWith('/readiness')&&!c.options.body));
 await refresh(root,{fetchImpl:async()=>{throw Error('offline');}});assert.match(output.textContent,/nicht verfügbar/);
});
test('existing three-channel planner preserves data and adds Mastodon only on ordinary save',async()=>{
 const env={DB:new D1TestAdapter(),BUCKET:new R2TestAdapter()},requests=[];
 const client=createPlannerClient({fetcher:(path,opts={})=>{requests.push({path,method:opts.method||'GET'});return handlePlannerRequest(new Request('https://planner.example'+path,{...opts,headers:{...opts.headers,'oai-authenticated-user-id':'fixture'}}),env);}});
 const oldStore=createTaktStore({client,timezone:'Europe/Berlin',channels:CHANNELS.filter(c=>c.id!=='mastodon')});let old=await oldStore.load();old.channels[0].handle='@preserved';old.posts.push({id:'existing',text:'Keep me',channels:['instagram'],status:'draft',scheduledAt:null,scheduledInstant:null,scheduleBinding:null,timeZone:'Europe/Berlin',media:{dataUrl:'data:image/png;base64,'+Buffer.from(png).toString('base64'),name:'fixture.png',alt:'Retained image',type:'image/png'},title:'Keep title',tags:['Keep tag'],variantTexts:{instagram:'Keep variant'}});old=await oldStore.save(old);
 const store=createTaktStore({client,timezone:'Europe/Berlin',channels:CHANNELS});const before=await client.load(),loaded=normalizeState(await store.load());assert.equal((await client.load()).revision,before.revision);assert.equal(loaded.channels.length,4);assert.equal(loaded.channels.find(c=>c.id==='instagram').handle,'@preserved');assert.deepEqual(loaded.posts,normalizeState(old).posts);
 loaded.posts.push({...loaded.posts[0],id:'mastodon-draft',text:'Fixture',channels:['mastodon'],variantTexts:{mastodon:'Own text'}});const saved=await store.save(loaded);assert.equal(saved.posts.length,2);const reloaded=await store.load();assert.equal(reloaded.channels.filter(c=>c.id==='mastodon').length,1);assert.deepEqual(reloaded.posts.find(p=>p.id==='mastodon-draft').channels,['mastodon']);assert.equal(reloaded.posts.find(p=>p.id==='mastodon-draft').variantTexts.mastodon,'Own text');assert.ok(requests.every(r=>!r.path.includes('/providers/')));
 await assert.rejects(oldStore.save(old),error=>error.status===409);
 const target=reloaded.posts.find(p=>p.id==='mastodon-draft');target.status='scheduled';target.scheduledAt='2027-02-01T10:00';target.scheduledInstant=null;target.scheduleBinding=null;
 const scheduled=await store.save(reloaded);assert.equal(scheduled.posts.find(p=>p.id==='mastodon-draft').status,'scheduled');assert.equal(scheduled.posts.find(p=>p.id==='mastodon-draft').scheduledAt,'2027-02-01T10:00');
 assert.deepEqual({...scheduled.posts.find(p=>p.id==='existing'),updatedAt:null},{...saved.posts.find(p=>p.id==='existing'),updatedAt:null});
 const oldClient=createTaktStore({client,timezone:'Europe/Berlin',channels:CHANNELS.filter(c=>c.id!=='mastodon')});await assert.rejects(oldClient.load(),error=>error.code==='UI_SCHEMA_UNSUPPORTED');
 assert.ok(requests.every(r=>!r.path.includes('/providers/')));
});
test('newer composer status wins over an earlier delayed read',async()=>{
 const output={textContent:''},root={querySelector:()=>output},pending=[];
 const old=refresh(root,{fetchImpl:()=>new Promise(resolve=>pending.push(resolve))});
 await refresh(root,{fetchImpl:async()=>({ok:false})});const latest=output.textContent;
 pending.forEach((resolve,i)=>resolve({ok:true,json:async()=>i===0?profile:publishing}));await old;assert.equal(output.textContent,latest);
});

test('filter and overview derive every planning target from CHANNELS and preserve selection',()=>{
 const app=readFileSync(new URL('../../public/app.js',import.meta.url),'utf8'),html=readFileSync(new URL('../../public/index.html',import.meta.url),'utf8');
 const start=app.indexOf('function renderPlanningChannelControls(){'),end=app.indexOf('\nfunction render(){',start);assert.ok(start>=0&&end>start);
 const fields={'#channel-filter':{},'#planning-channel-count':{}},context=vm.createContext({CHANNELS,channel:'mastodon',esc:v=>String(v),$:id=>fields[id]});vm.runInContext(app.slice(start,end),context);context.renderPlanningChannelControls();
 for(const c of CHANNELS)assert.match(fields['#channel-filter'].innerHTML,new RegExp('value="'+c.id+'"'));
 assert.equal(fields['#channel-filter'].value,'mastodon');assert.equal(fields['#planning-channel-count'].textContent,'4');context.channel='all';context.renderPlanningChannelControls();assert.equal(fields['#channel-filter'].value,'all');
 assert.match(html,/id="planning-channel-count"/);assert.match(html,/Planungsziele/);assert.doesNotMatch(html,/Demo-Kanäle|<strong>3<\/strong>/);assert.match(app,/renderPostLabelFilter\(\);renderPlanningChannelControls\(\)/);
 const summary=app.slice(app.indexOf('function showChannels(){'),app.indexOf('\n',app.indexOf('function showChannels(){')));assert.doesNotMatch(summary,/Nicht verbunden|enthält beides nicht/);assert.match(summary,/Beispielprofil/);assert.match(summary,/Planungsziel/);
});

test('hung readiness request or JSON body times out without blocking planning or stale overwrite',async()=>{
 const output={textContent:''},root={querySelector:()=>output},signals=[];let complete;
 await refresh(root,{timeoutMs:5,fetchImpl:async(url,options)=>{signals.push(options.signal);if(url.includes('/oauth/'))return {ok:true,json:()=>new Promise(resolve=>{complete=resolve;})};return new Promise(()=>{});}});
 assert.match(output.textContent,/Profilstatus nicht verfügbar/);assert.match(output.textContent,/Veröffentlichungsstatus nicht verfügbar/);assert.ok(signals.every(signal=>signal.aborted));const final=output.textContent;complete(profile);await Promise.resolve();assert.equal(output.textContent,final);
});
