import {imageOnlyPlanningAllowed} from '../../public/image-only-planning.js';
import {videoContext} from './video-context.mjs';
import {createComposerMedia} from '../../public/composer-media.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {CHANNELS,characterCount} from '../../public/model.js';
import {effectiveText,hasTextVariant,inheritedChannels} from '../../public/variants.js';
import {updateVisualPresentation} from '../../public/visual-editor.js';
const app=readFileSync(new URL('../../public/app.js',import.meta.url),'utf8');
const start=app.indexOf('function renderPreview('),end=app.indexOf('\nfunction ',start+1);
function harness(post){
 const elements=new Map();const $=id=>{if(!elements.has(id))elements.set(id,{value:'',dataset:{},classList:{toggle(){}},set innerHTML(value){this.html=value;if(id==='#preview-channel')this.value=/value="([^"]*)"/.exec(value)?.[1]||''},get innerHTML(){return this.html}});return elements.get(id)};
 const context={imageOnlyPlanningAllowed,...videoContext(),composerImages:createComposerMedia(),updateDraftSplitAvailability(){},CHANNELS,characterCount,editorPost:()=>post,$,hasTextVariant,effectiveText,inheritedChannels,updateVisualPresentation,queuePanel:null,activeTextTarget:'base',composerBaseText:post.text,composerMedia:null,composerCover:null,cover:()=>'',renderTimingStatus(){},updateVariantSummary(){},workspaceRestoring:false,saving:false,workspaceUI:null};
 vm.runInNewContext(app.slice(start,end)+';this.render=renderPreview;',context);return {context,$};
}
test('channel-less draft shows base text without inventing Instagram selection',()=>{
 const p={channels:[],text:'<script>literal</script>\nDraft',variantTexts:{mastodon:'Retained'}},before=JSON.stringify(p),h=harness(p);h.context.render();
 assert.equal(h.$('#preview-channel').disabled,true);assert.equal(h.$('#preview-channel').value,'');assert.doesNotMatch(h.$('#preview-channel').innerHTML,/instagram|mastodon/);assert.equal(h.$('#preview-text').textContent,p.text);assert.equal(h.$('.social-preview').dataset.platform,'base');assert.equal(h.$('#preview-name').textContent,'Klartext · Planungsvorschau');assert.equal(h.$('.preview-disclaimer').textContent,'');assert.equal(JSON.stringify(p),before);
});
test('Mastodon select, deselect, and reselect retain explicit empty variant without fake target',()=>{
 const p={channels:['mastodon'],text:'Base',variantTexts:{mastodon:''}},h=harness(p);h.context.render();assert.equal(h.$('#preview-channel').disabled,false);assert.equal(h.$('.social-preview').dataset.platform,'mastodon');assert.equal(h.$('#preview-text').textContent,'Für diesen Kanal ist noch kein Text vorhanden.');
 p.channels=[];h.context.render();assert.equal(h.$('#preview-channel').disabled,true);assert.equal(h.$('#preview-text').textContent,'Base');
 p.channels=['mastodon'];h.context.render();assert.equal(h.$('#preview-channel').disabled,false);assert.equal(h.$('#preview-channel').value,'mastodon');assert.equal(p.variantTexts.mastodon,'');assert.equal(h.$('.social-preview').dataset.platform,'mastodon');
});
test('multi-channel preview preserves explicit selected target and effective own text',()=>{
 const p={channels:['instagram','mastodon'],text:'Base',variantTexts:{mastodon:'Own'}},h=harness(p);h.context.render('mastodon');assert.equal(h.$('#preview-channel').value,'mastodon');assert.equal(h.$('#preview-text').textContent,'Own');h.context.render();assert.equal(h.$('#preview-channel').value,'mastodon');assert.equal(h.$('#preview-text').textContent,'Own');
});
test('late rerender never re-enables preview control while saving',()=>{
 const h=harness({channels:['mastodon'],text:'Draft',variantTexts:{}});h.context.saving=true;h.$('#preview-channel').disabled=true;h.context.render();assert.equal(h.$('#preview-channel').disabled,true);
});

test('normal composer omits redundant limit prose but preserves counter and actionable warnings',()=>{
 const p={channels:['mastodon'],text:'Short',variantTexts:{}},h=harness(p);h.context.render();assert.equal(h.$('#character-hint').textContent,'');assert.match(h.$('#character-counter').textContent,/5 \/ 500 Zeichen/);
 p.text='x'.repeat(501);h.context.composerBaseText=p.text;h.context.render();assert.match(h.$('#character-hint').textContent,/Zeichenlimit überschritten/);assert.match(h.$('#character-hint').textContent,/Entwurf/);
 p.channels=[];h.context.render();assert.equal(h.$('#character-hint').textContent,'');
});
test('preview never repeats channel formatting descriptions',()=>{
 for(const channel of CHANNELS){const h=harness({channels:[channel.id],text:'Text',variantTexts:{}});h.context.render();const note=h.$('.preview-disclaimer').textContent;assert.equal(note,'');}
});
test('composer removes repeated explanatory blocks without removing warnings or controls',()=>{
 const html=readFileSync(new URL('../../public/index.html',import.meta.url),'utf8');assert.doesNotMatch(html,/class="visual-text-tools"|class="demo-explainer"|id="visual-text-heading"/);
 for(const id of ['character-hint','variant-mode-hint','workspace-missing-media','mastodon-planning-status','form-errors','schedule-timezone'])assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(html,/aria-describedby="variant-mode-hint character-hint"/);
});

test('Mastodon status is visible only while Mastodon is a selected planning target',()=>{
 const p={channels:['instagram'],text:'Text',variantTexts:{}},h=harness(p);h.context.render();assert.equal(h.$('#mastodon-planning-status').hidden,true);
 p.channels.push('mastodon');h.context.render('instagram');assert.equal(h.$('#mastodon-planning-status').hidden,false);
 p.channels=['instagram'];h.context.render();assert.equal(h.$('#mastodon-planning-status').hidden,true);p.channels=[];h.context.render();assert.equal(h.$('#mastodon-planning-status').hidden,true);
 const html=readFileSync(new URL('../../public/index.html',import.meta.url),'utf8');assert.match(html,/id="mastodon-planning-status"[^>]*hidden/);
});
