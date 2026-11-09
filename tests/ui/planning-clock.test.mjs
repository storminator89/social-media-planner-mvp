import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {planningClockKey,installPlanningClock} from '../../public/planning-clock.js';
import {homeOverview,renderHomeOverview} from '../../public/home-overview.js';
import {channelQueue} from '../../public/channel-queue.js';
const date=s=>new Date(s);
const before='2026-11-09T12:00:00.000Z',after='2026-11-09T12:00:00.001Z';
function state(zone='Europe/Berlin'){
 return {settings:{timezone:zone},channels:[{id:'mastodon',name:'Mastodon',postingSchedule:null}],posts:[{id:'p1',title:'Title',text:'Original text',tags:['one'],channels:['mastodon'],status:'scheduled',scheduledAt:'2026-11-09T13:00',scheduledInstant:before,timeZone:'Europe/Berlin',media:null,cover:null,scheduleBinding:null}]};
}
function deepFreeze(value){Object.freeze(value);for(const x of Object.values(value))if(x&&typeof x==='object'&&!Object.isFrozen(x))deepFreeze(x);return value;}
class Element extends EventTarget{hidden=true;disabled=false;textContent='';focusCalls=[];focus(options){this.focusCalls.push(options)}querySelector(){return null}}
function harness(options={}){
 const data=deepFreeze(state(options.zone)),content=new Element(),notice=new Element(),message=new Element(),button=new Element(),focusTarget=new Element();
 const doc=new EventTarget();doc.body=new Element();doc.visibilityState='visible';
 const win=new EventTarget();win.scrollX=7;win.scrollY=412;const scrolls=[];win.scrollTo=value=>scrolls.push(value);
 const timers=new Map(),observations=[];let time=date('2026-11-09T11:59:59.999Z'),stamp=String(time.getTime()),observer,serial=0,refreshes=0,relevant=true,blocked=false,readFails=false,renderFails=false;
 class Observer{constructor(callback){this.callback=callback;observer=this}observe(target,config){observations.push([target,config])}disconnect(){this.disconnected=true}}
 const readKey=now=>{if(readFails)throw Error('PRIVATE_SECRET');return planningClockKey(data,now)};
 const changed=()=>observer.callback([{target:content,type:'childList'}]);
 const clock=installPlanningClock({content,notice,message,button,focusTarget,doc,win,Observer,now:()=>time,readKey,renderedAt:()=>stamp,isRelevant:()=>relevant,isBlocked:()=>blocked,
  setTimer(callback,delay){const id=++serial;timers.set(id,{callback,delay});return id},clearTimer:id=>timers.delete(id),
  refresh(){refreshes++;stamp=String(time.getTime());if(renderFails){observer.callback([{target:doc.body,type:'attributes'}]);throw Error('PRIVATE_SECRET')}changed();}
 });
 return {data,clock,content,notice,message,button,focusTarget,doc,win,scrolls,timers,observations,get observer(){return observer},get refreshes(){return refreshes},get stamp(){return stamp},set stamp(value){stamp=value},set time(value){time=date(value)},set relevant(value){relevant=value},set blocked(value){blocked=value},set readFails(value){readFails=value},set renderFails(value){renderFails=value},changed,
  fire(){const [id,{callback}]=timers.entries().next().value;timers.delete(id);callback()},click(){button.dispatchEvent(new Event('click'))},event(target,name){target.dispatchEvent(new Event(name))}};
}
test('clock identity changes only at status/day boundaries, not every tick or incidental content',()=>{
 const data=deepFreeze(state()),original=JSON.stringify(data),initial=planningClockKey(data,date('2026-11-09T11:30:00Z'));
 assert.equal(initial,planningClockKey(data,date('2026-11-09T11:59:59.999Z')));assert.notEqual(initial,planningClockKey(data,date(before)));assert.equal(planningClockKey(data,date(before)),planningClockKey(data,date(after)));
 const changed=structuredClone(data);changed.posts[0].text='Different';changed.posts[0].updatedAt='2099-01-01';assert.equal(initial,planningClockKey(changed,date('2026-11-09T11:30:00Z')));assert.equal(JSON.stringify(data),original);
});
for(const [zone,a,b,changes] of [
 ['Europe/Berlin','2026-11-09T22:59:59.999Z','2026-11-09T23:00:00Z',true],
 ['America/Los_Angeles','2026-11-09T23:59:59.999Z','2026-11-10T00:00:00Z',false],
 ['America/Los_Angeles','2026-11-10T07:59:59.999Z','2026-11-10T08:00:00Z',true],
 ['Asia/Tokyo','2026-11-09T14:59:59.999Z','2026-11-09T15:00:00Z',true]
])test(`civil-day key respects ${zone} at ${b}`,()=>assert.equal(planningClockKey(state(zone),date(a))!==planningClockKey(state(zone),date(b)),changes));
test('DST folds preserve exact scheduledInstant and do not invent a day change',()=>{
 const data=state();data.posts[0]={...data.posts[0],scheduledAt:'2026-10-25T02:30',scheduledInstant:'2026-10-25T01:30:00.000Z'};
 assert.equal(planningClockKey(data,date('2026-10-25T00:45Z')),planningClockKey(data,date('2026-10-25T01:15Z')));
 assert.notEqual(planningClockKey(data,date('2026-10-25T01:29:59.999Z')),planningClockKey(data,date('2026-10-25T01:30Z')));
});
test('actual Home and Queue projections agree with the detected transition and preserve source',()=>{
 const data=deepFreeze(state()),a=date('2026-11-09T11:59:59.999Z'),b=date(before),original=JSON.stringify(data);
 assert.equal(homeOverview(data,a).upcoming.length,1);assert.equal(homeOverview(data,b).overdue.length,1);
 assert.equal(channelQueue(data,{now:a}).counts.planned,1);assert.equal(channelQueue(data,{now:b}).counts.past,1);
 assert.match(renderHomeOverview(data,b),/Termin vergangen/);assert.equal(JSON.stringify(data),original);
});
test('timer only raises a persistent hint, never rerenders, focuses or scrolls',()=>{
 const h=harness();assert.equal(h.notice.hidden,true);assert.equal(h.button.disabled,true);assert.equal(h.timers.size,1);assert.equal([...h.timers.values()][0].delay,30000);
 h.time=after;h.fire();assert.equal(h.notice.hidden,false);assert.equal(h.button.disabled,false);assert.match(h.message.textContent,/zwischenzeitlich geändert/);assert.equal(h.refreshes,0);assert.deepEqual(h.focusTarget.focusCalls,[]);assert.deepEqual(h.scrolls,[]);assert.equal(h.timers.size,1);h.clock.destroy();
});
for(const event of ['focus','pageshow'])test(`${event} detects a deadline without a render or write`,()=>{
 const h=harness();h.time=after;h.event(h.win,event);assert.equal(h.notice.hidden,false);assert.equal(h.refreshes,0);h.clock.destroy();
});
test('hidden tabs suspend timers and visibly resumed pages check current time',()=>{
 const h=harness();h.doc.visibilityState='hidden';h.event(h.doc,'visibilitychange');assert.equal(h.timers.size,0);h.time=after;assert.equal(h.notice.hidden,true);h.doc.visibilityState='visible';h.event(h.doc,'visibilitychange');assert.equal(h.notice.hidden,false);assert.equal(h.timers.size,1);assert.equal(h.refreshes,0);h.clock.destroy();
});
test('BFCache pagehide pauses and pageshow resumes once, with no duplicate timer',()=>{
 const h=harness();h.event(h.win,'pagehide');h.time=after;h.clock.check();assert.equal(h.timers.size,0);assert.equal(h.notice.hidden,true);h.event(h.win,'pageshow');h.event(h.win,'pageshow');assert.equal(h.notice.hidden,false);assert.equal(h.timers.size,1);assert.equal(h.refreshes,0);h.clock.destroy();
});
test('dialogs, save, decode and workspace reads cannot trigger refresh; close rechecks',()=>{
 const h=harness();h.time=after;h.blocked=true;h.clock.check();h.click();assert.equal(h.notice.hidden,true);assert.equal(h.refreshes,0);h.blocked=false;h.event(h.doc,'close');assert.equal(h.notice.hidden,false);assert.equal(h.refreshes,0);h.clock.destroy();
});
test('irrelevant/unavailable views hide hint, stop timer and never refresh',()=>{
 const h=harness();h.time=after;h.clock.check();h.relevant=false;h.observer.callback([{target:h.doc.body,type:'attributes'}]);assert.equal(h.notice.hidden,true);assert.equal(h.timers.size,0);h.click();assert.equal(h.refreshes,0);h.relevant=true;h.clock.check();assert.equal(h.notice.hidden,false);h.clock.destroy();
});
test('explicit refresh uses existing state only, focuses main and restores viewport',()=>{
 const h=harness(),original=JSON.stringify(h.data);h.time=after;h.clock.check();h.click();assert.equal(h.refreshes,1);assert.equal(h.notice.hidden,true);assert.equal(h.button.disabled,true);assert.deepEqual(h.focusTarget.focusCalls,[{preventScroll:true}]);assert.deepEqual(h.scrolls,[{left:7,top:412,behavior:'instant'}]);assert.equal(JSON.stringify(h.data),original);h.clock.destroy();
});
test('existing ordinary renders clear the hint only after content replacement',()=>{
 const h=harness();h.time=after;h.clock.check();h.stamp=String(date(after).getTime());h.observer.callback([{target:h.doc.body,type:'attributes'}]);assert.equal(h.notice.hidden,false);h.changed();assert.equal(h.notice.hidden,true);assert.equal(h.refreshes,0);h.clock.destroy();
});
test('failed render start stamp cannot falsely acknowledge stale display or expose raw errors',()=>{
 const h=harness();h.time=after;h.clock.check();h.renderFails=true;h.click();assert.equal(h.notice.hidden,false);assert.equal(h.button.disabled,false);assert.match(h.message.textContent,/nicht aktualisiert/);assert.doesNotMatch(h.message.textContent,/PRIVATE_SECRET/);assert.deepEqual(h.focusTarget.focusCalls,[]);h.clock.check();assert.equal(h.notice.hidden,false);h.renderFails=false;h.click();assert.equal(h.notice.hidden,true);h.clock.destroy();
});
test('render-start baseline stays conservative if a deadline passes during rendering',()=>{
 const h=harness();h.stamp=String(date('2026-11-09T11:59:59.999Z').getTime());h.time=after;h.changed();h.clock.check();assert.equal(h.notice.hidden,false);assert.equal(h.refreshes,0);h.clock.destroy();
});
test('moving device time backward is detected; the hint stays until a successful render',()=>{
 const h=harness();h.time=after;h.stamp=String(date(after).getTime());h.changed();h.time='2026-11-09T11:59:59Z';h.clock.check();assert.equal(h.notice.hidden,false);h.time=after;h.clock.check();assert.equal(h.notice.hidden,false);h.changed();assert.equal(h.notice.hidden,true);h.clock.destroy();
});
test('invalid clock or render stamp gives a generic recoverable hint, never a false fresh state',()=>{
 const h=harness();h.stamp='not-a-number';h.changed();assert.equal(h.notice.hidden,false);assert.match(h.message.textContent,/nicht geprüft/);h.readFails=true;h.clock.check();assert.doesNotMatch(h.message.textContent,/PRIVATE_SECRET/);assert.equal(h.refreshes,0);h.readFails=false;h.stamp=String(date(before).getTime());h.time=before;h.changed();assert.equal(h.notice.hidden,true);h.clock.destroy();
});
test('observer is bounded to content replacement and view changes, avoiding notice feedback loops',()=>{
 const h=harness();assert.deepEqual(h.observations,[[h.content,{childList:true}],[h.doc.body,{attributes:true,attributeFilter:['data-planner-view']}]]);h.clock.destroy();
});
test('destroy removes all handlers and timers; late observer callbacks are inert',()=>{
 const h=harness();h.time=after;h.clock.check();h.clock.destroy();h.clock.destroy();assert.equal(h.timers.size,0);assert.equal(h.observer.disconnected,true);assert.equal(h.notice.hidden,true);h.changed();h.click();h.event(h.win,'pageshow');h.event(h.win,'focus');h.event(h.doc,'visibilitychange');h.clock.check();assert.equal(h.refreshes,0);assert.equal(h.timers.size,0);assert.equal(h.notice.hidden,true);
});
test('app wiring uses loaded state, all time views and existing busy/dialog guards',()=>{
 const app=readFileSync(new URL('../../public/app.js',import.meta.url),'utf8');
 assert.match(app,/const planningRenderedAt=String\(Date\.now\(\)\)/);
 assert.match(app,/isRelevant:\(\)=>plannerLoaded&&\['home','queue','calendar','list'\]\.includes\(view\)/);
 assert.match(app,/isBlocked:\(\)=>saving\|\|mediaLoading\|\|workspacePlannerReading\|\|!!document\.querySelector\('dialog\[open\]'\)/);
 assert.match(app,/readKey:now=>planningClockKey\(state,now\)/);assert.match(app,/refresh:\(\)=>render\(\)/);
 const module=readFileSync(new URL('../../public/planning-clock.js',import.meta.url),'utf8');assert.doesNotMatch(module,/\b(?:fetch|persist|renderPreview|captureChanged|localStorage|sessionStorage)\s*\(/);
});
test('static accessible hint is outside replaceable content and wraps on narrow screens',()=>{
 const html=readFileSync(new URL('../../public/index.html',import.meta.url),'utf8'),css=readFileSync(new URL('../../public/styles.css',import.meta.url),'utf8');
 assert.match(html,/<aside id="planning-clock-notice"[^>]*hidden[\s\S]*?<p id="planning-clock-message" role="status" aria-live="polite"><\/p>[\s\S]*?type="button" id="refresh-planning-clock"[\s\S]*?<\/aside><div id="content"/);
 assert.match(css,/@media\(max-width:600px\)\{\.planning-clock-notice\{[^}]*flex-direction:column/);assert.match(css,/\.planning-clock-notice button\{[^}]*min-height:44px/);
});


test('a focused notice is not hidden by timer rollback, hidden tab or page suspension',()=>{
 const h=harness();h.time=after;h.clock.check();h.doc.activeElement=h.button;
 h.time='2026-11-09T11:59:59.999Z';h.fire();assert.equal(h.notice.hidden,false);assert.equal(h.button.disabled,false);
 h.doc.visibilityState='hidden';h.event(h.doc,'visibilitychange');assert.equal(h.notice.hidden,false);assert.equal(h.button.disabled,false);assert.equal(h.timers.size,0);
 h.event(h.win,'pagehide');assert.equal(h.notice.hidden,false);h.doc.visibilityState='visible';h.event(h.win,'pageshow');assert.equal(h.notice.hidden,false);assert.equal(h.button.disabled,false);assert.equal(h.refreshes,0);assert.deepEqual(h.focusTarget.focusCalls,[]);
 h.click();assert.equal(h.notice.hidden,true);assert.equal(h.focusTarget.focusCalls.length,1);h.clock.destroy();
});


test('review-status posts still invalidate at the exact deadline for their additional past-time guidance',()=>{
 const data=state();data.posts[0].scheduleBinding={invalid:'review-only fixture'};deepFreeze(data);
 const a=date('2026-11-09T11:59:59.999Z'),b=date(before);
 assert.equal(channelQueue(data,{status:'review',now:a}).rows[0].planningStatus.kind,'review');
 assert.equal(channelQueue(data,{status:'review',now:b}).rows[0].planningStatus.kind,'review');
 assert.notEqual(planningClockKey(data,a),planningClockKey(data,b));
});


test('unchanged periodic hints do not mutate the live-region text repeatedly',()=>{
 const h=harness();let writes=0,current=h.message.textContent;
 Object.defineProperty(h.message,'textContent',{get:()=>current,set:value=>{writes++;current=value}});
 h.time=after;h.clock.check();h.clock.check();h.fire();h.event(h.win,'focus');assert.equal(writes,0);
 h.renderFails=true;h.click();assert.equal(writes,1);h.clock.check();h.fire();assert.equal(writes,1);h.clock.destroy();
});
test('only successful render exits publish the content timestamp, not failed subsequent starts',()=>{
 const app=readFileSync(new URL('../../public/app.js',import.meta.url),'utf8');
 assert.equal((app.match(/\$\('#content'\)\.dataset\.planningRenderedAt=planningRenderedAt/g)||[]).length,3);
 assert.match(app,/renderedAt:\(\)=>\$\('#content'\)\.dataset\.planningRenderedAt/);
});


test('explicit refresh restores the replaced week grid scroll offsets as well as the viewport',()=>{
 const h=harness(),oldGrid={scrollLeft:173,scrollTop:29},newGrid={scrollLeft:0,scrollTop:0};let reads=0;
 h.content.querySelector=selector=>{assert.equal(selector,'.week-grid');return ++reads===1?oldGrid:newGrid};
 h.time=after;h.clock.check();h.click();assert.deepEqual(newGrid,{scrollLeft:173,scrollTop:29});assert.equal(reads,2);assert.equal(h.refreshes,1);assert.equal(h.scrolls.length,1);h.clock.destroy();
});


test('late observer delivery of an old completed render never briefly clears an already visible warning',()=>{
 const h=harness();h.time=after;h.clock.check();assert.equal(h.notice.hidden,false);
 h.changed();assert.equal(h.notice.hidden,false);assert.equal(h.button.disabled,false);assert.equal(h.refreshes,0);
 h.stamp=String(date(after).getTime());h.changed();assert.equal(h.notice.hidden,true);h.clock.destroy();
});
