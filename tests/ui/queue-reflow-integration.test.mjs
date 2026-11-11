import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {queueReflowAvailable,renderChannelQueue} from '../../public/channel-queue.js';
import {findNextPostingSlots,selectPostingSlot} from '../../public/workflows/posting-schedules.mjs';
const app=readFileSync(new URL('../../public/app.js',import.meta.url),'utf8'),html=readFileSync(new URL('../../public/index.html',import.meta.url),'utf8');
const NOW='2030-04-01T00:00:00.000Z';
function fixture(){
 const s={revision:7,settings:{timezone:'UTC'},channels:[{id:'bluesky',name:'Bluesky',enabled:true,postingSchedule:{schemaVersion:1,timezone:'UTC',paused:false,minimumGapMinutes:0,overlapChoice:'reject',slots:Array.from({length:7},(_,weekday)=>({id:'day-'+weekday,weekday,time:'09:00'}))}}],posts:[]};
 for(const id of ['first','second']){const proposal=findNextPostingSlots(s,{postId:id,channelIds:['bluesky'],after:NOW,displayTimezone:'UTC',limit:1}),choice=selectPostingSlot(s,proposal,proposal.suggestions[0],{now:NOW});s.posts.push({id,title:id,text:id,tags:['campaign'],variantTexts:{},status:'scheduled',channels:['bluesky'],scheduledInstant:choice.scheduledAt,scheduledAt:choice.local,timeZone:'UTC',scheduleBinding:choice.scheduleBinding});}
 return s;
}
test('whole channel action survives search, label and status hiding every affected row',()=>{
 const s=fixture(),before=structuredClone(s);
 assert.equal(queueReflowAvailable(s,'bluesky',new Date(NOW)),true);assert.equal(queueReflowAvailable(s,'all',new Date(NOW)),false);assert.equal(queueReflowAvailable(s,'linkedin',new Date(NOW)),false);
 const out=renderChannelQueue(s,{channel:'bluesky',query:'hidden',tag:'other',status:'past',now:new Date(NOW),renderAgenda:()=>assert.fail('No matching rows')});assert.match(out,/data-action="queue-reflow"/);assert.match(out,/aria-label="Gesamte Kanal-Queue neu einplanen"/);assert.match(out,/Keine passenden Beiträge/);
 const all=renderChannelQueue(s,{channel:'all',now:new Date(NOW),renderAgenda:()=>''});assert.doesNotMatch(all,/data-action="queue-reflow"/);assert.deepEqual(s,before);
});
test('stale and multi-channel entries remain actionable for canonical validation; no future bound entries hides action',()=>{
 const s=fixture();s.channels[0].postingSchedule.paused=true;s.posts[0].channels.push('linkedin');assert.equal(queueReflowAvailable(s,'bluesky',new Date(NOW)),true);s.posts.forEach(p=>p.scheduleBinding=null);assert.equal(queueReflowAvailable(s,'bluesky',new Date(NOW)),false);
 const past=fixture();past.posts.forEach(p=>p.scheduledInstant=NOW);assert.equal(queueReflowAvailable(past,'bluesky',new Date(NOW)),false);
});
test('action delegates only concrete channel, never visible/filtered IDs or a direct save',async()=>{
 const handlers=new Map(),opened=[],c=vm.createContext({document:{addEventListener:(name,fn)=>handlers.set(name,fn)},channel:'bluesky',query:'hidden',postTag:'label',queueStatus:'past',queueReflowUI:{open:id=>opened.push(id)}});const line=app.split('\n').find(l=>l.startsWith("document.addEventListener('click',async"));vm.runInContext(line,c);await handlers.get('click')({target:{closest:()=>({dataset:{action:'queue-reflow'}})}});assert.deepEqual(opened,['bluesky']);assert.equal(c.query,'hidden');assert.equal(c.postTag,'label');
});
test('app integrates private methods, excludes other busy work/dialogs and warns during pending write',async()=>{
 const start=app.indexOf('queueReflowUI=createQueueReflowUI({'),end=app.indexOf('queuePriorityUI=createQueuePriorityUI({'),code=app.slice(start,end),nodes=new Map(),$=id=>{if(!nodes.has(id))nodes.set(id,{id});return nodes.get(id);};let config,selector,otherDialog=null,cancelled,savedCalls=0,prepared,unload;
 const store={previewQueueReflow:(ui,o)=>{prepared=o;return{token:'p'};},cancelQueueReflow:p=>{cancelled=p;},reflowQueue:async(ui,p)=>{savedCalls++;return{...ui,revision:ui.revision+1};}};
 const c=vm.createContext({$,state:{revision:7},view:'queue',channel:'bluesky',query:'hidden',postTag:'tag',queueStatus:'review',currentZone:()=> 'UTC',plannerLoaded:true,localFallback:false,saving:false,workspacePlannerReading:false,workspaceRestoring:false,mediaLoading:false,splitPending:false,draftBatchUI:{pending:false},queuePriorityUI:{pending:false},store,document:{querySelector:s=>{selector=s;return otherDialog;}},createQueueReflowUI:options=>{config=options;return{pending:false};},window:{addEventListener:(name,fn)=>{if(name==='beforeunload')unload=fn;}},normalizeState:x=>x,render(){},queuePanel:{invalidate(){}}});vm.runInContext(code,c);
 assert.equal(config.canOpen(),true);assert.equal(selector,'dialog[open]:not(#queue-reflow-dialog)');otherDialog={};assert.equal(config.canOpen(),false);otherDialog=null;
 for(const name of ['saving','workspacePlannerReading','workspaceRestoring','mediaLoading','splitPending','localFallback']){c[name]=true;assert.equal(config.canOpen(),false);c[name]=false;}
 for(const name of ['draftBatchUI','queuePriorityUI']){c[name].pending=true;assert.equal(config.canOpen(),false);c[name].pending=false;}c.channel='all';assert.equal(config.canOpen(),false);c.channel='bluesky';
 const p=config.prepare(c.state,{channelId:'bluesky'});assert.deepEqual(prepared,{channelId:'bluesky'});config.cancel(p);assert.equal(cancelled,p);const result=await config.save(c.state,p);assert.equal(result.revision,8);assert.equal(savedCalls,1);assert.equal(c.saving,false);config.onSaved(result);assert.equal(c.state.revision,8);
 const e={preventDefault(){this.prevented=true;}};unload(e);assert.equal(e.prevented,undefined);c.queueReflowUI.pending=true;unload(e);assert.equal(e.prevented,true);
 assert.match(app,/function render\(\)\{\s*queuePriorityUI\?\.checkState\(\);\s*queueReflowUI\?\.checkState\(\)/);
});
test('minimal accessible markup includes no new route or explanatory prose and keyboard guard respects modal',()=>{
 assert.match(html,/href="\.\/queue-reflow.css"/);const dialog=html.match(/<dialog id="queue-reflow-dialog"[\s\S]*?<\/dialog>/)[0];assert.match(dialog,/aria-labelledby="queue-reflow-title"/);assert.match(dialog,/>Queue neu einplanen<\/h2>/);assert.match(dialog,/data-reflow-confirm disabled>Termine übernehmen/);assert.match(dialog,/data-reflow-unchanged/);assert.match(dialog,/data-reflow-close>Abbrechen/);assert.doesNotMatch(dialog,/veröffentlichen|Versand|API|\bhref=/i);assert.match(app,/\|\|\$\('#queue-reflow-dialog'\)\.open\|\|/);
});
