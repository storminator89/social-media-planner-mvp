import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../../public/app.js',import.meta.url),'utf8');
const begin=source.indexOf('function refreshMediaFocus('),end=source.indexOf('\nfunction ',begin+1),body=source.slice(begin,end);
function harness({action,disabled=false,selected=true}={}){
 let focused=null;const events=[];const button={dataset:{action},disabled,focus:opts=>{focused='action';assert.equal(opts.preventScroll,true)}},thumb={dataset:{mediaKey:'selected'},focus:()=>focused='thumb'},add={focus:()=>focused='add'};
 const c=vm.createContext({composerImages:{selectedKey:'selected'},document:{querySelectorAll:query=>query.includes('data-action')?[button]:selected?[thumb]:[]},$:()=>add,renderMediaEditor:()=>events.push('media'),renderPreview:()=>events.push('preview')});vm.runInContext(body,c);return {c,events,get focused(){return focused}};
}
test('thumbnail selection restores selected thumbnail after replacing both DOM regions',()=>{const h=harness();h.c.refreshMediaFocus();assert.deepEqual(h.events,['media','preview']);assert.equal(h.focused,'thumb');});
for(const action of ['move-media-left','move-media-right','next-media','previous-media'])test(`${action} retains enabled action focus, falling back to selected thumbnail at boundary`,()=>{const h=harness({action});h.c.refreshMediaFocus(action);assert.equal(h.focused,'action');const edge=harness({action,disabled:true});edge.c.refreshMediaFocus(action);assert.equal(edge.focused,'thumb');});
test('removing final image restores add-image focus',()=>{const h=harness({selected:false});h.c.refreshMediaFocus();assert.equal(h.focused,'add');});
test('all thumbnail navigation/reorder/remove handlers use focus-preserving refresh',()=>{
 assert.match(source,/composerImages\.select\(button\.dataset\.mediaKey\);refreshMediaFocus\(\);return/);
 assert.match(source,/if\(row\)composerImages\.select\(row\.key\);\}refreshMediaFocus\(button\.dataset\.action\)/);
 assert.match(source,/composerImages\.remove\(\);composerMedia=composerImages\.selected;composerCover=null;refreshMediaFocus\(\)/);
});
