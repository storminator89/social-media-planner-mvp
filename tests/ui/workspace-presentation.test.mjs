import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const ui=readFileSync(new URL('../../public/workspace-ui.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../../public/index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../../public/workspace.css',import.meta.url),'utf8');
test('workspace overview labels confirmed recovery without claiming every edit is saved',()=>{
 assert.match(ui,/Noch keine aktive Arbeitsfassung/);
 assert.match(ui,/Genutzte Arbeitsfassungen/);
 assert.match(ui,/esc\(list.capacity.active\)/);
 assert.match(ui,/esc\(list.capacity.total\)/);
 assert.doesNotMatch(ui,/Änderungen im Beitragseditor werden separat gesichert/);
});
test('workspace presentation retains recovery and uncertainty boundaries',()=>{
 for(const message of ['Das Original wird nicht überschrieben.','Lokale Mediendateien fehlen.','Aktuelle Mediendaten übernehmen','Das Verwerfen dieser Arbeitsfassung ist noch unklar. Es wird nichts erneut gesendet.','Die Gesamtgrenze ist erreicht. Verwerfen gibt keinen neuen Gesamtplatz frei.','Wiederaufnahme: 30 Tage']) assert.ok(ui.includes(message),message);
 for(const action of ['restore-source','restore-copy','reconcile-discard','copy-server','discard-confirm'])assert.ok(ui.includes(action));
});
test('dialog keeps labelled title, accessible close action and bounded small-screen layout',()=>{
 assert.match(html,/aria-labelledby="workspace-title"/);
 assert.match(html,/data-workspace-action="close" aria-label="Arbeitsfassungen schließen"/);
 assert.match(css,/max-height:calc\(100dvh - 20px\)/);
 assert.match(css,/overflow-y:auto/);
 assert.match(css,/\.workspace-policy summary/);
});
