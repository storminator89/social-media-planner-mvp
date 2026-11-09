import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {describeMastodonFailure} from '../../public/mastodon-diagnostics.js';
const script=name=>readFileSync(new URL('../../public/'+name,import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replaceAll('export function','function').replace('export async function','async function');
const flush=()=>new Promise(setImmediate);
function harness(){
 const elements=new Map(),events=new Map(),calls=[];
 const node=()=>({hidden:false,disabled:false,textContent:'',children:[],listeners:{},focus(){},addEventListener(k,v){this.listeners[k]=v;},replaceChildren(){this.children=[];},append(...n){this.children.push(...n);}});
 let phase='linked';const pending=[];
 const context=vm.createContext({AbortController,setTimeout,clearTimeout,URL,Date,describeMastodonFailure,document:{getElementById(id){if(!elements.has(id))elements.set(id,node());return elements.get(id);},createElement:node,addEventListener(){}},window:{addEventListener(k,f){events.set(k,[...(events.get(k)||[]),f]);},confirm:()=>true},location:{href:'https://planner.example/mastodon.html',origin:'https://planner.example'},history:{replaceState(){}},fetch:async path=>{calls.push(path);if(path.endsWith('/readiness'))return{ok:true,json:async()=>({provider:'mastodon',scope:'profile',canPublish:false,instance:'https://kanoa.de',phase,canStart:phase==='not_connected'})};return new Promise(resolve=>pending.push(resolve));}});
 vm.runInContext(script('mastodon-request.js'),context);
 // Separate scopes mirror ES module lexical isolation while sharing the state setter.
 vm.runInContext('{'+script('mastodon-profile.js')+';globalThis.setProfileLinked=setProfileLinked;}',context);
 vm.runInContext('{'+script('mastodon.js')+'}',context);
 return{elements,events,calls,pending,setPhase:v=>phase=v};
}
test('integrated readiness gates profile access and refresh clears results without auto-reading',async()=>{
 const h=harness();await flush();assert.equal(h.elements.get('read-profile').hidden,false);assert.equal(h.calls.length,1);const work=h.elements.get('read-profile').onclick();h.pending.shift()({ok:true,json:async()=>({provider:'mastodon',scope:'profile',canPublish:false,fetchedAtMs:1,profile:{id:'123',acct:'test'}})});await work;assert.equal(h.elements.get('profile-result').hidden,false);
 h.setPhase('not_connected');h.elements.get('refresh').onclick();assert.equal(h.elements.get('read-profile').hidden,true);await flush();assert.equal(h.elements.get('profile-panel').hidden,true);assert.equal(h.elements.get('profile-result').children.length,0);assert.equal(h.elements.get('start').hidden,false);await h.elements.get('read-profile').onclick();assert.equal(h.calls.filter(p=>p.endsWith('/profile')).length,1);
});
test('integrated revocation blocks new profile reads while mutation is pending',async()=>{
 const h=harness();await flush();const work=h.elements.get('revoke').onclick();assert.equal(h.elements.get('read-profile').hidden,true);await h.elements.get('read-profile').onclick();assert.equal(h.calls.filter(p=>p.endsWith('/profile')).length,0);h.setPhase('not_connected');h.pending.shift()({ok:true});await work;await flush();assert.equal(h.elements.get('read-profile').hidden,true);
});
