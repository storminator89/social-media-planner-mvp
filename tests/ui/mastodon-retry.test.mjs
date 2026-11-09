import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {describeMastodonFailure} from '../../public/mastodon-diagnostics.js';
const helper=readFileSync(new URL('../../public/mastodon-request.js',import.meta.url),'utf8').replace('export async function','async function');
const source=helper+'\n'+readFileSync(new URL('../../public/mastodon.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'');
const flush=()=>new Promise(setImmediate);
async function harness(nextPhase='not_connected',startResponse=null,{recoveryVersion=null,confirm=false,recoveryResponder=null,recoveryState=null}={}){
 const nodes=Object.fromEntries(['action-message','start','refresh','status','confirmation','instance','confirm','cancel','revoke','recover','diagnose'].map(id=>[id,{disabled:false,hidden:id==='confirmation',focus(){}}]));
 let reads=0,starts=0;const navigations=[],recoveries=[],prompts=[];
 runInNewContext(source,{AbortController,setTimeout,clearTimeout,URL,describeMastodonFailure,setProfileLinked(){},document:{getElementById:id=>nodes[id],addEventListener(){}},window:{addEventListener(){},confirm:message=>{prompts.push(message);return confirm;}},history:{replaceState(){}},location:{origin:'https://planner.example',href:'https://planner.example/mastodon.html',assign:url=>navigations.push(url)},fetch:async(path,init)=>{
  if(path.endsWith('/readiness')){const observed=recoveryState?.(),phase=++reads===1?'not_connected':(observed?.phase??nextPhase);return{ok:true,json:async()=>({provider:'mastodon',phase,recoveryVersion:observed?.version??recoveryVersion,canStart:phase==='not_connected',canPublish:false,scope:'profile',instance:'https://kanoa.de'})};}
  if(path.endsWith('/diagnostics'))return{ok:true,json:async()=>({provider:'mastodon',diagnostic:'preflight_passed',registrationAttempted:false,canPublish:false})};
  if(path.endsWith('/recover')){const body=JSON.parse(init.body);recoveries.push(body);return recoveryResponder?recoveryResponder(body):{ok:false,status:409};}
  starts++;if(startResponse)return{ok:false,json:async()=>startResponse};throw Error('simulated start response loss');
 }});
 await flush();return{nodes,navigations,recoveries,prompts,get reads(){return reads;},get starts(){return starts;}};
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
test('unrecognized status remains neutral and never infers disconnection or repeats mutation',async()=>{const h=await harness('invalid');h.nodes.refresh.onclick();await flush();assert.match(h.nodes.status.textContent,/bestehende Verbindung kann gerade nicht beurteilt/);assert.doesNotMatch(h.nodes.status.textContent,/Es wurde keine Verbindung gestartet/);assert.equal(h.nodes.start.disabled,true);assert.equal(h.starts,0);assert.deepEqual(h.navigations,[]);});

test('recovery submits the exact observed phase/version and distinct explicit intent; 409 never retries or refreshes automatically',async()=>{
 for(const phase of ['pending','recovery_pending']){const h=await harness(phase,null,{recoveryVersion:9,confirm:true});h.nodes.refresh.onclick();await flush();const reads=h.reads;await h.nodes.recover.onclick();assert.deepEqual(JSON.parse(JSON.stringify(h.recoveries)),[{consent:phase==='recovery_pending'?'confirmed-manual-kanoa-profile-revocation-v2':'fence-kanoa-profile-v2',expectedPhase:phase,expectedVersion:9}]);assert.equal(h.reads,reads);assert.match(h.nodes.status.textContent,/nicht ausgeführt/);await h.nodes.recover.onclick();assert.equal(h.recoveries.length,1);assert.equal(h.starts,0);}
});
test('old readiness without recovery version hides and blocks recovery; cancel does not mutate',async()=>{
 for(const options of [{confirm:true},{recoveryVersion:9,confirm:false}]){const h=await harness('recovery_pending',null,options);h.nodes.refresh.onclick();await flush();if(!options.recoveryVersion)assert.equal(h.nodes.recover.hidden,true);await h.nodes.recover.onclick();assert.equal(h.recoveries.length,0);}
});
test('parallel frontend tabs never turn a stale fence confirmation into final recovery or retry 409',async()=>{
 let current={phase:'pending',version:9};const applied=[];
 const recoveryResponder=body=>{if(body.expectedPhase!==current.phase||body.expectedVersion!==current.version)return{ok:false,status:409};applied.push(body);current={phase:current.phase==='pending'?'recovery_pending':'recovered',version:current.version+1};return{ok:true,status:200};};
 const options={confirm:true,recoveryState:()=>current,recoveryResponder};const a=await harness('pending',null,options),b=await harness('pending',null,options);
 a.nodes.refresh.onclick();b.nodes.refresh.onclick();await flush();const staleReads=b.reads;
 await Promise.all([a.nodes.recover.onclick(),b.nodes.recover.onclick()]);await flush();
 assert.equal(applied.length,1);assert.equal(applied[0].consent,'fence-kanoa-profile-v2');assert.equal(current.phase,'recovery_pending');assert.equal(b.reads,staleReads);assert.match(b.nodes['action-message'].textContent,/nicht ausgeführt/);
 await b.nodes.recover.onclick();assert.equal(b.recoveries.length,1);assert.equal(applied.length,1);
 b.nodes.refresh.onclick();await flush();assert.match(b.nodes['action-message'].textContent,/nicht ausgeführt/);assert.match(b.nodes.recover.textContent,/Manuellen Widerruf/);assert.equal(applied.length,1);
 await b.nodes.recover.onclick();assert.equal(applied.length,2);assert.equal(applied[1].consent,'confirmed-manual-kanoa-profile-revocation-v2');assert.equal(applied[1].expectedPhase,'recovery_pending');assert.equal(applied[1].expectedVersion,10);
});
