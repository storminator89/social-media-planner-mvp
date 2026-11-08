import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {describeMastodonFailure} from '../../public/mastodon-diagnostics.js';
const source=readFileSync(new URL('../../public/mastodon.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'');
const flush=()=>new Promise(setImmediate);
async function harness(nextPhase='not_connected',startResponse=null){
 const nodes=Object.fromEntries(['start','refresh','status','confirmation','instance','confirm','cancel','revoke','recover','diagnose'].map(id=>[id,{disabled:false,hidden:id==='confirmation',focus(){}}]));
 let reads=0,starts=0;const navigations=[];
 runInNewContext(source,{URL,describeMastodonFailure,setProfileLinked(){},document:{getElementById:id=>nodes[id],addEventListener(){}},window:{addEventListener(){},confirm:()=>false},history:{replaceState(){}},location:{origin:'https://planner.example',href:'https://planner.example/mastodon.html',assign:url=>navigations.push(url)},fetch:async path=>{
  if(path.endsWith('/readiness')){const phase=++reads===1?'not_connected':nextPhase;return{ok:true,json:async()=>({provider:'mastodon',phase,canStart:phase==='not_connected',canPublish:false,scope:'profile',instance:'https://kanoa.de'})};}
  if(path.endsWith('/diagnostics'))return{ok:true,json:async()=>({provider:'mastodon',diagnostic:'preflight_passed',registrationAttempted:false,canPublish:false})};
  starts++;if(startResponse)return{ok:false,json:async()=>startResponse};throw Error('simulated start response loss');
 }});
 await flush();return{nodes,navigations,get starts(){return starts;}};
}
test('failed start then verified refresh allows a fresh consent dialog and cancel',async()=>{
 const h=await harness();h.nodes.start.onclick();assert.equal(h.nodes.confirmation.hidden,false);
 const request=h.nodes.confirm.onclick();assert.equal(h.nodes.confirm.disabled,true);assert.equal(h.nodes.cancel.disabled,true);await request;
 assert.equal(h.nodes.start.disabled,true);assert.equal(h.nodes.confirmation.hidden,true);assert.equal(h.starts,1);
 h.nodes.refresh.onclick();await flush();h.nodes.start.onclick();
 assert.equal(h.nodes.confirmation.hidden,false);assert.equal(h.nodes.confirm.disabled,false);assert.equal(h.nodes.cancel.disabled,false);
 h.nodes.cancel.onclick();assert.equal(h.nodes.confirmation.hidden,true);assert.equal(h.starts,1);assert.deepEqual(h.navigations,[]);
 h.nodes.start.onclick();await h.nodes.confirm.onclick();assert.equal(h.starts,2);
});
test('uncertain server attempt remains blocked after refresh without auto retry',async()=>{
 const h=await harness('registration_outcome_unknown');h.nodes.start.onclick();await h.nodes.confirm.onclick();h.nodes.refresh.onclick();await flush();
 assert.equal(h.nodes.start.disabled,true);h.nodes.start.onclick();assert.equal(h.nodes.confirmation.hidden,true);await h.nodes.confirm.onclick();assert.equal(h.starts,1);
});

test('precise preflight error survives UI without redirect or automatic retry',async()=>{const h=await harness('not_connected',{error:{code:'MASTODON_PREFLIGHT_FAILED',stage:'metadata',reason:'RESPONSE_ORIGIN_INVALID',registrationAttempted:false,message:'PRIVATE'}});h.nodes.start.onclick();await h.nodes.confirm.onclick();assert.match(h.nodes.status.textContent,/Antwortursprung/);assert.doesNotMatch(h.nodes.status.textContent,/PRIVATE/);assert.equal(h.starts,1);assert.equal(h.nodes.start.disabled,true);assert.deepEqual(h.navigations,[]);});
test('explicit diagnostic closes consent and never starts registration',async()=>{const h=await harness();h.nodes.start.onclick();await h.nodes.diagnose.onclick();assert.equal(h.nodes.confirmation.hidden,true);assert.match(h.nodes.status.textContent,/Vorprüfung erfolgreich/);assert.match(h.nodes.status.textContent,/Durch diese Prüfung wurde keine App registriert/);assert.match(h.nodes.status.textContent,/Bestehende Versuche bleiben unverändert/);assert.equal(h.nodes.start.disabled,true);assert.equal(h.starts,0);assert.deepEqual(h.navigations,[]);});
