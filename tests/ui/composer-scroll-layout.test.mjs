import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../../public/'+name,import.meta.url),'utf8');
const html=read('index.html'),composer=read('composer.css'),interfaceCss=read('interface.css');
function pathTo(id){
 const stack=[];
 for(const match of html.matchAll(/<\/?([a-z][\w-]*)\b[^>]*>/gi)){
  const [tag,name]=match;
  if(tag.startsWith('</')){if(stack.at(-1)?.name===name)stack.pop();continue;}
  const attrs=Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]]));
  if(attrs.id===id)return stack;
  if(!['input','img','meta','link','br','hr','source'].includes(name))stack.push({name,...attrs});
 }
 throw Error('Missing '+id);
}
const withinClass=(id,cls)=>pathTo(id).some(node=>(node.class||'').split(/\s+/).includes(cls));

test('secondary composer actions scroll with the editor, never expand the fixed save footer',()=>{
 for(const id of ['composer-actions','continue-composer','edit-actions','edit-channel-media','split-draft']){
  assert.equal(withinClass(id,'composer-editor'),true,id);
  assert.equal(withinClass(id,'composer-footer'),false,id);
 }
 for(const id of ['save-draft','schedule-post','mastodon-handoff'])assert.equal(withinClass(id,'composer-footer'),true,id);
 assert.ok(html.indexOf('id="queue-panel"')<html.indexOf('id="composer-actions"'));
 assert.ok(html.indexOf('id="composer-actions"')<html.indexOf('id="form-errors"'));
 assert.equal((html.match(/id="composer-actions"/g)||[]).length,1);
 assert.match(interfaceCss,/\.composer-dialog \.composer-actions\{min-width:0;margin:18px 0 0\}/);
});

test('outer composer cannot become a hidden programmatic scroller during preview/focus navigation',()=>{
 // Hidden overflow still scrolls on focus/scrollIntoView. Clip does not create
 // a scroll container: the normal body and the existing short-height form own it.
 assert.match(composer,/\.composer-dialog\{overflow:clip;/);
 assert.match(composer,/\.composer-dialog \.composer-body\{flex:1 1 auto;min-height:80px\}/);
 assert.match(composer,/@media\(max-height:500px\)\{\.composer-dialog form\{[^}]*overflow-y:auto\}/);
});

test('recovery and validation messages are not moved into the secondary disclosure',()=>{
 for(const id of ['workspace-status','workspace-missing-media','composer-file-drop-error','schedule-binding-status','form-errors']){
  assert.equal(pathTo(id).some(node=>node.name==='details'),false,id);
 }
 const actions=html.match(/<details id="composer-actions"[\s\S]*?<\/details>/)[0];
 assert.match(actions,/<summary>Weitere Aktionen<\/summary>/);
 for(const id of ['continue-composer','edit-actions','edit-channel-media','split-draft'])assert.ok(actions.includes(`id="${id}"`),id);
});

// The dialog retains 20px desktop margins even below 500px viewport height.
// A 100dvh form would be 42px taller than its inner box once overflow is clipped.
test('short wide forms fit the dialog rather than clipping the sticky save controls',()=>{
 assert.match(composer,/@media\(min-width:761px\) and \(max-height:500px\)\{\.composer-dialog form\{height:calc\(100dvh - 42px\);max-height:calc\(100dvh - 42px\)\}\}/);
});
