import test from 'node:test';
import assert from 'node:assert/strict';
import { createQueuePanel, sharedQueueRules } from '../../public/queue-panel.js';
import { applyQueueSuggestion, suggestQueueSlots } from '../../modules/workflows/queue.mjs';

class Element {
  children=[];listeners={};textContent='';value='';dataset={};
  addEventListener(event,handler){this.listeners[event]=handler;}
  append(...children){this.children.push(...children);}
  replaceChildren(){this.children=[];}
  get childElementCount(){return this.children.length;}
  closest(){return this;}
}
function fixture(t){
  const prior=global.document;global.document={createElement:()=>new Element()};t.after(()=>{global.document=prior;});
  const elements=Object.fromEntries(['.queue-results','.queue-status','.queue-time','.queue-gap','.queue-search'].map(key=>[key,new Element()]));
  const days=Array.from({length:7},(_,value)=>({value:String(value),checked:false}));const container=new Element();container.querySelector=s=>elements[s];container.querySelectorAll=s=>days.filter(d=>!s.includes(':checked')||d.checked);
  let post={id:'p1',text:'Basis',variantTexts:{linkedin:'Eigener Text'},channels:['linkedin'],status:'draft',scheduledAt:null,timeZone:'Europe/Berlin',media:null};
  const before=structuredClone(post),applied=[];let busy=false;
  const panel=createQueuePanel({container,getPost:()=>post,getPosts:()=>[],isBusy:()=>busy,onApply:value=>applied.push(value)});
  return{container,elements,days,post,before,applied,panel,setBusy:value=>{busy=value;},search:()=>elements['.queue-search'].listeners.click(),apply:()=>elements['.queue-results'].listeners.click({target:elements['.queue-results'].children[0]})};
}

test('queue panel previews do not change or save a post; only explicit selection returns a scheduled copy',t=>{
  const f=fixture(t);f.search();assert.equal(f.elements['.queue-results'].children.length,3);assert.equal(f.applied.length,0);assert.deepEqual(f.post,f.before);
  f.apply();assert.equal(f.applied.length,1);assert.equal(f.applied[0].status,'scheduled');assert.deepEqual(f.applied[0].variantTexts,f.post.variantTexts);assert.deepEqual(f.post,f.before);assert.equal(f.elements['.queue-results'].childElementCount,0);assert.match(f.elements['.queue-status'].textContent,/Erst.*speichert/);
});

test('queue panel invalidates changed input, resets temporary rules and respects commit locking',t=>{
  const f=fixture(t);f.search();f.elements['.queue-time'].value='12:30';f.container.listeners.input();assert.equal(f.elements['.queue-results'].childElementCount,0);assert.match(f.elements['.queue-status'].textContent,/erneut/);
  f.setBusy(true);f.search();assert.equal(f.elements['.queue-results'].childElementCount,0);f.setBusy(false);f.search();f.post.text='Changed without an event';f.apply();assert.equal(f.applied.length,0);assert.match(f.elements['.queue-status'].textContent,/geändert/);
  f.panel.reset();assert.equal(f.elements['.queue-time'].value,'09:00');assert.deepEqual(f.days.filter(d=>d.checked).map(d=>Number(d.value)),[1,3,5]);
});

test('queue panel exposes missing weekdays and malformed interval instead of inventing slots',t=>{
  const f=fixture(t);f.days.forEach(d=>{d.checked=false;});f.search();assert.match(f.elements['.queue-status'].textContent,/Wochentag/);assert.equal(f.applied.length,0);
  f.panel.reset();f.elements['.queue-gap'].value='';f.search();assert.match(f.elements['.queue-status'].textContent,/Mindestabstand/);assert.equal(f.elements['.queue-results'].childElementCount,0);
});

test('shared UI rules use every selected channel and the explicitly selected IANA zone',()=>{
  const post={id:'p',text:'Basis',channels:['linkedin','instagram'],timeZone:'Asia/Kathmandu',status:'draft'};
  const rules=sharedQueueRules(post,{weekdays:[1],time:'09:00'});assert.equal(rules.length,2);assert.ok(rules.every(r=>r.timezone==='Asia/Kathmandu'));
  const result=suggestQueueSlots({post,posts:[],rules,after:'2026-11-08T00:00:00Z'});const next=applyQueueSuggestion({post,posts:[],rules,suggestion:result.suggestions[0],now:'2026-11-08T00:00:00Z'});assert.equal(next.scheduledAt,'2026-11-09T09:00');assert.equal(result.suggestions[0].instant,'2026-11-09T03:15:00.000Z');
});
