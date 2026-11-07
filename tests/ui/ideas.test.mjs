import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { normalizeState, validatePost, CHANNELS } from '../../public/model.js';
import { normalizeEditorialMetadata, validateIdea, ideaTitle } from '../../public/ideas.js';
import { createIdea, updateIdea, parseIdeaTags, formatIdeaTags, prepareIdeaDraft, commitIdeaDraft, filterIdeas } from '../../public/workflows/ideas.mjs';
const idea=()=>({...createIdea({id:'i1',title:'Ein Titel',text:'Notiz',tags:['Thema, eins','Kampagne'],timezone:'Europe/Berlin',now:'2026-11-07T10:00:00Z'}),scheduleBinding:null,scheduledInstant:null});
const uiState=posts=>({schemaVersion:2,revision:4,channels:CHANNELS.map(({id,name,handle,color})=>({id,platform:id,name,handle,color,enabled:true,connectionStatus:'manual',postingSchedule:null})),settings:{timezone:'Europe/Berlin'},posts});
const source=readFileSync(new URL('../../public/app.js',import.meta.url),'utf8');
function functionSource(name){const start=source.search(new RegExp(`(?:async )?function ${name}\\(`));assert.ok(start>=0);const next=source.slice(start+1).search(/\n(?:async )?function /);return source.slice(start,next<0?undefined:start+1+next);}
function context(extra={}){
  const fields={'#search':{value:''},'#idea-title':{value:'Ein Titel'},'#idea-text':{value:'Notiz'},'#idea-tags':{value:'"Thema, eins", Kampagne'},'#idea-errors':{hidden:true,scrollIntoView(){}},'#idea-dialog':{open:true},'#info-dialog':{close(){}},'#main':{focus(){}}};
  const c={fields,$:selector=>fields[selector],$$:()=>[],state:uiState([idea()]),editingIdeaId:'i1',saving:false,createIdea,updateIdea,parseIdeaTags,validateIdea,Date,crypto:{randomUUID:()=> 'new-idea'},currentZone:()=> 'Europe/Berlin',setIdeaBusy:()=>{},notify:()=>{},render:()=>{},closeIdea:()=>{c.closed++},closed:0,prepared:0,beginIdeaPost:()=>{c.prepared++},view:'ideas',initialIdeaEditor:'',...extra};vm.createContext(c);vm.runInContext(functionSource('ideaEditorSnapshot'),c);return c;
}
test('title-only idea needs no channel or scheduling but cannot be a post',()=>{const p={...idea(),text:''};assert.deepEqual(validatePost(p),[]);assert.ok(validatePost({...p,status:'draft'}).length);});
test('normalizer retains idea metadata, label punctuation and whitespace',()=>{const p={...idea(),title:'  Titel  ',text:'  Notiz\n'};const state=normalizeState(uiState([p]));assert.deepEqual(state.posts[0],p);});
test('normalizer retains metadata on drafts with channel-specific text',()=>{const p={...idea(),status:'draft',channels:['bluesky'],variantTexts:{bluesky:'Eigener Text'}};const n=normalizeState(uiState([p])).posts[0];assert.deepEqual(n,p);});
test('idea cannot hide media, channel variants, covers or a schedule',()=>{for(const patch of [{media:{id:'m'}},{channels:['instagram']},{variantTexts:{bluesky:''}},{cover:'forms'},{scheduledAt:'2027-01-01T10:00'}])assert.throws(()=>normalizeState(uiState([{...idea(),...patch}])));});
test('metadata limits are validated without silently dropping values',()=>{for(const patch of [{title:'x'.repeat(201)},{tags:[12]},{tags:Array.from({length:21},(_,i)=>String(i))}])assert.throws(()=>normalizeEditorialMetadata(patch));});
test('label edit roundtrip preserves commas and quotes',()=>{const labels=['Thema, eins','Sie sagt "ja"'];assert.deepEqual(parseIdeaTags(formatIdeaTags(labels)),labels);});
test('display title falls back to note but never changes original',()=>{const p={...idea(),title:'',text:'Erste Zeile\nZweite'};assert.equal(ideaTitle(p),'Erste Zeile');assert.equal(p.text,'Erste Zeile\nZweite');});
test('repeated idea save makes only one write and failure keeps content',async()=>{let finish,writes=0;const c=context({persist:()=>{writes++;return new Promise(r=>finish=r)}});vm.runInContext(functionSource('saveIdea'),c);const pending=c.saveIdea();await c.saveIdea();assert.equal(writes,1);finish(false);await pending;assert.equal(c.closed,0);assert.equal(c.fields['#idea-text'].value,'Notiz');assert.equal(c.saving,false);});
test('prepare after save waits for persistence and keeps the same idea ID',async()=>{let finish,payload;const c=context({persist:next=>{payload=next;return new Promise(r=>finish=r)}});vm.runInContext(functionSource('saveIdea'),c);const pending=c.saveIdea(true);assert.equal(c.prepared,0);assert.equal(payload.posts[0].status,'idea');assert.equal(payload.posts[0].id,'i1');finish(true);await pending;assert.equal(c.prepared,1);assert.equal(c.closed,1);});
test('late idea edits are never closed or converted after earlier save',async()=>{let finish;const c=context({persist:()=>new Promise(r=>finish=r)});vm.runInContext(functionSource('saveIdea'),c);const pending=c.saveIdea(true);c.fields['#idea-text'].value='Neuere Notiz';finish(true);await pending;assert.equal(c.closed,0);assert.equal(c.prepared,0);assert.equal(c.fields['#idea-text'].value,'Neuere Notiz');});
test('invalid labels and empty ideas do not write',async()=>{let writes=0;const c=context({persist:async()=>{writes++;return true}});vm.runInContext(functionSource('saveIdea'),c);c.fields['#idea-tags'].value='"Offen';await c.saveIdea();assert.equal(writes,0);c.fields['#idea-tags'].value='';c.fields['#idea-title'].value='';c.fields['#idea-text'].value='';await c.saveIdea();assert.equal(writes,0);assert.equal(c.fields['#idea-errors'].hidden,false);});
test('idea busy state covers all editor controls',()=>{const controls=[{disabled:false},{disabled:false}];const c=context({$$:()=>controls});c.fields['#idea-form']={setAttribute(){}};vm.runInContext(functionSource('setIdeaBusy'),c);c.setIdeaBusy(true);assert.ok(controls.every(c=>c.disabled));c.setIdeaBusy(false);assert.ok(controls.every(c=>!c.disabled));});
test('preparing is read-only and successful proposed move replaces one stable ID',()=>{const original=idea(),posts=[original];const prepared=prepareIdeaDraft(original);assert.equal(posts[0].status,'idea');const next=commitIdeaDraft(posts,{...prepared.draft,channels:['linkedin']},{sourceFingerprint:prepared.sourceFingerprint,now:'2026-11-07T11:00:00Z'});assert.equal(posts[0].status,'idea');assert.equal(next.length,1);assert.equal(next[0].id,'i1');assert.equal(next[0].status,'draft');assert.deepEqual(next[0].tags,original.tags);});
test('deleting an idea only removes it after persistence succeeds',async()=>{let finish,next;const c=context({persist:value=>{next=value;return new Promise(r=>finish=r)}});vm.runInContext(functionSource('deleteIdea'),c);const pending=c.deleteIdea();assert.equal(next.posts.length,0);assert.equal(c.state.posts.length,1);assert.equal(c.closed,0);finish(false);await pending;assert.equal(c.closed,0);assert.equal(c.saving,false);});


test('actual idea renderer can filter a real label named all without colliding with All labels',()=>{
  const c=vm.createContext({state:{posts:[{...idea(),id:'selected',tags:['all']},{...idea(),id:'other',tags:['different']}]},ideaTag:'all',query:'',filterIdeas,ideaTitle,Date,JSON,icon:()=>'',esc:value=>String(value).replaceAll('&','&amp;').replaceAll('\"','&quot;'),dateLabel:()=>'',emptyState:()=>''});
  vm.runInContext(functionSource('renderIdeas'),c);const html=c.renderIdeas();assert.match(html,/<option value="">Alle Labels/);assert.match(html,/value="&quot;all&quot;" selected/);assert.match(html,/data-idea-id="selected"/);assert.doesNotMatch(html,/data-idea-id="other"/);assert.equal(c.ideaTag,'all');
});


test('failed Undo exposes the removed content for recovery instead of losing its only visible copy',async()=>{
  const removed=idea();let writes=0,recovered=null;const c=vm.createContext({state:{posts:[]},saving:false,persist:async()=>{writes++;return false},notify:()=>{},showDeletedRecovery:post=>{recovered=post}});
  vm.runInContext(functionSource('restoreDeletedPost'),c);await c.restoreDeletedPost(removed);assert.equal(writes,1);assert.equal(recovered,removed);assert.equal(c.saving,false);assert.equal(c.state.posts.length,0);
});

test('Undo never overwrites an existing same-ID record and preserves recovery during another save',async()=>{
  const removed=idea();let writes=0,recovered=0;const c=vm.createContext({state:{posts:[{...removed,text:'Newer content'}]},saving:false,persist:async()=>{writes++;return true},notify:()=>{},showDeletedRecovery:()=>{recovered++}});
  vm.runInContext(functionSource('restoreDeletedPost'),c);await c.restoreDeletedPost(removed);assert.equal(writes,0);assert.equal(recovered,1);assert.equal(c.state.posts[0].text,'Newer content');
  c.state.posts=[];c.saving=true;await c.restoreDeletedPost(removed);assert.equal(writes,0);assert.equal(recovered,2);assert.equal(c.saving,true);
});


test('unchanged title and labels retain exact canonical CRLF, whitespace and duplicates during note edits',async()=>{
  const original={...idea(),title:'Titel\r\nZeile zwei',tags:[' Tag ','Mehr\r\nZeilen','A','a','A']};let sent;
  const c=context({state:{posts:[original]},persist:async value=>{sent=value;return true;}});
  c.fields['#idea-title'].value='Titel\nZeile zwei';c.fields['#idea-tags'].value=formatIdeaTags(original.tags).replaceAll('\r\n','\n');c.initialIdeaEditor=c.ideaEditorSnapshot();c.fields['#idea-text'].value='Nur Notiz geändert';
  vm.runInContext(functionSource('saveIdea'),c);await c.saveIdea();assert.equal(sent.posts[0].title,original.title);assert.deepEqual([...sent.posts[0].tags],original.tags);assert.equal(sent.posts[0].text,'Nur Notiz geändert');
  assert.deepEqual(normalizeState(uiState([original])).posts[0].tags,original.tags);
});


test('title-only edit does not rewrite untouched CRLF note text',async()=>{
  const original={...idea(),text:'Notiz\r\nZweite Zeile'};let sent;const c=context({state:{posts:[original]},persist:async value=>{sent=value;return true;}});
  c.fields['#idea-text'].value='Notiz\nZweite Zeile';c.initialIdeaEditor=c.ideaEditorSnapshot();c.fields['#idea-title'].value='Neuer Titel';vm.runInContext(functionSource('saveIdea'),c);await c.saveIdea();assert.equal(sent.posts[0].text,original.text);assert.equal(sent.posts[0].title,'Neuer Titel');
});


test('label option values retain CRLF and lone surrogates without URI encoding failure',()=>{
  for(const label of ['A\r\nB','\ud800']){
    const c=vm.createContext({state:{posts:[{...idea(),tags:[label]}]},ideaTag:label,query:'',filterIdeas,ideaTitle,Date,JSON,icon:()=>'',esc:value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;'),dateLabel:()=>'',emptyState:()=>''});
    vm.runInContext(functionSource('renderIdeas'),c);const html=c.renderIdeas();const encoded=html.match(/<option value="([^"]+)" selected/)[1].replaceAll('&quot;','"').replaceAll('&amp;','&');assert.equal(JSON.parse(encoded),label);
  }
});
