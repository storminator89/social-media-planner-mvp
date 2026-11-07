import test from 'node:test';
import assert from 'node:assert/strict';
import { browserStore, loadInitialState } from '../../public/store.js';

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
  const empty=await loadInitialState({load:async()=>({schemaVersion:1,settings:{timezone:'Europe/Berlin'},posts:[]})});assert.deepEqual(empty.posts,[]);
});
