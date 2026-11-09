import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../../public/app.js',import.meta.url),'utf8');
const renderer=source.slice(source.indexOf('function render(){'),source.indexOf('\nfunction notify('));
function harness(view){
 const fields=new Map();
 const $=selector=>{if(!fields.has(selector))fields.set(selector,{hidden:false,dataset:{},classList:{toggle(){}},setAttribute(name,value){this[name]=value;},replaceChildren(child){this.child=child;}});return fields.get(selector);};
 const context=vm.createContext({view,$,$$:()=>[],document:{body:{dataset:{}}},history:{replaceState(){}},renderPostLabelFilter(){},renderPlanningChannelControls(){},connectionsPanel:{show(){},hide(){}},state:{posts:[],channels:[]},CHANNELS:[],channel:'all',query:'',postTag:'',calendarStatus:'all',range:'week',anchor:new Date('2026-11-09'),currentZone:()=> 'Europe/Berlin',visiblePeriod:()=>({start:new Date('2026-11-09'),end:new Date('2026-11-15')}),dateLabel:()=> '15. November',dateKey:()=> '2026-11-09',relevantPosts:()=>[],periodPosts:posts=>posts,renderIdeas:()=>'<label>Test filter</label>',emptyState:(title,description,action,label)=>JSON.stringify({title,description,action,label}),renderHomeOverview:()=>'<div>Overview</div>'});
 vm.runInContext(renderer,context);context.render();return {context,$};
}
test('ideas library keeps label filtering, focused heading and existing creation action',()=>{
 const {context,$}=harness('ideas');assert.equal(context.document.body.dataset.editorialView,'ideas');assert.equal($('.overview').hidden,true);assert.equal($('.bottom-note').hidden,true);assert.equal($('#page-title').textContent,'Ideen');assert.equal($('.create-post').dataset.action,'new-idea');assert.equal($('#idea-label-filter-wrap').hidden,false);assert.equal($('#idea-label-filter-wrap').child,$('#content .idea-label-filter'));assert.equal($('#channel-filter-wrap').hidden,true);
});
test('draft creation uses draft mode and preserves channel/label search controls',()=>{
 const {context,$}=harness('drafts');assert.equal(context.document.body.dataset.editorialView,'drafts');assert.equal($('#page-title').textContent,'Entwürfe');assert.equal($('.create-post').dataset.action,'new-draft');assert.equal($('#search').placeholder,'Entwürfe durchsuchen');assert.equal($('#channel-filter-wrap').hidden,false);assert.equal($('#idea-label-filter-wrap').hidden,true);assert.equal(JSON.parse($('#content').innerHTML).action,'new-draft');
 context.query='missing';context.render();const empty=JSON.parse($('#content').innerHTML);assert.equal(empty.title,'Keine passenden Entwürfe');assert.equal(empty.action,'clear-filters');
});
test('navigating out clears the library CSS scope and ideas filter visibility',()=>{
 const {context,$}=harness('ideas');context.view='connections';context.render();assert.equal(context.document.body.dataset.editorialView,'');assert.equal($('.create-post').hidden,true);
});
test('library additions are bundled by normal stylesheet entry and do not invent sort controls',()=>{
 const html=readFileSync(new URL('../../public/index.html',import.meta.url),'utf8');assert.match(html,/href="\.\/editorial-library\.css"/);assert.equal((html.match(/id="idea-label-filter-wrap"/g)||[]).length,1);const css=readFileSync(new URL('../../public/editorial-library.css',import.meta.url),'utf8');assert.match(css,/@media\(max-width:760px\)/);assert.match(css,/\.view-tabs\{display:grid/);assert.doesNotMatch(html,/id="draft-sort"|id="draft-view-toggle"/);
});
test('zero matching drafts expose only the empty-state reset, while matching results keep their summary',()=>{
 const {context,$}=harness('drafts');context.query='missing';context.render();assert.equal($('#post-filter-summary').hidden,true);assert.equal(JSON.parse($('#content').innerHTML).action,'clear-filters');
 context.relevantPosts=()=>[{id:'draft',updatedAt:'2026-11-09T10:00:00Z'}];context.postCard=()=>'<button>Existing draft</button>';context.icon=()=>'';context.render();assert.equal($('#post-filter-summary').hidden,false);assert.match($('#content').innerHTML,/Existing draft/);assert.doesNotMatch($('#content').innerHTML,/clear-filters/);
});
test('mobile high-zoom library creation action stays in flow and content clears bottom navigation',()=>{
 const css=readFileSync(new URL('../../public/editorial-library.css',import.meta.url),'utf8');const fix=css.slice(css.indexOf('/* Review fix:'));
 assert.match(fix,/@media\(max-width:760px\)/);assert.match(fix,/\.create-post\{position:static;inset:auto;z-index:auto;transform:none;/);assert.match(fix,/main\{padding-bottom:calc\(90px \+ env\(safe-area-inset-bottom\)\)/);
});

test('v11 Mastodon planning lifecycle and dynamic channel controls remain present',()=>{
 assert.match(source,/import \{refreshMastodonPlanningStatus,clearMastodonPlanningStatus\} from '\.\/mastodon-planning\.js'/);
 assert.match(source,/renderPostLabelFilter\(\);renderPlanningChannelControls\(\)/);
 assert.match(source,/refreshMastodonPlanningStatus\(\$\('#mastodon-planning-status'\)\)/);
 assert.match(source,/function closeComposer\(\)\{clearMastodonPlanningStatus\(\)/);
 const html=readFileSync(new URL('../../public/index.html',import.meta.url),'utf8');assert.match(html,/id="mastodon-planning-status"/);assert.match(html,/id="planning-channel-count"/);
});
test('leaving libraries restores calendar and list controls without losing planning context',()=>{
 const {context,$}=harness('ideas');
 context.renderCalendarSummary=()=>'<div>Safe planning summary</div>';
 context.renderWeek=()=>'<div>Week</div>';context.renderMonth=()=>'<div>Month</div>';context.renderAgenda=()=>'<div>Agenda</div>';
 context.view='calendar';context.render();
 assert.equal(context.document.body.dataset.editorialView,'');
 assert.equal(context.document.body.dataset.plannerView,'calendar');
 assert.equal($('#page-title').textContent,'Redaktionsplan');
 assert.equal($('#calendar-toolbar').hidden,false);
 assert.equal($('#idea-label-filter-wrap').hidden,true);
 assert.equal($('#timezone').textContent,'Europe/Berlin');
 assert.equal($('.create-post').dataset.action,'new-post');
 assert.match($('#content').innerHTML,/Safe planning summary.*Week/);
 context.view='list';context.render();
 assert.equal($('#page-title').textContent,'Deine Beitragsliste.');
 assert.match($('#content').innerHTML,/Safe planning summary.*Agenda/);
});
