import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDraftCSV,csvDraftState} from '../../public/planner-csv.js';
import {createDemoState} from '../../public/model.js';
import {previewPlanningImport,applyPlanningImport,IMPORT_MAX_BYTES} from '../../public/planner-import.js';
const now='2030-01-01T00:00:00.000Z';
const state=()=>({...createDemoState(new Date(now)),posts:[],settings:{timezone:'Europe/Berlin'}});
const csvCell=x=>'"'+x.replaceAll('"','""')+'"';

test('CSV preserves literal Unicode, quotes, commas, whitespace and embedded line breaks',()=>{
 const body='  <img src=x onerror=evil> 👩‍💻, "Zitat"\r\n\n第二行  ';
 const rows=parseDraftCSV('\uFEFFText,Tags\r\n'+csvCell(body)+','+csvCell('Kampagne, "Label, mit Komma"')+'\r\n');
 assert.deepEqual(rows,[{text:body,tags:['Kampagne','Label, mit Komma']}]);
});
test('German Excel semicolon CSV is accepted from explicit header, without changing literal semicolons',()=>{
 assert.deepEqual(parseDraftCSV('Text;Tags\n"Hallo; Welt";Tipps\n'),[{text:'Hallo; Welt',tags:['Tipps']}]);
 assert.equal(parseDraftCSV('Text\nHallo; Welt')[0].text,'Hallo; Welt');
});
for(const [label,input] of [
 ['unknown header','Text,Title\nA,B'],['duplicate header','Text,Text\nA,A'],['wrong case','text\nA'],['prototype key','Text,__proto__\nA,B'],
 ['extra field','Text\nA,B'],['missing field','Text,Tags\nA'],['open quote','Text\n"A'],['unquoted quote','Text\nA"B'],['text after quote','Text\n"A"B'],
 ['empty file',''],['header only','Text\n'],['blank middle row','Text\nA\n\nB'],['empty text','Text,Tags\n ,Label'],['nul','Text\nA\u0000B'],['too long text','Text\n'+'A'.repeat(20001)],
 ['too many fields','Text,Tags,Image URL,Posting Time,Extra\nA,,,,'],['invalid labels','Text,Tags\nA,'+csvCell('"Open')],['too many labels','Text,Tags\nA,'+csvCell(Array.from({length:21},(_,i)=>'T'+i).join(','))]
])test(`CSV rejects ${label} as a whole`,()=>assert.throws(()=>parseDraftCSV(input)));
for(const [column,value] of [['Image URL','https://example.invalid/private.png']])test(`CSV refuses nonempty ${column}, never silently loses it`,()=>assert.throws(()=>parseDraftCSV(`Text,${column}\nValid,\nOther,${value}`),/Eintrag 2.*nicht unterstützt/));
test('Buffer text-only template with empty unsupported columns is accepted',()=>assert.deepEqual(parseDraftCSV('Text,Image URL,Tags,Posting Time\r\nHello,,Tag,\r\n'),[{text:'Hello',tags:['Tag']}]));
test('100 rows accepted, 101 rejected; UTF-8 byte bound applies before parsing',()=>{
 assert.equal(parseDraftCSV('Text\n'+Array(100).fill('A').join('\n')).length,100);
 assert.throws(()=>parseDraftCSV('Text\n'+Array(101).fill('A').join('\n')),/100/);
 assert.throws(()=>parseDraftCSV('é'.repeat(IMPORT_MAX_BYTES/2+1)),/1 MB/);
});
test('formula-like text remains literal and does not execute',()=>assert.equal(parseDraftCSV('Text\n"=HYPERLINK(""https://example.invalid"",""literal"")"')[0].text,'=HYPERLINK("https://example.invalid","literal")'));
test('one explicitly enabled channel, drafts only, no inherited schedule or media',async()=>{
 const current=state(),before=structuredClone(current),incoming=await csvDraftState(current,'Text,Tags\nOne,Label','mastodon',{now});
 assert.deepEqual(current,before);assert.equal(incoming.posts.length,1);assert.deepEqual(incoming.posts[0],{id:incoming.posts[0].id,title:'',text:'One',tags:['Label'],channels:['mastodon'],variantTexts:{},status:'draft',scheduleBinding:null,scheduledAt:null,scheduledInstant:null,timeZone:'Europe/Berlin',cover:null,mediaItems:[],createdAt:now,updatedAt:now});
 assert.match(incoming.posts[0].id,/^csv-[a-f0-9]{64}-1$/);
 for(const id of ['',null,'__proto__','unknown'])await assert.rejects(csvDraftState(current,'Text\nA',id));current.channels.find(c=>c.id==='mastodon').enabled=false;await assert.rejects(csvDraftState(current,'Text\nA','mastodon'));
});
test('stable IDs preserve repeated rows but detect reimport even after row reordering and timestamp updates',async()=>{
 const current=state(),first=await csvDraftState(current,'Text\nA\nA\nB','mastodon',{now}),preview=previewPlanningImport(current,first),saved=applyPlanningImport(current,preview);
 assert.equal(new Set(saved.posts.map(p=>p.id)).size,3);saved.posts.forEach(p=>p.updatedAt='2030-02-01T00:00:00.000Z');saved.revision++;
 const next=await csvDraftState(saved,'Text\nB\nA\nA','mastodon',{now:'2030-03-01T00:00:00.000Z'}),retry=previewPlanningImport(saved,next);assert.equal(retry.duplicates.length,3);assert.equal(retry.additions.length,0);
});
test('existing CSV draft edits are a conflict, never overwritten or duplicated silently',async()=>{
 const current=state(),incoming=await csvDraftState(current,'Text\nA\nB','mastodon',{now}),saved=applyPlanningImport(current,previewPlanningImport(current,incoming));saved.posts[0].text='Newer edited text';
 const retry=await csvDraftState(saved,'Text\nA\nB\nC','mastodon',{now});assert.throws(()=>previewPlanningImport(saved,retry),/Konflikt/);assert.equal(saved.posts.length,2);assert.equal(saved.posts[0].text,'Newer edited text');
});
test('channel choice is part of identity, current settings cannot silently retarget a prior import',async()=>{
 const current=state(),first=await csvDraftState(current,'Text\nA','mastodon',{now}),saved=applyPlanningImport(current,previewPlanningImport(current,first));saved.settings.timezone='Asia/Tokyo';
 const again=await csvDraftState(saved,'Text\nA','mastodon',{now});assert.equal(previewPlanningImport(saved,again).duplicates.length,1);assert.equal(again.posts[0].timeZone,'Europe/Berlin');
 const different=await csvDraftState(saved,'Text\nA','linkedin',{now});assert.notEqual(different.posts[0].id,first.posts[0].id);assert.equal(different.posts[0].timeZone,'Asia/Tokyo');
});
test('quota and stale-preview checks remain atomic',async()=>{
 const current=state(),incoming=await csvDraftState(current,'Text\nA\nB','mastodon',{now}),preview=previewPlanningImport(current,incoming);current.revision++;assert.throws(()=>applyPlanningImport(current,preview),/geändert/);
 const full=state();full.posts=Array.from({length:99},(_,i)=>({...incoming.posts[0],id:'old'+i}));assert.throws(()=>previewPlanningImport(full,incoming),/Grenze/);assert.equal(full.posts.length,99);
});
