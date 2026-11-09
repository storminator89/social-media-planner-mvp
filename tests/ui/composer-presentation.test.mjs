import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderWorkspaceStatus} from '../../public/workspace-ui.js';
const html=readFileSync(new URL('../../public/index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../../public/composer.css',import.meta.url),'utf8');
const app=readFileSync(new URL('../../public/app.js',import.meta.url),'utf8');
test('composer retains v13 planning controls and single-image contract',()=>{
 for(const id of ['composer-channels','mastodon-planning-status','variant-tabs','post-text','character-hint','channel-checks','media-file','media-editor','post-tags','post-date','post-time','schedule-binding-status','queue-panel','workspace-status','workspace-missing-media','preview-name','preview-avatar','preview-handle','save-draft','schedule-post'])assert.equal((html.match(new RegExp(`id="${id}"`,'g'))||[]).length,1,id);
 assert.ok(html.indexOf('id="add-media"')<html.indexOf('id="post-tags"'));
 assert.match(html,/JPG\/PNG\/WebP bis 20 MB · Ausgabe: 1 JPG bis 2 MB/);
 assert.doesNotMatch(html,/10 Anhänge|20 MiB/);
 assert.match(html,/mastodon-publish\.html/);
});
test('only confirmed quiet status may collapse, warnings remain visible',()=>{
 for(const phase of ['dirty','saving','uncertain','checking','conflict','paused','error','invalid','closed','closing','local_only']){
  const output=renderWorkspaceStatus({phase,message:'Prüfung nötig',canReconcile:true},{available:true});
  assert.doesNotMatch(output,/<details/);assert.match(output,/Prüfung nötig/);assert.match(output,/data-workspace-severity="attention"/);
 }
 assert.match(renderWorkspaceStatus({phase:'saved',message:'Bestätigt'},{available:true}),/<details/);
 const missing=renderWorkspaceStatus({phase:'saved',message:'Bestätigt'},{available:true,omitted:true});assert.doesNotMatch(missing,/<details/);assert.match(missing,/Lokales Bild nicht mitgesichert/);
 assert.doesNotMatch(renderWorkspaceStatus({phase:'saved'},{available:false}),/<details/);
});
test('preview navigation and safe initial focus preserve current editor data',()=>{
 assert.match(html,/id="composer-preview"[^>]*tabindex="-1"/);
 assert.match(app,/scrollTop=0;\$\('#post-text'\)\.focus\(\{preventScroll:true\}\)/);
 for(const id of ['show-composer-preview','back-to-composer'])assert.match(app,new RegExp(id));
 assert.match(css,/max-height:500px/);assert.match(css,/\.preview-pane\{display:block/);
 assert.match(app, /refreshMastodonPlanningStatus/);
});
