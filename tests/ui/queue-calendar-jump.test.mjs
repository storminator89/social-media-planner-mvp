import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {channelQueue,renderChannelQueue,queueCalendarDay,QUEUE_STATUSES} from '../../public/channel-queue.js';
import {calendarTime,calendarPosts,planningStatus,periodSummary} from '../../public/calendar-model.js';
import {CHANNELS,dateKey,addDays,startOfWeek,zonedNow,filterPosts,displayTitle,normalizeState} from '../../public/model.js';
import {effectiveText,variantCount} from '../../public/variants.js';
import {postLabelOptions} from '../../public/post-labels.js';
import {inspectScheduleBinding,scheduleLocalTime} from '../../public/workflows/posting-schedules.mjs';
import {renderPlanningHint} from '../../public/planning-guidance.js';

const app=readFileSync(new URL('../../public/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../../public/index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../../public/channel-queue.css',import.meta.url),'utf8');
const now=Date.parse('2026-11-09T07:00:00.000Z');
const freeze=value=>{if(value&&typeof value==='object'){Object.freeze(value);Object.values(value).forEach(freeze);}return value;};
function actual(name,source=app){
  const start=source.search(new RegExp(`(?:async )?function ${name}\\(`));assert.ok(start>=0,name);
  const next=source.slice(start+1).search(/\n(?:(?:async )?function |document.addEventListener)/);
  return source.slice(start,next<0?undefined:start+next+1);
}
const post=(id,instant='2027-01-01T01:30:00.000Z',zone='UTC',extra={})=>({id,title:'Title '+id,text:'Keep '+id,tags:['Focus'],variantTexts:{instagram:'Individual '+id},channels:['instagram'],status:'scheduled',scheduledAt:scheduleLocalTime(instant,zone),scheduledInstant:instant,scheduleBinding:null,timeZone:zone,media:{id:'image',url:'/api/planner/media/image',alt:'Keep alt',name:'image.png',type:'image/png'},cover:null,createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-11-01T00:00:00.000Z',...extra});
function fixture(zone='Europe/Berlin',posts=[post('first'),post('second','2027-01-01T03:30:00.000Z'),post('another-day','2027-01-03T13:00:00.000Z')]){
  return normalizeState({schemaVersion:2,revision:7,settings:{timezone:zone},channels:CHANNELS.map(({id,name,handle,color})=>({id,platform:id,name,handle,color,enabled:true,connectionStatus:'manual',postingSchedule:null})),posts});
}
function reviewPost(){const p=post('review','2027-01-04T08:00:00.000Z','Europe/Berlin');p.scheduleBinding={schemaVersion:1,mode:'queue',instant:p.scheduledInstant,selectedAt:'2026-11-01T08:00:00.000Z',sourceRevision:6,refs:[{channelId:'instagram',slotId:'old-slot',local:p.scheduledAt,timezone:p.timeZone,overlapChoice:'reject',minimumGapMinutes:30}]};return p;}
function attributes(tag){return Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(([,name,value])=>[name,value]));}
const decode=value=>value?.replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
function harness(t,{state=fixture(),status='all',channel='all',query='',tag='',source=app}={}){
  t.mock.timers.enable({apis:['Date'],now});
  const calls=[],handlers=new Map(),windowHandlers=new Map(),fields=new Map();let buttons=[],content='';
  const doc={body:{dataset:{}},activeElement:null,modal:false,addEventListener:(name,fn)=>handlers.set(name,fn),querySelector(selector){return selector==='dialog[open]'?(this.modal?{}:null):$(selector);}};
  function field(key){if(!fields.has(key))fields.set(key,{dataset:{},value:'',hidden:false,open:false,disabled:false,isConnected:true,tagName:key==='#period-title'?'H2':'DIV',classList:{toggle(){}},setAttribute(){},focus(){doc.activeElement=this;calls.push(['focus',key]);},addEventListener(){}});return fields.get(key);}
  function $(selector){
    const day=selector.match(/^#content \[data-queue-day="(.+)"\]$/)?.[1];
    if(day)return buttons.find(b=>b.dataset.queueDay===day)||null;
    if(selector==='#queue-status'&&!content.includes('id="queue-status"'))return null;
    return field(selector);
  }
  Object.defineProperty(field('#content'),'innerHTML',{get:()=>content,set(value){for(const b of buttons)b.isConnected=false;content=value;buttons=[...value.matchAll(/<button\b[^>]*>/g)].map(([tag])=>{const attrs=attributes(tag);const b={attrs,dataset:Object.fromEntries(Object.entries(attrs).filter(([k])=>k.startsWith('data-')).map(([k,v])=>[k.slice(5).replace(/-([a-z])/g,(_,x)=>x.toUpperCase()),decode(v)])),isConnected:true,tagName:'BUTTON',classList:{contains:()=>false},focus(){doc.activeElement=b;calls.push(['focus','day:'+b.dataset.queueDay]);}};return b;});}});
  field('#content').contains=b=>buttons.includes(b)&&b.isConnected;
  const location={hash:'#queue'},entries=['#queue'];let index=0;
  const history={blocked:false,replaceState(value,title,url){assert.equal(value,null);calls.push(['replace',url]);entries[index]=url;location.hash=url;},pushState(value,title,url){if(this.blocked)throw Error('History unavailable');assert.equal(value,null);calls.push(['push',url]);entries.splice(index+1);entries.push(url);index++;location.hash=url;},go(delta){const next=index+delta;if(next<0||next>=entries.length)return;index=next;location.hash=entries[index];windowHandlers.get('hashchange')();}};
  const forbidden=name=>()=>assert.fail('Unexpected '+name);
  const c=vm.createContext({state:freeze(state),view:'queue',range:'month',anchor:new Date('2026-10-15T12:00'),channel,query,postTag:tag,ideaTag:'',calendarStatus:'review',queueStatus:status,queueCalendarReturnDay:null,plannerLoaded:true,saving:false,workspacePlannerReading:false,config:{},Date,Intl,Set,Map,document:doc,window:{addEventListener:(name,fn)=>windowHandlers.set(name,fn)},location,history,$,$$:()=>[],
    channelQueue,renderChannelQueue,queueCalendarDay,QUEUE_STATUSES,calendarTime,calendarPosts,planningStatus,periodSummary,CHANNELS,dateKey,addDays,startOfWeek,zonedNow,filterPosts,displayTitle,effectiveText,variantCount,postLabelOptions,inspectScheduleBinding,renderPlanningHint,
    connectionsPanel:{hide(){},show(){}},openComposer:forbidden('composer'),persist:forbidden('persist'),fetch:forbidden('fetch'),store:{save:forbidden('store.save'),uploadMedia:forbidden('upload')},localStorage:{setItem:forbidden('storage')},sessionStorage:{setItem:forbidden('storage')},requestAnimationFrame:forbidden('deferred focus'),
    days:['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'],dateLabel:(d,o={})=>new Date(d).toLocaleDateString('de-DE',o),esc:value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),icon:name=>`<svg aria-hidden="true" data-test-icon="${name}"></svg>`,platform:()=>'',stack:()=>''});
  for(const name of ['currentZone','mediaSource','cover','scheduleNeedsReview','badge','shownTime','calendarContext','renderCalendarSummary','postLabelDescription','postLabels','postCard','relevantPosts','visiblePeriod','periodPosts','emptyState','renderWeek','renderMobileWeek','renderMonth','renderAgenda','renderPostLabelFilter','renderPlanningChannelControls','render','goView','openQueueCalendar']){
    if(name==='mediaSource'){vm.runInContext(source.split('\n').find(l=>l.startsWith('const mediaSource=')),c);continue;}
    if(name==='openQueueCalendar'&&!source.includes('function openQueueCalendar('))continue;
    vm.runInContext(actual(name,source),c);
  }
  vm.runInContext(source.split('\n').find(l=>l.startsWith("document.addEventListener('click',async")),c);
  vm.runInContext(source.split('\n').find(l=>l.startsWith("window.addEventListener('hashchange'")),c);
  c.render();calls.length=0;
  const click=async button=>handlers.get('click')({detail:0,target:{closest:selector=>selector==='button'?button:null}});
  return {c,calls,doc,fields,$,click,history,entries,location,get html(){return content},get buttons(){return buttons},dayButton:day=>buttons.find(b=>b.dataset.queueDay===day)};
}
function noNestedButtons(value){let open=0;for(const tag of value.match(/<\/?button\b[^>]*>/g)||[]){if(tag.startsWith('</')){assert.equal(open,1);open--;}else{assert.equal(open,0,'Nested button');open++;}}assert.equal(open,0);}
function navigationSnapshot(h){return {view:h.c.view,range:h.c.range,anchor:dateKey(h.c.anchor),channel:h.c.channel,query:h.c.query,tag:h.c.postTag,calendarStatus:h.c.calendarStatus,queueStatus:h.c.queueStatus,hash:h.location.hash,entries:[...h.entries]};}
function unchanged(h,before){assert.deepEqual(navigationSnapshot(h),before);assert.equal(h.calls.filter(([kind])=>kind==='push').length,0);}

for(const value of [undefined,null,7,{},[],true,'','2027-1-01','2027-01-1',' 2027-01-01','2027-01-01\n','2027-01-01Z','2027-01-01T12:00','2027-02-29','2026-02-31','2027-04-31','2027-00-01','2027-13-01','2027-01-00','2027-01-32','0000-01-01','0099-01-01','0999-01-01','10000-01-01','2027-01-01" onclick="bad'])test('strict civil day rejects '+JSON.stringify(value),()=>assert.equal(queueCalendarDay(value),null));
for(const value of ['2027-01-01','2026-12-31','2028-02-29','2027-03-28','2027-10-31','2000-02-29','1000-01-01','9999-12-31'])test('strict civil day retains '+value,()=>{const d=queueCalendarDay(value);assert.equal(dateKey(d),value);assert.equal(d.getHours(),12);});

test('real Queue render adds one clear native button per projected day, outside post buttons',t=>{
  const h=harness(t),jump=h.buttons.filter(b=>b.dataset.action==='queue-calendar');
  assert.deepEqual(jump.map(b=>b.dataset.queueDay),['2027-01-01','2027-01-03']);
  for(const b of jump){assert.equal(b.attrs.type,'button');assert.match(b.attrs['aria-label'],/2027 im Kalender öffnen$/);assert.equal(b.dataset.postId,undefined);assert.equal(b.dataset.newDate,undefined);}
  assert.equal(h.buttons.filter(b=>b.dataset.postId).length,3);assert.equal((h.html.match(/Im Kalender<\/button>/g)||[]).length,2);noNestedButtons(h.html);
  assert.match(html,/<h2 id="period-title" tabindex="-1"><\/h2>/);assert.match(css,/queue-day-heading\{[^}]*flex-wrap:wrap/);assert.match(css,/queue-calendar-jump\{[^}]*min-height:44px/);
});
for(const zone of ['UTC','Europe/Berlin','America/Los_Angeles','Asia/Tokyo'])for(const instant of ['2027-01-01T01:30:00.000Z','2026-12-31T23:30:00.000Z','2027-03-28T00:30:00.000Z','2027-03-28T01:30:00.000Z','2027-10-31T00:30:00.123Z','2027-10-31T01:30:00.987Z','2028-02-29T23:30:00.000Z'])test(`real click opens projected ${zone} day for ${instant}`,async t=>{
  const s=fixture(zone,[post('keep',instant,'Asia/Tokyo')]),before=structuredClone(s),h=harness(t,{state:s}),day=scheduleLocalTime(instant,zone).slice(0,10),button=h.dayButton(day);
  assert.ok(button);await h.click(button);assert.equal(h.c.view,'calendar');assert.equal(h.c.range,'week');assert.equal(dateKey(h.c.anchor),day);assert.equal(h.c.calendarStatus,'all');assert.equal(h.$('#jump-date').value,day);
  const period=h.c.visiblePeriod();assert.ok(dateKey(period.start)<=day);assert.ok(dateKey(period.end)>=day);assert.equal(h.c.periodPosts(h.c.relevantPosts()).length,1);assert.ok(h.html.includes('data-post-id="keep"'));assert.equal(h.doc.activeElement,h.$('#period-title'));
  assert.deepEqual(h.entries,['#queue','#calendar']);assert.deepEqual(h.c.state,before);assert.equal(h.c.state.revision,7);assert.equal(h.calls.filter(([name])=>name==='push').length,1);
  await h.click(button);assert.equal(h.calls.filter(([name])=>name==='push').length,1,'Detached duplicate cannot add history');
});
for(const status of Object.keys(QUEUE_STATUSES))test(`Queue ${status} replaces stale calendar status and keeps channel/search/label`,async t=>{
  const rows=[post('keep'),post('past','2026-01-02T10:00:00.000Z'),reviewPost(),post('other','2027-03-01T12:00:00.000Z','UTC',{channels:['linkedin'],variantTexts:{linkedin:'Individual other'}})],s=fixture('Europe/Berlin',rows);
  const h=harness(t,{state:s,status,channel:'instagram',query:status==='review'?'review':status==='past'?'past':'Individual',tag:'Focus'}),before=structuredClone(h.c.state),day=h.buttons.find(b=>b.dataset.queueDay)?.dataset.queueDay;
  assert.ok(day);const rowsBefore=channelQueue(h.c.state,{status,channel:h.c.channel,query:h.c.query,tag:h.c.postTag}).rows.filter(p=>p.calendarTime.local.startsWith(day)).map(p=>p.id);
  await h.click(h.dayButton(day));assert.equal(h.c.calendarStatus,status);assert.equal(h.$('#calendar-status').value,status);assert.equal(h.c.channel,'instagram');assert.equal(h.c.postTag,'Focus');assert.equal(h.c.query,status==='review'?'review':status==='past'?'past':'Individual');assert.equal(h.c.queueStatus,status);
  assert.deepEqual(h.c.periodPosts(h.c.relevantPosts()).filter(p=>p.calendarTime.local.startsWith(day)).map(p=>p.id),rowsBefore);assert.deepEqual(h.c.state,before);
});
test('Back/Forward preserve filters, source day focus and history length; period change does not lose return day',async t=>{
  const h=harness(t,{status:'planned',channel:'instagram',query:'Individual',tag:'Focus'}),filters=[h.c.channel,h.c.query,h.c.postTag,h.c.queueStatus];await h.click(h.dayButton('2027-01-01'));
  h.c.anchor=addDays(h.c.anchor,7);h.c.render();h.history.go(-1);assert.equal(h.c.view,'queue');assert.equal(h.doc.activeElement,h.dayButton('2027-01-01'));assert.deepEqual([h.c.channel,h.c.query,h.c.postTag,h.c.queueStatus],filters);
  h.history.go(1);assert.equal(h.c.view,'calendar');assert.equal(h.doc.activeElement,h.$('#period-title'));assert.equal(dateKey(h.c.anchor),'2027-01-08');assert.equal(h.c.calendarStatus,'planned');assert.deepEqual(h.entries,['#queue','#calendar']);
});
test('Back after a day disappears focuses existing Queue status instead of a detached element',async t=>{const h=harness(t);await h.click(h.dayButton('2027-01-01'));h.c.state=freeze(fixture('Europe/Berlin',[]));h.history.go(-1);assert.equal(h.c.view,'queue');assert.equal(h.doc.activeElement,h.$('#queue-status'));});
test('Back after failed loading focuses main context and has no invented queue action',async t=>{const h=harness(t);await h.click(h.dayButton('2027-01-01'));h.c.plannerLoaded=false;h.history.go(-1);assert.equal(h.doc.activeElement,h.$('#main'));assert.doesNotMatch(h.html,/queue-calendar/);});
test('ordinary view changes keep replace semantics and clear only the transient return-focus hint',async t=>{const h=harness(t);await h.click(h.dayButton('2027-01-01'));await h.click({dataset:{view:'list'}});assert.equal(h.c.view,'list');assert.equal(h.c.queueCalendarReturnDay,null);assert.equal(h.entries.length,2);assert.equal(h.location.hash,'#list');assert.doesNotMatch(h.html,/queue-calendar|queue-day-heading/);});

for(const [name,alter] of [
  ['missing day',(h,b)=>delete b.dataset.queueDay],['invalid day',(h,b)=>b.dataset.queueDay='2027-02-31'],['valid absent day',(h,b)=>b.dataset.queueDay='2027-02-01'],['removed rows',h=>h.c.state=freeze(fixture('Europe/Berlin',[]))],
  ['stale query',h=>h.c.query='not present'],['stale label',h=>h.c.postTag='other'],['stale channel',h=>h.c.channel='linkedin'],['unknown queue status',h=>h.c.queueStatus='__proto__'],['changed status',h=>h.c.queueStatus='past'],
  ['load failure',h=>h.c.plannerLoaded=false],['missing state',h=>h.c.state=null],['broken projection',h=>h.c.state=freeze({...fixture(),settings:{timezone:'not-a-zone'}})],['invalid instant',h=>{const s=fixture();s.posts[0].scheduledInstant='Invalid Date';h.c.state=freeze(s);}],
  ['detached button',(h,b)=>b.isConnected=false],['foreign button',(h,b)=>h.$('#content').contains=()=>false],['other view',h=>h.c.view='list'],['open modal',h=>h.doc.modal=true],['saving',h=>h.c.saving=true],['loading newer state',h=>h.c.workspacePlannerReading=true],['history failure',h=>h.history.blocked=true]
])test('stale/invalid click is inert: '+name,async t=>{const h=harness(t),button=h.dayButton('2027-01-01');alter(h,button);const before=navigationSnapshot(h);await h.click(button);unchanged(h,before);});
test('time-stale planned Queue day cannot jump after last row becomes past',async t=>{const h=harness(t,{state:fixture('UTC',[post('last','2026-11-09T07:01:00.000Z')]),status:'planned'}),button=h.dayButton('2026-11-09');t.mock.timers.tick(60001);const before=navigationSnapshot(h);await h.click(button);unchanged(h,before);});
test('a stale click cannot reuse a date that moved across zones',async t=>{const h=harness(t,{state:fixture('UTC',[post('last')])}),button=h.dayButton('2027-01-01');h.c.state=freeze({...h.c.state,settings:{timezone:'America/Los_Angeles'}});const before=navigationSnapshot(h);await h.click(button);unchanged(h,before);});
test('unavailable, empty, and search-empty Queue never render a day jump',t=>{const h=harness(t);h.c.query='not present';h.c.render();assert.doesNotMatch(h.html,/queue-calendar/);h.c.query='';h.c.state=freeze(fixture('UTC',[]));h.c.render();assert.doesNotMatch(h.html,/queue-calendar/);h.c.plannerLoaded=false;h.c.state=null;assert.doesNotMatch(renderChannelQueue(null,{available:false,renderAgenda:()=>assert.fail()}),/queue-calendar/);});
test('XSS-shaped titles, labels and IDs remain inert; day action contains only validated display day',async t=>{
  const x='\"><img src=x onerror="bad">',s=fixture('UTC',[post(x,'2027-01-01T01:30:00.000Z','UTC',{text:x,title:x,tags:[x],variantTexts:{instagram:x}})]),before=structuredClone(s),h=harness(t,{state:s,tag:x});
  assert.doesNotMatch(h.html,/<img src=x|<script|data-post-id=""\s+onclick=/);assert.match(h.html,/&lt;img src=x onerror=&quot;bad&quot;&gt;/);noNestedButtons(h.html);
  const b=h.dayButton('2027-01-01');assert.equal(b.attrs['data-queue-day'],'2027-01-01');await h.click(b);assert.deepEqual(h.c.state,before);assert.equal(h.c.postTag,x);
});
for(const view of ['calendar','list'])for(const range of ['week','month'])test(`unchanged ${view}/${range} rendering has no Queue jump or extra headings`,t=>{const h=harness(t);h.c.view=view;h.c.range=range;h.c.anchor=new Date('2027-01-01T12:00');h.c.calendarStatus='all';h.c.render();assert.doesNotMatch(h.html,/queue-calendar|queue-day-heading/);noNestedButtons(h.html);});
test('narrow month and week agenda renderers keep their established paths',t=>{const h=harness(t);h.c.view='calendar';h.c.anchor=new Date('2027-01-01T12:00');const posts=h.c.relevantPosts();for(const out of [h.c.renderMobileWeek(posts,startOfWeek(h.c.anchor)),h.c.renderAgenda(posts,true),h.c.renderMonth(posts),h.c.renderWeek(posts)])assert.doesNotMatch(out,/queue-calendar|queue-day-heading/);});
test('Escape/Enter/Space do not create a post through the global keyboard shortcut',async t=>{
  const h=harness(t);await h.click(h.dayButton('2027-01-01'));const line=app.split('\n').find(l=>l.startsWith("$('#composer-form').addEventListener"));const start=line.indexOf("document.addEventListener('keydown'");const end=line.indexOf(";window.addEventListener('beforeunload'",start);
  let handler;h.c.document.addEventListener=(name,fn)=>{if(name==='keydown')handler=fn};vm.runInContext(line.slice(start,end),h.c);for(const key of ['Escape','Enter',' ']){handler({key,preventDefault:()=>assert.fail('Unexpected key interception')});assert.equal(h.c.view,'calendar');assert.equal(h.doc.activeElement,h.$('#period-title'));}
});

test('hard reload restores only the existing route, not transient jump day or filters',async t=>{
  const h=harness(t,{status:'planned',channel:'instagram',query:'Individual',tag:'Focus'}),saved=structuredClone(h.c.state);
  await h.click(h.dayButton('2027-01-03'));assert.equal(dateKey(h.c.anchor),'2027-01-03');
  const fresh=vm.createContext({Date,startOfWeek,addDays,zonedNow,dateKey,calendarPosts,loaded:saved,location:{hash:h.location.hash},config:{}});
  for(const prefix of ['let state,view=',"let calendarStatus=","let queueStatus=","let queueCalendarReturnDay=",'let editingIdeaId='])vm.runInContext(app.split('\n').find(line=>line.startsWith(prefix)),fresh);
  vm.runInContext(actual('currentZone'),fresh);vm.runInContext('state=loaded;',fresh);
  const start=app.indexOf("if(['home','calendar','list','queue','drafts','ideas','connections'].includes(location.hash.slice(1)))view=");
  const end=app.indexOf("if(config.storageMode===",start);assert.ok(start>=0&&end>start);vm.runInContext(app.slice(start,end),fresh);
  const reset=JSON.parse(vm.runInContext('JSON.stringify({view,range,day:dateKey(anchor),channel,query,postTag,calendarStatus,queueStatus,queueCalendarReturnDay})',fresh));
  assert.deepEqual(reset,{view:'calendar',range:'week',day:'2026-12-28',channel:'all',query:'',postTag:'',calendarStatus:'all',queueStatus:'planned',queueCalendarReturnDay:null});assert.deepEqual(saved,h.c.state);
});

// Optional external baseline comparison uses the same actual render/DOM harness.
// It is a verification input only, never used by application code.
if(process.env.QUEUE_JUMP_BASELINE){const baseline=readFileSync(process.env.QUEUE_JUMP_BASELINE,'utf8');test('calendar/list/mobile output remains byte-identical to the supplied baseline',t=>{
  const a=harness(t),b=harness({mock:{timers:{enable(){}}}},{source:baseline});
  for(const view of ['calendar','list'])for(const range of ['week','month'])for(const h of [a,b]){h.c.view=view;h.c.range=range;h.c.calendarStatus='all';h.c.anchor=new Date('2027-01-01T12:00');h.c.render();if(h===b)assert.equal(a.html,b.html,`${view}/${range}`);}
  for(const name of ['renderAgenda','renderMobileWeek','renderMonth','renderWeek']){const rows=a.c.relevantPosts(),args=name==='renderMobileWeek'?[rows,startOfWeek(a.c.anchor)]:name==='renderAgenda'?[rows,true]:[rows];assert.equal(a.c[name](...args),b.c[name](...args),name);}
});}
