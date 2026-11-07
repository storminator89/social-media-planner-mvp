import test from 'node:test';
import assert from 'node:assert/strict';
import { browserStore, loadInitialState } from '../../public/store.js';
import { createDemoState } from '../../public/model.js';

test('missing server adapter fails closed and never reads or writes legacy browser storage',async t=>{
  const descriptor=Object.getOwnPropertyDescriptor(global,'localStorage');let touches=0;
  Object.defineProperty(global,'localStorage',{configurable:true,get(){touches++;throw new Error('Must not access legacy drafts');}});
  t.after(()=>{if(descriptor)Object.defineProperty(global,'localStorage',descriptor);else delete global.localStorage;});
  await assert.rejects(browserStore.load(),/keinen Browser-only-Speicher/);
  await assert.rejects(browserStore.save({schemaVersion:1,posts:[]}),/keinen Browser-only-Speicher/);
  await assert.rejects(loadInitialState(),/keinen Browser-only-Speicher/);assert.equal(touches,0);
});

test('null or failing adapter load never substitutes synthetic demo posts',async()=>{
  await assert.rejects(loadInitialState({load:async()=>null}),/keinen gültigen Planungszustand/);
  await assert.rejects(loadInitialState({load:async()=>{throw new Error('Offline');}}),/Offline/);
  const expected={...createDemoState(new Date('2026-11-07T12:00:00Z')),revision:7,settings:{timezone:'Europe/Berlin'},posts:[]};
  const empty=await loadInitialState({load:async()=>expected});assert.deepEqual(empty,expected);
});


test('old or incomplete server snapshots fail closed without demo or version migration',async()=>{
  const valid={...createDemoState(new Date('2026-11-07T12:00:00Z')),posts:[]};
  for(const state of [{...valid,schemaVersion:1},{...valid,revision:undefined},{...valid,channels:undefined}]) {
    await assert.rejects(loadInitialState({load:async()=>state}));
  }
});
