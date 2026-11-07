import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {startOfWeek,addDays,dateKey} from '../../public/model.js';

// Exercise the actual application functions with delayed I/O, not a rewritten model.
const source=readFileSync(new URL('../../public/app.js',import.meta.url),'utf8');
function functionSource(name){const start=source.search(new RegExp(`(?:async )?function ${name}\\(`));assert.ok(start>=0);const next=source.slice(start+1).search(/\n(?:async )?function /);return source.slice(start,next<0?undefined:start+1+next);}
function context(extra={}){
  const fields={'#post-text':{value:'Gesendete Fassung'},'#post-date':{value:'2027-01-15'},'#post-time':{value:'10:30'},'#post-zone':{value:'Europe/Berlin'},'#composer':{open:true},'#media-alt':{focus(){}},'#media-file':{value:'file'},'#save-draft':{},'#schedule-post':{}};
  const c={fields,$:selector=>fields[selector],$$:()=>[{value:'instagram'}],state:{posts:[]},editingId:null,composerMedia:null,composerCover:null,saving:false,mediaLoading:false,composerGeneration:1,mediaGeneration:0,initialEditor:'',view:'drafts',crypto:{randomUUID:()=> 'new-post'},Date,Map,Promise,structuredClone,validatePost:()=>[],notify:()=>{},render:()=>{},renderMediaEditor:()=>{},renderPreview:()=>{},setComposerBusy:()=>{},updateSaveAvailability:()=>{},closeCount:0,closeComposer:()=>c.closeCount++,editorSnapshot:()=>fields['#post-text'].value,...extra};
  return vm.createContext(c);
}

test('successful delayed save cannot close over a newer editor value',async()=>{
  let finish;const c=context({persist:()=>new Promise(resolve=>{finish=resolve;})});vm.runInContext(functionSource('savePost'),c);
  const pending=c.savePost('draft');assert.equal(c.saving,true);
  c.fields['#post-text'].value='Neuere noch nicht gesendete Fassung';finish(true);await pending;
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

test('mobile week agenda excludes posts outside the selected week',()=>{
  const c=context({anchor:new Date('2026-11-02T12:00:00'),startOfWeek,addDays,dateKey,days:['Mo','Di','Mi','Do','Fr','Sa','So'],dateLabel:()=>'',postCard:p=>p.id,icon:()=>'',renderAgenda:posts=>JSON.stringify(posts.map(p=>p.id)),periodPosts:posts=>posts.filter(p=>p.scheduledAt>='2026-11-02'&&p.scheduledAt<'2026-11-09')});
  vm.runInContext(functionSource('renderWeek'),c);
  const html=c.renderWeek([{id:'inside-week',scheduledAt:'2026-11-03T10:00'},{id:'outside-week',scheduledAt:'2026-11-09T10:00'}]);
  assert.match(html,/inside-week/);assert.doesNotMatch(html,/outside-week/);
});
