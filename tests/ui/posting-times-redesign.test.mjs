import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPostingTimesUI,postingTimesStatus} from '../../public/posting-times-ui.js';
const schedule=()=>({schemaVersion:1,timezone:'Europe/Berlin',paused:false,minimumGapMinutes:30,overlapChoice:'reject',slots:[{id:'one',weekday:1,time:'09:00'},{id:'two',weekday:3,time:'16:30'}]});
function harness(t,{filled=false,fail=false,disconnectAfterSave=false}={}){
 const previous=globalThis.document;globalThis.document={activeElement:null};t.after(()=>{globalThis.document=previous;});
 let state={schemaVersion:2,revision:7,settings:{timezone:'Europe/Berlin'},channels:[{id:'instagram',name:'Instagram',enabled:true,postingSchedule:filled?schedule():null},{id:'mastodon',name:'Mastodon',enabled:true,postingSchedule:null}],posts:[]};
 let html='',nodes=new Map(),writes=0;const handlers={};
 const node=(selector,dataset={})=>{if(!nodes.has(selector))nodes.set(selector,{dataset,isConnected:true,disabled:false,hidden:false,focus(){document.activeElement=this;},scrollIntoView(){},setAttribute(){}});return nodes.get(selector);};
 const dialog={open:false,addEventListener(type,fn){handlers[type]=fn;},removeEventListener(){},setAttribute(){},showModal(){this.open=true;},close(){this.open=false;},get innerHTML(){return html;},set innerHTML(value){for(const item of nodes.values())item.isConnected=false;nodes=new Map();html=value;},querySelector(selector){if(!html)return null;const action=selector.match(/data-times="([^"]+)"/);return node(selector,action?{times:action[1]}:{});},querySelectorAll(){return [node('[data-times="save"]',{times:'save'}),node('[data-times="close"]',{times:'close'}),node('[data-times="add"]',{times:'add'})];}};
 const entry={isConnected:true,focus(){document.activeElement=this;},addEventListener(){},removeEventListener(){}};document.activeElement=entry;
 const fallback={isConnected:true,focus(){document.activeElement=this;}};
 const ui=createPostingTimesUI({fallbackFocus:()=>fallback,onSaved:()=>{if(disconnectAfterSave)entry.isConnected=false;},dialog,openButton:entry,getState:()=>state,saveState:async value=>{writes++;if(fail)throw Error('Uncertain result');state={...value,revision:value.revision+1};return state;}});t.after(()=>ui.destroy());ui.open('instagram');
 const click=async action=>{const button=node(`[data-times="${action}"]`,{times:action});document.activeElement=button;await handlers.click({target:{closest:()=>button}});};
 const change=(field,value)=>{const target=node(`[data-times-field="${field}"]`,{timesField:field});target.value=value;document.activeElement=target;handlers.change({target});return target;};
 return {ui,dialog,node,click,change,entry,fallback,get writes(){return writes;}};
}
test('status distinguishes absent rules, unsaved edits and acknowledged saved or paused states',()=>{
 assert.equal(postingTimesStatus({draft:null}),'Noch keine Zeiten eingerichtet.');assert.equal(postingTimesStatus({draft:null,dirty:true}),'Noch nicht gespeichert.');assert.equal(postingTimesStatus({draft:schedule()}),'Gespeicherter Stand.');assert.match(postingTimesStatus({draft:{...schedule(),paused:true}}),/pausiert/);assert.equal(postingTimesStatus({busy:true,message:'Old receipt'}),'Wird gespeichert …');assert.equal(postingTimesStatus({message:'Times confirmed',draft:null}),'Times confirmed');
});
test('empty dialog has one add action, disabled save, real channel options and truthful status',t=>{
 const h=harness(t);assert.equal((h.dialog.innerHTML.match(/data-times="add"/g)||[]).length,1);assert.match(h.dialog.innerHTML,/Mastodon/);assert.match(h.dialog.innerHTML,/times-settings-grid/);assert.equal(h.node('[data-times="save"]').disabled,true);assert.equal(h.node('[data-times-status]').textContent,'Noch keine Zeiten eingerichtet.');assert.equal(h.writes,0);
});
test('filled dialog retains two editable slots and all daylight-saving controls',t=>{
 const h=harness(t,{filled:true});assert.equal((h.dialog.innerHTML.match(/data-slot="/g)||[]).length,2);for(const text of ['Wochentag 1','Uhrzeit 2','value="09:00"','value="16:30"','value="reject"','value="earlier"','value="later"','data-times-field="minimumGapMinutes"','Ausfallende Frühlingszeiten','Keine automatische Veröffentlichung'])assert.ok(h.dialog.innerHTML.includes(text),text);assert.equal((h.dialog.innerHTML.match(/data-times="add"/g)||[]).length,1);
});
test('dirty channel-switch guard returns focus to the original selector when edits are kept',async t=>{
 const h=harness(t);await h.click('add');const original=h.change('channel','mastodon');assert.equal(h.node('[data-times-guard]').hidden,false);await h.click('keep');assert.equal(h.node('[data-times-guard]').hidden,true);assert.equal(document.activeElement,original);assert.equal(h.ui.dirty,true);assert.equal(h.writes,0);
});
test('failed save leaves copy recovery and errors visible, blocks retry and allows close',async t=>{
 const h=harness(t,{fail:true});await h.click('add');await h.click('save');assert.equal(h.writes,1);assert.equal(h.node('[data-times-error]').hidden,false);assert.match(h.node('[data-times-error]').textContent,/Keine automatische Wiederholung/);assert.equal(h.node('[data-times-copy-wrap]').hidden,false);assert.match(h.node('#times-copy').value,/instagram/);assert.equal(h.node('[data-times="save"]').disabled,true);assert.equal(h.node('[data-times="close"]').disabled,false);await h.click('save');assert.equal(h.writes,1);
});
test('successful save keeps confirmed status and disables unnecessary repeat saves',async t=>{
 const h=harness(t);await h.click('add');await h.click('save');assert.equal(h.writes,1);assert.match(h.node('[data-times-status]').textContent,/Zeiten gespeichert/);assert.equal(h.node('[data-times="save"]').disabled,true);
});
test('short-height zoom uses whole-dialog scrolling without sticky footer overlay',()=>{
 const css=readFileSync(new URL('../../public/posting-times.css',import.meta.url),'utf8');const final=css.slice(css.indexOf('/* Posting-times redesign:'));assert.match(final,/@media\(max-height:560px\)/);assert.match(final,/\.posting-times-dialog\[open\]\{display:block;overflow-y:auto\}/);assert.match(final,/\.posting-times-head,\.posting-times-footer\{position:static\}/);assert.match(final,/grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\) 44px/);
});

test('closing after save restores stable fallback when rendered guidance opener was replaced',async t=>{const h=harness(t,{disconnectAfterSave:true});await h.click('add');await h.click('save');assert.equal(h.entry.isConnected,false);await h.click('close');assert.equal(h.dialog.open,false);assert.equal(document.activeElement,h.fallback);assert.equal(h.writes,1);});
test('normal close prefers the still connected original opener',async t=>{const h=harness(t);await h.click('close');assert.equal(document.activeElement,h.entry);assert.equal(h.writes,0);});
test('discarding unsaved settings also restores fallback for replaced opener without saving',async t=>{const h=harness(t);await h.click('add');h.entry.isConnected=false;await h.click('close');assert.equal(h.dialog.open,true);await h.click('discard');assert.equal(h.dialog.open,false);assert.equal(document.activeElement,h.fallback);assert.equal(h.writes,0);});
