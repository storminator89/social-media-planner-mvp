import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../../public/'+name,import.meta.url),'utf8');
test('routine screens remove explanatory paragraphs, not validation and recovery controls',()=>{
 const html=read('index.html');
 for(const prose of ['Kanäle und Termin kommen später','Kommagetrennt; Label-Kommas','Nur Textprüfung.','Keine Liveansicht','Später weiterarbeiten'])assert.ok(!html.includes(prose),prose);
 for(const hook of ['form-errors','workspace-missing-media','character-hint','post-tags','idea-errors','channel-checks'])assert.ok(html.includes(`id="${hook}"`),hook);
 assert.match(html,/aria-describedby="variant-mode-hint character-hint"/);
 for(const removed of ['post-tags-hint','idea-tags-hint','idea-text-hint','visual-text-note'])assert.ok(!html.includes(removed),removed);
 assert.match(read('app.js'),/\(schreibgeschützt\)/);
 assert.doesNotMatch(read('app.js'),/\$\('\.preview-disclaimer'\)\.textContent/);
});
test('image, posting-time and workspace screens retain actionable states without tutorials',()=>{
 assert.doesNotMatch(read('image-studio.js'),/Ausschnitt im Bild ziehen|Der Text wird sichtbar|WENIGER KLICKS/);
 assert.match(read('image-studio.js'),/id="studio-status" role="status"/);
 assert.match(read('posting-times-ui.js'),/data-times-guard/);
 assert.doesNotMatch(read('posting-times-ui.js'),/Beiträge später selbst zuordnen/);
 assert.match(read('workspace-ui.js'),/Lokale Mediendateien fehlen/);
 assert.match(read('workspace-ui.js'),/Das Original wird nicht überschrieben/);
 assert.doesNotMatch(read('workspace-ui.js'),/Wiederherstellung: Was wird gesichert/);
});
