import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readPostGroups,renderPostGroups,createPostGroupsReader} from '../../public/post-groups.js';
import {fixture} from '../data/support.mjs';
const seed=()=>{const s=fixture();s.media=[{id:'m2',filename:'two.jpg'},{id:'m1',filename:'one.jpg'}];s.channels.push({...s.channels[0],id:'linkedin',platform:'linkedin',name:'LinkedIn'});s.posts[0].variants[0].scheduledAt='2026-11-09T08:00:00.000Z';s.posts[0].variants[0].mediaIds=['m1','m2'];s.posts[0].variants.push({...s.posts[0].variants[0],id:'v2',channelId:'linkedin',body:'LinkedIn only\r\nsecond line',status:'failed',scheduledAt:'2026-11-10T09:00:00.000Z',timezone:'Asia/Kathmandu',statusNote:'Rejected test'});return s;};
test('read-only projection preserves exact own bodies, statuses, dates, zones, and media order',()=>{const s=seed(),before=structuredClone(s),p=readPostGroups(s).posts[0];assert.deepEqual(s,before);assert.equal(p.variants[1].body,'LinkedIn only\r\nsecond line');assert.equal(p.variants[0].status,'planned');assert.equal(p.variants[1].status,'failed');assert.notEqual(p.variants[0].scheduledAt,p.variants[1].scheduledAt);assert.equal(p.variants[1].timezone,'Asia/Kathmandu');assert.deepEqual(p.variants[0].media.map(m=>m.name),['one.jpg','two.jpg']);});
test('HTML shows status per channel and exact timezone, no group success claim',()=>{const html=renderPostGroups(readPostGroups(seed()));assert.match(html,/Eingeplant/);assert.match(html,/Fehlgeschlagen/);assert.match(html,/Asia\/Kathmandu/);assert.match(html,/LinkedIn only\r\nsecond line/);assert.doesNotMatch(html,/Alle.*veröffentlicht|Erfolgreich/);});
test('XSS payloads escape across title, channel, body, status note, filename and link',()=>{const s=seed();s.posts[0].title='<img src=x onerror=alert(1)>';s.channels[1].name='<script>bad</script>';const v=s.posts[0].variants[1];v.body='<svg onload=bad>';v.statusNote='<iframe>';v.status='published';v.publishedAt='2026-11-01T00:00:00Z';v.publishedUrl='https://example.org/?q="<test>';s.media[0].filename='<object>';const html=renderPostGroups(readPostGroups(s));for(const tag of ['img','script','svg','iframe','object'])assert.doesNotMatch(html,new RegExp('<'+tag+'[ >]'));assert.match(html,/Als veröffentlicht markiert/);assert.match(html,/noopener noreferrer/);});
test('malformed schema, status and duplicate media fail closed',()=>{for(const alter of [s=>s.schemaVersion=4,s=>s.posts[0].variants[0].status='success',s=>s.media.push(s.media[0]),s=>s.media={}]){const s=seed();alter(s);assert.throws(()=>readPostGroups(s));}});
test('empty, archived, missing medium, and explicit empty override remain truthful',()=>{const s=seed();s.posts[0].stage='archived';s.posts[0].variants[1].body='';s.media=[];const html=renderPostGroups(readPostGroups(s));assert.match(html,/Archiv/);assert.match(html,/Ohne Text/);assert.match(html,/Medium nicht verfügbar/);s.posts=[];assert.match(renderPostGroups(readPostGroups(s)),/Noch keine/);});
test('latest refresh wins; late response, cancellation and failures do not expose stale content',async()=>{const pending=[],events=[];const r=createPostGroupsReader({load:()=>new Promise((resolve,reject)=>pending.push({resolve,reject})),onState:e=>events.push(e)});const a=r.refresh(),b=r.refresh();pending[1].resolve(seed());await b;pending[0].reject(Error('old'));await a;assert.equal(events.at(-1).phase,'ready');const c=r.refresh();r.cancel();pending[2].resolve(seed());await c;assert.equal(events.at(-1).phase,'loading');const d=r.refresh();pending[3].reject(Error('secret'));await d;assert.deepEqual(events.at(-1),{phase:'error'});});
test('page has one explicit GET-only path, no bootstrap/store or browser storage',()=>{const page=readFileSync(new URL('../../public/post-groups-page.js',import.meta.url),'utf8'),html=readFileSync(new URL('../../public/post-groups.html',import.meta.url),'utf8');assert.match(page,/method:'GET'/);assert.doesNotMatch(page,/localStorage|sessionStorage|PUT|POST|\.save\(|TaktStore/);assert.doesNotMatch(html,/bootstrap|app\.js/);assert.match(html,/Nur Ansicht/);assert.match(html,/keine Liveprüfung/);assert.match(page,/groups.replaceChildren\(\)/);});

test('status filtering selects the matching variant, never a whole mixed group',async()=>{
 const {filterPostGroups}=await import('../../public/post-groups.js');
 const data=readPostGroups(seed()),before=structuredClone(data);
 const view=filterPostGroups(data,{status:'failed'});
 assert.equal(view.posts.length,1);assert.equal(view.posts[0].variants.length,1);
 assert.equal(view.posts[0].variants[0].channel,'LinkedIn');assert.equal(view.posts[0].totalVariants,2);
 const html=renderPostGroups(view,{filtered:true});assert.match(html,/1 \/ 2 Kanäle/);assert.doesNotMatch(html,/Eingeplant/);
 assert.deepEqual(data,before);
});
test('query and status intersect, case and surrounding whitespace normalize',async()=>{
 const {filterPostGroups}=await import('../../public/post-groups.js');const data=readPostGroups(seed());
 assert.equal(filterPostGroups(data,{query:'  LINKEDIN ONLY  ',status:'failed'}).posts[0].variants.length,1);
 assert.equal(filterPostGroups(data,{query:'LinkedIn only',status:'planned'}).posts.length,0);
 assert.equal(filterPostGroups(data,{query:'Rejected test'}).posts[0].variants.length,1);
 assert.equal(filterPostGroups(data,{query:'two.jpg'}).posts[0].variants.length,2);
 assert.equal(filterPostGroups(data,{query:data.posts[0].title}).posts[0].variants.length,2);
});
test('clearing filters restores all variants including archived groups without changing source',async()=>{
 const {filterPostGroups}=await import('../../public/post-groups.js');const s=seed();s.posts[0].stage='archived';
 const data=readPostGroups(s);filterPostGroups(data,{status:'failed',query:'LinkedIn'});
 assert.equal(filterPostGroups(data).posts[0].variants.length,2);assert.equal(filterPostGroups(data).posts[0].archived,true);
 assert.equal(filterPostGroups(data,{status:'unknown'}).posts.length,0);
});
test('search is literal, does not interpolate input into HTML and distinguishes empty results',async()=>{
 const {filterPostGroups}=await import('../../public/post-groups.js');const data=readPostGroups(seed());
 for(const query of ['<svg onload=alert(1)>','.*','[','"']){
  const html=renderPostGroups(filterPostGroups(data,{query}),{filtered:true});assert.equal(html,'<p class="empty">Keine Treffer.</p>');
 }
 assert.match(renderPostGroups({posts:[]}),/Noch keine/);
});
test('filters remain read-only, disabled on error/loading, and clear count before new data',()=>{
 const page=readFileSync(new URL('../../public/post-groups-page.js',import.meta.url),'utf8'),html=readFileSync(new URL('../../public/post-groups.html',import.meta.url),'utf8');
 assert.match(page,/current=null;groups.replaceChildren\(\);count.textContent='';filters.disabled=true/);
 assert.match(page,/query.value='';state.value='';render\(\);query.focus\(\)/);
 assert.match(html,/fieldset id="filters" class="filters" disabled/);
 assert.match(html,/aria-label="Status filtern"/);assert.match(html,/id="count"[^>]*aria-live="polite"/);
 assert.doesNotMatch(page,/localStorage|sessionStorage|PUT|POST|\.save\(/);
});
