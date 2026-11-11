import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDraftCSV,csvDraftState,validateCSVImportTimes} from '../../public/planner-csv.js';
import {createDemoState} from '../../public/model.js';
import {previewPlanningImport,applyPlanningImport} from '../../public/planner-import.js';
const now='2030-01-01T00:00:00.000Z';
const state=()=>({...createDemoState(new Date(now)),posts:[],settings:{timezone:'Europe/Berlin'}});
const raw=(time='2030-04-06 09:00',body='Same')=>`Text,Tags,Posting Time\n${body},Tag,${time}`;
const incoming=(current,text,timezone='Europe/Berlin',time=now)=>csvDraftState(current,text,'mastodon',{now:time,timezone});

test('strict Buffer local minute syntax and optional mixed draft rows',()=>{
 assert.deepEqual(parseDraftCSV('Text;Posting Time;Tags\r\nOne;2030-04-06 09:00;Tag\r\nTwo;;\r\nThree;  ;'),[{text:'One',tags:['Tag'],postingTime:'2030-04-06T09:00'},{text:'Two',tags:[]},{text:'Three',tags:[]}]);
});
for(const value of ['2030-04-06T09:00','2030-04-06T09:00:00Z','2030-04-06T09:00:00+02:00','2030-04-06 09:00:00','2030-4-06 09:00','2030-04-6 09:00','2030-04-06 9:00','2030-04-06 09:0',' 2030-04-06 09:00','2030-04-06 09:00 ','04/06/2030 09:00','46200','tomorrow','2030-02-29 09:00','2030-02-30 09:00','2030-13-01 09:00','2030-04-06 24:00','2030-04-06 09:60','0999-04-06 09:00'])test(`reject noncanonical or impossible date: ${value}`,()=>assert.throws(()=>parseDraftCSV(raw(value)),/Eintrag 1/));
test('unknown time/zone/status headers remain errors, no ignored columns',()=>{
 for(const column of ['Timezone','Time Zone','time','posting time','Status','Schedule'])assert.throws(()=>parseDraftCSV(`Text,${column}\nOne,`),/CSV-Spalten/);
});
test('explicit zone is mandatory only for timed rows and invalid zones never default',async()=>{
 for(const timezone of [undefined,null,'','CET+1','+02:00','No/SuchZone'])await assert.rejects(incoming(state(),raw(),timezone===undefined?null:timezone),/Zeitzone/);
 const drafts=await csvDraftState(state(),raw(''),'mastodon',{now});assert.equal(drafts.posts[0].status,'draft');
});
test('unique resolution covers seasonal, negative and fractional offsets without changing planner timezone',async()=>{
 for(const [time,zone,instant] of [['2030-01-15 12:00','Europe/Berlin','2030-01-15T11:00:00.000Z'],['2030-07-15 12:00','Europe/Berlin','2030-07-15T10:00:00.000Z'],['2030-01-15 12:00','America/New_York','2030-01-15T17:00:00.000Z'],['2030-01-15 12:00','Asia/Kathmandu','2030-01-15T06:15:00.000Z']]){
  const current=state(),before=structuredClone(current),file=await incoming(current,raw(time),zone),preview=previewPlanningImport(current,file),post=preview.additions[0];
  assert.equal(preview.expectedInstants[post.id],instant);assert.equal(post.scheduledAt,time.replace(' ','T'));assert.equal(post.scheduledInstant,null);assert.equal(post.scheduleBinding,null);assert.equal(post.status,'scheduled');assert.deepEqual(post.channels,['mastodon']);assert.deepEqual(current,before);assert.equal(applyPlanningImport(current,preview).settings.timezone,'Europe/Berlin');
 }
});
test('DST gap and overlap reject whole mixed import, never earlier/later guessing',async()=>{
 for(const value of ['2030-03-31 02:30','2030-10-27 02:30']){const current=state(),before=structuredClone(current);await assert.rejects(incoming(current,'Text,Posting Time\nDraft,\nTimed,'+value),/Eintrag 2.*Zeitumstellung/);assert.deepEqual(current,before);}
});
test('blank-time IDs stay byte-identical, timed IDs are separate and bind content/zone/instant',async()=>{
 const draft=(await incoming(state(),raw(''))).posts[0];assert.equal(draft.id,'csv-8c6d65681879154aaf88021d9ee2b60c46262de8e11a7bac87a66c870f4e3c4f-1');
 const original=(await incoming(state(),raw())).posts[0];assert.match(original.id,/^csv-time-[a-f0-9]{64}-1$/);
 const different=[(await incoming(state(),raw('2030-04-06 09:01'))).posts[0],(await incoming(state(),raw(),'UTC')).posts[0],(await incoming(state(),raw('2030-04-06 09:00','Other'))).posts[0],(await csvDraftState(state(),raw(),'linkedin',{now,timezone:'Europe/Berlin'})).posts[0]];
 for(const post of [draft,...different])assert.notEqual(post.id,original.id);
 const same=(await incoming(state(),raw(),'Europe/Berlin','2030-02-01T00:00:00.000Z')).posts[0];assert.equal(same.id,original.id);
});
test('mixed rows and reordering retain occurrence identities; elapsed duplicates stay no-op',async()=>{
 const current=state(),source='Text,Posting Time\nA,2030-04-06 09:00\nB,\nA,2030-04-06 09:00',file=await incoming(current,source),preview=previewPlanningImport(current,file),saved=applyPlanningImport(current,preview);saved.revision++;for(const p of saved.posts){p.updatedAt='2030-06-01T00:00:00.000Z';if(p.status==='scheduled')p.scheduledInstant=preview.expectedInstants[p.id];}
 const retry=previewPlanningImport(saved,await incoming(saved,'Text,Posting Time\nB,\nA,2030-04-06 09:00\nA,2030-04-06 09:00','Europe/Berlin','2030-06-01T00:00:00.000Z'));assert.equal(retry.additions.length,0);assert.equal(retry.duplicates.length,3);assert.deepEqual({...retry.expectedInstants},{});validateCSVImportTimes(retry,new Date('2031-01-01'));
 const mixed=previewPlanningImport(saved,await incoming(saved,source+'\nLater,2032-01-15 12:00','Europe/Berlin','2031-01-01T00:00:00.000Z'));assert.equal(mixed.additions.length,1);assert.equal(mixed.duplicates.length,3);validateCSVImportTimes(mixed,new Date('2031-01-01'));
});
test('new past or exactly-now time blocks all rows, while elapsed confirmation is rechecked',async()=>{
 for(const time of ['2029-12-31 23:59','2030-01-01 00:00'])await assert.rejects(incoming(state(),raw(time),'UTC'),/Zukunft/);
 const current=state(),preview=previewPlanningImport(current,await incoming(current,raw('2030-01-01 00:01'),'UTC'));validateCSVImportTimes(preview,new Date(now));assert.throws(()=>validateCSVImportTimes(preview,new Date('2030-01-01T00:01:00.000Z')),/Zukunft/);assert.throws(()=>validateCSVImportTimes(preview,new Date('invalid')),/Importzeit/);
});
test('edits to an existing scheduled CSV row conflict and block mixed additions',async()=>{
 const current=state(),file=await incoming(current,raw()),saved=applyPlanningImport(current,previewPlanningImport(current,file));saved.posts[0].text='Edited';const before=structuredClone(saved),retry=await incoming(saved,raw()+'\nNew,Tag,2030-04-06 10:00');assert.throws(()=>previewPlanningImport(saved,retry),/Konflikt/);assert.deepEqual(saved,before);
});
test('scheduled text limits apply; unbound draft limits remain unchanged',async()=>{
 await assert.rejects(incoming(state(),raw('2030-04-06 09:00','A'.repeat(501))),/maximal 500/);assert.equal((await incoming(state(),raw('','A'.repeat(501)))).posts[0].status,'draft');
});
test('tampered expected instants fail confirmation without mutating planner',async()=>{
 const current=state(),preview=previewPlanningImport(current,await incoming(current,raw()));preview.expectedInstants[preview.additions[0].id]='2030-04-06T08:00:00.000Z';assert.throws(()=>validateCSVImportTimes(preview,new Date(now)),/Terminvorschau/);assert.equal(current.posts.length,0);
});
