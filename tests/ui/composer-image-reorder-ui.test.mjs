import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const app=readFileSync(new URL('../../public/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../../public/composer.css',import.meta.url),'utf8');
const helper=app.slice(app.indexOf('function renderImageReorderControls('),app.indexOf('function renderMediaEditor('));
const context=vm.createContext({icon:name=>`<svg aria-hidden="true" data-icon="${name}"></svg>`});
vm.runInContext(helper,context);
const render=(n,i)=>context.renderImageReorderControls(n,i);
for(const n of [0,1])test(`no unnecessary reorder controls for ${n} images`,()=>assert.equal(render(n,0),''));
for(const [count,index] of [[2,0],[2,1],[3,1],[10,9]])test(`carousel ${index+1}/${count} keeps exact boundary guards and accessible actions`,()=>{
 const html=render(count,index),buttons=html.match(/<button[^>]*>/g);
 assert.equal(buttons.length,2);
 assert.equal(buttons[0].includes('disabled'),index===0);
 assert.equal(buttons[1].includes('disabled'),index===count-1);
 assert.match(html,/role="group" aria-label="Bildreihenfolge"/);
 for(const [direction,label] of [['left','links'],['right','rechts']]){
  assert.match(html,new RegExp(`data-action="move-media-${direction}" aria-label="Bild nach ${label} verschieben"`));
  assert.match(html,new RegExp(`title="Bild nach ${label} verschieben"`));
  assert.match(html,new RegExp(`data-icon="chevron-${direction}"`));
 }
});
test('composer uses real carousel selection and keeps established focus and handler paths',()=>{
 assert.match(app,/renderImageReorderControls\(composerImages.length,composerImages.index\)/);
 assert.match(app,/function refreshMediaFocus\(action=null\)/);
 assert.match(app,/requested\|\|selected\|\|\$\('#add-media'\)/);
 assert.match(css,/\.media-reorder \.icon-button\{min-width:44px;min-height:44px\}/);
});
