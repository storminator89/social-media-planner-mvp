import {normalizeWorkspacePayload as v71Payload} from '../workspaces/fixtures/workspace-client-v71.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {captureWorkspaceChannelMedia,projectWorkspaceChannelMedia} from '../../public/workspace-channel-media.js';
import {normalizeWorkspacePayload,workspacePayloadEqual,workspaceReceiptMatches} from '../../public/workspace-client.js';
import {workspaceRestoreDecision,workspaceRestoreMedia,restoredWorkspacePayload,workspaceHasOmissions} from '../../public/workspace-restore.js';
import {createWorkspaceController} from '../../public/workspace-controller.js';
import {renderWorkspaceStatus} from '../../public/workspace-ui.js';
import {payload} from './workspace-fixtures.mjs';
const img=id=>({id,url:'/api/planner/media/'+id,alt:'alt '+id,name:id+'.png',type:'image/png'});
const local=()=>({dataUrl:'data:image/png;base64,eA==',name:'same.png',alt:'same',type:'image/png'});
const channels=['linkedin','instagram'];
const map=()=>({linkedin:[img('a'),img('b')],instagram:[img('b'),img('c')]});
function rich(m=map()){const {media,localMediaOmitted,...base}=payload();return {...base,...captureWorkspaceChannelMedia(m,channels)};}
function receipt(p){return {workspaceId:'workspace-00000001',revision:1,writeId:'operation-00000001',sourcePostId:'post-1',basePlannerRevision:7,payload:p,mediaMetadataConflict:false,resolvedMediaItems:p.mediaItems.map(m=>m.id?img(m.id):null)};}
const context=(source,revision=7)=>({posts:[source],revision,allowedChannels:channels,isTimeZone:()=>true,dateAccepts:()=>true,timeAccepts:()=>true});
test('v4 preserves shared/disjoint order, explicit empty lists and first-channel projection',()=>{
 for(const m of [map(),{linkedin:[],instagram:[img('b')]},{linkedin:[],instagram:[]}]){const p=normalizeWorkspacePayload(rich(m));const w=receipt(p);assert.deepEqual(projectWorkspaceChannelMedia(p,workspaceRestoreMedia(w,p)),m);assert.equal(p.schemaVersion,4);}
 const p=rich();assert.deepEqual(p.mediaItems.map(m=>m.id),['a','b','c']);assert.deepEqual(p.channelMediaRefs,{linkedin:[0,1],instagram:[1,2]});assert.equal(JSON.stringify(p).includes('url'),false);
});
test('ambiguous metadata rejected; equal local metadata never deduplicates and never saves bytes',()=>{
 const m=map();m.instagram[0].alt='conflicting';assert.throws(()=>rich(m));const p=rich({linkedin:[local()],instagram:[local()]});assert.equal(p.mediaItems.length,2);assert.deepEqual(p.channelMediaRefs,{linkedin:[0],instagram:[1]});assert.ok(workspaceHasOmissions(p));assert.doesNotMatch(JSON.stringify(p),/dataUrl|base64|url/);assert.throws(()=>restoredWorkspacePayload(receipt(p)));assert.throws(()=>workspaceRestoreMedia(receipt(p),p));
});
test('strict refs reject sparse, dangling, duplicate, hidden, accessor, wrong channel and unreachable data without getters',()=>{
 const edits=[p=>p.channelMediaRefs.linkedin=[0,0],p=>p.channelMediaRefs.linkedin=[-1],p=>p.channelMediaRefs.linkedin=[3],p=>p.channelMediaRefs.linkedin=Array(2),p=>delete p.channelMediaRefs.instagram,p=>p.channelMediaRefs.extra=[],p=>p.channelMediaRefs.instagram=[],p=>p.channelMediaRefs.linkedin=Array(11).fill(0),p=>p.mediaItems[0].url='https://private.invalid',p=>p.mediaItems[0].type='video/mp4'];
 for(const edit of edits){const p=rich();edit(p);assert.throws(()=>normalizeWorkspacePayload(p));}
 let calls=0;const p=rich();Object.defineProperty(p.channelMediaRefs,'linkedin',{enumerable:true,get(){calls++;return [0,1];}});assert.throws(()=>normalizeWorkspacePayload(p));assert.equal(calls,0);
});
test('receipt comparison includes channel mapping and does not silently reorder catalog',()=>{
 const p=rich(),q=structuredClone(p);q.channelMediaRefs.instagram.reverse();assert.equal(workspacePayloadEqual(p,q),false);const request={...receipt(p),expectedRevision:0};assert.ok(workspaceReceiptMatches({...receipt(p),state:'active'},request));assert.equal(workspaceReceiptMatches({...receipt(q),state:'active'},request),false);
 const reordered=structuredClone(p);reordered.mediaItems.reverse();reordered.channelMediaRefs={linkedin:[2,1],instagram:[1,0]};assert.deepEqual(normalizeWorkspacePayload(reordered).mediaItems,reordered.mediaItems);assert.equal(workspacePayloadEqual(p,reordered),false);
});
test('original restore needs revision and exact channels; archive and legacy richer-source restoration copy-only',()=>{
 const source={id:'post-1',status:'draft',channels,channelMediaItems:map()};const w=receipt(rich());assert.equal(workspaceRestoreDecision(w,context(source)).sameSource,true);for(const [s,r] of [[{...source,status:'archived'},7],[{...source,channels:[...channels].reverse()},7],[source,8]])assert.equal(workspaceRestoreDecision(w,context(s,r)).sameSource,false);
 const p=rich();delete p.channelMediaRefs;p.schemaVersion=2;p.mediaItems=p.mediaItems.slice(0,2);assert.equal(workspaceRestoreDecision(receipt(p),context(source)).sameSource,false);
 const omitted=receipt(rich({linkedin:[img('a')],instagram:[local()]}));assert.equal(workspaceRestoreDecision(omitted,context(source)).supported,false);
});
test('inflight receipt never confirms newer channel order, and v4 cannot downgrade',async()=>{
 let finish;let captured;const controller=createWorkspaceController({uuid:()=> 'workspace-00000001',setTimer:()=>1,clearTimer:()=>{},client:{save:request=>{captured=request;return new Promise(r=>finish=r);}}});const p=rich();controller.open({sourcePostId:'post-1',basePlannerRevision:7,payload:p});const newer=structuredClone(p);newer.text='changed';controller.changed(newer);const pending=controller.save();const newest=structuredClone(newer);newest.channelMediaRefs.instagram.reverse();controller.changed(newest);finish({...receipt(captured.payload),state:'active',writeId:captured.writeId});await pending;assert.equal(controller.snapshot.phase,'dirty');assert.equal(controller.canCloseSafely,false);const downgraded=structuredClone(newest);downgraded.schemaVersion=2;delete downgraded.channelMediaRefs;controller.changed(downgraded);assert.equal(controller.snapshot.phase,'invalid');controller.destroy();
});
test('secondary local omission blocks safe close and full saved claim; clean unsaved editor never claims metadata persisted',()=>{
 const p=rich({linkedin:[img('a')],instagram:[local()]});const c=createWorkspaceController({setTimer:()=>1,clearTimer:()=>{}});c.open({payload:p},receipt(p));assert.equal(c.canCloseSafely,false);const html=renderWorkspaceStatus(c.snapshot,{available:true,omitted:true});assert.match(html,/Nur Metadaten gesichert/);assert.doesNotMatch(html,/Arbeitsfassung gesichert|<details/);c.destroy();const clean=renderWorkspaceStatus({phase:'saved',workspace:null,message:'Noch keine Sicherung.'},{available:true,omitted:true});assert.doesNotMatch(clean,/Text und Medienbeschreibungen sind gesichert/);
});

test('unchanged v71 client rejects v4 instead of silently flattening, while v2 and v3 remain readable',()=>{assert.throws(()=>v71Payload(rich()));const p=rich();delete p.channelMediaRefs;p.schemaVersion=2;assert.deepEqual(v71Payload(p),normalizeWorkspacePayload(p));p.schemaVersion=3;assert.deepEqual(v71Payload(p),normalizeWorkspacePayload(p));});
