import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {groupDraftsByLabel,renderDraftGroups,restoreDraftCardFocus} from '../../public/draft-groups.js';
import {filterPosts} from '../../public/model.js';

const draft=(id,tags=[],extra={})=>({id,status:'draft',tags,text:'Saved '+id,channels:['bluesky'],updatedAt:'2026-01-01T10:00:00Z',...extra});
const source=readFileSync(new URL('../../public/app.js',import.meta.url),'utf8');
const fn=name=>{const start=source.search(new RegExp(`(?:async )?function ${name}\\(`));assert.ok(start>=0);const end=source.slice(start+1).search(/\n(?:async )?function /);return source.slice(start,end<0?undefined:start+1+end);};
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const unescape=value=>value.replaceAll('&quot;','"').replaceAll('&#39;',"'").replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&amp;','&');

test('group projection keeps exact labels, distinct membership, references and caller order',()=>{
 const posts=[draft('one',['A','B','A']),draft('two',['B']),draft('none'),draft('scheduled',['A'],{status:'scheduled'}),draft('one',['A','B'])],before=structuredClone(posts);
 const groups=groupDraftsByLabel(posts);
 assert.deepEqual(groups.map(g=>[g.label,g.posts.map(p=>p.id)]),[['A',['one']],['B',['one','two']],[null,['none']]]);
 assert.equal(groups[0].posts[0],posts[0]);assert.deepEqual(posts,before);
});
test('case, canonical Unicode, whitespace, control characters and lone surrogates are exact identities',()=>{
 const labels=['A','a',' A ','ä','a\u0308','A\r\nB','A\nB','x\0y','\ud800','all','Ohne Label','__proto__','constructor'];
 const groups=groupDraftsByLabel(labels.map((label,i)=>draft(String(i),[label,label])));
 assert.equal(groups.length,labels.length);for(const label of labels){const group=groups.find(g=>g.label===label);assert.equal(group.posts.length,1);assert.equal(group.posts[0].tags[0],label);}
 assert.deepEqual(groups.map(g=>g.label),[...labels].sort((a,b)=>a.localeCompare(b,'de')||(a<b?-1:a>b?1:0)));
});
test('locale-equal spellings have deterministic raw tie-breaks independent of encounter order',()=>{
 const tags=['é','e\u0301','Ä','A\u0308'];const a=groupDraftsByLabel(tags.map(t=>draft(t,[t]))),b=groupDraftsByLabel(tags.toReversed().map(t=>draft(t,[t])));
 assert.deepEqual(a.map(g=>g.label),b.map(g=>g.label));
});
test('missing tags join unlabelled last, separate from the real label named Ohne Label',()=>{
 const groups=groupDraftsByLabel([draft('none',undefined),draft('named',['Ohne Label']),draft('other',['Z'])]);
 assert.deepEqual(groups.map(g=>g.label),['Ohne Label','Z',null]);assert.equal(groups.at(-1).posts[0].id,'none');
 const html=renderDraftGroups(groups.flatMap(g=>g.posts),()=>'<button></button>');assert.match(html,/Label: Ohne Label/);assert.match(html,/aria-label="Ohne Label"/);
});
test('grouping excludes non-drafts and empty input never manufactures buckets',()=>{
 assert.deepEqual(groupDraftsByLabel([]),[]);assert.deepEqual(groupDraftsByLabel(['idea','scheduled','archived'].map(status=>draft(status,['A'],{status}))),[]);
});
test('projection composes with the exact existing channel, label and search filters',()=>{
 const posts=[draft('one',['A','B']),draft('two',['B']),draft('three',['A'],{channels:['linkedin']}),draft('idea',['A'],{status:'idea'})];
 const filtered=filterPosts(posts,{status:'draft',channel:'bluesky',tag:'A',query:'saved one'}),groups=groupDraftsByLabel(filtered);
 assert.deepEqual(groups.map(g=>[g.label,g.posts.map(p=>p.id)]),[['A',['one']],['B',['one']]]);assert.equal(filtered.length,1);
});
test('frozen input survives repeated projections without persistence, normalization or reordering',()=>{
 const tags=Object.freeze([' B ','A','A']),posts=Object.freeze([Object.freeze(draft('one',tags)),Object.freeze(draft('two',Object.freeze([])))]);
 for(let n=0;n<5;n++)assert.equal(groupDraftsByLabel(posts).length,3);assert.deepEqual(posts[0].tags,[' B ','A','A']);
});
test('renderer escapes labels and supplies a unique reversible card occurrence for every membership',()=>{
 const labels=['<img src=x onerror=x>','A"&\n\\','A\r\nB','\ud800','x\0y','Ohne Label'],seen=[];
 const html=renderDraftGroups([draft('a"<',labels),draft('b',[])],(post,occurrence)=>{seen.push(occurrence);return `<button data-post-id="${esc(post.id)}" data-draft-occurrence="${esc(occurrence)}"></button>`;});
 assert.doesNotMatch(html,/<img| id=|draggable/);assert.equal(new Set(seen).size,labels.length+1);
 const encoded=[...html.matchAll(/data-draft-occurrence="([^"]+)"/g)].map(m=>JSON.parse(unescape(m[1])));
 for(const label of labels)assert.ok(encoded.some(([l,id])=>l===label&&id==='a"<'));assert.deepEqual(encoded.at(-1),[null,'b']);
});
test('100 drafts with 20 memberships each render 2000 cards without inventing quota or posts',()=>{
 const posts=Array.from({length:100},(_,i)=>draft(String(i),Array.from({length:20},(_,j)=>'Label '+j))),before=JSON.stringify(posts);
 assert.equal(groupDraftsByLabel(posts).length,20);let n=0;renderDraftGroups(posts,()=>{n++;return '';});assert.equal(n,2000);assert.equal(posts.length,100);assert.equal(JSON.stringify(posts),before);
});
test('postCard ignores Array.map numeric arguments and adds identity only for grouped occurrences',()=>{
 const context=vm.createContext({view:'drafts',isPreservedOriginalCopy:()=>false,esc,displayTitle:p=>p.text,postLabelDescription:()=>'',icon:()=>'',stack:()=>'',cover:()=>'',calendarContext:()=>'',postLabels:()=>'',badge:()=>'',variantCount:()=>0,channel:'all',currentZone:()=> 'UTC'});
 vm.runInContext(fn('postCard'),context);const p=draft('one',['A','B']);
 for(const index of [0,1,20])assert.doesNotMatch(context.postCard(p,index),/data-draft-occurrence| id=|draggable/);
 const first=context.postCard(p,JSON.stringify(['A',p.id])),second=context.postCard(p,JSON.stringify(['B',p.id]));assert.notEqual(first,second);assert.match(first,/data-post-id="one"/);assert.doesNotMatch(first,/ id=/);
});
test('focus uses exact occurrence before canonical ID and never builds a user-derived selector',()=>{
 const occurrence=JSON.stringify(['a"\r\n\ud800','x[]"']),previous={dataset:{draftOccurrence:occurrence,postId:'x[]"'}},calls=[];
 const cards=[{dataset:{draftOccurrence:'other',postId:'x[]"'},focus:()=>calls.push('other')},{dataset:{draftOccurrence:occurrence,postId:'x[]"'},focus:()=>calls.push('exact')}];
 const root={querySelectorAll:selector=>{assert.equal(selector,'[data-draft-occurrence]');return cards;}};
 assert.equal(restoreDraftCardFocus(previous,root),true);assert.deepEqual(calls,['exact']);cards.pop();assert.equal(restoreDraftCardFocus(previous,root),true);assert.deepEqual(calls,['exact','other']);cards.pop();assert.equal(restoreDraftCardFocus(previous,root),false);
 assert.equal(restoreDraftCardFocus(null,root),false);assert.equal(restoreDraftCardFocus(previous,null),false);
});
test('group controls are advanced, named, transient and active mode remains in the closed summary',()=>{
 const html=readFileSync(new URL('../../public/index.html',import.meta.url),'utf8'),filter=html.match(/<details id="planning-filters".*?<\/details>/s)[0];
 assert.match(filter,/<summary>Filter.*id="draft-grouping-status" hidden>Nach Labels<\/span><\/summary>/);
 assert.match(filter,/<label id="draft-grouping-wrap" for="draft-grouping" hidden>Gruppierung/);assert.match(filter,/<option value="none">Nicht gruppiert<\/option><option value="labels">Nach Labels<\/option>/);
 assert.match(source,/let draftGrouping='none'/);assert.doesNotMatch(readFileSync(new URL('../../public/draft-groups.js',import.meta.url),'utf8'),/fetch\(|localStorage|sessionStorage|\.save\(|persist\(|normalize\(/);
});
