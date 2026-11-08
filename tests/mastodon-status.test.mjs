import {test} from 'node:test';import assert from 'node:assert/strict';
import {normalizeMastodonStatus,mastodonStatusCopy,createMastodonStatusReader} from '../public/mastodon-status.js';
import {renderConnections} from '../public/connections.js';
const ready={provider:'mastodon',instance:'https://kanoa.de',scope:'profile',phase:'linked',canStart:false,canPublish:false,verifiedAtMs:10};
test('Only verified exact profile readiness yields connected label',()=>{
 const state=normalizeMastodonStatus(ready);assert.deepEqual(mastodonStatusCopy({phase:'ready',state}),['Profil verbunden','linked']);
 for(const patch of [{instance:'https://other.example'},{scope:'write'},{canPublish:true},{phase:'invented'},{canStart:true}])assert.throws(()=>normalizeMastodonStatus({...ready,...patch}));
 for(const phase of ['idle','loading','error'])assert.notEqual(mastodonStatusCopy({phase,state})[1],'linked');
 const html=renderConnections({mastodon:{phase:'ready',state}});assert.match(html,/Profil verbunden/);assert.match(html,/data-account-row="mastodon"/);assert.match(html,/Profilzugriff verwalten/);assert.match(html,/Diese Freigabe erlaubt keinen Versand/);
});
test('Readiness is read-only, stale responses after hide cannot restore linked',async()=>{
 let resolve;const seen=[];const reader=createMastodonStatusReader({fetcher:async(url,opts)=>{assert.equal(url,'/api/providers/mastodon/oauth/readiness');assert.equal(opts.method,undefined);assert.equal(opts.cache,'no-store');await new Promise(r=>resolve=r);return Response.json(ready);},onChange:s=>seen.push(s)});
 const pending=reader.refresh();reader.hide();resolve();await pending;assert.equal(reader.snapshot.phase,'idle');assert.equal(seen.some(s=>s.state?.phase==='linked'),false);
});
test('failed refresh clears previously connected evidence',async()=>{
 let fail=false;const reader=createMastodonStatusReader({fetcher:async()=>{if(fail)throw Error();return Response.json(ready)}});await reader.refresh();assert.equal(reader.snapshot.state.phase,'linked');fail=true;await reader.refresh();assert.equal(reader.snapshot.phase,'error');assert.equal(reader.snapshot.state,null);reader.destroy();
});
for(const stalledStage of ['fetch','json'])test(`timeout bounds ${stalledStage} even when abort is ignored; late success stays unavailable`,{timeout:1000},async()=>{
 let finish,signal;const seen=[];
 const stalled=new Promise(resolve=>{finish=resolve});
 const reader=createMastodonStatusReader({timeoutMs:10,onChange:s=>seen.push(s.phase),fetcher:async(_,opts)=>{
  signal=opts.signal;
  if(stalledStage==='fetch'){await stalled;return Response.json(ready);}
  return {ok:true,headers:new Headers({'Content-Type':'application/json'}),json:async()=>{await stalled;return ready;}};
 }});
 await reader.refresh();
 assert.equal(signal.aborted,true);
 assert.deepEqual(reader.snapshot,{phase:'error',state:null});
 assert.deepEqual(seen,['loading','error']);
 finish();await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(reader.snapshot,{phase:'error',state:null});
 assert.deepEqual(seen,['loading','error']);
 reader.destroy();
});
test('hidden timed-out request cannot replace a subsequent successful refresh',{timeout:1000},async()=>{
 let calls=0;const reader=createMastodonStatusReader({timeoutMs:10,fetcher:async()=>++calls===1?new Promise(()=>{}):Response.json(ready)});
 const old=reader.refresh();reader.hide();await reader.refresh();await old;
 assert.equal(reader.snapshot.phase,'ready');assert.equal(reader.snapshot.state.phase,'linked');reader.destroy();
});
