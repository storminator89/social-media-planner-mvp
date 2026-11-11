import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {CHANNELS,validatePost} from '../../public/model.js';
import {createComposerMedia} from '../../public/composer-media.js';
import {captureWorkspaceChannelMedia,projectWorkspaceChannelMedia} from '../../public/workspace-channel-media.js';
import {workspaceRestoreDecision,workspaceRestoreMedia} from '../../public/workspace-restore.js';
const source=readFileSync(new URL('../../public/app.js',import.meta.url),'utf8');
function fn(name){const start=source.search(new RegExp(`(?:async )?function ${name}\\(`)),next=source.slice(start+1).search(/\n(?:async )?function /);assert.ok(start>=0);return source.slice(start,next<0?undefined:start+1+next);}
const image=id=>({id,url:'/api/planner/media/'+id,name:id+'.png',alt:id,type:'image/png'});
const clone=v=>JSON.parse(JSON.stringify(v));
function harness(channels,map){
 let inputs=[],saved;const fields={};const $=id=>fields[id]??=({value:'',hidden:false,checked:false,open:false});
 Object.defineProperty($('#composer-channels'),'innerHTML',{set(html){inputs=[...html.matchAll(/<input[^>]*value="([^"]+)"([^>]*)>/g)].map(m=>({value:m[1],checked:/\bchecked\b/.test(m[2])}));},get(){return '';}});
 $('#post-zone').value='UTC';
 const original={id:'post-1',channels:[...channels],status:'draft',text:'Text',mediaItems:map?map[channels[0]]:[],...(map?{channelMediaItems:map}:{}),title:'',tags:[],timeZone:'UTC'};
 const c={CHANNELS,platform:()=>'',esc:x=>x,structuredClone,crypto,$,$$:selector=>selector.includes(':checked')?inputs.filter(x=>x.checked):inputs,state:{posts:[original]},editingId:'post-1',composerBaseText:'Text',composerVariantTexts:{},composerLabelState:{title:'',tags:[],baseline:''},composerCover:null,composerChannelMedia:map?structuredClone(map):null,composerImages:createComposerMedia(map?map[channels[0]]:[]),composerTiming:{planning:{schemaVersion:1,scheduledInstant:null,scheduleBinding:null},snapshot:{},restore(){},forSave:()=>({scheduledInstant:null,scheduleBinding:null})},activeTextTarget:'base',videoWorkspaceVersion:2,isVideoMedia:()=>false,captureWorkspaceChannelMedia,projectWorkspaceChannelMedia,workspaceRestoreMedia,currentComposerRawTags:()=>'',composerMissingMedia:false,workspaceRestoring:false,saving:false,mediaLoading:false,savedAltEdit:null,composerIdeaFingerprint:null,composerRestoredWorkspace:false,composerMedia:null,workspaceUI:{beforePostSave(){},async afterPostSave(){return true;}},originalPreservationController:()=>({status:()=>({kind:'none'})}),editedPostLabels:()=>[],selectedVariantTexts:()=>({}),validatePost,initialEditor:'{}',setComposerBusy(){},async persist(state){saved=clone(state.posts.at(-1));return true;},focusComposerErrors(){},notify(){},closeComposer(){},render(){},openComposer(id){c.editingId=id;c.renderComposerChannels(id?original.channels:['instagram']);},populateZoneSelect(node,v){node.value=v;},effectiveText:()=>'',renderMediaEditor(){},renderVariantTabs(){},renderPreview(){},view:'drafts'};
 vm.createContext(c);for(const name of ['renderComposerChannels','editorSnapshot','editorPost','captureWorkspacePayload','applyWorkspaceRestore','savePost'])vm.runInContext(fn(name),c);
 c.renderComposerChannels(channels);return {c,fields,original,inputs:()=>inputs,saved:()=>saved};
}
for(const [name,channels,map] of [
 ['non-global empty primary',['linkedin','instagram'],{linkedin:[],instagram:[image('b'),image('a')]}],
 ['global shared/disjoint',['instagram','linkedin'],{instagram:[image('a')],linkedin:[image('b'),image('a')]}],
 ['non-global all empty',['linkedin','instagram'],{linkedin:[],instagram:[]}],
])test(`actual render/capture/ordinary save/restore retain ${name}`,async()=>{
 const h=harness(channels,map),{c}=h;const captured=clone(c.captureWorkspacePayload());assert.deepEqual(captured.channels,channels);assert.deepEqual(projectWorkspaceChannelMedia(captured,captured.mediaItems.map(m=>image(m.id))),map);
 const w={sourcePostId:'post-1',basePlannerRevision:2,payload:captured,resolvedMediaItems:captured.mediaItems.map(m=>image(m.id)),mediaMetadataConflict:false};assert.equal(workspaceRestoreDecision(w,{posts:[h.original],revision:2,allowedChannels:CHANNELS.map(c=>c.id),isTimeZone:()=>true,dateAccepts:()=>true,timeAccepts:()=>true}).sameSource,true);
 await c.savePost('draft');assert.deepEqual(h.saved().channels,channels);assert.deepEqual(h.saved().mediaItems,map[channels[0]]);assert.deepEqual(h.saved().channelMediaItems,map);
 for(const asCopy of [false,true]){c.applyWorkspaceRestore(w,captured,{asCopy});assert.deepEqual(clone(c.captureWorkspacePayload()),captured);await c.savePost('draft');assert.deepEqual(h.saved().channels,channels);assert.deepEqual(h.saved().mediaItems,map[channels[0]]);assert.deepEqual(h.saved().channelMediaItems,map);}
});
test('common v2/v3 selections add/remove/readd without rerendering and preserve order when reopened',async()=>{
 const h=harness(['linkedin'],null),{c}=h;const firstInputs=h.inputs();firstInputs.find(x=>x.value==='instagram').checked=true;firstInputs.find(x=>x.value==='linkedin').checked=false;firstInputs.find(x=>x.value==='linkedin').checked=true;assert.equal(h.inputs(),firstInputs);assert.deepEqual(clone(c.captureWorkspacePayload().channels),['linkedin','instagram']);await c.savePost('draft');assert.deepEqual(h.saved().channels,['linkedin','instagram']);c.renderComposerChannels(h.saved().channels);assert.deepEqual(clone(c.captureWorkspacePayload().channels),['linkedin','instagram']);c.videoWorkspaceVersion=3;assert.equal(c.captureWorkspacePayload().schemaVersion,3);
});
test('invalid selected channels reject before modifying DOM; actual open and restore call the same renderer',()=>{
 const h=harness(['linkedin'],null),before=h.inputs();for(const ids of [['linkedin','linkedin'],['unknown']])assert.throws(()=>h.c.renderComposerChannels(ids));assert.equal(h.inputs(),before);assert.match(fn('openComposer'),/renderComposerChannels\(channels\)/);assert.match(fn('applyWorkspaceRestore'),/renderComposerChannels\(payload.channels\)/);
});
