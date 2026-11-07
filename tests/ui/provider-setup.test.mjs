import test from 'node:test';
import assert from 'node:assert/strict';
import {renderProviderSetup,setupCallbackURL} from '../../public/provider-setup.js';
import {LINKEDIN_SETUP_DATA} from '../../public/linkedin-setup.js';
const origin='https://planner.example';
test('common setup renders three short steps and collapsed technical details',()=>{
 const html=renderProviderSetup(LINKEDIN_SETUP_DATA);assert.equal((html.match(/class="setup-step-heading"/g)||[]).length,3);assert.equal((html.match(/<h4>/g)||[]).length,3);assert.doesNotMatch(html,/<details[^>]*\bopen\b/);assert.match(html,/Anleitung, keine Freigabe/);assert.doesNotMatch(html,/data-provider-setup-copy|<input/);
});
test('only implemented callbacks are displayed on a canonical public HTTPS origin',()=>{
 assert.equal(setupCallbackURL('linkedin',origin),origin+'/api/providers/linkedin/oauth/callback');assert.equal(setupCallbackURL('youtube',origin),origin+'/api/providers/youtube/oauth/callback');assert.equal(setupCallbackURL('x',origin),null);assert.equal(setupCallbackURL('instagram',origin),null);assert.throws(()=>setupCallbackURL('other',origin));
 const html=renderProviderSetup(LINKEDIN_SETUP_DATA,{siteOrigin:origin});assert.match(html,/readonly value="https:\/\/planner.example\/api\/providers\/linkedin\/oauth\/callback"/);assert.match(html,/data-provider-setup-copy="linkedin"/);assert.doesNotMatch(html,/oauth\/v2\/authorization|client_secret|TAKT_LINKEDIN_ENABLED/);
});
for(const bad of ['http://127.0.0.1:4173','https://localhost','https://127.0.0.1','https://sub.localhost','https://[::1]','https://planner.example/','https://planner.example:443','https://planner.example:444','https://u:p@planner.example','https://planner.example?x=1','https://planner.example#x',' https://planner.example',undefined])test(`no displayed callback for noncanonical origin ${String(bad)}`,()=>{assert.equal(setupCallbackURL('linkedin',bad),null);assert.doesNotMatch(renderProviderSetup(LINKEDIN_SETUP_DATA,{siteOrigin:bad}),/data-provider-setup-copy/);});
test('help links are fixed official HTTPS targets without referrer and never authorize',()=>{
 const html=renderProviderSetup(LINKEDIN_SETUP_DATA);assert.match(html,/rel="noopener noreferrer" referrerpolicy="no-referrer"/);assert.doesNotMatch(html,/<form|type="password"|data-connect|data-linkedin-start|data-publish/);
 const malicious=structuredClone(LINKEDIN_SETUP_DATA);malicious.steps[0].links[0].url='https://evil.example/signin';assert.throws(()=>renderProviderSetup(malicious));
 malicious.steps[0].links[0].url='https://learn.microsoft.com/evil?token=value';assert.throws(()=>renderProviderSetup(malicious));
});
test('text is HTML-escaped and titles cannot introduce active markup',()=>{
 const data=structuredClone(LINKEDIN_SETUP_DATA);data.title='<img src=x onerror=alert(1)>';data.steps[0].description='<script>bad()</script>';const html=renderProviderSetup(data);assert.doesNotMatch(html,/<img|<script/);assert.match(html,/&lt;img/);assert.match(html,/&lt;script/);
});
test('detail state uses provider-specific keys and ignores arbitrary keys',()=>{
 const html=renderProviderSetup(LINKEDIN_SETUP_DATA,{siteOrigin:origin,expandedDetails:['setup-linkedin-app','setup-linkedin-callback','bad" onclick="evil']});assert.equal((html.match(/<details[^>]* open>/g)||[]).length,2);assert.doesNotMatch(html,/onclick/);
});
test('unknown schema fields, duplicate IDs and accessor records fail closed',()=>{
 const extra=structuredClone(LINKEDIN_SETUP_DATA);extra.enabled=true;assert.throws(()=>renderProviderSetup(extra));
 const duplicate=structuredClone(LINKEDIN_SETUP_DATA);duplicate.steps[1].id=duplicate.steps[0].id;assert.throws(()=>renderProviderSetup(duplicate));
 const accessor=structuredClone(LINKEDIN_SETUP_DATA);let called=false;Object.defineProperty(accessor,'title',{enumerable:true,get(){called=true;return'bad';}});assert.throws(()=>renderProviderSetup(accessor));assert.equal(called,false);
});

// The action layer has no dependency on any provider client or status mutation.
import {createProviderSetupActions} from '../../public/provider-setup.js';
import {YOUTUBE_SETUP_DATA} from '../../public/youtube-setup.js';
import {X_SETUP_DATA} from '../../public/x-setup.js';
import {INSTAGRAM_SETUP} from '../../public/instagram-setup.js';
import {assertSetupHelpLinks} from './setup-link-assertions.mjs';
const flush=()=>new Promise(setImmediate);
function actionHarness(writeText,{siteOrigin=origin,timeoutMs=20}={}){
 const events=new Map(),node={textContent:''};let visible=true;
 const container={addEventListener:(k,f)=>events.set(k,f),removeEventListener:k=>events.delete(k),contains:t=>t?.inside===true,querySelector:()=>node};
 const actions=createProviderSetupActions({container,siteOrigin,writeText,visible:()=>visible,timeoutMs});
 return{actions,node,events,hide(){visible=false;actions.invalidate();},click(provider='linkedin'){const target={inside:true,dataset:{providerSetupCopy:provider}};events.get('click')?.({target:{closest:()=>target},preventDefault(){}});}};
}
test('all four verified data sources use the same rendering without invented status',()=>{
 for(const data of [LINKEDIN_SETUP_DATA,YOUTUBE_SETUP_DATA,X_SETUP_DATA,INSTAGRAM_SETUP]){const html=renderProviderSetup(data,{siteOrigin:origin});assert.equal((html.match(/class="setup-step-heading"/g)||[]).length,3);assertSetupHelpLinks(html);assert.doesNotMatch(html,/data-(?:linkedin|youtube)-start|data-publish|type="password"/);if(['x','instagram'].includes(data.provider))assert.doesNotMatch(html,/<input|data-provider-setup-copy|oauth\/callback/);}
});
test('copy does nothing until an explicit click then writes only the derived callback',async()=>{
 const writes=[];const h=actionHarness(async v=>writes.push(v));await flush();assert.deepEqual(writes,[]);h.click();await flush();assert.deepEqual(writes,[origin+'/api/providers/linkedin/oauth/callback']);assert.match(h.node.textContent,/kopiert/);h.actions.destroy();assert.equal(h.events.size,0);
});
test('local origin, unknown provider and unimplemented callbacks never copy',async()=>{
 const writes=[];for(const p of ['instagram','x','other']){const h=actionHarness(async v=>writes.push(v));h.click(p);await flush();h.actions.destroy();}const local=actionHarness(async v=>writes.push(v),{siteOrigin:'http://127.0.0.1:4173'});local.click();await flush();local.actions.destroy();assert.deepEqual(writes,[]);
});
test('destroy before the queued clipboard operation prevents even a first write',async()=>{
 let writes=0;const h=actionHarness(async()=>writes++);h.click();h.actions.destroy();await flush();assert.equal(writes,0);
});
test('late clipboard completion after hide never touches current UI or repeats',async()=>{
 let finish,writes=0;const h=actionHarness(()=>{writes++;return new Promise(r=>finish=r);});h.click();await flush();h.hide();const before=h.node.textContent;finish();await flush();assert.equal(h.node.textContent,before);assert.equal(writes,1);h.actions.destroy();
});
test('clipboard failure or deadline gives a manual path without false success or retry',async()=>{
 for(const writeText of [async()=>{throw new Error('raw secret');},()=>new Promise(()=>{})]){const h=actionHarness(writeText,{timeoutMs:2});h.click();await new Promise(r=>setTimeout(r,12));assert.match(h.node.textContent,/nicht bestätigt/);assert.doesNotMatch(h.node.textContent,/raw secret|kopiert\./);h.actions.destroy();}
});
