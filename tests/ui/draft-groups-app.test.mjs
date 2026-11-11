import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {renderDraftGroups,restoreDraftCardFocus} from '../../public/draft-groups.js';
import {filterPosts,CHANNELS,dateKey,addDays,startOfWeek,displayTitle,zonedNow,validatePost} from '../../public/model.js';
import {calendarPosts,calendarTime} from '../../public/calendar-model.js';
import {postLabelOptions,editedPostLabels} from '../../public/post-labels.js';
import {formatIdeaTags} from '../../public/workflows/ideas.mjs';
import {selectedVariantTexts,effectiveText} from '../../public/variants.js';
import {duplicateTaktDraft} from '../../public/workflows/queue.mjs';
import {createComposerMedia} from '../../public/composer-media.js';
import {createEditorTiming} from '../../public/editor-timing.js';
import {preservationContext} from './preservation-context.mjs';
import {videoContext} from './video-context.mjs';
const source=readFileSync(new URL('../../public/app.js',import.meta.url),'utf8');
function fn(name){const start=source.search(new RegExp(`(?:async )?function ${name}\\(`));assert.ok(start>=0);const end=source.slice(start+1).search(/\n(?:async )?function /);return source.slice(start,end<0?undefined:start+1+end);}
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const unescape=value=>value.replaceAll('&quot;','"').replaceAll('&#39;',"'").replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&amp;','&');
const draft=(id,tags=['A','B'],extra={})=>({id,status:'draft',tags,title:'Title '+id,text:'Saved '+id,channels:['bluesky'],variantTexts:{},timeZone:'UTC',scheduledAt:null,scheduledInstant:null,scheduleBinding:null,mediaItems:[],cover:null,createdAt:'2026-01-01T10:00:00.000Z',updatedAt:'2026-01-01T10:00:00.000Z',...extra});
function harness(posts=[draft('one'),draft('two',['B']),draft('none',[])]){
 const fields=new Map(),events={},writes=[],opened=[],notices=[];let cards=[],ctx;
 class El{
  constructor(){this.dataset={};this.value='';this.hidden=false;this.open=false;this.isConnected=true;this.classList={toggle(){}};this.events={};}
  setAttribute(k,v){this[k]=v;}
  addEventListener(name,fn){this.events[name]=fn;}
  focus(){document.activeElement=this;}
  close(){this.open=false;}
  contains(el){return cards.includes(el);}
  querySelectorAll(selector){assert.equal(selector,'[data-draft-occurrence]');return cards.filter(c=>c.dataset.draftOccurrence);}
  get innerHTML(){return this.html||'';}
  set innerHTML(value){
   this.html=value;if(this!==fields.get('#content'))return;
   for(const card of cards){card.isConnected=false;if(document.activeElement===card)document.activeElement=document.body;}
   cards=[...value.matchAll(/<button\b[^>]*data-post-id="[^"]*"[^>]*>/g)].map(m=>{const card=new El();for(const [attr,key] of [['data-post-id','postId'],['data-draft-occurrence','draftOccurrence']]){const match=m[0].match(new RegExp(attr+'="([^"]*)"'));if(match)card.dataset[key]=unescape(match[1]);}return card;});
  }
 }
 const document={body:new El(),activeElement:null,addEventListener:(event,fn)=>events[event]=fn,querySelector:()=>null};document.activeElement=document.body;
 const $=id=>{if(!fields.has(id))fields.set(id,new El());return fields.get(id);};
 const $$=selector=>selector==='#composer-channels input:checked'?ctx.selectedChannels.map(value=>({value})):[];
 ctx={...preservationContext(),...videoContext(),document,$,$$,state:{schemaVersion:3,revision:1,settings:{timezone:'UTC'},channels:CHANNELS,posts},view:'drafts',draftGrouping:'none',range:'week',channel:'all',query:'',postTag:'',ideaTag:'',calendarStatus:'all',anchor:new Date('2027-01-01'),history:{replaceState(){}},Date,Set,structuredClone,crypto:{randomUUID:()=> 'copy'},CHANNELS,dateKey,addDays,startOfWeek,displayTitle,zonedNow,filterPosts,calendarPosts,calendarTime,postLabelOptions,renderDraftGroups,restoreDraftCardFocus,esc,
  queuePriorityUI:null,queueReflowUI:null,dateShiftUI:null,queueSwapUI:null,returnDraftsUI:null,draftLabelsUI:null,draftReplaceUI:null,archiveDraftsUI:null,draftBatchUI:null,connectionsPanel:{hide(){},show(){}},plannerLoaded:true,localFallback:false,homeExpanded:new Set(),
  currentZone:()=> 'UTC',dateLabel:()=> '1. Januar',visiblePeriod:()=>({start:new Date('2027-01-01'),end:new Date('2027-01-07')}),scheduleNeedsReview:()=>false,icon:()=>'',platform:()=>'',stack:()=>'',cover:()=>'',calendarContext:()=>'',badge:()=>'',variantCount:()=>0,emptyState:title=>`<p>${title}</p>`,renderCalendarSummary:()=>'',renderWeek:()=>'',periodPosts:posts=>posts,
  savedAltEdit:null,cancelSavedAlt(){},savedTextPicker:null,postTemplatePicker:null,closeDraftSplit(){},composerFileDrop:{reset(){}},clearMastodonPlanningStatus(){},imageStudio:{close(){},hasPendingWork:false},composerTiming:createEditorTiming(),composerImages:createComposerMedia(),workspaceUI:null,queuePanel:null,composerGeneration:1,mediaGeneration:0,mediaLoading:false,saving:false,workspacePlannerReading:false,workspaceRestoring:false,composerRestoredWorkspace:false,composerMissingMedia:false,composerIdeaFingerprint:null,composerChannelMedia:null,channelPreviewIndex:{},editingId:null,returnFocus:null,composerMedia:null,composerCover:null,composerLabelState:null,selectedChannels:['bluesky'],selectedVariantTexts,effectiveText,editedPostLabels,duplicateTaktDraft,validatePost,notify:message=>notices.push(message),setComposerBusy(){},focusComposerErrors(){},openComposer:id=>opened.push(id),
  editorSnapshot:()=>JSON.stringify({text:ctx.composerBaseText,tags:$('#post-tags').value}),currentComposerRawTags:()=>$('#post-tags').value,persist:async next=>{writes.push(next);ctx.state=next;ctx.render();return true;}
 };
 vm.createContext(ctx);for(const name of ['postLabelDescription','postLabels','postCard','relevantPosts','renderPostLabelFilter','renderPlanningChannelControls','render','closeComposer','savePost','duplicatePost','archivePostAction'])vm.runInContext(fn(name),ctx);
 vm.runInContext(source.split('\n').find(line=>line.startsWith("$('#draft-grouping').addEventListener")),ctx);
 vm.runInContext(source.split('\n').find(line=>line.startsWith("document.addEventListener('click'")),ctx);
 return {ctx,fields,$,document,writes,opened,notices,get cards(){return cards;},render:()=>ctx.render(),toggle(value){$('#draft-grouping').value=value;$('#draft-grouping').events.change({target:$('#draft-grouping')});},click:async dataset=>{const button={dataset,isConnected:true};await events.click({target:{closest:()=>button}});},edit(card){card.focus();ctx.returnFocus=card;ctx.editingId=card.dataset.postId;const post=ctx.state.posts.find(p=>p.id===ctx.editingId);ctx.composerBaseText=post.text;ctx.composerVariantTexts=structuredClone(post.variantTexts);ctx.composerImages.reset(post.mediaItems);ctx.selectedChannels=[...post.channels];$('#post-tags').value=formatIdeaTags(post.tags);$('#post-date').value='2099-01-15';$('#post-time').value='10:00';$('#post-zone').value='UTC';ctx.initialEditor=ctx.editorSnapshot();$('#composer').open=true;$('#post-text').focus();}};
}
test('actual render defaults flat and toggles grouping without any writes or source mutations',()=>{
 const h=harness(),before=JSON.stringify(h.ctx.state);h.render();assert.equal(h.cards.length,3);assert.equal(h.$('#draft-grouping-status').hidden,true);
 h.toggle('labels');assert.equal(h.cards.length,4);assert.match(h.$('#content').innerHTML,/>3 Entwürfe<\/span>/);assert.equal(h.$('#draft-grouping-status').hidden,false);assert.equal(h.document.activeElement,h.$('#draft-grouping'));
 h.toggle('none');assert.equal(h.cards.length,3);assert.equal(h.writes.length,0);assert.equal(JSON.stringify(h.ctx.state),before);
});
test('actual grouped render preserves filter scope, distinct count and stable updated order',()=>{
 const h=harness([draft('old'),draft('new',['A','B'],{updatedAt:'2026-02-01T10:00:00.000Z'}),draft('other',['A'],{channels:['linkedin']}),draft('archive',['A'],{status:'archived'})]);h.ctx.channel='bluesky';h.ctx.postTag='B';h.ctx.query='saved';h.toggle('labels');
 assert.match(h.$('#content').innerHTML,/>2 Entwürfe<\/span>/);assert.deepEqual(h.cards.map(c=>c.dataset.postId),['new','old','new','old']);assert.match(h.$('#post-filter-result').textContent,/2 Beiträge passen/);assert.equal(h.writes.length,0);
});
test('empty filters retain grouping control and active marker and do not invent unlabelled group',()=>{
 const h=harness();h.ctx.query='missing';h.toggle('labels');assert.equal(h.cards.length,0);assert.match(h.$('#content').innerHTML,/Keine passenden Entwürfe/);assert.equal(h.$('#draft-grouping-wrap').hidden,false);assert.equal(h.$('#draft-grouping-status').hidden,false);assert.doesNotMatch(h.$('#content').innerHTML,/Ohne Label/);
});
test('grouping is session-only, survives navigation and hides on non-draft views',()=>{
 const h=harness();h.toggle('labels');h.ctx.view='archive';h.render();assert.equal(h.$('#draft-grouping-wrap').hidden,true);assert.equal(h.$('#draft-grouping-status').hidden,true);h.ctx.view='drafts';h.render();assert.equal(h.ctx.draftGrouping,'labels');assert.equal(h.cards.length,4);
 const fresh=harness();fresh.render();assert.equal(fresh.ctx.draftGrouping,'none');assert.equal(fresh.cards.length,3);
});
test('invalid or off-view grouping events cannot change the projection or persistence',()=>{
 const h=harness();h.render();h.toggle('unsupported');assert.equal(h.ctx.draftGrouping,'none');h.ctx.view='archive';h.toggle('labels');assert.equal(h.ctx.draftGrouping,'none');assert.equal(h.writes.length,0);
});
test('all batch handlers derive each filtered canonical draft once despite multiple cards',async()=>{
 const h=harness();h.ctx.postTag='B';h.toggle('labels');assert.equal(h.cards.length,3);
 for(const [action,ui] of [['batch-drafts','draftBatchUI'],['label-drafts','draftLabelsUI'],['replace-drafts','draftReplaceUI'],['archive-drafts','archiveDraftsUI']]){let ids;h.ctx[ui]={open:input=>ids=input};await h.click({action});assert.deepEqual([...ids],['one','two']);}
 assert.equal(h.writes.length,0);
});
test('every repeated card opens the same canonical post without ambiguity',async()=>{
 const h=harness();h.toggle('labels');for(const card of h.cards.filter(c=>c.dataset.postId==='one'))await h.click(card.dataset);assert.deepEqual(h.opened,['one','one']);assert.equal(h.writes.length,0);
});
test('close without rerender restores exact original membership, with no mutation',()=>{
 const h=harness();h.toggle('labels');const origin=h.cards.find(c=>c.dataset.draftOccurrence===JSON.stringify(['B','one']));h.edit(origin);h.ctx.closeComposer();assert.equal(h.document.activeElement,origin);assert.equal(h.writes.length,0);
});
test('actual savePost retains exact original group focus across persist render, close and second render',async()=>{
 const h=harness();h.toggle('labels');const occurrence=JSON.stringify(['B','one']),origin=h.cards.find(c=>c.dataset.draftOccurrence===occurrence);h.edit(origin);h.ctx.composerBaseText='Saved edited';await h.ctx.savePost('draft');
 assert.equal(h.writes.length,1);assert.equal(h.ctx.state.posts.filter(p=>p.id==='one').length,1);assert.equal(h.ctx.state.posts.find(p=>p.id==='one').text,'Saved edited');assert.equal(h.$('#composer').open,false);assert.equal(h.document.activeElement.dataset.draftOccurrence,occurrence);assert.notEqual(h.document.activeElement,origin);assert.equal(h.document.activeElement.isConnected,true);
});
test('actual label edit falls back to surviving canonical card when originating label is removed',async()=>{
 const h=harness();h.toggle('labels');h.edit(h.cards.find(c=>c.dataset.draftOccurrence===JSON.stringify(['B','one'])));h.$('#post-tags').value='';await h.ctx.savePost('draft');
 assert.equal(h.writes.length,1);assert.equal(h.document.activeElement.dataset.draftOccurrence,JSON.stringify([null,'one']));assert.equal(h.cards.filter(c=>c.dataset.postId==='one').length,1);
});
test('actual scheduling leaves drafts rather than restoring an obsolete repeated card',async()=>{
 const h=harness();h.toggle('labels');h.edit(h.cards.find(c=>c.dataset.draftOccurrence===JSON.stringify(['B','one'])));await h.ctx.savePost('scheduled');assert.equal(h.writes.length,1);assert.equal(h.ctx.view,'calendar');assert.equal(h.document.activeElement,h.$('#main'));assert.equal(h.ctx.state.posts.find(p=>p.id==='one').status,'scheduled');
});
test('actual duplication from repeated card creates exactly one fresh draft and preserves labels',async()=>{
 const h=harness();h.toggle('labels');h.edit(h.cards.find(c=>c.dataset.draftOccurrence===JSON.stringify(['B','one'])));await h.ctx.duplicatePost();assert.equal(h.writes.length,1);assert.equal(h.ctx.state.posts.length,4);assert.deepEqual([...h.ctx.state.posts.find(p=>p.id==='copy').tags],['A','B']);assert.deepEqual(h.opened,['copy']);assert.equal(h.cards.filter(c=>c.dataset.postId==='copy').length,2);
});
test('actual archive handler targets canonical post exactly once and leaves other drafts intact',async()=>{
 const h=harness();h.toggle('labels');h.edit(h.cards.find(c=>c.dataset.draftOccurrence===JSON.stringify(['B','one'])));const calls=[];h.ctx.normalizeState=x=>x;h.ctx.store={archiveAction:async(state,{postId,action})=>{calls.push([postId,action]);return {state:{...state,posts:state.posts.map(p=>p.id===postId?{...p,status:'archived'}:p)}};}};
 await h.ctx.archivePostAction('archive');assert.deepEqual(calls,[['one','archive']]);assert.equal(h.ctx.view,'archive');assert.equal(h.ctx.state.posts.filter(p=>p.status==='draft').length,2);assert.equal(h.ctx.state.posts.find(p=>p.id==='one').status,'archived');
});
test('focused grouped card survives independent rerender; removing its last membership falls back to main',()=>{
 const h=harness();h.toggle('labels');const occurrence=JSON.stringify(['B','one']);h.cards.find(c=>c.dataset.draftOccurrence===occurrence).focus();h.render();assert.equal(h.document.activeElement.dataset.draftOccurrence,occurrence);
 h.ctx.state.posts=h.ctx.state.posts.filter(p=>p.id!=='one');h.render();assert.equal(h.document.activeElement,h.$('#main'));
});
