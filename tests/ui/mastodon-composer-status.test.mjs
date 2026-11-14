import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {summarizeMastodonPlanningStatus as summary,describeMastodonPlanningStatus as detail,refreshMastodonPlanningStatus as refresh,clearMastodonPlanningStatus as clear} from '../../public/mastodon-planning.js';
const profile={provider:'mastodon',instance:'https://kanoa.de',scope:'profile',canPublish:false,phase:'linked',account:'fixture'};
const publishing={phase:'linked',account:'fixture',canPublish:true,canStart:false};
function harness(){const nodes={'[data-mastodon-summary]':{textContent:''},'[data-mastodon-status]':{textContent:''},'[data-mastodon-details]':{open:true}};return {nodes,querySelector:key=>nodes[key]};}
test('compact status never implies automatic publishing and preserves blocked cases',()=>{
 assert.equal(summary(profile,publishing),'Versandzugriff bestätigt · separat senden');
 for(const [p,v,expected] of [[null,null,'Status nicht verfügbar'],[profile,{...publishing,expired:true},'Versandzugriff abgelaufen'],[profile,{...publishing,accountMismatch:true},'Konten stimmen nicht überein'],[profile,{...publishing,account:'other'},'Profil verbunden · Versand nicht bestätigt'],[profile,{...publishing,canStart:true},'Profil verbunden · Versand nicht bestätigt'],[{...profile,phase:'not_configured'},publishing,'Profil nicht bestätigt · kein Versand'],[profile,{...publishing,phase:'pending'},'Profil verbunden · Versand nicht bestätigt'],[profile,{...publishing,canPublish:false},'Profil verbunden · Versand nicht bestätigt']]){
  assert.equal(summary(p,v),expected);assert.doesNotMatch(summary(p,v),/Versandzugriff bestätigt/);
 }
 assert.match(detail(profile,publishing),/Konto: @fixture/);
 assert.match(detail(profile,publishing),/Versand prüft eigene Grenzen; keine automatische Medienübernahme/);
});
test('details are initially collapsed; safety limits remain visible outside disclosure',()=>{
 const html=readFileSync(new URL('../../public/index.html',import.meta.url),'utf8');
 const section=html.match(/<section id="mastodon-planning-status"[\s\S]*?<\/section>/)[0];
 assert.match(section,/<p data-mastodon-summary role="status" aria-live="polite"><\/p>/);
 assert.match(section,/Nur Planung · Medien werden nicht mitgesendet<\/p><details/);
 assert.match(section,/<details data-mastodon-details class="ui-disclosure">/);
 assert.match(section,/<summary>Zugriff &amp; Versanddetails<\/summary>/);
 for(const url of ['/mastodon.html','/mastodon-publish.html'])assert.ok(section.includes(`href="${url}"`));
});
test('refresh updates summary and full text safely; close prevents both stale writes',async()=>{
 const root=harness(),requests=[];
 await refresh(root,{fetchImpl:async(url,options)=>{requests.push(options);return {ok:true,json:async()=>url.includes('/oauth/')?profile:publishing};}});
 assert.equal(root.nodes['[data-mastodon-details]'].open,false);
 assert.equal(root.nodes['[data-mastodon-summary]'].textContent,summary(profile,publishing));
 assert.equal(root.nodes['[data-mastodon-status]'].textContent,detail(profile,publishing));
 assert.ok(requests.every(r=>r.method==='GET'&&r.credentials==='same-origin'&&r.redirect==='error'&&!r.body));
 const pending=[];const task=refresh(root,{fetchImpl:()=>new Promise(resolve=>pending.push(resolve))});clear();
 root.nodes['[data-mastodon-summary]'].textContent='closed';root.nodes['[data-mastodon-status]'].textContent='closed';
 pending.forEach(resolve=>resolve({ok:true,json:async()=>profile}));await task;
 assert.equal(root.nodes['[data-mastodon-summary]'].textContent,'closed');assert.equal(root.nodes['[data-mastodon-status]'].textContent,'closed');
 await refresh(root,{fetchImpl:async()=>{throw Error('offline');}});
 assert.equal(root.nodes['[data-mastodon-summary]'].textContent,'Status nicht verfügbar');
 assert.match(root.nodes['[data-mastodon-status]'].textContent,/Profilstatus nicht verfügbar/);
});
