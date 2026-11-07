import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createLocalHandler } from '../server/handler.mjs';
import { createPlannerClient } from '../modules/data/client.mjs';
import { createTaktStore } from '../modules/data/takt-adapter.mjs';
import { suggestQueueSlots, applyQueueSuggestion } from '../modules/workflows/queue.mjs';

test('selected queue slot round-trips UTC + variant text; stale clients cannot overwrite its reservation',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'takt-queue-'));const app=createLocalHandler({directory});t.after(async()=>{app.close();await rm(directory,{recursive:true,force:true});});
  const client=createPlannerClient({fetcher:(path,options)=>app.fetch(new Request('http://localhost:3000'+path,options))});
  const options={client,timezone:'Europe/Berlin',channels:[{id:'linkedin',name:'LinkedIn'}]};
  const one=createTaktStore(options),two=createTaktStore(options);const a=await one.load(),b=await two.load();
  const post={id:'p',text:'Basis',variantTexts:{linkedin:'Eigener Text'},channels:['linkedin'],status:'draft',scheduledAt:null,timeZone:'Europe/Berlin'};
  const rules=[{channelId:'linkedin',timezone:'Europe/Berlin',slots:[{weekday:1,time:'09:00'}]}];
  const suggestion=suggestQueueSlots({post,posts:a.posts,rules,after:'2027-01-01T00:00:00Z'}).suggestions[0];
  assert.equal((await client.load()).revision,0);
  const selected=applyQueueSuggestion({post,posts:a.posts,rules,suggestion,now:'2027-01-01T00:00:00Z'});await one.save({...a,posts:[selected]});
  await assert.rejects(two.save({...b,posts:[{...selected,id:'stale'}]}),error=>error.status===409);
  const state=await client.load();assert.equal(state.posts[0].scheduledAt,suggestion.instant);assert.equal(state.posts[0].variants[0].body,'Eigener Text');assert.equal(state.posts[0].variants[0].inheritsBody,false);assert.equal(state.posts.length,1);
});
