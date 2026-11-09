import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../../public/mastodon.html',import.meta.url),'utf8');
test('Mastodon redesign preserves unique flow hooks and accessible status',()=>{
 for(const id of ['start','refresh','status','confirmation','confirm','cancel','instance','revoke','recover','diagnose'])assert.equal((html.match(new RegExp(`id="${id}"`,'g'))||[]).length,1,id);
 assert.match(html,/id="status" role="status" aria-live="polite"/);
 assert.match(html,/id="refresh"[^>]+aria-label="Status aktualisieren"/);
 assert.match(html,/id="start"[^>]+disabled/);
 for(const id of ['confirmation','revoke','recover'])assert.match(html,new RegExp(`id="${id}"[^>]+hidden`));
});
test('Mastodon keeps informed consent and secondary tools in accessible disclosures',()=>{
 assert.match(html,/einmalige App-Registrierung bei kanoa.de/);
 assert.match(html,/verschlüsselt auf dem Server gespeichert/);
 assert.match(html,/Er bleibt bis zum Widerruf bestehen/);
 assert.match(html,/Versand gesperrt/);
 assert.match(html,/<details><summary>[\s\S]+id="diagnose"[\s\S]+<\/details>/);
 assert.match(html,/<details id="access-help">[\s\S]+id="recover"[\s\S]+<\/details>/);
 assert.doesNotMatch(html,/https?:\/\/[^<\s]+\.(?:js|css)/);
});
test('profile and publishing access remain explicitly separate without inventing publishing state',()=>{
 assert.match(html,/<h1>Mastodon<\/h1>/);assert.match(html,/Profilzugriff/);assert.match(html,/Veröffentlichungszugriff/);assert.match(html,/Status hier nicht geprüft/);assert.match(html,/Eine Profilverbindung schaltet ihn nicht frei/);assert.match(html,/Mit diesem Profilzugriff: Versand gesperrt/);assert.match(html,/href="\/mastodon-publish.html"/);assert.match(html,/<span>Status prüfen<\/span>/);
});
test('profile-only visual rules do not restyle publishing consent',()=>{const css=readFileSync(new URL('../../public/mastodon.css',import.meta.url),'utf8');assert.match(html,/<body class="profile-page">/);const publish=readFileSync(new URL('../../public/mastodon-publish.html',import.meta.url),'utf8');assert.doesNotMatch(publish,/<body class="profile-page">/);assert.match(css,/\.profile-page \.status-panel/);});
