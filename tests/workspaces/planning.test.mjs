import test from 'node:test';
import assert from 'node:assert/strict';
import {payloadSnapshot,WORKSPACE_LIMITS} from '../../modules/workspaces/workspace-domain.mjs';
import {createEditorWorkspaceApi} from '../../modules/workspaces/workspace-api.mjs';
import {normalizeWorkspacePayload as legacyClientPayload} from './fixtures/legacy-workspace-client-v0.8.0.mjs';
import {setup,payload,saveInput,discardInput,uuid,row,errorCode} from './support.mjs';

const instant='2026-10-25T01:30:00.000Z';
const planning=()=>({schemaVersion:1,scheduledInstant:instant,scheduleBinding:{schemaVersion:1,mode:'queue',instant,selectedAt:'2026-10-01T08:14:37.123Z',sourceRevision:7,refs:[{channelId:'youtube',slotId:'fold',local:'2026-10-25T02:30',timezone:'Europe/Berlin',overlapChoice:'later',minimumGapMinutes:30},{channelId:'linkedin',slotId:'utc',local:'2026-10-25T01:30',timezone:'UTC',overlapChoice:'reject',minimumGapMinutes:0}]}});
const cleared=()=>({schemaVersion:1,scheduledInstant:null,scheduleBinding:null});
const rich=(overrides={})=>payload({planning:planning(),...overrides});
const plain=value=>JSON.parse(JSON.stringify(value));
const fixed=()=>({schemaVersion:1,scheduledInstant:'2026-10-25T01:30:37.123Z',scheduleBinding:null});

test('legacy presence stays absent and richer payload fails closed in old strict client',()=>{
 const p=payload(),got=payloadSnapshot(p);assert.equal(JSON.stringify(got),JSON.stringify(p));assert.equal(Object.hasOwn(got,'planning'),false);
 assert.deepEqual(legacyClientPayload(p).text,p.text);assert.throws(()=>legacyClientPayload(rich()));
 assert.notEqual(JSON.stringify(payloadSnapshot(payload())),JSON.stringify(payloadSnapshot(rich({planning:cleared()}))));
});
test('planning retains exact fold instant, seconds and milliseconds, ref order, and incomplete raw input',()=>{
 for(const p of [rich(),rich({planning:fixed()}),rich({planning:cleared()}),rich({channels:[],activeTextTarget:'base',date:'incomplete',time:'25:',timeZone:''})])assert.deepEqual(plain(payloadSnapshot(p)),p);
 const p=rich(),got=payloadSnapshot(p);p.planning.scheduleBinding.refs[0].slotId='changed';assert.equal(got.planning.scheduleBinding.refs[0].slotId,'fold');
});
test('both explicit fold branches roundtrip without resolving a different instant',()=>{
 const p=rich();p.planning.scheduledInstant=p.planning.scheduleBinding.instant='2026-10-25T00:30:00.000Z';p.planning.scheduleBinding.refs[0].overlapChoice='earlier';p.planning.scheduleBinding.refs[1].local='2026-10-25T00:30';assert.deepEqual(plain(payloadSnapshot(p)),p);
});
const invalid={
 planningNull:p=>p.planning=null,
 planningUndefined:p=>p.planning=undefined,
 missingInstant:p=>delete p.planning.scheduledInstant,
 missingBinding:p=>delete p.planning.scheduleBinding,
 planningVersion:p=>p.planning.schemaVersion=2,
 planningUnknown:p=>p.planning.extra='lost',
 planningSymbol:p=>p.planning[Symbol('hidden')]='lost',
 planningHidden:p=>Object.defineProperty(p.planning,'extra',{value:'lost'}),
 planningPrototype:p=>Object.setPrototypeOf(p.planning,{extra:1}),
 bindingUnknown:p=>p.planning.scheduleBinding.extra='lost',
 bindingVersion:p=>p.planning.scheduleBinding.schemaVersion=2,
 bindingMode:p=>p.planning.scheduleBinding.mode='fixed',
 bindingSourceNegative:p=>p.planning.scheduleBinding.sourceRevision=-1,
 bindingSourceUnsafe:p=>p.planning.scheduleBinding.sourceRevision=Number.MAX_SAFE_INTEGER+1,
 bindingSourceFloat:p=>p.planning.scheduleBinding.sourceRevision=1.5,
 bindingMissing:p=>delete p.planning.scheduleBinding.selectedAt,
 bindingInstantMismatch:p=>p.planning.scheduledInstant='2026-10-25T00:30:00.000Z',
 bindingNullInstant:p=>p.planning.scheduledInstant=null,
 bindingInstantOffset:p=>p.planning.scheduleBinding.instant='2026-10-25T02:30:00.000+01:00',
 selectionNoncanonical:p=>p.planning.scheduleBinding.selectedAt='2026-10-01T08:14:37Z',
 selectionBadDate:p=>p.planning.scheduleBinding.selectedAt='2026-02-30T00:00:00.000Z',
 selectionControl:p=>p.planning.scheduleBinding.selectedAt='2026-10-01T08:14:37.123Z\n',
 refsEmpty:p=>p.planning.scheduleBinding.refs=[],
 refsDuplicate:p=>p.planning.scheduleBinding.refs[1].channelId='youtube',
 refsTooMany:p=>p.planning.scheduleBinding.refs=Array.from({length:21},(_,i)=>({...p.planning.scheduleBinding.refs[0],channelId:`c${i}`})),
 refsHoles:p=>p.planning.scheduleBinding.refs=new Array(1),
 refsHiddenIndex:p=>Object.defineProperty(p.planning.scheduleBinding.refs,'0',{enumerable:false}),
 refsExtra:p=>p.planning.scheduleBinding.refs.extra='lost',
 refsSymbol:p=>p.planning.scheduleBinding.refs[Symbol('hidden')]='lost',
 refUnknown:p=>p.planning.scheduleBinding.refs[0].extra='lost',
 refMissing:p=>delete p.planning.scheduleBinding.refs[0].slotId,
 refSymbol:p=>p.planning.scheduleBinding.refs[0][Symbol('hidden')]='lost',
 refPrototype:p=>Object.setPrototypeOf(p.planning.scheduleBinding.refs[0],{extra:1}),
 refChannelControl:p=>p.planning.scheduleBinding.refs[0].channelId='youtube\n',
 refSlotOversize:p=>p.planning.scheduleBinding.refs[0].slotId='x'.repeat(101),
 refLocalControl:p=>p.planning.scheduleBinding.refs[0].local='2026-10-25T02:30\n',
 refZoneControl:p=>p.planning.scheduleBinding.refs[0].timezone='Europe/Berlin\u0000',
 refZoneC1:p=>p.planning.scheduleBinding.refs[0].timezone='Europe/Berlin\u0085',
 refZoneOversize:p=>p.planning.scheduleBinding.refs[0].timezone='x'.repeat(101),
 refZoneInvalid:p=>p.planning.scheduleBinding.refs[0].timezone='No/Zone',
 refGapOversize:p=>p.planning.scheduleBinding.refs[0].minimumGapMinutes=1441,
 refGapFloat:p=>p.planning.scheduleBinding.refs[0].minimumGapMinutes=.5,
 refFoldReject:p=>p.planning.scheduleBinding.refs[0].overlapChoice='reject',
 refFoldWrongBranch:p=>p.planning.scheduleBinding.refs[0].overlapChoice='earlier',
 refInstantMismatch:p=>p.planning.scheduleBinding.refs[1].local='2026-10-25T03:30',
};
for(const [name,change] of Object.entries(invalid))test(`planning rejects ${name}`,()=>{const p=rich();change(p);assert.throws(()=>payloadSnapshot(p),errorCode('WORKSPACE_INPUT_INVALID'));});
test('no nested accessors or coercion hooks execute',()=>{
 let calls=0;const accessor={enumerable:true,get(){calls++;throw Error('PRIVATE_ACCESSOR');}};
 for(const change of [p=>Object.defineProperty(p,'planning',accessor),p=>Object.defineProperty(p.planning,'scheduledInstant',accessor),p=>Object.defineProperty(p.planning,'scheduleBinding',accessor),p=>Object.defineProperty(p.planning.scheduleBinding,'refs',accessor),p=>Object.defineProperty(p.planning.scheduleBinding.refs,'0',accessor),p=>Object.defineProperty(p.planning.scheduleBinding.refs[0],'local',accessor),p=>p.planning.scheduleBinding.refs[0].timezone={toString(){calls++;return 'UTC';}},p=>p.planning.scheduleBinding.refs[0].local={toString(){calls++;return '2026-10-25T02:30';}},p=>Object.defineProperty(p.planning.scheduleBinding,'toJSON',accessor)]){const p=rich();change(p);assert.throws(()=>payloadSnapshot(p),errorCode('WORKSPACE_INPUT_INVALID'));}assert.equal(calls,0);
});
test('timestamps are canonical exact UTC without correcting invalid dates or coercing values',()=>{
 for(const scheduledInstant of ['2026-02-30T01:30:00.000Z','2026-10-25T24:00:00.000Z','2026-10-25T01:30:60.000Z','2026-10-25T01:30:00Z','2026-10-25T01:30:00.0Z','2026-10-25T02:30:00.000+01:00','2026-10-25t01:30:00.000z','2026-10-25T01:30:00.000Z\n','\ud800',0,{},new Date(instant)])assert.throws(()=>payloadSnapshot(rich({planning:{...fixed(),scheduledInstant}})),errorCode('WORKSPACE_INPUT_INVALID'));
});
test('maximal 20-reference snapshot fits and new planning counts toward existing byte cap',()=>{
 const p=rich();p.planning.scheduleBinding.refs=Array.from({length:20},(_,i)=>({...planning().scheduleBinding.refs[0],channelId:`c${i}`}));assert.deepEqual(plain(payloadSnapshot(p)),p);
 const base=payload({variantTexts:Object.fromEntries(Array.from({length:7},(_,i)=>[`c${i}`,'x'.repeat(18000)]))});const bytes=new TextEncoder().encode(JSON.stringify(payloadSnapshot(base))).length;base.text+='x'.repeat(WORKSPACE_LIMITS.jsonBytes-bytes);assert.equal(new TextEncoder().encode(JSON.stringify(payloadSnapshot(base))).length,WORKSPACE_LIMITS.jsonBytes);assert.throws(()=>payloadSnapshot({...base,planning:cleared()}),errorCode('WORKSPACE_TOO_LARGE'));
});
test('legacy save/read bytes stay exact; explicit first rich write upgrades only that workspace',async()=>{
 const {repo,db}=setup();const legacy=await repo.save('alice',saveInput()),raw=row(db).payload_json;assert.equal(Object.hasOwn(legacy.workspace.payload,'planning'),false);assert.equal(Object.hasOwn((await repo.load('alice',uuid(1))).workspace.payload,'planning'),false);await repo.list('alice');assert.equal(row(db).payload_json,raw);
 const input=saveInput({expectedRevision:1,writeId:uuid(101),payload:rich()}),out=await repo.save('alice',input);assert.deepEqual(plain(out.workspace.payload),input.payload);assert.deepEqual(await repo.load('alice',uuid(1)),out);assert.equal(out.workspace.revision,2);
});
test('cached legacy PUT after rich save returns fixed schema409 for matching and stale revisions without mutation',async()=>{
 const {repo,db,setNow}=setup();await repo.save('alice',saveInput());await repo.save('alice',saveInput({expectedRevision:1,writeId:uuid(101),payload:rich()}));const before={...row(db)};setNow(2_000_000);
 for(const expectedRevision of [0,1,2])await assert.rejects(repo.save('alice',saveInput({expectedRevision,writeId:uuid(102)})),e=>e.status===409&&e.code==='WORKSPACE_SCHEMA_CHANGED'&&!Object.hasOwn(e,'details'));assert.deepEqual({...row(db)},before);
});
test('downgrade predicate observes richer data added at batch boundary, not a pre-read',async()=>{
 const {repo,db}=setup();await repo.save('alice',saveInput());db.beforeBatch=()=>{const p=JSON.parse(row(db).payload_json);p.planning=planning();db.sql.prepare('UPDATE planner_editor_workspaces SET payload_json=? WHERE owner_id=?').run(JSON.stringify(p),'alice');};
 await assert.rejects(repo.save('alice',saveInput({expectedRevision:1,writeId:uuid(101)})),errorCode('WORKSPACE_SCHEMA_CHANGED'));assert.equal(row(db).revision,1);assert.equal(row(db).last_write_id,uuid(100));assert.deepEqual(JSON.parse(row(db).payload_json).planning,planning());
});
test('concurrent rich/legacy upgrade preserves the exact CAS winner in either hash order',async()=>{
 const {repo}=setup();await repo.save('alice',saveInput());
 const inputs=[saveInput({expectedRevision:1,writeId:uuid(101),payload:rich()}),saveInput({expectedRevision:1,writeId:uuid(102)})];
 const results=await Promise.allSettled(inputs.map(input=>repo.save('alice',input)));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const winner=results.findIndex(r=>r.status==='fulfilled'),loser=1-winner;
 // Both requests hash asynchronously. Legacy can legitimately win before rich
 // context exists; only a legacy write after a rich winner is a downgrade.
 assert.equal(results[loser].reason.status,409);
 assert.equal(results[loser].reason.code,winner===0?'WORKSPACE_SCHEMA_CHANGED':'WORKSPACE_CONFLICT');
 const saved=results[winner].value,loaded=await repo.load('alice',uuid(1));
 assert.equal(saved.workspace.revision,2);assert.equal(saved.workspace.writeId,inputs[winner].writeId);
 assert.deepEqual(plain(saved.workspace.payload),inputs[winner].payload);assert.deepEqual(loaded,saved);
 assert.equal(Object.hasOwn(loaded.workspace.payload,'planning'),winner===0);
});
test('new clients can clear explicitly but presence remains protected and receipts bind all planning data',async()=>{
 const {repo,db}=setup();const original=saveInput({payload:rich()});await repo.save('alice',original);
 for(const plan of [cleared(),fixed(),{...planning(),scheduleBinding:{...planning().scheduleBinding,selectedAt:'2026-10-01T08:14:37.124Z'}},{...planning(),scheduleBinding:{...planning().scheduleBinding,refs:[...planning().scheduleBinding.refs].reverse()}}])await assert.rejects(repo.save('alice',{...original,payload:rich({planning:plan})}),errorCode('WORKSPACE_WRITE_ID_REUSED'));
 const input=saveInput({expectedRevision:1,writeId:uuid(101),payload:rich({planning:cleared()})}),saved=await repo.save('alice',input);assert.deepEqual(plain(saved.workspace.payload.planning),cleared());const before={...row(db)};assert.deepEqual(await repo.save('alice',input),saved);await assert.rejects(repo.save('alice',saveInput({expectedRevision:2,writeId:uuid(102)})),errorCode('WORKSPACE_SCHEMA_CHANGED'));assert.deepEqual({...row(db)},before);
});
test('omitted and explicit-null planning are different exact write receipts',async()=>{
 const {repo}=setup();const input=saveInput();await repo.save('alice',input);await assert.rejects(repo.save('alice',{...input,payload:rich({planning:cleared()})}),errorCode('WORKSPACE_WRITE_ID_REUSED'));assert.equal(Object.hasOwn((await repo.load('alice',uuid(1))).workspace.payload,'planning'),false);
});
test('lost commit exact readback preserves presence/context and cannot confirm another attempt',async()=>{
 for(const p of [payload(),rich(),rich({planning:cleared()})]){const {repo,db,setNow}=setup();const input=saveInput({payload:p});db.unknownBatch=true;await assert.rejects(repo.save('alice',input),errorCode('WORKSPACE_STORAGE_UNCERTAIN'));const readback=await repo.load('alice',uuid(1));assert.deepEqual(plain(readback.workspace.payload),p);assert.equal(Object.hasOwn(readback.workspace.payload,'planning'),Object.hasOwn(p,'planning'));setNow(2_000_000);assert.deepEqual(await repo.save('alice',input),readback);await assert.rejects(repo.save('alice',{...input,writeId:uuid(101)}),errorCode('WORKSPACE_CONFLICT'));assert.equal(row(db).expires_at_ms,readback.workspace.expiresAtMs);}
});
test('rich receipt is its own in-transaction snapshot when a different attempt commits before response',async()=>{
 const {repo,db}=setup();db.afterBatch=()=>repo.save('alice',saveInput({expectedRevision:1,writeId:uuid(101),payload:rich({planning:cleared()})}));const own=await repo.save('alice',saveInput({payload:rich()}));assert.equal(own.workspace.writeId,uuid(100));assert.deepEqual(plain(own.workspace.payload.planning),planning());assert.deepEqual(plain((await repo.load('alice',uuid(1))).workspace.payload.planning),cleared());
});
test('snapshot detaches nested metadata synchronously before first async hash',async()=>{
 const {repo}=setup();const input=saveInput({payload:rich()}),expected=plain(input.payload),pending=repo.save('alice',input);input.payload.planning.scheduleBinding.refs[0].slotId='changed';input.payload.planning.scheduleBinding.refs.length=0;input.payload.planning.scheduledInstant=null;delete input.payload.planning;const got=await pending;assert.deepEqual(plain(got.workspace.payload),expected);
});
test('owner/source and all canonical tables remain unchanged through rich writes and clears',async()=>{
 const {repo,db}=setup();const canonical=()=>db.sql.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name!='planner_editor_workspaces' ORDER BY name").all().map(({name})=>({name,rows:db.sql.prepare(`SELECT * FROM ${name}`).all()}));const before=canonical();await repo.save('alice',saveInput({payload:rich()}));assert.equal((await repo.list('bob')).capacity.total,0);await assert.rejects(repo.load('bob',uuid(1)),errorCode('WORKSPACE_NOT_FOUND'));await repo.save('bob',saveInput());assert.equal(Object.hasOwn((await repo.load('bob',uuid(1))).workspace.payload,'planning'),false);await assert.rejects(repo.save('alice',saveInput({expectedRevision:1,writeId:uuid(101),sourcePostId:null,payload:rich()})),errorCode('WORKSPACE_SOURCE_CHANGED'));await assert.rejects(repo.save('alice',saveInput({expectedRevision:1,writeId:uuid(101),basePlannerRevision:8,payload:rich()})),errorCode('WORKSPACE_SOURCE_CHANGED'));await repo.save('alice',saveInput({expectedRevision:1,writeId:uuid(101),payload:rich({planning:cleared()})}));assert.deepEqual(canonical(),before);
});
test('discard and expiry retain rich bytes and cannot reopen via legacy or rich payload',async()=>{
 for(const close of ['discard','expire']){const {repo,db,setNow}=setup();const saved=await repo.save('alice',saveInput({payload:rich()})),before=row(db).payload_json;if(close==='discard')await repo.discard('alice',discardInput());else{setNow(saved.workspace.expiresAtMs);await repo.list('alice');}for(const p of [payload(),rich()])await assert.rejects(repo.save('alice',saveInput({expectedRevision:2,writeId:uuid(101),payload:p})),errorCode('WORKSPACE_CLOSED'));assert.equal(row(db).payload_json,before);assert.equal((await repo.list('alice')).capacity.total,1);}
});
test('invalid nested metadata never reaches a write batch',async()=>{
 const {repo,db}=setup();let batches=0;const batch=db.batch.bind(db);db.batch=async s=>{batches++;return batch(s);};for(const change of Object.values(invalid)){const p=rich();change(p);await assert.rejects(repo.save('alice',saveInput({payload:p})),errorCode('WORKSPACE_INPUT_INVALID'));}assert.equal(batches,0);assert.equal(row(db),undefined);
});
test('HTTP uses same schema1 route and redacted downgrade409 with unchanged target',async()=>{
 const {repo,db}=setup(),origin='https://takt.example',path=origin+'/api/planner/workspaces/'+uuid(1),api=createEditorWorkspaceApi({repository:repo,siteOrigin:origin,authenticateRequest:async()=> 'alice'});
 const put=async input=>{const {workspaceId,...body}=input;return api(new Request(path,{method:'PUT',headers:{Origin:origin,'X-Planner-Request':'1','Content-Type':'application/json'},body:JSON.stringify(body)}));};const richResponse=await put(saveInput({payload:rich()}));assert.equal(richResponse.status,200);assert.equal((await richResponse.json()).schemaVersion,1);const before={...row(db)},denied=await put(saveInput({expectedRevision:1,writeId:uuid(101)}));assert.equal(denied.status,409);assert.deepEqual(await denied.json(),{error:{code:'WORKSPACE_SCHEMA_CHANGED'}});assert.deepEqual({...row(db)},before);
 const readback=await api(new Request(path));assert.deepEqual((await readback.json()).workspace.payload.planning,planning());
});
