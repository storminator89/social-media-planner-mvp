import {focusComposerErrors} from '../../public/composer-feedback.js';
import {createEditorTiming} from '../../public/editor-timing.js';
import { editedPostLabels } from '../../public/post-labels.js';
import { formatIdeaTags } from '../../public/workflows/ideas.mjs';
import { createIdea, prepareIdeaDraft, commitIdeaDraft } from '../../public/workflows/ideas.mjs';
import { CHANNELS } from '../../public/model.js';
import {selectedVariantTexts} from '../../public/variants.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise the actual application functions with delayed I/O, not a rewritten model.
const source=readFileSync(new URL('../../public/app.js',import.meta.url),'utf8');
function functionSource(name){const start=source.search(new RegExp(`(?:async )?function ${name}\\(`));assert.ok(start>=0);const next=source.slice(start+1).search(/\n(?:async )?function /);return source.slice(start,next<0?undefined:start+1+next);}
function context(extra={}){
  const fields={'#post-tags':{value:'',focus(){}},'#form-errors':{hidden:true,focus(){this.focused=true},scrollIntoView(options){this.scrollOptions=options}},'#search':{value:'Suchfilter'},'#post-text':{value:'Gesendete Fassung'},'#post-date':{value:'2027-01-15'},'#post-time':{value:'10:30'},'#post-zone':{value:'Europe/Berlin'},'#composer':{open:true},'#workspace-missing-media':{hidden:true},'#media-alt':{focus(){}},'#media-file':{value:'file'},'#save-draft':{},'#schedule-post':{}};
  const c={setTimeout,clearTimeout,focusComposerErrors,composerTiming:createEditorTiming(),fields,$:selector=>fields[selector],$$:()=>[{value:'instagram'}],state:{posts:[]},editingId:null,composerIdeaFingerprint:null,composerMissingMedia:false,composerLabelState:null,workspaceUI:null,currentComposerRawTags:()=>fields['#post-tags'].value,composerMedia:null,composerCover:null,composerBaseText:'Gesendete Fassung',composerVariantTexts:{},editedPostLabels,selectedVariantTexts,commitIdeaDraft,CHANNELS,saving:false,mediaLoading:false,composerGeneration:1,mediaGeneration:0,initialEditor:'',view:'drafts',crypto:{randomUUID:()=> 'new-post'},Date,Map,Promise,structuredClone,validatePost:()=>[],notify:()=>{},render:()=>{},renderMediaEditor:()=>{},renderPreview:()=>{},setComposerBusy:()=>{},updateSaveAvailability:()=>{},closeCount:0,closeComposer:()=>c.closeCount++,editorSnapshot:()=>JSON.stringify({tags:fields['#post-tags'].value,text:c.composerBaseText,variantTexts:c.composerVariantTexts}),...extra};
  fields['#post-tags'].value=formatIdeaTags(c.state.posts.find(p=>p.id===c.editingId)?.tags||[]);
  if(!c.initialEditor)c.initialEditor=c.editorSnapshot();
  return vm.createContext(c);
}

test('successful delayed save cannot close over a newer editor value',async()=>{
  let finish;const c=context({persist:()=>new Promise(resolve=>{finish=resolve;})});vm.runInContext(functionSource('savePost'),c);
  const pending=c.savePost('draft');assert.equal(c.saving,true);
  c.fields['#post-text'].value='Neuere noch nicht gesendete Fassung';c.composerBaseText=c.fields['#post-text'].value;finish(true);await pending;
  assert.equal(c.closeCount,0);assert.equal(c.editingId,'new-post');assert.equal(c.fields['#post-text'].value,'Neuere noch nicht gesendete Fassung');assert.equal(c.saving,false);
});

test('repeated save clicks produce only one write and failure retains the editor',async()=>{
  let finish,writes=0;const c=context({persist:()=>{writes++;return new Promise(resolve=>{finish=resolve;});}});vm.runInContext(functionSource('savePost'),c);
  const pending=c.savePost('draft');await c.savePost('draft');assert.equal(writes,1);finish(false);await pending;assert.equal(c.closeCount,0);assert.equal(c.saving,false);
});

test('commit lock disables every editor control and restores its previous state',()=>{
  const controls=[{disabled:false},{disabled:false},{disabled:true}];const c=context({disabledDuringCommit:new Map(),$$:()=>controls});c.fields['#composer-form']={setAttribute(){}};
  vm.runInContext(functionSource('setComposerBusy'),c);c.setComposerBusy(true);assert.ok(controls.every(x=>x.disabled));c.setComposerBusy(false);assert.deepEqual(controls.map(x=>x.disabled),[false,false,true]);
});

test('late image decode from a previous composer cannot replace the current image',async()=>{
  const readers=[],images=[];const c=context({FileReader:class{readAsDataURL(){readers.push(this);}},Image:class{set src(value){images.push(this);}}});vm.runInContext(functionSource('readMedia'),c);
  const pending=c.readMedia({name:'old.png',type:'image/png',size:10});assert.equal(c.mediaLoading,true);
  readers[0].result='data:image/png;base64,OLD';readers[0].onload();await new Promise(setImmediate);assert.equal(images.length,1);
  c.composerGeneration++;c.mediaGeneration++;c.mediaLoading=false;c.composerMedia={name:'new.png'};
  images[0].onload();await pending;assert.equal(c.composerMedia.name,'new.png');assert.equal(c.mediaLoading,false);
});

test('newer file selection wins even if an older read finishes last',async()=>{
  const readers=[],images=[];const c=context({FileReader:class{readAsDataURL(){readers.push(this);}},Image:class{set src(value){images.push(this);}}});vm.runInContext(functionSource('readMedia'),c);
  const old=c.readMedia({name:'old.png',type:'image/png',size:10});const newer=c.readMedia({name:'new.png',type:'image/png',size:10});
  readers[1].result='data:image/png;base64,NEW';readers[1].onload();await new Promise(setImmediate);images[0].onload();await newer;
  readers[0].result='data:image/png;base64,OLD';readers[0].onload();await old;assert.equal(c.composerMedia.name,'new.png');assert.equal(images.length,1);
});

test('pending image decode blocks save, and dirty duplicate never discards current edits',async()=>{
  let writes=0;const c=context({mediaLoading:true,persist:async()=>{writes++;return true;}});vm.runInContext(functionSource('savePost'),c);await c.savePost('draft');assert.equal(writes,0);
  c.mediaLoading=false;c.editingId='p1';c.state.posts=[{id:'p1'}];c.initialEditor='Older value';vm.runInContext(functionSource('duplicatePost'),c);await c.duplicatePost();assert.equal(writes,0);assert.equal(c.closeCount,0);
});


test('delayed save preserves a newer individual channel text',async()=>{
  let finish,submitted;const c=context({composerVariantTexts:{instagram:'Gesendete Variante'},persist:next=>{submitted=next;return new Promise(resolve=>{finish=resolve;});}});vm.runInContext(functionSource('savePost'),c);
  const pending=c.savePost('draft');assert.equal(submitted.posts[0].text,'Gesendete Fassung');assert.equal(submitted.posts[0].variantTexts.instagram,'Gesendete Variante');
  c.composerVariantTexts.instagram='Neuere Variante';finish(true);await pending;assert.equal(c.closeCount,0);assert.equal(c.composerVariantTexts.instagram,'Neuere Variante');assert.equal(c.saving,false);
});

test('mobile week agenda receives only the selected week, not all posts',()=>{
  const dateKey=d=>new Date(d).toISOString().slice(0,10),addDays=(d,n)=>new Date(new Date(d).getTime()+n*86400000);
  const c=vm.createContext({anchor:new Date('2026-11-02T00:00:00Z'),startOfWeek:d=>d,addDays,dateKey,Date,days:['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'],dateLabel:d=>dateKey(d),icon:()=>'',postCard:()=>'',currentZone:()=> 'UTC',zonedNow:()=>new Date('2026-11-02T00:00Z'),renderMobileWeek:posts=>{c.received=posts;return '';},periodPosts:posts=>posts.filter(p=>p.scheduledAt>='2026-11-02'&&p.scheduledAt<'2026-11-09')});
  vm.runInContext(functionSource('renderWeek'),c);
  c.renderWeek([{id:'before',scheduledAt:'2026-11-01T10:00'},{id:'inside',scheduledAt:'2026-11-08T10:00'},{id:'after',scheduledAt:'2026-11-09T10:00'}]);
  assert.deepEqual(c.received.map(p=>p.id),['inside']);
});


test('actual composer save moves an idea with identical ID and preserves title/tags',async()=>{
  const idea=createIdea({id:'idea-actual',title:'Redaktionell',text:'Gesendete Fassung',tags:['A, B'],timezone:'Europe/Berlin'});const prepared=prepareIdeaDraft(idea);let candidate;
  const c=context({state:{posts:[idea]},editingId:idea.id,composerIdeaFingerprint:prepared.sourceFingerprint,persist:async next=>{candidate=next;return true;},query:'Suchfilter',channel:'bluesky'});vm.runInContext(functionSource('savePost'),c);await c.savePost('draft');
  assert.equal(candidate.posts.length,1);assert.equal(candidate.posts[0].id,idea.id);assert.equal(candidate.posts[0].status,'draft');assert.equal(candidate.posts[0].title,'Redaktionell');assert.deepEqual([...candidate.posts[0].tags],['A, B']);assert.equal(c.closeCount,1);assert.equal(c.channel,'all');assert.equal(c.query,'');assert.equal(c.composerIdeaFingerprint,null);
});

test('actual composer retains idea and conversion guard after failed save',async()=>{
  const idea=createIdea({id:'idea-actual',text:'Gesendete Fassung',timezone:'Europe/Berlin'}),prepared=prepareIdeaDraft(idea);
  const c=context({state:{posts:[idea]},editingId:idea.id,composerIdeaFingerprint:prepared.sourceFingerprint,persist:async()=>false});vm.runInContext(functionSource('savePost'),c);await c.savePost('draft');assert.equal(c.state.posts[0].status,'idea');assert.equal(c.composerIdeaFingerprint,prepared.sourceFingerprint);assert.equal(c.closeCount,0);
});

test('actual composer rejects changed idea before any write',async()=>{
  const idea=createIdea({id:'idea-actual',text:'Gesendete Fassung',timezone:'Europe/Berlin'}),prepared=prepareIdeaDraft(idea);let writes=0;
  const c=context({state:{posts:[{...idea,text:'Andere Fassung'}]},editingId:idea.id,composerIdeaFingerprint:prepared.sourceFingerprint,persist:async()=>{writes++;return true;}});vm.runInContext(functionSource('savePost'),c);await c.savePost('draft');assert.equal(writes,0);assert.equal(c.closeCount,0);assert.match(c.fields['#form-errors'].textContent,/inzwischen geändert/);assert.equal(c.saving,false);
});

test('single-image editor adoption swaps image and alt only after successful decode',async()=>{
 const original={id:'saved-image',url:'/api/planner/media/saved-image',name:'original.png',type:'image/png',alt:'Original alt'},readers=[],images=[];let captures=0;
 const c=context({composerMedia:original,composerCover:'forms',workspaceUI:{captureChanged:()=>captures++},FileReader:class{readAsDataURL(){readers.push(this);}},Image:class{set src(value){if(value)images.push(this);}}});vm.runInContext(functionSource('readMedia'),c);
 const pending=c.readMedia({name:'edited.jpg',type:'image/jpeg',size:10},'New alt');assert.equal(c.composerMedia,original);readers[0].result='data:image/jpeg;base64,dGVzdA==';readers[0].onload();await new Promise(setImmediate);assert.equal(c.composerMedia,original);assert.equal(c.composerCover,'forms');images[0].onload();assert.equal(await pending,true);assert.equal(c.composerMedia.alt,'New alt');assert.equal(c.composerMedia.name,'edited.jpg');assert.equal(original.alt,'Original alt');assert.equal(c.composerCover,null);assert.equal(captures,1);
});
for(const stage of ['read','decode'])test(`single-image ${stage} deadline preserves existing image, alt and cover and ignores late callback`,async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const original={id:'saved-image',alt:'Keep'},readers=[],images=[];let aborts=0,captures=0;
 const c=context({setTimeout,clearTimeout,composerMedia:original,composerCover:'forms',workspaceUI:{captureChanged:()=>captures++},FileReader:class{readAsDataURL(){readers.push(this);}abort(){aborts++;}},Image:class{set src(value){if(value)images.push(this);}}});vm.runInContext(functionSource('readMedia'),c);
 const pending=c.readMedia({name:'new.jpg',type:'image/jpeg',size:10},'New');let late=readers[0].onload;readers[0].result='data:image/jpeg;base64,dGVzdA==';if(stage==='decode'){late();await new Promise(setImmediate);late=images[0].onload;}
 t.mock.timers.tick(15000);assert.equal(await pending,false);assert.equal(c.composerMedia,original);assert.equal(c.composerCover,'forms');assert.equal(c.mediaLoading,false);assert.equal(captures,0);assert.equal(aborts,stage==='read'?1:0);late();await new Promise(setImmediate);assert.equal(c.composerMedia,original);assert.equal(captures,0);
});
test('editor bridge rejects failed or stale adoption and leaves the source image unchanged',async()=>{
 const original={id:'saved-image',alt:'Keep'};let calls=0;const c=context({composerMedia:original,imageStudioTarget:original,imageStudioGeneration:1,readMedia:async()=>{calls++;return false;}});vm.runInContext(functionSource('applyEditedImage'),c);
 await assert.rejects(c.applyEditedImage({type:'image/jpeg'},'New'),/nicht übernommen/);assert.equal(calls,1);assert.equal(c.composerMedia,original);c.composerGeneration=2;await assert.rejects(c.applyEditedImage({},''),/inzwischen geändert/);assert.equal(calls,1);c.composerGeneration=1;c.composerMedia={...original};await assert.rejects(c.applyEditedImage({},''),/inzwischen geändert/);assert.equal(calls,1);
});
test('image studio captures the current composer identity; add starts blank and edit reads existing image only',async()=>{
 const original={id:'saved-image',alt:'Keep'},opened=[];const c=context({composerMedia:original,imageStudioTarget:null,imageStudioGeneration:0,imageStudio:{open:async media=>opened.push(media)}});vm.runInContext(functionSource('openImageStudio'),c);
 await c.openImageStudio();assert.deepEqual(opened,[null]);assert.equal(c.imageStudioTarget,original);assert.equal(c.imageStudioGeneration,1);await c.openImageStudio(true);assert.equal(opened[1],original);c.saving=true;await c.openImageStudio();assert.equal(opened.length,2);
});
test('composer closure force-closes image studio before invalidating session and clearing its image',()=>{
 let closed=0;const c=context({imageStudio:{close:options=>{assert.equal(options.force,true);closed++;}},clearMastodonPlanningStatus(){},queuePanel:null,returnFocus:null});c.fields['#info-dialog']={open:false};c.fields['#composer'].close=()=>{};c.fields['#main']={focus(){}};vm.runInContext(functionSource('closeComposer'),c);c.closeComposer();assert.equal(closed,1);assert.equal(c.composerGeneration,2);assert.equal(c.mediaGeneration,1);assert.equal(c.composerMedia,null);
});
for(const stage of ['editor','preview','workspace'])test(`failed ${stage} update rolls back image, alt, cover and missing warning`,async()=>{
 const original={id:'saved-image',alt:'Keep'},readers=[],images=[];const c=context({composerMedia:original,composerCover:'forms',composerMissingMedia:true,FileReader:class{readAsDataURL(){readers.push(this);}},Image:class{set src(value){if(value)images.push(this);}}});
 const fail=()=>{throw Error('Synthetic UI failure');};if(stage==='editor')c.renderMediaEditor=fail;if(stage==='preview')c.renderPreview=fail;if(stage==='workspace')c.workspaceUI={captureChanged:fail};vm.runInContext(functionSource('readMedia'),c);
 const pending=c.readMedia({name:'edited.jpg',type:'image/jpeg',size:10},'New');readers[0].result='data:image/jpeg;base64,dGVzdA==';readers[0].onload();await new Promise(setImmediate);images[0].onload();assert.equal(await pending,false);assert.equal(c.composerMedia,original);assert.equal(c.composerMedia.alt,'Keep');assert.equal(c.composerCover,'forms');assert.equal(c.composerMissingMedia,true);assert.equal(c.fields['#workspace-missing-media'].hidden,false);
});
test('beforeunload warns for unadopted image studio work even with an unchanged composer',()=>{
 const match=source.match(/window\.addEventListener\('beforeunload',e=>\{.*?\}\);/);assert.ok(match);let guard;const c=vm.createContext({window:{addEventListener:(_name,fn)=>guard=fn},imageStudio:{hasPendingWork:true},postingTimesUI:{dirty:false},workspaceUI:{hasUnsavedLocalInput:false},$:selector=>({open:selector==='#composer'}),initialEditor:'saved',editorSnapshot:()=> 'saved'});vm.runInContext(match[0],c);let prevented=0;const event={preventDefault:()=>prevented++};guard(event);assert.equal(prevented,1);assert.equal(event.returnValue,'');c.imageStudio.hasPendingWork=false;guard({preventDefault:()=>assert.fail('No pending work')});
});
