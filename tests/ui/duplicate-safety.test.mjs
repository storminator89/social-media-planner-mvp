import {preservationContext} from './preservation-context.mjs';
import {createComposerMedia} from '../../public/composer-media.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {duplicateTaktDraft} from '../../public/workflows/queue.mjs';
import {createEditorTiming} from '../../public/editor-timing.js';
import {editedPostLabels} from '../../public/post-labels.js';
import {formatIdeaTags} from '../../public/workflows/ideas.mjs';
import {selectedVariantTexts} from '../../public/variants.js';
import {CHANNELS} from '../../public/model.js';

const source=readFileSync(new URL('../../public/app.js',import.meta.url),'utf8');
function actual(name){const start=source.search(new RegExp(`(?:async )?function ${name}\\(`));assert.ok(start>=0,name);const next=source.slice(start+1).search(/\n(?:async )?function /);return source.slice(start,next<0?undefined:start+1+next);}
const clone=value=>structuredClone(value);
const stored=()=>({id:'source',title:'Original title',tags:['Original label'],text:'Original base',variantTexts:{instagram:'Original variant'},channels:['instagram','linkedin'],status:'scheduled',scheduledAt:'2027-01-15T10:30',scheduledInstant:'2027-01-15T09:30:00.000Z',scheduleBinding:null,timeZone:'Europe/Berlin',mediaItems:[{id:'owned-image',url:'/api/planner/media/owned-image',name:'original.png',type:'image/png',alt:'Original alt'}],cover:null,createdAt:'2026-11-01T10:00:00.000Z',updatedAt:'2026-11-02T10:00:00.000Z'});
function harness(extra={}){
 const post=stored(),writes=[],notices=[],opens=[],busy=[];let closes=0,retains=0,cleanups=0;
 const fields={'#post-tags':{value:formatIdeaTags(post.tags)},'#post-date':{value:'2027-01-15'},'#post-time':{value:'10:30'},'#post-zone':{value:post.timeZone},'#form-errors':{hidden:true,focus(){},scrollIntoView(){}},'#search':{value:''}};
 const channels=post.channels.map(value=>({value,checked:true}));
 const c=vm.createContext({...preservationContext(),composerImages:createComposerMedia(),savedAltEdit:null,cancelSavedAlt(){},structuredClone,Date,Promise,crypto:{randomUUID:()=> 'copy'},duplicateTaktDraft,editedPostLabels,selectedVariantTexts,CHANNELS,composerTiming:createEditorTiming(),saving:false,mediaLoading:false,composerRestoredWorkspace:false,composerMissingMedia:false,composerIdeaFingerprint:null,composerLabelState:{title:post.title,tags:clone(post.tags),baseline:fields['#post-tags'].value},composerBaseText:post.text,composerVariantTexts:clone(post.variantTexts),composerMedia:clone(post.mediaItems[0]),composerCover:post.cover,editingId:post.id,initialEditor:'',view:'queue',state:{posts:[post],settings:{timezone:'Europe/Berlin'}},$:key=>fields[key],$$:()=>channels.filter(x=>x.checked),currentComposerRawTags:()=>fields['#post-tags'].value,setComposerBusy:value=>busy.push(value),validatePost:()=>[],focusComposerErrors(){},notify:message=>notices.push(message),render(){},closeComposer(){closes++},openComposer(id){opens.push(id)},workspaceUI:{beforePostSave(){},afterPostSave(){cleanups++},retainNewerInput(){retains++}},async persist(next){writes.push(clone(next));const result=extra.persist?await extra.persist(next):true;if(result)c.state=next;return result;}});
 c.composerImages.reset(post.mediaItems);c.composerMedia=c.composerImages.selected;
 for(const name of ['editorSnapshot','savePost','duplicatePost'])vm.runInContext(actual(name),c);
 c.initialEditor=c.editorSnapshot();
 return {c,fields,channels,writes,notices,opens,busy,get closes(){return closes},get retains(){return retains},get cleanups(){return cleanups}};
}
const mutations={
 'base text':h=>{h.c.composerBaseText='Late base'},
 'labels':h=>{h.fields['#post-tags'].value='Late label'},
 'channel variant':h=>{h.c.composerVariantTexts.instagram='Late variant'},
 'channel selection':h=>{h.channels[1].checked=false},
 'date':h=>{h.fields['#post-date'].value='2027-01-16'},
 'time':h=>{h.fields['#post-time'].value='11:00'},
 'time zone':h=>{h.fields['#post-zone'].value='UTC'},
 'owned image alt':h=>{h.c.composerMedia.alt='Late alt'},
 'image replacement':h=>{h.c.composerImages.commit(h.c.composerImages.ticket('replace'),{dataUrl:'data:image/png;base64,c3ludGhldGlj',alt:'Local image'});h.c.composerMedia=h.c.composerImages.selected},
 'image removal':h=>{h.c.composerImages.remove();h.c.composerMedia=h.c.composerImages.selected},
 'cover':h=>{h.c.composerCover='forms'},
 'timing mode':h=>{h.c.composerTiming.manual()},
};
for(const [name,mutate] of Object.entries(mutations))test(`actual duplicate keeps newer ${name} open after delayed success`,async()=>{
 let finish;const h=harness({persist:()=>new Promise(resolve=>{finish=resolve})});
 // A bound timing state ensures the manual transition is observable in the actual snapshot.
 h.c.composerTiming.open({...stored(),scheduleBinding:{channelIds:['instagram','linkedin'],scheduleVersion:1}});h.c.initialEditor=h.c.editorSnapshot();
 const before=clone(h.c.state.posts[0]),initial=h.c.initialEditor,pending=h.c.duplicatePost();
 assert.equal(h.c.saving,true);assert.equal(h.writes.length,1);mutate(h);const newer=h.c.editorSnapshot();assert.notEqual(newer,initial);
 finish(true);await pending;
 assert.equal(h.closes,0);assert.deepEqual(h.opens,[]);assert.equal(h.retains,1);assert.equal(h.cleanups,0);assert.equal(h.c.editingId,'source');assert.equal(h.c.initialEditor,initial);assert.equal(h.c.view,'queue');assert.equal(h.c.editorSnapshot(),newer);assert.equal(h.c.saving,false);assert.deepEqual(h.busy,[true,false]);assert.equal(h.writes.length,1);assert.deepEqual(h.c.state.posts[0],before);assert.equal(h.c.state.posts[1].text,before.text);assert.equal(h.c.state.posts[1].variantTexts.instagram,before.variantTexts.instagram);assert.equal(h.c.state.posts[1].status,'draft');assert.equal(h.c.state.posts[1].scheduledAt,null);assert.equal(h.c.state.posts[1].scheduledInstant,null);assert.equal(h.c.state.posts[1].scheduleBinding,null);assert.deepEqual(h.c.state.posts[1].mediaItems,before.mediaItems);assert.match(h.notices.at(-1),/neueren Eingaben.*ursprünglichen/);
});

test('ordinary duplicate preserves source and opens exactly one unscheduled copy',async()=>{
 const h=harness(),before=clone(h.c.state.posts[0]);await h.c.duplicatePost();assert.equal(h.writes.length,1);assert.equal(h.closes,1);assert.deepEqual(h.opens,['copy']);assert.equal(h.retains,0);assert.equal(h.cleanups,0);assert.deepEqual(h.c.state.posts[0],before);assert.equal(h.c.view,'drafts');assert.equal(h.c.state.posts[1].title,before.title);assert.deepEqual(clone(h.c.state.posts[1].tags),before.tags);assert.equal(h.c.state.posts[1].status,'draft');assert.deepEqual(h.c.state.posts[1].channels,before.channels);assert.deepEqual(h.c.state.posts[1].mediaItems,before.mediaItems);
});
test('duplicate double click is one write and false result keeps editor and source',async()=>{
 let finish;const h=harness({persist:()=>new Promise(resolve=>{finish=resolve})}),before=clone(h.c.state);const pending=h.c.duplicatePost();await h.c.duplicatePost();assert.equal(h.writes.length,1);h.c.composerBaseText='Late on failure';finish(false);await pending;assert.equal(h.closes,0);assert.deepEqual(h.opens,[]);assert.equal(h.retains,0);assert.deepEqual(h.c.state,before);assert.equal(h.c.composerBaseText,'Late on failure');assert.equal(h.c.saving,false);assert.deepEqual(h.notices,[]);
});
test('unexpected duplicate exception unlocks without closing, retrying or changing canonical data',async()=>{
 const h=harness({persist:()=>{throw Error('unknown outcome')}}),before=clone(h.c.state);await assert.rejects(h.c.duplicatePost(),/unknown outcome/);assert.equal(h.writes.length,1);assert.equal(h.closes,0);assert.deepEqual(h.opens,[]);assert.deepEqual(h.c.state,before);assert.equal(h.c.saving,false);assert.deepEqual(h.busy,[true,false]);
});
test('dirty or decoding editor never starts duplicate write',async()=>{
 const h=harness();h.c.mediaLoading=true;await h.c.duplicatePost();h.c.mediaLoading=false;h.c.composerBaseText='Unsaved';await h.c.duplicatePost();assert.equal(h.writes.length,0);assert.equal(h.closes,0);assert.match(h.notices.at(-1),/Speichere deine Änderungen/);
});
test('restored workspace is blocked even when editor snapshot was reset or only title changed',async()=>{
 const h=harness();h.c.composerRestoredWorkspace=true;h.c.composerLabelState.title='Restored title';h.c.initialEditor=h.c.editorSnapshot();await h.c.duplicatePost();assert.equal(h.writes.length,0);assert.equal(h.closes,0);assert.equal(h.retains,0);assert.equal(h.cleanups,0);assert.equal(h.c.composerLabelState.title,'Restored title');assert.equal(h.c.state.posts[0].title,'Original title');assert.match(h.notices.at(-1),/wiederaufgenommene Arbeitsfassung.*als Beitrag/);
});
for(const result of [false,true])test(`workspace duplicate marker clears only on confirmed post save (${result})`,async()=>{
 const h=harness({persist:()=>result});h.c.composerRestoredWorkspace=true;h.c.composerBaseText='Restored contents';h.c.composerLabelState.title='Restored title';h.c.initialEditor=h.c.editorSnapshot();await h.c.savePost('draft');assert.equal(h.c.composerRestoredWorkspace,!result);assert.equal(h.writes.length,1);assert.equal(h.writes[0].posts[0].text,'Restored contents');assert.equal(h.writes[0].posts[0].title,'Restored title');assert.equal(h.closes,result?1:0);assert.equal(h.cleanups,result?1:0);
});
test('successful workspace save with late input clears restore marker but dirty duplicate still blocks',async()=>{
 let finish;const h=harness({persist:()=>new Promise(resolve=>{finish=resolve})});h.c.composerRestoredWorkspace=true;h.c.composerBaseText='Restored submitted';h.c.initialEditor=h.c.editorSnapshot();const pending=h.c.savePost('draft');h.c.composerBaseText='Newer than restored';finish(true);await pending;assert.equal(h.c.composerRestoredWorkspace,false);assert.equal(h.closes,0);assert.equal(h.retains,1);await h.c.duplicatePost();assert.equal(h.writes.length,1);assert.equal(h.c.composerBaseText,'Newer than restored');assert.match(h.notices.at(-1),/Speichere deine Änderungen/);
});
test('failed or uncertain restored save never unlocks duplicate or erases visible input',async()=>{
 const h=harness({persist:()=>{throw Error('unknown save outcome')}});h.c.composerRestoredWorkspace=true;h.c.composerBaseText='Restored still visible';h.c.initialEditor=h.c.editorSnapshot();await h.c.savePost('draft');await h.c.duplicatePost();assert.equal(h.c.composerRestoredWorkspace,true);assert.equal(h.writes.length,1);assert.equal(h.closes,0);assert.equal(h.cleanups,0);assert.equal(h.c.composerBaseText,'Restored still visible');
});

test('duplicate refusal is shown inside modal editor, not only behind its backdrop',async()=>{for(const restored of [false,true]){const h=harness();h.c.composerRestoredWorkspace=restored;if(!restored)h.c.composerBaseText='Unsaved';await h.c.duplicatePost();assert.equal(h.fields['#form-errors'].hidden,false);assert.match(h.fields['#form-errors'].textContent,/Speichere/);assert.equal(h.writes.length,0);}});
