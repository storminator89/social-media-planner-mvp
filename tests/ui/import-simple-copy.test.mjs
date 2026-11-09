import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../../public/index.html',import.meta.url),'utf8');
const ui=readFileSync(new URL('../../public/planner-import-ui.js',import.meta.url),'utf8');
test('simple import keeps boundaries visible without nested menus',()=>{
 const dialog=html.slice(html.indexOf('<dialog id="planner-import-dialog"'),html.indexOf('</dialog>',html.indexOf('<dialog id="planner-import-dialog"')));
 for(const phrase of ['Schema 2','1 MB','nichts überschreiben','Dateien mit Bildern','werden abgelehnt','Kein vollständiges Backup','Arbeitsfassungen','Kontozugriffe','Kanal-Einstellungen','nichts veröffentlicht'])assert.ok(dialog.includes(phrase),phrase);
 assert.doesNotMatch(dialog,/<details|<summary|hidden|<p><\/p>/);assert.match(dialog,/data-import-confirm disabled/);
});
test('short uncertain-save message does not claim failure or invite blind retry',()=>{
 assert.match(ui,/Import nicht bestätigt\. Möglicherweise wurde gespeichert\./);assert.match(ui,/Seite neu laden und Einträge prüfen/);assert.match(ui,/busy\|\|attempted/);
});
