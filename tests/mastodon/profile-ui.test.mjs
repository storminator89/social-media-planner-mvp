import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=(await readFile(new URL('../../public/mastodon-profile.js',import.meta.url),'utf8')).replaceAll('export function','function');
function harness(linked=true){
 const elements=new Map(),events=new Map(),pending=[];
 const node=()=>({children:[],hidden:false,disabled:false,textContent:'',listeners:{},addEventListener(k,fn){this.listeners[k]=fn;},replaceChildren(){this.children=[];},append(...n){this.children.push(...n);}});
 const document={getElementById(id){if(!elements.has(id))elements.set(id,node());return elements.get(id);},createElement:node};
 vm.runInNewContext(source+'\nsetProfileLinked('+linked+');',{document,window:{addEventListener(k,fn){events.set(k,fn);}},fetch:(url,options)=>new Promise(resolve=>pending.push({url,options,resolve})),Date});
 return{elements,events,pending};
}
const payload={provider:'mastodon',scope:'profile',canPublish:false,fetchedAtMs:1000,profile:{id:'123',acct:'fixture',note:'<img src=x onerror=alert(1)>',followers_count:2}};
const response=v=>({ok:true,json:async()=>v});
test('no automatic fetch; manual duplicate clicks issue one fetch; bio remains text',async()=>{
 const h=harness(),button=h.elements.get('read-profile');assert.equal(h.pending.length,0);const work=button.onclick();await button.onclick();assert.equal(h.pending.length,1);assert.equal(button.disabled,true);assert.equal(h.pending[0].options.credentials,'same-origin');h.pending[0].resolve(response(payload));await work;
 const result=h.elements.get('profile-result');assert.equal(result.hidden,false);assert.ok(result.children.some(x=>x.textContent===payload.profile.note));assert.ok(result.children.every(x=>!Object.hasOwn(x,'innerHTML')));assert.equal(button.disabled,false);
});
test('navigation and revocation discard in-flight/stale profile data',async()=>{
 for(const event of ['pagehide','pageshow','revoke','recover','refresh','start','diagnose']){
  const h=harness(),work=h.elements.get('read-profile').onclick();if(h.events.has(event))h.events.get(event)();else h.elements.get(event).listeners.click();h.pending[0].resolve(response(payload));await work;assert.equal(h.elements.get('profile-result').hidden,true);assert.equal(h.elements.get('profile-result').children.length,0);
 }
});
test('failed retry clears earlier data and displays no raw error',async()=>{
 const h=harness(),button=h.elements.get('read-profile');let work=button.onclick();h.pending[0].resolve(response(payload));await work;work=button.onclick();assert.equal(h.elements.get('profile-result').hidden,true);h.pending[1].resolve({ok:false,json:async()=>({error:'PRIVATE'})});await work;assert.equal(h.elements.get('profile-result').children.length,0);assert.doesNotMatch(h.elements.get('profile-status').textContent,/PRIVATE/);assert.match(h.elements.get('profile-status').textContent,/nicht abrufbar/);
});

test('unlinked profile button is hidden and cannot trigger an API request',async()=>{const h=harness(false),button=h.elements.get('read-profile');assert.equal(button.hidden,true);assert.equal(button.disabled,true);await button.onclick();assert.equal(h.pending.length,0);});
