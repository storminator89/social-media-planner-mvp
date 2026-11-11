import test from 'node:test';import assert from 'node:assert/strict';
import {createDemoState,normalizeState} from '../../public/model.js';
import {parsePlanningExport,previewPlanningImport,applyPlanningImport,IMPORT_MAX_BYTES} from '../../public/planner-import.js';
const current=()=>({...createDemoState(new Date('2030-01-01T12:00:00Z')),settings:{timezone:'Europe/Berlin'},posts:[],revision:4});
const post=(id='p1')=>({id,title:'Test',text:'<script>alert(1)</script>',tags:['Label'],channels:['mastodon'],variantTexts:{mastodon:'Eigener Text'},status:'draft',scheduleBinding:null,scheduledAt:null,scheduledInstant:null,timeZone:'Europe/Berlin',cover:null,mediaItems:[],createdAt:'2030-01-01T12:00:00.000Z',updatedAt:'2030-01-01T12:00:00.000Z'});
const exported=(p=post())=>({...current(),posts:[p],exportedAt:'2030-01-01T12:00:00.000Z'});
test('strict round-trip retains text, labels, variants and adds without replacing current data',()=>{const cur=current();cur.posts=[post('existing')];const data=parsePlanningExport(JSON.stringify(exported()));const preview=previewPlanningImport(cur,data),next=applyPlanningImport(cur,preview);assert.deepEqual(next.posts[0],cur.posts[0]);assert.deepEqual(next.posts[1],post());assert.deepEqual(next.settings,cur.settings);assert.deepEqual(next.channels,cur.channels);assert.equal(cur.posts.length,1);});
test('identical ids skip, changed ids and duplicate file ids fail atomically',()=>{const cur=current();cur.posts=[post()];const data=parsePlanningExport(JSON.stringify(exported()));assert.equal(previewPlanningImport(cur,data).duplicates.length,1);data.posts[0].text='changed';assert.throws(()=>previewPlanningImport(cur,data),/Konflikt/);const raw=exported();raw.posts.push(post());assert.throws(()=>parsePlanningExport(JSON.stringify(raw)));});
test('malformed, dangerous, oversized, future and unknown fields fail closed',()=>{for(const text of ['{','{"schemaVersion":3,"schemaVersion":3}','null','[]','{"__proto__":{"polluted":true}}','{"constructor":{}}','x'.repeat(IMPORT_MAX_BYTES+1)])assert.throws(()=>parsePlanningExport(text));assert.equal({}.polluted,undefined);for(const edit of [x=>x.schemaVersion=4,x=>x.extra='hidden',x=>x.posts[0].attachments=[],x=>x.posts[0].text=42,x=>x.posts[0].title=null,x=>x.posts[0].tags=null,x=>x.posts[0].variantTexts.linkedin='unselected',x=>x.posts[0].createdAt=null,x=>x.posts[0].createdAt='2030-02-30T12:00:00.000Z',x=>delete x.posts[0].title,x=>x.posts[0].timeZone='No/SuchZone',x=>x.posts[0].media={url:'https://evil.invalid/a.jpg'},x=>x.posts[0].media={dataUrl:'data:image/png;base64,eA=='},x=>x.posts[0].cover='forms',x=>x.posts[0].scheduleBinding={}]){const raw=exported();edit(raw);assert.throws(()=>parsePlanningExport(JSON.stringify(raw)));}});
test('manual schedule preserves exact UTC meaning without trusting foreign fixed instant',()=>{const p=post();Object.assign(p,{status:'scheduled',scheduledAt:'2030-01-15T12:00',scheduledInstant:'2030-01-15T11:00:00.000Z'});const data=parsePlanningExport(JSON.stringify(exported(p)));const preview=previewPlanningImport(current(),data);assert.equal(preview.additions[0].scheduledInstant,null);assert.equal(preview.expectedInstants.p1,'2030-01-15T11:00:00.000Z');assert.equal(preview.additions[0].scheduledAt,p.scheduledAt);data.posts[0].scheduledInstant='2030-01-15T12:00:00.000Z';assert.throws(()=>previewPlanningImport(current(),data));});
test('preview refuses concurrent local revision/content change and capacity overflow',()=>{const cur=current(),data=parsePlanningExport(JSON.stringify(exported())),p=previewPlanningImport(cur,data);assert.throws(()=>applyPlanningImport({...cur,revision:5},p));const changed=structuredClone(cur);changed.settings.timezone='UTC';assert.throws(()=>applyPlanningImport(changed,p));cur.posts=Array.from({length:100},(_,i)=>post('old'+i));assert.throws(()=>previewPlanningImport(cur,data));});
test('ambiguous DST schedule is not silently moved',()=>{const p=post();Object.assign(p,{status:'scheduled',scheduledAt:'2030-10-27T02:30',scheduledInstant:'2030-10-27T00:30:00.000Z'});const data=parsePlanningExport(JSON.stringify(exported(p)));assert.throws(()=>previewPlanningImport(current(),data));});

test('duplicate known keys including escaped aliases are rejected even with identical values',()=>{
 const text=JSON.stringify(exported());assert.throws(()=>parsePlanningExport(text.replace('"schemaVersion":3','"schemaVersion":3,"schemaVersion":3')));
 assert.throws(()=>parsePlanningExport(text.replace('"schemaVersion":3','"schemaVersion":3,"\\u0073chemaVersion":3')));
});

test('strict parser rejects duplicate escaped nested keys, deep structures and oversized UTF-8 before normalization',()=>{
 const json=JSON.stringify(exported());
 for(const source of [json.replace('"timezone":','"timezone":"UTC","\\u0074imezone":'),json.replace('"variantTexts":{','"variantTexts":{"mastodon":"different",'),json.replace('"variantTexts":{','"variantTexts":{"\\u005f_proto__":1,'),'['.repeat(25)+'0'+']'.repeat(25),'"'+'é'.repeat(IMPORT_MAX_BYTES/2)+'"'])assert.throws(()=>parsePlanningExport(source));
});
test('unknown nested channel, settings and entry fields are not silently dropped',()=>{
 for(const mutate of [x=>x.settings.locale='de',x=>x.channels[0].credentials={},x=>x.posts[0].publishNow=true,x=>x.posts[0].attachments=null,x=>x.posts[0].variantTexts.mastodon=12,x=>x.posts[0].channels=['mastodon','mastodon'],x=>x.posts[0].status='published']){
  const raw=exported();mutate(raw);assert.throws(()=>parsePlanningExport(JSON.stringify(raw)));
 }
});
test('preview and apply leave source exports and current state untouched, retaining empty explicit variants and literal Unicode',()=>{
 const cur=current(),raw=exported({...post(),text:'Literal <b>Text</b> 👩‍💻\n第二行',variantTexts:{mastodon:''}}),incoming=parsePlanningExport(JSON.stringify(raw)),beforeCurrent=structuredClone(cur),beforeIncoming=structuredClone(incoming);
 const preview=previewPlanningImport(cur,incoming),result=applyPlanningImport(cur,preview);assert.deepEqual(cur,beforeCurrent);assert.deepEqual(incoming,beforeIncoming);assert.equal(result.posts[0].variantTexts.mastodon,'');assert.equal(result.posts[0].text,raw.posts[0].text);
 result.posts[0].tags.push('new');assert.deepEqual(preview.additions[0].tags,['Label']);assert.deepEqual(incoming.posts[0].tags,['Label']);
});
test('same revision does not allow stale import after existing post, channel or settings changes',()=>{
 for(const mutate of [s=>s.settings.timezone='UTC',s=>s.channels[0].name='Changed',s=>s.posts[0].text='Changed']){
  const cur=current();cur.posts=[post('existing')];const preview=previewPlanningImport(cur,parsePlanningExport(JSON.stringify(exported())));const changed=structuredClone(cur);mutate(changed);assert.throws(()=>applyPlanningImport(changed,preview),/geändert/);
 }
});
test('one conflicting ID blocks all otherwise valid additions without replacing or removing current records',()=>{
 const cur=current();cur.posts=[post('existing')];const raw=exported();raw.posts.push({...post('existing'),text:'Conflict'});const before=structuredClone(cur);assert.throws(()=>previewPlanningImport(cur,parsePlanningExport(JSON.stringify(raw))),/Kein Überschreiben, kein Teilimport/);assert.deepEqual(cur,before);
});
test('manual UTC expectations are stable across positive, negative and fractional offsets',()=>{
 for(const [timeZone,scheduledAt,scheduledInstant]of [['Europe/Berlin','2030-07-15T12:00','2030-07-15T10:00:00.000Z'],['America/New_York','2030-01-15T12:00','2030-01-15T17:00:00.000Z'],['Asia/Kathmandu','2030-01-15T12:00','2030-01-15T06:15:00.000Z']]){
  const value={...post(),status:'scheduled',timeZone,scheduledAt,scheduledInstant};const incoming=parsePlanningExport(JSON.stringify(exported(value))),preview=previewPlanningImport(current(),incoming);assert.equal(preview.expectedInstants.p1,scheduledInstant);assert.equal(preview.additions[0].scheduledInstant,null);assert.equal(incoming.posts[0].scheduledInstant,scheduledInstant);
 }
 const gap={...post(),status:'scheduled',scheduledAt:'2030-03-31T02:30',scheduledInstant:null};assert.throws(()=>parsePlanningExport(JSON.stringify(exported(gap))));
});

 test('explicit legacy schema2 text exports normalize to schema3 without dropping content',()=>{const legacy=exported();legacy.schemaVersion=2;for(const p of legacy.posts){delete p.mediaItems;p.media=null;}const incoming=parsePlanningExport(JSON.stringify(legacy));assert.equal(incoming.schemaVersion,3);assert.deepEqual(incoming.posts[0],post());assert.equal(Object.hasOwn(incoming.posts[0],'media'),false);const currentState=current(),preview=previewPlanningImport(currentState,incoming);assert.deepEqual(applyPlanningImport(currentState,preview).posts,[post()]);});

test('archive export including mixed active records rejects before import preview',()=>{const raw=exported({...post(),status:'archived'});raw.posts.push(post('active'));assert.throws(()=>parsePlanningExport(JSON.stringify(raw)),/Archivierte Beiträge werden nicht importiert/);});
