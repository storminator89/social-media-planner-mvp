import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../../public/index.html',import.meta.url),'utf8');
const ui=readFileSync(new URL('../../public/planner-import-ui.js',import.meta.url),'utf8');
test('import uses minimal labelled controls and only on-demand status text',()=>{
 const dialog=html.slice(html.indexOf('<dialog id="planner-import-dialog"'),html.indexOf('</dialog>',html.indexOf('<dialog id="planner-import-dialog"')));
 for(const phrase of ['>Importieren</h2>','>Datei</label>','>Kanal</label>','>CSV-Vorlage</button>','data-csv-options hidden','data-import-confirm disabled','aria-labelledby="planner-import-title"','aria-label="Vorschau"','aria-label="Import schließen"','role="status" aria-live="polite"','accept="application/json,text/csv,.json,.csv"'])assert.ok(dialog.includes(phrase),phrase);
 assert.doesNotMatch(dialog,/<details|<summary|Formate und Grenzen|Schema 2|nichts überschreiben|Zielkanal für alle|Kein vollständiges Backup|nichts veröffentlicht/);
 assert.equal((dialog.match(/<p[ >]/g)||[]).length,1);
 assert.match(dialog,/<p data-import-status role="status" aria-live="polite"><\/p>/);
});
test('short uncertain-save message does not claim failure or invite blind retry',()=>{
 assert.match(ui,/Unklar, ob gespeichert\. Neu laden und Einträge prüfen\./);assert.match(ui,/busy\|\|attempted/);
});
