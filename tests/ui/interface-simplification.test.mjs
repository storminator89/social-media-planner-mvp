import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {renderChannelQueue} from '../../public/channel-queue.js';
import {renderHomeOverview} from '../../public/home-overview.js';
const read=p=>readFileSync(new URL('../../public/'+p,import.meta.url),'utf8');
const html=read('index.html'),app=read('app.js'),css=read('interface.css');
// Exact nested ownership rather than broad substring checks for safety regions.
function ancestors(markup,id){const stack=[];for(const match of markup.matchAll(/<\/?([a-z][\w-]*)\b[^>]*>/gi)){const [tag,name]=match;if(tag.startsWith('</')){if(stack.at(-1)?.name===name)stack.pop();continue;}const attrs=Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]]));if(attrs.id===id)return stack;if(!['input','img','meta','link','br','hr','source'].includes(name))stack.push({name,...attrs});}throw Error('Missing '+id);}
const inDetails=id=>ancestors(html,id).filter(e=>e.name==='details').map(e=>e.id);
test('global tools remain discoverable without enclosing recovery warnings',()=>{
 for(const id of ['open-posting-times','open-workspaces'])assert.deepEqual(inDetails(id),['workspace-tools']);
 assert.deepEqual(inDetails('workspace-global-notice'),[]);assert.match(html,/<summary>Werkzeuge<\/summary>/);
 for(const id of ['planning-clock-notice','workspace-status','workspace-missing-media','form-errors','composer-file-drop-error','schedule-binding-status','media-editor'])assert.deepEqual(inDetails(id),[],id);
});
test('primary composing controls and save buttons stay outside advanced disclosures',()=>{
 for(const id of ['composer-channels','post-text','character-hint','add-media','add-video','choose-saved-image','post-date','post-time','save-draft','schedule-post','mastodon-handoff'])assert.deepEqual(inDetails(id),[],id);
 assert.deepEqual(inDetails('post-tags'),['composer-labels']);
 assert.deepEqual(inDetails('add-media-batch'),['media-options']);
 assert.deepEqual(inDetails('continue-composer'),['composer-actions']);
 assert.match(app,/\$\('#composer-labels'\)\.open=!!post\?\.tags\?\.length/);
 assert.match(app,/\$\('#composer-labels'\)\.open=!!payload.rawTags/);
 assert.match(app,/catch\(error\)\{\$\('#composer-labels'\)\.open=true/);
});
test('each main destination is reachable on small screens without the duplicate six-tab strip',()=>{
 const mobile=html.match(/<nav class="mobile-nav"[^>]*>(.*?)<\/nav>/s)[1];
 for(const view of ['home','calendar','drafts','ideas','connections'])assert.ok(mobile.includes(`data-view="${view}"`));
 const more=html.match(/<dialog id="more-dialog".*?<\/dialog>/s)[0];
 for(const view of ['queue','list','archive'])assert.ok(more.includes(`data-view="${view}"`));
 const tabs=html.match(/<nav class="view-tabs".*?<\/nav>/s)[0];assert.equal((tabs.match(/data-view=/g)||[]).length,3);
 assert.match(mobile,/data-action="settings"/);assert.match(more,/data-action="close-more"/);
 assert.match(html,/id="page-title" tabindex="-1"/);
});
test('selecting a More destination dismisses only that menu and focuses the new title',()=>{
 const fields=new Map(),events=[],$=id=>{if(!fields.has(id))fields.set(id,{open:id==='#more-dialog',close(){this.open=false;events.push('close')},focus(){events.push('focus')}});return fields.get(id);};
 const c=vm.createContext({$,ideaReuseNavigation:0,queueCalendarReturnDay:'old',view:'home',render(){events.push('render')},history:{replaceState(){}}});
 vm.runInContext(app.match(/function goView\(next\)\{[^\n]+/)[0],c);c.goView('archive');assert.equal(c.view,'archive');assert.equal($('#more-dialog').open,false);assert.deepEqual(events,['close','render','focus']);
});
test('filter summary reports hidden criteria and leaves search directly visible',()=>{
 assert.deepEqual(inDetails('search'),[]);assert.deepEqual(inDetails('channel-filter'),['planning-filters']);assert.deepEqual(inDetails('post-label-filter'),['planning-filters']);
 assert.match(html,/id="active-filter-count"/);assert.match(app,/Number\(channel!=='all'\)\+Number\(postTag!==''\)/);assert.match(app,/view==='ideas'\?Number\(ideaTag!==''\)/);
 assert.match(css,/summary:focus-visible/);assert.match(css,/min-height:44px/);
});
test('queue actions disclose without changing conditional availability or data',()=>{
 const state={settings:{timezone:'UTC'},channels:[],posts:[]};const before=structuredClone(state);
 const closed=renderChannelQueue(state,{renderAgenda:()=>'',actionsExpanded:false}),open=renderChannelQueue(state,{renderAgenda:()=>'',actionsExpanded:true});
 assert.match(closed,/<details class="ui-disclosure channel-queue-actions" data-ui-actions="queue" ><summary>Queue-Aktionen/);
 assert.match(open,/data-ui-actions="queue" open/);assert.match(closed,/data-action="queue-times"/);assert.match(closed,/data-action="queue-drafts"/);assert.doesNotMatch(closed,/data-action="queue-reflow"/);assert.deepEqual(state,before);
});
test('start shows real overdue and review work, without an empty overdue card',()=>{
 const state={settings:{timezone:'UTC'},channels:[],posts:[]};assert.doesNotMatch(renderHomeOverview(state),/id="home-overdue"/);
 state.posts=[{id:'past',status:'scheduled',text:'Unpublished old plan',channels:[],scheduledAt:'2026-01-01T10:00',scheduledInstant:'2026-01-01T10:00:00Z',timeZone:'UTC'}];
 assert.match(renderHomeOverview(state,new Date('2026-11-10T10:00:00Z')),/id="home-overdue"/);assert.match(renderHomeOverview(state,new Date('2026-11-10T10:00:00Z')),/Termin vergangen/);
});
test('More blocks global N and search shortcuts until dismissed',()=>{
 const fields=new Map(),events=[],$=id=>{if(!fields.has(id))fields.set(id,{open:id==='#more-dialog',focus(){events.push('search')}});return fields.get(id);};let handler;
 const c=vm.createContext({$,view:'home',document:{activeElement:{tagName:'BUTTON'},addEventListener:(event,fn)=>handler=fn},openComposer(){events.push('composer')},openIdea(){events.push('idea')}});
 const start=app.indexOf("document.addEventListener('keydown',e=>");const end=app.indexOf(";window.addEventListener('beforeunload'",start);
 vm.runInContext(app.slice(start,end),c);
 for(const key of ['n','/'])handler({key,preventDefault(){events.push('prevent')}});assert.deepEqual(events,[]);
 $('#more-dialog').open=false;handler({key:'n',preventDefault(){events.push('prevent')}});assert.deepEqual(events,['prevent','composer']);
});
