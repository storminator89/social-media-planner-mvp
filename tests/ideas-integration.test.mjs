import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLocalHandler } from '../server/handler.mjs';
import { createPlannerClient } from '../modules/data/client.mjs';
import { createTaktStore } from '../modules/data/takt-adapter.mjs';
import { normalizeState, CHANNELS } from '../public/model.js';
import { createIdea, prepareIdeaDraft, commitIdeaDraft } from '../modules/workflows/ideas.mjs';
import { suggestQueueSlots, applyQueueSuggestion, duplicateTaktDraft } from '../modules/workflows/queue.mjs';
async function setup(t){const directory=await mkdtemp(join(tmpdir(),'takt-03-'));const app=createLocalHandler({directory});t.after(async()=>{app.close();await rm(directory,{recursive:true,force:true});});const client=createPlannerClient({fetcher:(path,options)=>app.fetch(new Request('http://localhost:3000'+path,options))});const store=createTaktStore({client,timezone:'Europe/Berlin',channels:CHANNELS});return{app,client,store};}
const now='2026-11-07T12:00:00.000Z';
const idea=()=>createIdea({id:'idea-integration',title:'Redaktioneller Titel',text:'Basistext',tags:['Thema, eins','Zitat "ja"'],timezone:'Europe/Berlin',now});

test('idea to queued plan keeps identity, metadata and independent text through the real full pipeline',async t=>{
  const {store,client}=await setup(t);const state=await store.save({...await store.load(),posts:[idea()]});const preparation=prepareIdeaDraft(state.posts[0]);
  const draft={...preparation.draft,channels:['instagram','bluesky'],variantTexts:{bluesky:'Eigener kurzer Text'}};
  const rules=draft.channels.map(channelId=>({channelId,timezone:'Europe/Berlin',slots:[{weekday:1,time:'09:30'}]}));
  const proposed=suggestQueueSlots({post:draft,posts:state.posts,rules,after:now}).suggestions[0];
  assert.equal((await client.load()).posts[0].stage,'idea');assert.equal((await client.load()).revision,1);
  const planned=applyQueueSuggestion({post:draft,posts:state.posts,rules,suggestion:proposed,now});
  const posts=commitIdeaDraft(state.posts,planned,{sourceFingerprint:preparation.sourceFingerprint,allowedChannels:CHANNELS.map(c=>c.id),now});
  const saved=normalizeState(await store.save({...state,posts}));assert.equal(saved.posts.length,1);assert.equal(saved.posts[0].id,idea().id);assert.equal(saved.posts[0].title,idea().title);assert.deepEqual(saved.posts[0].tags,idea().tags);assert.equal(saved.posts[0].createdAt,idea().createdAt);assert.equal(saved.posts[0].variantTexts.bluesky,'Eigener kurzer Text');
  const canonical=await client.load();assert.equal(canonical.posts[0].scheduledAt,proposed.instant);assert.equal(canonical.posts[0].stage,'planned');assert.equal(canonical.revision,2);
});

test('duplicating a converted post never loses title, quoted labels, or independent channel text',async t=>{
  const {store}=await setup(t);let state=await store.save({...await store.load(),posts:[idea()]});const prep=prepareIdeaDraft(state.posts[0]);
  state=await store.save({...state,posts:commitIdeaDraft(state.posts,{...prep.draft,channels:['bluesky'],variantTexts:{bluesky:'Eigene Fassung'}},{sourceFingerprint:prep.sourceFingerprint,now})});
  const copy=duplicateTaktDraft(state.posts[0],{id:'copy',now});state=normalizeState(await store.save({...state,posts:[...state.posts,copy]}));
  assert.equal(state.posts.length,2);const actual=state.posts.find(p=>p.id==='copy');assert.equal(actual.title,idea().title);assert.deepEqual(actual.tags,idea().tags);assert.equal(actual.variantTexts.bluesky,'Eigene Fassung');assert.equal(actual.status,'draft');assert.equal(actual.scheduledAt,null);
});

test('one idea and rich existing draft survive unrelated full-snapshot edits without metadata or media loss',async t=>{
  const {store,client}=await setup(t);let state=await store.load();
  const image={dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAGUlEQVR4nGMsTLjBQApgIkn1qIZRDUNKAwBGMgHJ6tENZAAAAABJRU5ErkJggg==',alt:'Testbild',name:'test.png',type:'image/png'};
  state=await store.save({...state,posts:[idea(),{...idea(),id:'existing-draft',status:'draft',channels:['instagram'],variantTexts:{instagram:''},mediaItems:[image]}]});
  const before=await client.load();state.posts.find(p=>p.status==='idea').text='Neue Notiz';await store.save(normalizeState(state));const after=await client.load();
  const old=before.posts.find(p=>p.id==='existing-draft'),saved=after.posts.find(p=>p.id==='existing-draft');assert.equal(saved.title,old.title);assert.deepEqual(saved.tags,old.tags);assert.deepEqual(saved.variants,old.variants);assert.deepEqual(after.media,before.media);
});
