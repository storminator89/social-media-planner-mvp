import {preservationContext} from './preservation-context.mjs';
import {videoContext} from './video-context.mjs';
import {createComposerMedia} from '../../public/composer-media.js';
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
  const c={...videoContext(),imageStudioTicket:null,composerImages:createComposerMedia(),savedTextPicker:null,postTemplatePicker:null,setTimeout,clearTimeout,focusComposerErrors,composerTiming:createEditorTiming(),fields,$:selector=>fields[selector],$$:selector=>selector==='#composer video'?[]:[{value:'instagram'}],state:{posts:[]},editingId:null,composerIdeaFingerprint:null,composerMissingMedia:false,composerRestoredWorkspace:false,composerLabelState:null,workspaceUI:null,currentComposerRawTags:()=>fields['#post-tags'].value,composerMedia:null,composerCover:null,composerBaseText:'Gesendete Fassung',composerVariantTexts:{},editedPostLabels,selectedVariantTexts,commitIdeaDraft,CHANNELS,saving:false,mediaLoading:false,composerGeneration:1,mediaGeneration:0,initialEditor:'',view:'drafts',crypto:{randomUUID:()=> 'new-post'},Date,Map,Promise,structuredClone,validatePost:()=>[],notify:()=>{},render:()=>{},renderMediaEditor:()=>{},renderPreview:()=>{},setComposerBusy:()=>{},updateSaveAvailability:()=>{},closeCount:0,closeComposer:()=>c.closeCount++,editorSnapshot:()=>JSON.stringify({tags:fields['#post-tags'].value,text:c.composerBaseText,variantTexts:c.composerVariantTexts}),...extra};
  fields['#post-tags'].value=formatIdeaTags(c.state.posts.find(p=>p.id===c.editingId)?.tags||[]);
  if(!c.initialEditor)c.initialEditor=c.editorSnapshot();
  c.composerImages.reset(c.composerMedia?[c.composerMedia]:[]);c.imageStudioTicket=c.composerImages.ticket('replace');c.closeDraftSplit=()=>{};const result=vm.createContext(Object.assign(c,{...preservationContext(),savedAltEdit:null,cancelSavedAlt(){},composerFileDrop:{reset(){}}}));vm.runInContext(functionSource('prepareMediaCommit'),result);return result;
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
  const readers=[],images=[];const c=context({FileReader:class{readAsDataURL(){readers.push(this);}},Image:class{naturalWidth=100;naturalHeight=100;set src(value){images.push(this);}}});vm.runInContext(functionSource('readMedia'),c);
  const pending=c.readMedia({name:'old.png',type:'image/png',size:10});assert.equal(c.mediaLoading,true);
  readers[0].result='data:image/png;base64,OLD';readers[0].onload();await new Promise(setImmediate);assert.equal(images.length,1);
  c.composerGeneration++;c.mediaGeneration++;c.mediaLoading=false;c.composerMedia={name:'new.png'};
  images[0].onload();await pending;assert.equal(c.composerMedia.name,'new.png');assert.equal(c.mediaLoading,false);
});

test('newer file selection wins even if an older read finishes last',async()=>{
  const readers=[],images=[];const c=context({FileReader:class{readAsDataURL(){readers.push(this);}},Image:class{naturalWidth=100;naturalHeight=100;set src(value){images.push(this);}}});vm.runInContext(functionSource('readMedia'),c);
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
  const c=vm.createContext({...preservationContext(),...videoContext(),savedAltEdit:null,cancelSavedAlt(){},composerFileDrop:{reset(){}},splitPending:false,closeDraftSplit(){},updateDraftSplitAvailability(){},anchor:new Date('2026-11-02T00:00:00Z'),startOfWeek:d=>d,addDays,dateKey,Date,days:['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'],dateLabel:d=>dateKey(d),icon:()=>'',postCard:()=>'',currentZone:()=> 'UTC',zonedNow:()=>new Date('2026-11-02T00:00Z'),renderMobileWeek:posts=>{c.received=posts;return '';},periodPosts:posts=>posts.filter(p=>p.scheduledAt>='2026-11-02'&&p.scheduledAt<'2026-11-09')});
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
 const c=context({composerMedia:original,composerCover:'forms',workspaceUI:{captureChanged:()=>captures++},FileReader:class{readAsDataURL(){readers.push(this);}},Image:class{naturalWidth=100;naturalHeight=100;set src(value){if(value)images.push(this);}}});vm.runInContext(functionSource('readMedia'),c);
 const pending=c.readMedia({name:'edited.jpg',type:'image/jpeg',size:10},'New alt',()=>true,c.composerImages.ticket('replace'));assert.equal(c.composerMedia,original);readers[0].result='data:image/jpeg;base64,dGVzdA==';readers[0].onload();await new Promise(setImmediate);assert.equal(c.composerMedia,original);assert.equal(c.composerCover,'forms');images[0].onload();assert.equal(await pending,true);assert.equal(c.composerMedia.alt,'New alt');assert.equal(c.composerMedia.name,'edited.jpg');assert.equal(original.alt,'Original alt');assert.equal(c.composerCover,null);assert.equal(captures,1);
});
for(const stage of ['read','decode'])test(`single-image ${stage} deadline preserves existing image, alt and cover and ignores late callback`,async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const original={id:'saved-image',alt:'Keep'},readers=[],images=[];let aborts=0,captures=0;
 const c=context({setTimeout,clearTimeout,composerMedia:original,composerCover:'forms',workspaceUI:{captureChanged:()=>captures++},FileReader:class{readAsDataURL(){readers.push(this);}abort(){aborts++;}},Image:class{naturalWidth=100;naturalHeight=100;set src(value){if(value)images.push(this);}}});vm.runInContext(functionSource('readMedia'),c);
 const pending=c.readMedia({name:'new.jpg',type:'image/jpeg',size:10},'New',()=>true,c.composerImages.ticket('replace'));let late=readers[0].onload;readers[0].result='data:image/jpeg;base64,dGVzdA==';if(stage==='decode'){late();await new Promise(setImmediate);late=images[0].onload;}
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
 const original={id:'saved-image',alt:'Keep'},readers=[],images=[];const c=context({composerMedia:original,composerCover:'forms',composerMissingMedia:true,FileReader:class{readAsDataURL(){readers.push(this);}},Image:class{naturalWidth=100;naturalHeight=100;set src(value){if(value)images.push(this);}}});
 const fail=()=>{throw Error('Synthetic UI failure');};if(stage==='editor')c.renderMediaEditor=fail;if(stage==='preview')c.renderPreview=fail;if(stage==='workspace')c.workspaceUI={captureChanged:fail};vm.runInContext(functionSource('readMedia'),c);
 const pending=c.readMedia({name:'edited.jpg',type:'image/jpeg',size:10},'New',()=>true,c.composerImages.ticket('replace'));readers[0].result='data:image/jpeg;base64,dGVzdA==';readers[0].onload();await new Promise(setImmediate);images[0].onload();assert.equal(await pending,false);assert.deepEqual(c.composerMedia,original);assert.equal(c.composerMedia.alt,'Keep');assert.equal(c.composerCover,'forms');assert.equal(c.composerMissingMedia,true);assert.equal(c.fields['#workspace-missing-media'].hidden,false);
});
test('beforeunload warns for unadopted image studio work even with an unchanged composer',()=>{
 const match=source.match(/window\.addEventListener\('beforeunload',e=>\{.*?\}\);/);assert.ok(match);let guard;const c=vm.createContext({...preservationContext(),...videoContext(),savedAltEdit:null,cancelSavedAlt(){},composerFileDrop:{reset(){}},splitPending:false,closeDraftSplit(){},updateDraftSplitAvailability(){},window:{addEventListener:(_name,fn)=>guard=fn},imageStudio:{hasPendingWork:true},postingTimesUI:{dirty:false},workspaceUI:{hasUnsavedLocalInput:false},$:selector=>({open:selector==='#composer'}),initialEditor:'saved',editorSnapshot:()=> 'saved'});vm.runInContext(match[0],c);let prevented=0;const event={preventDefault:()=>prevented++};guard(event);assert.equal(prevented,1);assert.equal(event.returnValue,'');c.imageStudio.hasPendingWork=false;guard({preventDefault:()=>assert.fail('No pending work')});
});
for(const mutation of ['move','remove','select','session'])test(`actual file decoder cannot overwrite carousel after ${mutation}`,async()=>{
 const readers=[],images=[],c=context({FileReader:class{readAsDataURL(){readers.push(this);}},Image:class{naturalWidth=100;naturalHeight=100;set src(value){if(value)images.push(this);}}});
 c.composerImages.reset([{id:'one',alt:'One'},{id:'two',alt:'Two'}]);c.composerMedia=c.composerImages.selected;vm.runInContext(functionSource('readMedia'),c);
 const pending=c.readMedia({name:'late.png',type:'image/png',size:10},'Late',()=>true,c.composerImages.ticket('replace'));readers[0].result='data:image/png;base64,AAAA';readers[0].onload();await new Promise(setImmediate);
 if(mutation==='move')c.composerImages.move(1);if(mutation==='remove')c.composerImages.remove();if(mutation==='select')c.composerImages.select(c.composerImages.rows[1].key);if(mutation==='session')c.composerImages.reset();c.composerMedia=c.composerImages.selected;const before=c.composerImages.items;images[0].onload();assert.equal(await pending,false);assert.deepEqual(c.composerImages.items,before);
});
test('second-image adoption does not retire or replace a workspace',async()=>{
 const readers=[],images=[],c=context({workspaceUI:{prepareCarousel:async()=>assert.fail('No retirement'),captureChanged(){}},FileReader:class{readAsDataURL(){readers.push(this);}},Image:class{naturalWidth=100;naturalHeight=100;set src(value){if(value)images.push(this);}}});c.composerImages.reset([{id:'one',alt:'One'}]);c.composerMedia=c.composerImages.selected;vm.runInContext(functionSource('readMedia'),c);const before=c.composerImages.items;
 const pending=c.readMedia({name:'second.png',type:'image/png',size:10},'Second');readers[0].result='data:image/png;base64,AAAA';readers[0].onload();await new Promise(setImmediate);images[0].onload();assert.equal(await pending,true);assert.equal(c.composerImages.length,2);assert.deepEqual(c.composerImages.items[0],before[0]);
});

function carouselStudioContext(extra={}){
 const c=context({imageStudioGeneration:1,imageAltIsReadOnly:media=>!!media.id,copySavedImage:async()=>assert.fail('Unexpected saved-image copy'),readMedia:async()=>assert.fail('Unexpected byte decoding'),...extra});
 c.composerImages.reset([{dataUrl:'data:image/png;base64,AAAA',name:'one.png',type:'image/png',alt:'One'},{dataUrl:'data:image/png;base64,BBBB',name:'two.png',type:'image/png',alt:'Two'}]);
 c.composerMedia=c.composerImages.selected;c.imageStudioTarget=c.composerMedia;c.imageStudioTicket=c.composerImages.ticket('replace');
 for(const name of ['imageStudioSnapshot','selectStudioImage','applyEditedImage'])vm.runInContext(functionSource(name),c);
 return c;
}
for(const change of ['move','remove','select','alt','session'])test(`studio snapshot never renews a ticket after external ${change}`,()=>{
 const c=carouselStudioContext(),ticket=c.imageStudioTicket;assert.equal(c.imageStudioSnapshot().items.length,2);
 if(change==='move')c.composerImages.move(1);
 if(change==='remove')c.composerImages.remove();
 if(change==='select')c.composerImages.select(c.composerImages.rows[1].key);
 if(change==='alt')c.composerImages.updateAlt('Changed');
 if(change==='session')c.composerGeneration++;
 c.composerMedia=c.composerImages.selected;
 assert.equal(c.imageStudioSnapshot(),null);assert.equal(c.imageStudioSnapshot(),null);assert.equal(c.imageStudioTicket,ticket);
 assert.equal(c.selectStudioImage(c.composerImages.selectedKey),false);assert.equal(c.imageStudioTicket,ticket);
});
test('intentional carousel selection renews only its selected stable-key target',()=>{
 const c=carouselStudioContext(),before=c.composerImages.items,rows=c.composerImages.rows,ticket=c.imageStudioTicket;
 assert.equal(c.selectStudioImage('missing-key'),false);assert.equal(c.imageStudioTicket,ticket);
 assert.equal(c.selectStudioImage(rows[1].key),true);assert.equal(c.imageStudioSnapshot().key,rows[1].key);assert.equal(c.imageStudioTarget,rows[1].media);assert.equal(c.composerImages.current(c.imageStudioTicket),true);assert.notEqual(c.imageStudioTicket,ticket);assert.deepEqual(c.composerImages.items,before);
});
test('repeated alt-only local applies renew snapshots without changing bytes or other positions',async()=>{
 let captures=0;const c=carouselStudioContext({workspaceUI:{captureChanged(){captures++;}}}),before=c.composerImages.items,key=c.composerImages.selectedKey;
 await c.applyEditedImage(null,'First change',{unchanged:true});const firstTicket=c.imageStudioTicket;
 assert.equal(c.imageStudioSnapshot().items[0].media,c.composerMedia);assert.equal(c.composerMedia.alt,'First change');
 await c.applyEditedImage(null,'Second change',{unchanged:true});assert.notEqual(c.imageStudioTicket,firstTicket);assert.equal(c.imageStudioSnapshot().key,key);
 assert.equal(c.composerMedia.dataUrl,before[0].dataUrl);assert.equal(c.composerMedia.name,before[0].name);assert.equal(c.composerMedia.type,before[0].type);assert.deepEqual(c.composerImages.items[1],before[1]);assert.equal(captures,2);
 assert.equal(c.selectStudioImage(c.composerImages.rows[1].key),true);await c.applyEditedImage(null,'Second position',{unchanged:true});assert.equal(c.composerImages.items[0].alt,'Second change');assert.equal(c.composerImages.items[1].alt,'Second position');
});
test('unchanged image and alt apply performs no mutation, copy, or recompression',async()=>{
 const c=carouselStudioContext({workspaceUI:{captureChanged(){assert.fail('No capture for no-op');}}}),ticket=c.imageStudioTicket,target=c.composerMedia;
 await c.applyEditedImage(null,'One',{unchanged:true});assert.equal(c.imageStudioTicket,ticket);assert.equal(c.composerMedia,target);assert.equal(c.composerImages.current(ticket),true);
 // The same no-op guarantee applies to saved media without fetching bytes.
 c.composerImages.reset([{id:'saved',alt:'Saved'}]);c.composerMedia=c.composerImages.selected;c.imageStudioTarget=c.composerMedia;c.imageStudioTicket=c.composerImages.ticket('replace');const savedTicket=c.imageStudioTicket;
 await c.applyEditedImage(null,'Saved',{unchanged:true});assert.equal(c.imageStudioTicket,savedTicket);assert.equal(c.composerImages.current(savedTicket),true);
});
function useSavedStudioTarget(c){c.composerImages.reset([{id:'saved',url:'/api/planner/media/saved',alt:'Saved'}]);c.composerMedia=c.composerImages.selected;c.imageStudioTarget=c.composerMedia;c.imageStudioTicket=c.composerImages.ticket('replace');}
test('failed saved alt byte-copy preserves source and clears only its own pending state',async()=>{
 const c=carouselStudioContext({copySavedImage:async()=>{throw Error('Copy failed');}});useSavedStudioTarget(c);const target=c.composerMedia,ticket=c.imageStudioTicket;
 await assert.rejects(c.applyEditedImage(null,'New alt',{unchanged:true}),/Copy failed/);assert.equal(c.composerMedia,target);assert.equal(c.imageStudioTicket,ticket);assert.equal(c.mediaLoading,false);assert.equal(c.imageStudioSnapshot().items[0].media,target);
});
test('late saved alt copy cannot clear newer media loading or redirect adoption',async()=>{
 let finish;const c=carouselStudioContext({copySavedImage:()=>new Promise(resolve=>{finish=resolve;})});useSavedStudioTarget(c);
 const pending=c.applyEditedImage(null,'Old alt',{unchanged:true});assert.equal(c.mediaLoading,true);
 c.composerGeneration++;c.mediaGeneration++;c.composerImages.reset([{dataUrl:'new',alt:'New session'}]);c.composerMedia=c.composerImages.selected;c.imageStudioTarget=c.composerMedia;c.imageStudioTicket=c.composerImages.ticket('replace');c.imageStudioGeneration=c.composerGeneration;const target=c.composerMedia,ticket=c.imageStudioTicket;
 finish({type:'image/png'});await assert.rejects(pending,/inzwischen geändert/);assert.equal(c.mediaLoading,true);assert.equal(c.composerMedia,target);assert.equal(c.imageStudioTicket,ticket);
});
test('saved alt adoption passes byte-copy with captured ticket then renews media reference',async()=>{
 const bytes={type:'image/png',name:'copy.png'},c=carouselStudioContext({copySavedImage:async()=>bytes});useSavedStudioTarget(c);const ticket=c.imageStudioTicket;
 c.readMedia=async(file,alt,current,capturedTicket)=>{assert.equal(file,bytes);assert.equal(alt,'New alt');assert.equal(capturedTicket,ticket);assert.equal(current(),true);c.composerMedia=c.composerImages.commit(capturedTicket,{dataUrl:'byte-identical-copy',alt});return true;};
 await c.applyEditedImage(null,'New alt',{unchanged:true});assert.equal(c.mediaLoading,false);assert.notEqual(c.imageStudioTicket,ticket);assert.equal(c.imageStudioSnapshot().items[0].media,c.composerMedia);assert.equal(c.composerMedia.alt,'New alt');
});
for(const failedRender of ['renderMediaEditor','renderPreview'])test(`carousel select failure in ${failedRender} preserves position, media references and valid studio`,()=>{
 const c=carouselStudioContext(),before=c.imageStudioSnapshot(),target=c.imageStudioTarget;
 c[failedRender]=()=>{throw Error('Synthetic renderer failure');};
 assert.equal(c.selectStudioImage(before.items[1].key),false);
 const after=c.imageStudioSnapshot();assert.ok(after);assert.equal(after.key,before.key);assert.equal(c.imageStudioTarget,target);assert.equal(c.composerMedia,target);
 assert.deepEqual(after.items.map(row=>row.key),before.items.map(row=>row.key));for(let i=0;i<before.items.length;i++)assert.equal(after.items[i].media,before.items[i].media);
});
for(const failure of ['renderMediaEditor','renderPreview','workspace'])test(`alt-only apply ${failure} failure preserves references and prior commits, recaptures rollback, permits retry`,async()=>{
 let captures=0,fail=false;const c=carouselStudioContext({workspaceUI:{captureChanged(){captures++;if(fail&&failure==='workspace')throw Error('Synthetic apply failure');}}});
 await c.applyEditedImage(null,'Already committed',{unchanged:true});
 const before=c.imageStudioSnapshot(),target=c.composerMedia;
 if(failure!=='workspace')c[failure]=()=>{if(fail)throw Error('Synthetic apply failure');};
 fail=true;await assert.rejects(c.applyEditedImage(null,'Retry this alt',{unchanged:true}),/Synthetic apply failure/);
 const after=c.imageStudioSnapshot();assert.ok(after);assert.equal(after.key,before.key);assert.equal(c.composerMedia,target);assert.equal(c.imageStudioTarget,target);assert.equal(c.composerMedia.alt,'Already committed');
 for(let i=0;i<before.items.length;i++)assert.equal(after.items[i].media,before.items[i].media);
 assert.equal(captures,failure==='workspace'?3:2);
 fail=false;await c.applyEditedImage(null,'Retry this alt',{unchanged:true});assert.equal(c.composerMedia.alt,'Retry this alt');assert.ok(c.imageStudioSnapshot());assert.equal(c.composerMedia.dataUrl,target.dataUrl);assert.equal(c.composerImages.items[1].alt,'Two');
});
test('failed alt-only render cannot roll back a newer successful media commit or renew its stale target',async()=>{
 const c=carouselStudioContext(),ticket=c.imageStudioTicket;let newer;
 c.renderMediaEditor=()=>{c.composerMedia=c.composerImages.commit(c.composerImages.ticket('replace'),{dataUrl:'newer-bytes',alt:'Newer successful commit'});newer=c.composerMedia;throw Error('Later render failure');};
 await assert.rejects(c.applyEditedImage(null,'Earlier edit',{unchanged:true}),/Later render failure/);
 assert.equal(c.composerMedia,newer);assert.equal(c.composerImages.selected,newer);assert.equal(c.composerMedia.alt,'Newer successful commit');assert.equal(c.imageStudioTicket,ticket);assert.equal(c.imageStudioSnapshot(),null);
});
for(const failure of ['renderMediaEditor','renderPreview','workspace'])test(`processed studio apply ${failure} failure restores references and permits pixel retry`,async()=>{
 let fail=true,captures=0;const readers=[],images=[],c=carouselStudioContext({FileReader:class{readAsDataURL(){readers.push(this);}},Image:class{naturalWidth=100;naturalHeight=100;set src(value){if(value)images.push(this);}},workspaceUI:{captureChanged(){captures++;if(fail&&failure==='workspace')throw Error('Synthetic pixel failure');}}});
 vm.runInContext(functionSource('readMedia'),c);if(failure!=='workspace')c[failure]=()=>{if(fail)throw Error('Synthetic pixel failure');};
 const before=c.imageStudioSnapshot(),target=c.composerMedia;
 async function finishIO(){const reader=readers.at(-1);reader.result='data:image/png;base64,EDIT';reader.onload();await new Promise(setImmediate);images.at(-1).onload();}
 const failed=c.applyEditedImage({name:'edit.png',type:'image/png',size:10},'Edited');await finishIO();await assert.rejects(failed,/nicht übernommen/);
 const after=c.imageStudioSnapshot();assert.ok(after);assert.equal(c.composerMedia,target);assert.equal(after.key,before.key);for(let i=0;i<before.items.length;i++)assert.equal(after.items[i].media,before.items[i].media);assert.equal(captures,failure==='workspace'?2:1);
 fail=false;const retry=c.applyEditedImage({name:'edit.png',type:'image/png',size:10},'Edited');await finishIO();await retry;assert.ok(c.imageStudioSnapshot());assert.equal(c.composerMedia.alt,'Edited');assert.equal(c.composerMedia.dataUrl,'data:image/png;base64,EDIT');assert.equal(c.composerImages.items[1].alt,'Two');
});
