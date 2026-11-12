import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectDraftCSV,parseDraftCSV,csvDraftState} from '../../public/planner-csv.js';
import {createDemoState} from '../../public/model.js';
import {previewPlanningImport,applyPlanningImport} from '../../public/planner-import.js';

const bad='Text,Tags,Image URL,Posting Time\r\nGood,,,\r\n"Hello\nthere",,,03/04/2035 12:30\r\nOther,,https://example.invalid/image.png,\r\nDate,,,2035-02-30 12:00';
test('collects row-level semantic errors without exposing valid subset',()=>{
 const before=bad;const r=inspectDraftCSV(bad);assert.deepEqual(r.issues.map(x=>x.entry),[2,3,4]);assert.deepEqual(r.entries,[]);assert.equal(r.total,4);assert.equal(bad,before);
 assert.match(r.issues[0].message,/Eintrag 2.*YYYY-MM-DD/);assert.match(r.issues[1].message,/Eintrag 3.*Bilder/);assert.match(r.issues[2].message,/Eintrag 4.*ungültig/);
 assert.throws(()=>parseDraftCSV(bad),{message:r.issues[0].message});
});
test('structural failure never attempts resynchronization',()=>{
 for(const source of ['Text\n"open','Text,Text\na,b','Text\n"closed"junk','Text\n\u0000'])assert.throws(()=>inspectDraftCSV(source));
});
test('no guess of ambiguous, Excel serial, or localized dates',()=>{
 for(const value of ['01/02/2035 12:00','02.01.2035 12:00','49244','2035-01-02T12:00','2035-01-02 12:00Z'])assert.equal(inspectDraftCSV(`Text,Posting Time\nx,${value}`).issues.length,1);
});
test('strict default and media-enabled inspection preserve blank rows',()=>{
 assert.deepEqual(inspectDraftCSV('Text\n""').issues.map(x=>x.entry),[1]);
 assert.deepEqual(inspectDraftCSV('Text\n""',{allowEmptyText:true}).entries,[{text:'',tags:[]}]);
});
test('semicolon, unicode, multiline and formulas remain literal',()=>{
 const source='Text;Tags;Posting Time\n"=HYPERLINK(\"\"x\"\")\nGrüße 😀";Tag;2035-06-10 12:30';
 const r=inspectDraftCSV(source);assert.equal(r.issues.length,0);assert.equal(r.entries[0].text,'=HYPERLINK("x")\nGrüße 😀');assert.equal(r.entries[0].postingTime,'2035-06-10T12:30');
});
test('correcting whole file preserves occurrence IDs and atomic reimport',async()=>{
 const state={...createDemoState(),posts:[]},before=structuredClone(state);
 await assert.rejects(csvDraftState(state,bad,'mastodon',{now:'2030-01-01T00:00:00.000Z',timezone:'UTC'}));assert.deepEqual(state,before);
 const text='Text\nSame\nSame\nOther';const imported=await csvDraftState(state,text,'mastodon',{now:'2030-01-01T00:00:00.000Z'});
 assert.match(imported.posts[0].id,/-1$/);assert.match(imported.posts[1].id,/-2$/);
 const saved=applyPlanningImport(state,previewPlanningImport(state,imported));
 const again=await csvDraftState(saved,text,'mastodon',{now:'2030-01-02T00:00:00.000Z'});const p=previewPlanningImport(saved,again);assert.equal(p.additions.length,0);assert.equal(p.duplicates.length,3);
});
