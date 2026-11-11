import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {queuePriorityAvailable} from '../../public/channel-queue.js';
import {findNextPostingSlots,selectPostingSlot} from '../../public/workflows/posting-schedules.mjs';
const app=readFileSync(new URL('../../public/app.js',import.meta.url),'utf8'),html=readFileSync(new URL('../../public/index.html',import.meta.url),'utf8');
const NOW='2099-10-01T00:00:00.000Z';
function fixture(){
 const s={revision:7,channels:[{id:'bluesky',enabled:true,postingSchedule:{schemaVersion:1,timezone:'UTC',paused:false,minimumGapMinutes:0,overlapChoice:'reject',slots:Array.from({length:7},(_,weekday)=>({id:'day-'+weekday,weekday,time:'09:00'}))}}],posts:[]};
 for(const id of ['first','second']){const proposal=findNextPostingSlots(s,{postId:id,channelIds:['bluesky'],after:NOW,displayTimezone:'UTC',limit:1}),choice=selectPostingSlot(s,proposal,proposal.suggestions[0],{now:NOW});s.posts.push({id,status:'scheduled',channels:['bluesky'],scheduledInstant:choice.scheduledAt,scheduledAt:choice.local,timeZone:'UTC',scheduleBinding:choice.scheduleBinding});}
 return s;
}
test('priority action availability uses the complete channel, never all-channel or fixed/past/first/multi/review rows',()=>{
 const s=fixture(),[first,second]=s.posts,now=Date.parse(NOW),before=structuredClone(s);
 assert.equal(queuePriorityAvailable(s,second,'bluesky',now),true);assert.equal(queuePriorityAvailable(s,first,'bluesky',now),false);
 for(const [post,channel] of [[second,'all'],[second,'linkedin'],[{...second,scheduleBinding:null},'bluesky'],[{...second,channels:['bluesky','linkedin']},'bluesky'],[{...second,scheduledInstant:NOW},'bluesky'],[{...second,scheduledInstant:null},'bluesky'],[{...second,status:'draft'},'bluesky']])assert.equal(queuePriorityAvailable(s,post,channel,now),false);
 const changed=structuredClone(s);changed.channels[0].postingSchedule.paused=true;assert.equal(queuePriorityAvailable(changed,changed.posts[1],'bluesky',now),false);assert.deepEqual(s,before);
});
test('opener validates specific queue context, connected owned visible row and controller scope',()=>{
 const fn=app.slice(app.indexOf('function openQueuePriority(button){'),app.indexOf("document.addEventListener('click',async event=>")),opened=[];
 const button={dataset:{queuePriority:'two'},isConnected:true},state={posts:[{id:'two'}]},content={contains:b=>b===button};
 const c=vm.createContext({view:'queue',plannerLoaded:true,localFallback:false,saving:false,workspacePlannerReading:false,mediaLoading:false,channel:'bluesky',query:'needle',postTag:'tag',queueStatus:'planned',state,$:()=>content,document:{querySelector:()=>null},queuePriorityAvailable:()=>true,channelQueue:(s,o)=>{assert.equal(o.query,'needle');assert.equal(o.tag,'tag');return{rows:[{id:'two'}]};},queuePriorityUI:{open:(...args)=>opened.push(args)}});vm.runInContext(fn,c);c.openQueuePriority(button);assert.deepEqual(opened,[['two','bluesky']]);
 for(const key of ['saving','workspacePlannerReading','mediaLoading','localFallback']){c[key]=true;c.openQueuePriority(button);c[key]=false;}
 c.channel='all';c.openQueuePriority(button);c.channel='bluesky';button.isConnected=false;c.openQueuePriority(button);button.isConnected=true;c.view='calendar';c.openQueuePriority(button);c.view='queue';c.channelQueue=()=>({rows:[]});c.openQueuePriority(button);assert.equal(opened.length,1);
});
test('integration allows its own dialog, rejects other dialogs/dirty activities, uses private methods and pending unload guard',async()=>{
 const start=app.indexOf('queuePriorityUI=createQueuePriorityUI({'),code=app.slice(start,app.indexOf('returnDraftsUI=createReturnDraftsUI({',start)), nodes=new Map(),$=id=>{if(!nodes.has(id))nodes.set(id,{id});return nodes.get(id);};let config,selector,otherDialog=null,cancelled,savedCalls=0,prepared;
 const store={previewQueuePriority:(ui,o)=>{prepared=o;return{token:'p'};},cancelQueuePriority:p=>{cancelled=p;},prioritizeQueue:async(ui,p)=>{savedCalls++;return{...ui,revision:ui.revision+1};}};
 const c=vm.createContext({$,state:{revision:7},view:'queue',channel:'bluesky',query:'',postTag:'',queueStatus:'planned',currentZone:()=> 'UTC',plannerLoaded:true,localFallback:false,saving:false,workspacePlannerReading:false,workspaceRestoring:false,mediaLoading:false,splitPending:false,draftBatchUI:{pending:false},store,document:{querySelector:s=>{selector=s;return otherDialog;}},createQueuePriorityUI:options=>{config=options;return{pending:false};},window:{addEventListener(){}},normalizeState:x=>x,render(){},queuePanel:{invalidate(){}}});vm.runInContext(code,c);
 assert.equal(config.canOpen(),true);assert.equal(selector,'dialog[open]:not(#queue-priority-dialog)');otherDialog={};assert.equal(config.canOpen(),false);otherDialog=null;
 for(const name of ['saving','workspacePlannerReading','workspaceRestoring','mediaLoading','splitPending','localFallback']){c[name]=true;assert.equal(config.canOpen(),false);c[name]=false;}
 c.draftBatchUI.pending=true;assert.equal(config.canOpen(),false);c.draftBatchUI.pending=false;c.channel='all';assert.equal(config.canOpen(),false);c.channel='bluesky';
 const p=config.prepare(c.state,{postId:'two',channelId:'bluesky'});assert.deepEqual(prepared,{postId:'two',channelId:'bluesky'});config.cancel(p);assert.equal(cancelled,p);const result=await config.save(c.state,p);assert.equal(result.revision,8);assert.equal(savedCalls,1);assert.equal(c.saving,false);
 assert.match(code,/beforeunload.*queuePriorityUI\?\.pending/);assert.match(app,/function render\(\)\{\s*queuePriorityUI\?\.checkState\(\)/);
});
test('minimal queue markup wires sibling action and labelled preview, not publishing or a new route',()=>{
 assert.match(app,/view==='queue'&&queuePriorityAvailable\(state,p,channel\)/);assert.match(app,/data-queue-priority=.*?Priorisieren<\/button>/);assert.match(html,/href="\.\/queue-priority.css"/);
 const dialog=html.match(/<dialog id="queue-priority-dialog"[\s\S]*?<\/dialog>/)[0];assert.match(dialog,/aria-labelledby="queue-priority-title"/);assert.match(dialog,/data-priority-confirm disabled>Termine übernehmen/);assert.match(dialog,/data-priority-close>Abbrechen/);assert.match(dialog,/aria-label="Bisherige und neue Termine"/);assert.doesNotMatch(dialog,/veröffentlichen|Versand|API|\bhref=/i);
 assert.match(app,/\|\|\$\('#queue-priority-dialog'\)\.open\|\|\['INPUT'/);
});
