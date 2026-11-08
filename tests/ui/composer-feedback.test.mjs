import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {focusComposerErrors} from '../../public/composer-feedback.js';
import {validatePost} from '../../public/model.js';
test('error summary receives focus then immediate start-aligned scroll',()=>{
 const calls=[];const element={hidden:false,textContent:'Mastodon: maximal 500 Zeichen',focus:options=>calls.push(['focus',options]),scrollIntoView:options=>calls.push(['scroll',options])};
 assert.equal(focusComposerErrors(element),true);
 assert.deepEqual(calls,[['focus',{preventScroll:true}],['scroll',{block:'start',inline:'nearest',behavior:'instant'}]]);
});
test('hidden or absent errors never steal focus',()=>{
 for(const element of [null,{hidden:true,textContent:'alt'},{hidden:false,textContent:' '}])assert.equal(focusComposerErrors(element),false);
});
test('501-character Mastodon scheduling remains rejected and summary stays labelled/focusable',()=>{
 const errors=validatePost({id:'test',text:'a'.repeat(501),variantTexts:{},channels:['mastodon'],status:'scheduled',scheduledAt:'2030-01-15T12:00',timeZone:'Europe/Berlin',tags:[],media:null});
 assert.ok(errors.some(message=>/Mastodon/.test(message)),errors.join(' '));
 const html=readFileSync(new URL('../../public/index.html',import.meta.url),'utf8');
 assert.match(html,/id="form-errors"[^>]*role="alert"[^>]*aria-label="Beitrag konnte nicht gespeichert werden"[^>]*tabindex="-1"/);
 const app=readFileSync(new URL('../../public/app.js',import.meta.url),'utf8');
 assert.match(app,/if\(errors.length\).*focusComposerErrors\(\$\('#form-errors'\)\);return/);
 assert.match(app,/if\(!success\)focusComposerErrors/);
 assert.doesNotMatch(app,/form-errors'\)\.scrollIntoView\(\{block:'nearest',behavior:'smooth'/);
});
