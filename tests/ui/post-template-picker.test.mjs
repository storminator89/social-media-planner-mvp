import test from 'node:test';
import assert from 'node:assert/strict';
import {createPostTemplatePicker} from '../../public/post-template-picker.js';
function harness(){
 const previous=globalThis.document,nodes=[],closes=[],applied=[];let allowed=true;
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
  querySelectorAll(tag){return this.children.flatMap(child=>[...(child.tagName===tag.toUpperCase()?[child]:[]),...child.querySelectorAll(tag)]);}
  focus(){doc.activeElement=this;}
  showModal(){this.open=true;}
  close(){this.open=false;closes.push(()=>this.fire('close'));}
 }
 const doc={createElement(tag){const node=new Element(tag);nodes.push(node);return node;},body:new Element('body')};globalThis.document=doc;
 const picker=createPostTemplatePicker({canOpen:()=>allowed,onChoose:(text,target)=>{applied.push({text,target});return true},onClose:()=>{}});
 return {picker,nodes,applied,closes,open:()=>picker.open({generation:1}),get format(){return nodes.find(n=>n.id==='post-template-format')},get fields(){return nodes.find(n=>n.className==='post-template-fields').children.filter(n=>n.tagName==='TEXTAREA')},get apply(){return nodes.find(n=>n.tagName==='BUTTON'&&n.textContent==='Einfügen')},get dialog(){return nodes.find(n=>n.id==='post-template-picker')},set allowed(value){allowed=value},fill(){for(const field of this.fields){field.value='Exact '+field.id;field.fire('input');}},restore(){picker.close();globalThis.document=previous;}};
}
test('template picker requires fields and inserts only on explicit action once',()=>{const h=harness();try{assert.equal(h.open(),true);assert.equal(h.apply.disabled,true);h.fill();assert.equal(h.apply.disabled,false);assert.equal(h.applied.length,0);h.apply.fire('click');h.apply.fire('click');assert.equal(h.applied.length,1);assert.equal(h.dialog.open,false);}finally{h.restore();}});
test('format switching preserves entered values within session, closing clears them',()=>{const h=harness();try{h.open();h.fill();const original=h.fields.map(f=>f.value);h.format.value='question';h.format.fire('change');assert.ok(h.fields.every(f=>f.value===''));h.fill();h.format.value='announcement';h.format.fire('change');assert.deepEqual(h.fields.map(f=>f.value),original);h.picker.close();h.open();assert.ok(h.fields.every(f=>f.value===''));assert.equal(h.apply.disabled,true);}finally{h.restore();}});
test('busy state prevents apply and Escape cancels without writes',()=>{const h=harness();try{h.open();h.fill();h.allowed=false;h.apply.fire('click');assert.equal(h.applied.length,0);h.dialog.fire('cancel');assert.equal(h.dialog.open,false);assert.equal(h.applied.length,0);}finally{h.restore();}});
test('queued earlier close cannot dismiss new picker session',()=>{const h=harness();try{h.open();h.picker.close();h.open();for(const cb of h.closes)cb();assert.equal(h.picker.isOpen,true);assert.equal(h.dialog.open,true);}finally{h.restore();}});
