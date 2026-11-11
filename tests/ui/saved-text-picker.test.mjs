import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSavedTextPicker} from '../../public/saved-text-picker.js';
import {savedTextCatalog} from '../../public/saved-texts.js';
const definitions=[{id:'mastodon',name:'Mastodon'}];
const post=(id,extra={})=>({id,status:'draft',title:'Source '+id,text:'  Stored '+id+'\n\n😀 ',channels:['mastodon'],variantTexts:{},updatedAt:'2027-01-01',...extra});
const catalog=(...posts)=>savedTextCatalog({posts},definitions);
function harness({initial=catalog(post('one'),post('two')),onChoose=()=>true}={}){
 const previous={document:globalThis.document,fetch:globalThis.fetch},nodes=[],closes=[],applied=[],dismissed=[];
 let current=initial,busy=false;
 class Element {
  constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.parentElement=null;this.attributes=new Map();this.listeners=new Map();this.dataset={};this.className='';this.id='';this.value='';this.hidden=false;this.disabled=false;this.open=false;this._text='';}
  append(...children){for(const node of children){node.parentElement=this;this.children.push(node);}}
  replaceChildren(...children){for(const node of this.children)node.parentElement=null;this.children=[];this._text='';this.append(...children);}
  set textContent(value){this.replaceChildren();this._text=String(value);}
  get textContent(){return this._text+this.children.map(node=>node.textContent).join('');}
  set innerHTML(_){assert.fail('Text picker must not parse saved content as HTML.');}
  setAttribute(key,value){this.attributes.set(key,String(value));}
  getAttribute(key){return this.attributes.get(key);}
  addEventListener(name,callback){if(!this.listeners.has(name))this.listeners.set(name,[]);this.listeners.get(name).push(callback);}
  fire(name,extra={}){const event={target:this,preventDefault(){this.defaultPrevented=true},...extra};for(const cb of this.listeners.get(name)||[])cb(event);return event;}
  focus(){doc.activeElement=this;}
  showModal(){this.open=true;}
  close(){this.open=false;closes.push(()=>this.fire('close'));}
 }
 const doc={createElement(tag){const node=new Element(tag);nodes.push(node);return node;},body:new Element('body')};
 globalThis.document=doc;globalThis.fetch=()=>assert.fail('No network needed for saved text.');
 const picker=createSavedTextPicker({getCatalog:()=>{if(current instanceof Error)throw current;return current},canOpen:()=>!busy,onChoose:(item,target)=>{applied.push([item,target]);return onChoose(item,target)},onClose:(target,options)=>dismissed.push({target,options})});
 const byClass=cls=>nodes.find(node=>node.className===cls);
 return {picker,nodes,doc,closes,applied,dismissed,set busy(value){busy=value},set catalog(value){current=value},
  open(origin={label:'Basistext · Nach Auswahl einfügen'}){return picker.open(origin)},
  get dialog(){return nodes.find(node=>node.id==='saved-text-picker')},get search(){return nodes.find(node=>node.id==='saved-text-search')},get list(){return byClass('saved-text-list')},get cards(){return this.list?.children||[]},get apply(){return nodes.find(node=>node.dataset.savedTextAction==='apply')},get cancel(){return nodes.find(node=>node.dataset.savedTextAction==='cancel')},get preview(){return byClass('saved-text-preview-content')},get status(){return byClass('saved-text-status').textContent},get empty(){return byClass('saved-text-empty')},
  select(index=0){this.cards[index].fire('click')},confirm(){this.apply.fire('click')},searchFor(value){this.search.value=value;this.search.fire('input')},restore(){picker.close({restoreFocus:false});Object.assign(globalThis,previous)}};
}
test('opens native modal with exact destination, search focus, concise source provenance and disabled confirmation',()=>{
 const h=harness();try{assert.equal(h.dialog,undefined);assert.equal(h.open(),true);assert.equal(h.open(),false);assert.equal(h.dialog.open,true);assert.equal(h.doc.activeElement,h.search);assert.equal(h.apply.disabled,true);assert.match(h.dialog.textContent,/Text übernehmen/);assert.match(h.dialog.textContent,/Basistext · Nach Auswahl einfügen/);assert.match(h.cards[0].textContent,/Source one/);assert.match(h.cards[0].textContent,/Entwurf · Basistext · Mastodon/);assert.equal(h.applied.length,0);h.confirm();assert.equal(h.applied.length,0);}finally{h.restore()}
});
test('selecting shows full exact text and changes no editor; explicit action adopts once with original target',()=>{
 const origin={label:'Mastodon · Eigener Text · An Textposition einfügen',generation:4},h=harness();try{h.open(origin);const card=h.cards[0];card.focus();h.select();assert.equal(h.doc.activeElement,card);assert.equal(h.cards[0],card);assert.equal(h.applied.length,0);assert.equal(h.apply.disabled,false);assert.equal(card.getAttribute('aria-pressed'),'true');assert.equal(h.preview.textContent,'  Stored one\n\n😀 ');h.confirm();h.confirm();assert.equal(h.applied.length,1);assert.equal(h.applied[0][1],origin);assert.equal(h.dialog.open,false);assert.equal(h.dismissed[0].target,origin);assert.equal(h.dismissed[0].options.applied,true);}finally{h.restore()}
});
test('search finds body/title/status/channel and clears a now-hidden selection instead of applying it',()=>{
 const h=harness();try{h.open();h.select();h.searchFor('two Mastodon');assert.equal(h.cards.length,1);assert.match(h.cards[0].textContent,/Source two/);assert.equal(h.apply.disabled,true);assert.equal(h.preview.textContent,'');h.confirm();assert.equal(h.applied.length,0);h.searchFor('missing');assert.equal(h.cards.length,0);assert.equal(h.empty.textContent,'Keine passenden Texte.');h.searchFor('');assert.equal(h.cards.length,2);}finally{h.restore()}
});
for(const ending of ['button','Escape','native','programmatic'])test(`${ending} cancellation preserves no-write semantics and invalidates detached old cards on reopen`,()=>{
 const h=harness();try{h.open();h.select();const old=h.cards[0],origin=h.dismissed[0];if(ending==='button')h.cancel.fire('click');else if(ending==='Escape')assert.equal(h.dialog.fire('cancel').defaultPrevented,true);else if(ending==='native'){h.dialog.open=false;h.dialog.fire('close')}else h.picker.close();assert.equal(h.picker.isOpen,false);assert.equal(h.applied.length,0);assert.equal(h.dismissed.length,1);assert.equal(h.dismissed[0].options.restoreFocus,true);h.open({label:'New target'});old.fire('click');assert.equal(h.apply.disabled,true);for(const close of h.closes)close();assert.equal(h.dialog.open,true);assert.equal(h.picker.isOpen,true);assert.equal(h.dismissed.length,1);}finally{h.restore()}
});
test('busy state blocks open and confirms safely without mutation',()=>{
 const h=harness();try{h.busy=true;assert.equal(h.open(),false);h.busy=false;h.open();h.select();h.busy=true;h.confirm();assert.equal(h.applied.length,0);assert.match(h.status,/beschäftigt/);assert.equal(h.dialog.open,true);}finally{h.restore()}
});
test('changed/deleted/unavailable source rejects old preview without invoking application',()=>{
 for(const changed of [catalog(post('one',{text:'Changed'})),catalog(post('two')),{available:false,items:[]},new Error('SECRET')]){const h=harness();try{h.open();h.select();h.catalog=changed;h.confirm();assert.equal(h.applied.length,0);assert.match(h.status,/geändert/);assert.equal(h.dialog.open,true);assert.equal(h.preview.textContent,'  Stored one\n\n😀 ');}finally{h.restore()}}
});
test('empty and unavailable states are distinct and no fabricated sources are offered',()=>{
 for(const [initial,expected] of [[catalog(),/Noch keine/],[{available:false,items:[]},/nicht verfügbar/],[new Error('SECRET'),/nicht verfügbar/]]){const h=harness({initial});try{h.open();assert.equal(h.cards.length,0);assert.match(h.empty.textContent,expected);assert.equal(h.apply.disabled,true);}finally{h.restore()}}
});
test('rejected application preserves the dialog and selected preview with actionable error',()=>{
 const h=harness({onChoose(){throw Error('Zu lang: Zusammen sind höchstens 20.000 Zeichen möglich.')}});try{h.open();h.select();h.confirm();assert.match(h.status,/20.000/);assert.equal(h.picker.isOpen,true);assert.equal(h.preview.textContent,'  Stored one\n\n😀 ');assert.equal(h.dismissed.length,0);}finally{h.restore()}
});
test('saved HTML-looking title and text are only text nodes, including full preview',()=>{
 const text='<img src=x onerror=alert(1)>\n<script>bad()</script>',h=harness({initial:catalog(post('x',{title:'<svg onload=bad()>',text}))});try{h.open();h.select();assert.equal(h.preview.textContent,text);assert.match(h.cards[0].textContent,/<svg onload=bad\(\)>/);assert.ok(h.nodes.every(node=>!['IMG','SVG','SCRIPT'].includes(node.tagName)));h.confirm();assert.equal(h.applied[0][0].text,text);}finally{h.restore()}
});
test('non-focusing teardown during save does not restore stale input focus',()=>{
 const h=harness();try{h.open();h.picker.close({restoreFocus:false});assert.equal(h.dismissed[0].options.restoreFocus,false);assert.equal(h.dialog.open,false);}finally{h.restore()}
});
test('layout wraps long strings, supports narrow/short viewports, and labels controls without prose',()=>{
 const css=readFileSync(new URL('../../public/saved-text-picker.css',import.meta.url),'utf8'),js=readFileSync(new URL('../../public/saved-text-picker.js',import.meta.url),'utf8');
 for(const required of ['max-width:calc(100vw - 28px)','max-height:calc(100dvh - 28px)','overflow-wrap:anywhere','white-space:pre-wrap','max-width:500px','max-height:480px','min-height:44px',':focus-visible'])assert.ok(css.includes(required),required);
 assert.doesNotMatch(js,/element\('p'|innerHTML|fetch\(|localStorage|indexedDB/);assert.match(js,/aria-labelledby/);assert.match(js,/aria-describedby/);assert.match(js,/role', 'alert/);
});

test('full preview normalizes CRLF and lone CR to the insertion display without changing raw source identity',()=>{
 const raw='QA Windows erste\r\nzweite\rdritte',h=harness({initial:catalog(post('windows',{text:raw}))});
 try{h.open();h.select();assert.equal(h.preview.textContent,'QA Windows erste\nzweite\ndritte');h.confirm();assert.equal(h.applied.length,1);assert.equal(h.applied[0][0].text,raw);}finally{h.restore()}
});
test('preview normalization never permits a raw newline-only source change to bypass stale-source rejection',()=>{
 const h=harness({initial:catalog(post('windows',{text:'first\r\nsecond\rthird'}))});
 try{h.open();h.select();h.catalog=catalog(post('windows',{text:'first\nsecond\nthird'}));h.confirm();assert.equal(h.applied.length,0);assert.match(h.status,/geändert/);assert.equal(h.preview.textContent,'first\nsecond\nthird');}finally{h.restore()}
});
