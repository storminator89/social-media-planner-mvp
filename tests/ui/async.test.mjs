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
  const fields={'#search':{value:'Suchfilter'},'#post-text':{value:'Gesendete Fassung'},'#post-date':{value:'2027-01-15'},'#post-time':{value:'10:30'},'#post-zone':{value:'Europe/Berlin'},'#composer':{open:true},'#media-alt':{focus(){}},'#media-file':{value:'file'},'#save-draft':{},'#schedule-post':{}};
  const c={fields,$:selector=>fields[selector],$$:()=>[{value:'instagram'}],state:{posts:[]},editingId:null,composerIdeaFingerprint:null,composerMedia:null,composerCover:null,composerBaseText:'Gesendete Fassung',composerVariantTexts:{},selectedVariantTexts,commitIdeaDraft,CHANNELS,saving:false,mediaLoading:false,composerGeneration:1,mediaGeneration:0,initialEditor:'',view:'drafts',crypto:{randomUUID:()=> 'new-post'},Date,Map,Promise,structuredClone,validatePost:()=>[],notify:()=>{},render:()=>{},renderMediaEditor:()=>{},renderPreview:()=>{},setComposerBusy:()=>{},updateSaveAvailability:()=>{},closeCount:0,closeComposer:()=>c.closeCount++,editorSnapshot:()=>JSON.stringify({text:c.composerBaseText,variantTexts:c.composerVariantTexts}),...extra};
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
  const c=vm.createContext({anchor:new Date('2026-11-02T00:00:00Z'),startOfWeek:d=>d,addDays,dateKey,Date,days:['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'],dateLabel:d=>dateKey(d),icon:()=>'',postCard:()=>'',renderAgenda:posts=>{c.received=posts;return '';},periodPosts:posts=>posts.filter(p=>p.scheduledAt>='2026-11-02'&&p.scheduledAt<'2026-11-09')});
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
  const c=context({state:{posts:[{...idea,text:'Andere Fassung'}]},editingId:idea.id,composerIdeaFingerprint:prepared.sourceFingerprint,persist:async()=>{writes++;return true;}});c.fields['#form-errors']={hidden:true};vm.runInContext(functionSource('savePost'),c);await c.savePost('draft');assert.equal(writes,0);assert.equal(c.closeCount,0);assert.match(c.fields['#form-errors'].textContent,/inzwischen geändert/);assert.equal(c.saving,false);
});
