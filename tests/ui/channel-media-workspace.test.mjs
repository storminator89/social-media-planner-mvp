import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkspaceController} from '../../public/workspace-controller.js';
import {workspaceRestoreDecision} from '../../public/workspace-restore.js';
import {payload,workspace,saved,deferred,timers} from './workspace-fixtures.mjs';
const image=id=>({id,url:'/api/planner/media/'+id,type:'image/png',name:id+'.png',alt:'Alt '+id});
const rich=()=>({...payload(),channelMediaItems:{instagram:[],linkedin:[image('secondary')]}});
function setup(behavior={}){const clock=timers(),calls={save:[],read:[],discard:[]};const client={save:async request=>{calls.save.push(request);return behavior.save?behavior.save(request):saved(request);},read:async id=>{calls.read.push(id);return behavior.read();},discard:async request=>{calls.discard.push(request);throw Error('must not discard');}};const c=createWorkspaceController({client,uuid:()=> 'rich-workspace-123456',setTimer:clock.setTimer,clearTimer:clock.clearTimer});return {c,calls,clock,behavior};}
test('rich checkpoint remains raw local-only, never manual/auto saved or safe-to-close',async()=>{
 const {c,calls,clock}=setup();const p=rich();assert.equal(c.open({sourcePostId:'p',basePlannerRevision:3,payload:p}),false);assert.deepEqual(c.snapshot.payload,p);assert.equal(c.snapshot.phase,'local_only');assert.equal(c.snapshot.localOnly,true);assert.equal(c.canCloseSafely,false);assert.equal(clock.size,0);c.pause();c.resume();await c.save();assert.equal(c.snapshot.phase,'local_only');assert.deepEqual(calls,{save:[],read:[],discard:[]});c.changed({...p,text:'Newer'});assert.equal(c.snapshot.payload.text,'Newer');assert.deepEqual(c.snapshot.payload.channelMediaItems,p.channelMediaItems);c.destroy();
});
test('ordinary post completion never discards an earlier recovery while rich input exists',async()=>{
 const {c,calls}=setup();const w=workspace();c.open({sourcePostId:'p',basePlannerRevision:3,payload:payload()},w);c.changed(rich());await c.completed();assert.equal(calls.discard.length,0);assert.deepEqual(c.snapshot.workspace,w);assert.equal(c.snapshot.open,false);c.destroy();
});
test('late old checkpoint response and exact reconciliation cannot mark rich current input saved',async()=>{
 const held=deferred(),h=setup({save:()=>held.promise});h.c.open({sourcePostId:'p',basePlannerRevision:3,payload:payload()});h.c.changed(payload({text:'ordinary edit'}));const pending=h.c.save();const receipt=saved(h.calls.save[0]);h.c.changed(rich());assert.equal(h.c.snapshot.pendingWrite,true);assert.equal(h.c.snapshot.valid,false);held.resolve(receipt);await pending;assert.deepEqual(h.c.snapshot.payload,rich());assert.equal(h.c.canCloseSafely,false);h.behavior.read=()=>receipt;await h.c.reconcile();assert.deepEqual(h.c.snapshot.payload,rich());assert.equal(h.c.snapshot.phase,'local_only');assert.match(h.c.snapshot.message,/Kanalmedien nicht automatisch gesichert/);h.c.resume();await h.c.save();await h.c.completed();assert.equal(h.calls.save.length,1);assert.equal(h.calls.discard.length,0);h.c.destroy();
});
test('legacy workspace may become conscious copy but never overwrite richer current source at same revision',()=>{
 const w=workspace({sourcePostId:'p',basePlannerRevision:3,payload:payload({localMediaOmitted:false})});const result=workspaceRestoreDecision(w,{posts:[{id:'p',status:'draft',channelMediaItems:rich().channelMediaItems}],revision:3,allowedChannels:w.payload.channels,isTimeZone:()=>true,dateAccepts:()=>true,timeAccepts:()=>true});assert.equal(result.supported,true);assert.equal(result.sameSource,false);assert.equal(result.requiresCopy,true);
});
