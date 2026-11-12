import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
test('concise copy preserves public/mastodon-publish.html',()=>assert.equal(createHash('sha256').update(read('public/mastodon-publish.html')).digest('hex'),'4c3d875e0ac80a2eb7bae54d3fcb7e950666170ee20a94f2451cd6002c3b3eae'));
test('concise copy preserves public/mastodon-publish.js',()=>assert.equal(createHash('sha256').update(read('public/mastodon-publish.js')).digest('hex'),'dfd106e1e358fe73cfcf439d84b7a4a2a33f90857af7f0db4b0a8b0ab2293256'));
test('concise copy preserves public/mastodon.js',()=>assert.equal(createHash('sha256').update(read('public/mastodon.js')).digest('hex'),'c4c070e8802f96b0455c39ff9666952f7e46ce06e829d277bb7fb490ba0b10db'));
test('archive-rejecting carousel import pins public/planner-import.js',()=>assert.equal(createHash('sha256').update(read('public/planner-import.js')).digest('hex'),'a8256b6e6467104ec8debe452b18cf5419c82c596254d4704c3169a66c20d52f'));
test('reviewed CSV time and saved-image import UI remains pinned',()=>assert.equal(createHash('sha256').update(read('public/planner-import-ui.js')).digest('hex'),'e1c9b06f5159204d28061c0fdb8d0b10aff9712e6bafe7680cba97c2b3c5e67c'));
test('reviewed carousel migration preserves public/mastodon-handoff.js',()=>assert.equal(createHash('sha256').update(read('public/mastodon-handoff.js')).digest('hex'),'570912c7a98d1fb757eeb7d7d39c95b80a5aa44217d558fb32d93af8e829bd45'));
// v71 explicit channel media: pinned changed import/handoff guards and unsupported workspace safety.
// Offline video-v3 review: sticky protocol upgrades and typed video restoration retain legacy image recovery.
// These candidate pins do not modify the live v54 baseline or authorize rollback/deployment.
test('v72 candidate workspace recovery pins public/workspace-controller.js',()=>assert.equal(createHash('sha256').update(read('public/workspace-controller.js')).digest('hex'),'ecda1830effc9862cfb86799ac48a5331c5daf99fe0bda6a5c1a020db0726f78'));
test('archive-aware v72 candidate recovery pins public/workspace-restore.js',()=>assert.equal(createHash('sha256').update(read('public/workspace-restore.js')).digest('hex'),'68ac894cd76317c25d9f6c909e4e39fc3f5caa8af56324a63441f21f746cd55b'));
test('concise copy preserves public/provider-setup.js',()=>assert.equal(createHash('sha256').update(read('public/provider-setup.js')).digest('hex'),'d146eef7863499e7838c43255b9e5afdf2f90f2f43a1e79c38e4a2bbcd294368'));
test('concise copy preserves public/youtube-upload.js',()=>assert.equal(createHash('sha256').update(read('public/youtube-upload.js')).digest('hex'),'31a333ce56ce5add98545af4c931b89b52e5d7a5badcb1c86c3460f6b10ca321'));
test('profile consent remains complete and unchanged',()=>{const h=read('public/mastodon.html'),start=h.indexOf('<section id="confirmation"'),section=h.slice(start,h.indexOf('</section>',start)+10);assert.equal(createHash('sha256').update(section).digest('hex'),'57a4b20d9cd7c0cd0a0d2351bfa4bae4219ad204902b0a795580d3f3f1c9006b')});
test('concise descriptions keep media, scope and planning boundaries visible',()=>{const h=read('public/index.html');for(const label of ['id="media-file"','id="post-tags"','id="channel-checks"','aria-describedby=','role="alert"'])assert.ok(h.includes(label),label);assert.match(read('public/workspace-ui.js'),/Lokale Mediendateien fehlen/);assert.match(read('public/app.js'),/Verbindungen ansehen/)});
