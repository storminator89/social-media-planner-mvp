import test from 'node:test';
import assert from 'node:assert/strict';
import {consumeYouTubeReturn,createYouTubeConnectionController} from '../../public/youtube-connection.js';
import {readiness,NOW,ORIGIN,flush,deferred} from './youtube-fixtures.mjs';
function browser(query='youtube=cancelled',hash='#connections',path='/'){
 const calls=[],state={planner:true};
 return {calls,location:{href:ORIGIN+path+'?'+query+hash},history:{state,replaceState(...args){calls.push(args);}}};
}
test('return hints are allowlisted, consumed once from URL, and preserve unrelated history context',()=>{
 for(const result of ['linked','cancelled','failed','unconfirmed']){
  const w=browser('keep=1&youtube='+result);assert.equal(consumeYouTubeReturn(w),result);
  assert.deepEqual(w.calls,[[w.history.state,'','/?keep=1#connections']]);
 }
 for(const query of ['youtube=linked&youtube=failed','youtube=<script>','youtube=']){
  const w=browser(query);assert.equal(consumeYouTubeReturn(w),null);assert.equal(w.calls.length,1);
 }
 for(const w of [browser('youtube=linked','#calendar'),browser('youtube=linked','#connections','/other'),{}])assert.equal(consumeYouTubeReturn(w),null);
 const w=browser();w.history.replaceState=()=>{throw Error('blocked')};assert.equal(consumeYouTubeReturn(w),null);
});
test('a forged success hint cannot claim a connection or start authorization',async()=>{
 let starts=0,loads=0;
 const c=createYouTubeConnectionController({returnOutcome:'linked',now:()=>NOW,siteOrigin:ORIGIN,client:{load:async()=>{loads++;return readiness('not_configured')},start:async()=>{starts++}}});
 c.show();await flush();assert.equal(c.snapshot.readiness.stage,'not_configured');assert.match(c.snapshot.message,/ausschließlich.*Serverstatus/);await c.start();assert.equal(starts,0);assert.equal(loads,1);
 await c.refresh();assert.equal(c.snapshot.message,'');c.destroy();
});
test('cancelled and uncertain callbacks only read status; hide suppresses late results',async()=>{
 for(const returnOutcome of ['cancelled','failed','unconfirmed']){
  const d=deferred();let loads=0;
  const c=createYouTubeConnectionController({returnOutcome,now:()=>NOW,siteOrigin:ORIGIN,client:{load:()=>{loads++;return d.promise},start:()=>assert.fail('unexpected OAuth')}});
  c.show();assert.notEqual(c.snapshot.message,'');c.hide();d.resolve(readiness('linked'));await flush();assert.equal(c.snapshot.readiness,null);assert.equal(loads,1);c.destroy();
 }
});
