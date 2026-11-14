import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../../public/index.html',import.meta.url),'utf8');
const workspace=readFileSync(new URL('../../public/workspace-ui.js',import.meta.url),'utf8');
const reschedule=readFileSync(new URL('../../public/calendar-reschedule-ui.js',import.meta.url),'utf8');
test('replacement details are optional, removal and case sensitivity remain explicit',()=>{
 const block=html.split('<dialog id="draft-replace-dialog"')[1].split('</dialog>')[0];
 assert.match(block,/<label for="draft-replace-find">Suchen<\/label>/);
 assert.match(block,/<small id="draft-replace-match-help">Groß-\/Kleinschreibung beachten<\/small>/);
 assert.match(block,/<details class="ui-disclosure"><summary>Details<\/summary><p>Treffer werden/);
 assert.match(block,/aria-describedby="draft-replace-remove-help"/);
 assert.match(block,/<small id="draft-replace-remove-help">Leer = entfernen<\/small>/);
 for(const control of ['data-replace-preview','data-replace-confirm','data-replace-scope'])assert.ok(block.includes(control));
});
test('rescheduling retains explicit queue consequences and direction',()=>{
 assert.ok(html.includes('Beim Speichern wird der Beitrag aus der Queue gelöst.'));
 assert.ok(reschedule.includes("confirm.textContent='Im Editor prüfen'"));
 assert.ok(html.includes('2–50 feste Termine · Uhrzeit bleibt gleich · Queue unverändert'));
 assert.ok(html.includes('aria-describedby="date-shift-direction"'));
 assert.ok(html.includes('+ später · − früher'));
 assert.ok(html.includes('Keine automatische Veröffentlichung.'));
});
test('short recovery text still states missing files, non-overwrite and discard consequences',()=>{
 for(const text of ['Das Original wird nicht überschrieben.','Lokale Mediendateien fehlen. Wiederaufnahme gesperrt','Keine vollständige Wiederaufnahme möglich.','Danach nicht mehr wiederaufnehmbar. Daten und belegter Gesamtplatz bleiben erhalten.','Aktuelle Mediendaten übernehmen'])assert.ok(workspace.includes(text),text);
});
