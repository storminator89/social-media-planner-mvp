import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {homeOverview,renderHomeOverview} from '../../public/home-overview.js';
const now=new Date('2026-11-08T12:00:00Z');
const scheduled=(id,instant)=>({id,title:id,text:id,status:'scheduled',scheduledAt:instant.slice(0,16),scheduledInstant:instant,timeZone:'UTC',channels:['mastodon'],tags:[]});
const draft=(id,updatedAt)=>({id,text:id,status:'draft',channels:['mastodon'],updatedAt,tags:[]});
const state=posts=>({posts,settings:{timezone:'Europe/Berlin'},channels:[{id:'mastodon',name:'Mastodon',postingSchedule:null}]});
test('read-only home groups real planned times and drafts, exact now is past, ideas excluded',()=>{
 const input=state([scheduled('future','2026-11-08T13:00:00Z'),scheduled('past','2026-11-07T13:00:00Z'),scheduled('now','2026-11-08T12:00:00Z'),draft('draft','2026-11-08T11:00:00Z'),{id:'idea',status:'idea'}]);const before=structuredClone(input),out=homeOverview(input,now);assert.deepEqual(out.upcoming.map(p=>p.id),['future']);assert.deepEqual(out.overdue.map(p=>p.id),['now','past']);assert.deepEqual(out.drafts.map(p=>p.id),['draft']);assert.deepEqual(input,before);
});
test('upcoming order uses real instants across zones and drafts use recent update order',()=>{
 const a=scheduled('later','2026-11-08T14:00:00Z'),b={...scheduled('earlier','2026-11-08T13:00:00Z'),scheduledAt:'2026-11-08T22:00',timeZone:'Asia/Tokyo'};const result=homeOverview(state([a,b,draft('old','2026-11-01T01:00:00Z'),draft('new','2026-11-07T01:00:00Z')]),now);assert.deepEqual(result.upcoming.map(p=>p.id),['earlier','later']);assert.deepEqual(result.drafts.map(p=>p.id),['new','old']);
});
test('invalidated schedule binding is review, not duplicated as overdue or imminent',()=>{
 const p=scheduled('review','2026-11-07T13:00:00.000Z');p.scheduleBinding={schemaVersion:1,mode:'queue',instant:p.scheduledInstant,selectedAt:now.toISOString(),sourceRevision:1,refs:[{channelId:'mastodon',slotId:'monday',local:'2026-11-07T13:00',timezone:'UTC',overlapChoice:'reject',minimumGapMinutes:0}]};const out=homeOverview(state([p]),now);assert.equal(out.review.length,1);assert.equal(out.overdue.length,0);assert.equal(out.upcoming.length,0);assert.equal(out.review[0].scheduledInstant,p.scheduledInstant);
});
test('missing confirmed load is explicitly unavailable, never asserted empty analytics',()=>{
 const html=renderHomeOverview(state([]),now,{available:false});assert.match(html,/Planung nicht verfügbar/);assert.doesNotMatch(html,/home-count|Keine vergangenen|Noch keine Entwürfe/);
});
test('confirmed empty state has useful next steps and no fabricated analytics or account status',()=>{
 const html=renderHomeOverview(state([]),now);assert.match(html,/Noch keine Termine/);assert.match(html,/Keine vergangenen Planungstermine/);assert.doesNotMatch(html,/Planung ist kein Versandnachweis/);assert.match(html,/data-action="new-idea"/);assert.doesNotMatch(html,/Reichweite|Follower|verbunden|erfolgreich veröffentlicht/);
});
test('all user-controlled values are escaped and displayed dates use the current planning zone',()=>{
 const p=scheduled('id" onclick="bad','2026-11-08T13:00:00Z');p.text='<img src=x onerror=bad>';const data=state([p]);data.channels[0].name='<script>bad</script>';const html=renderHomeOverview(data,now);assert.match(html,/&lt;img/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<img|<script|data-post-id="id"/);assert.match(html,/14:00/);assert.match(html,/Europe\/Berlin/);
});
test('preview counts are honest and expanding reveals all existing records',()=>{
 const data=state(Array.from({length:8},(_,i)=>scheduled('p'+i,`2026-11-${10+i}T13:00:00Z`)));const preview=renderHomeOverview(data,now),all=renderHomeOverview(data,now,{expanded:new Set(['upcoming'])});assert.match(preview,/5 von 8/);assert.equal((preview.match(/data-post-id=/g)||[]).length,5);assert.equal((all.match(/data-post-id=/g)||[]).length,8);assert.match(all,/Weniger anzeigen/);
});
test('home is reachable without removing any existing desktop or mobile route',()=>{
 const html=readFileSync(new URL('../../public/index.html',import.meta.url),'utf8');const mobile=html.match(/<nav class="mobile-nav"[^>]*>(.*?)<\/nav>/s)[1];for(const view of ['home','calendar','drafts','ideas','connections'])assert.ok(mobile.includes(`data-view="${view}"`));assert.match(mobile,/data-action="settings"/);const app=readFileSync(new URL('../../public/app.js',import.meta.url),'utf8');assert.match(app,/view='home'/);assert.match(app,/plannerLoaded=true/);assert.match(app,/available:plannerLoaded/);assert.match(app,/\['home','calendar','list','queue','drafts','ideas','connections'\]/);assert.match(app,/renderPlanningChannelControls\(\)/);
});
test('home render clears stale controls, honors load failure and does not use active filters',()=>{
 const source=readFileSync(new URL('../../public/app.js',import.meta.url),'utf8'),fn=source.slice(source.indexOf('function render(){'),source.indexOf('\nfunction notify('));const fields=new Map();const $=id=>{if(!fields.has(id))fields.set(id,{dataset:{},setAttribute(){}});return fields.get(id);};const c=vm.createContext({document:{body:{dataset:{}}},view:'home',history:{replaceState(){}},$,$$:()=>[],renderPostLabelFilter(){},renderPlanningChannelControls(){},connectionsPanel:{hide(){}},state:state([draft('one','2026-11-08T10:00:00Z')]),CHANNELS:[],platform:()=>'',esc:String,homeExpanded:new Set(),plannerLoaded:false,renderHomeOverview,channel:'mastodon',query:'does not match',postTag:'hidden'});vm.runInContext(fn,c);c.render();assert.equal($('.view-toolbar').hidden,true);assert.equal($('#calendar-toolbar').hidden,true);assert.equal($('#post-filter-summary').hidden,true);assert.match($('#content').innerHTML,/nicht verfügbar/);c.plannerLoaded=true;c.render();assert.match($('#content').innerHTML,/data-post-id="one"/);assert.equal($('.create-post').dataset.action,'new-post');
});

test('six mobile destinations share one row rather than overflowing the fixed navigation bar',()=>{
 const css=readFileSync(new URL('../../public/home-overview.css',import.meta.url),'utf8');
 assert.match(css,/\.mobile-nav:has\(\[data-view="home"\]\)\{grid-template-columns:repeat\(6,minmax\(0,1fr\)\);grid-template-rows:1fr\}/);
});
