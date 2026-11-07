import test from 'node:test';
import assert from 'node:assert/strict';
import { CHANNELS, SCHEMA_VERSION, createDemoState, normalizeState, validatePost } from '../../public/model.js';
import { inspectScheduleBinding } from '../../public/workflows/posting-schedules.mjs';

const NOW=new Date('2026-11-07T12:00:00.000Z');
const post=(patch={})=>({id:'scheduled-post',title:'  Titel  ',tags:['  Kampagne / Q4  ','a,b'],text:'Ein Beitrag',variantTexts:{instagram:'Ein Kanaltext'},channels:['instagram'],status:'scheduled',scheduledAt:'2027-01-15T10:00',scheduledInstant:'2027-01-15T09:00:23.456Z',scheduleBinding:null,timeZone:'Europe/Berlin',media:null,cover:null,createdAt:NOW.toISOString(),updatedAt:NOW.toISOString(),...patch});
const state=(posts=[post()],patch={})=>({...createDemoState(NOW),revision:8,settings:{timezone:'Europe/Berlin'},posts,...patch});
const rule=(patch={})=>({schemaVersion:1,timezone:'Europe/Berlin',paused:false,minimumGapMinutes:30,overlapChoice:'later',slots:[{id:'sunday-fold',weekday:0,time:'02:30'}],...patch});
const binding=(overlapChoice='later')=>({schemaVersion:1,mode:'queue',instant:overlapChoice==='later'?'2027-10-31T01:30:00.000Z':'2027-10-31T00:30:00.000Z',selectedAt:NOW.toISOString(),sourceRevision:7,refs:[{channelId:'instagram',slotId:'sunday-fold',local:'2027-10-31T02:30',timezone:'Europe/Berlin',overlapChoice,minimumGapMinutes:30}]});
const boundPost=(choice='later')=>post({scheduledAt:'2027-10-31T02:30',scheduledInstant:binding(choice).instant,scheduleBinding:binding(choice)});
const without=(value,key)=>{const copy=structuredClone(value);delete copy[key];return copy;};

test('demo schema 2 explicitly declares revision, full channel definitions and nullable timing fields',()=>{
  const before=structuredClone(CHANNELS),demo=createDemoState(NOW);
  assert.equal(SCHEMA_VERSION,2);assert.equal(demo.schemaVersion,2);assert.equal(demo.revision,0);
  assert.ok(demo.channels.every(c=>c.postingSchedule===null&&c.platform===c.id&&c.enabled===true&&c.connectionStatus==='manual'));
  assert.ok(demo.posts.every(p=>p.scheduleBinding===null&&p.scheduledInstant===null));
  assert.deepEqual(normalizeState(demo),demo);assert.deepEqual(CHANNELS,before);
  assert.ok(CHANNELS.every(c=>!Object.hasOwn(c,'postingSchedule')));
});

test('schema 1 is rejected and confirmed revision is required without coercion',()=>{
  assert.throws(()=>normalizeState({...state(),schemaVersion:1}),/Format/);
  for(const revision of [undefined,null,-1,1.5,'8',Infinity,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>normalizeState(state([],{revision})),/revision/i);
  assert.equal(normalizeState(state([],{revision:0})).revision,0);
  assert.equal(normalizeState(state([],{revision:Number.MAX_SAFE_INTEGER})).revision,Number.MAX_SAFE_INTEGER);
});

test('normalizer preserves full channel definitions, revision, raw metadata and immutable rule copies',()=>{
  const input=state();input.channels[0]={...input.channels[0],name:'Editorial Instagram',handle:'@example',color:'#123abc',enabled:false,postingSchedule:rule()};
  const copy=structuredClone(input),normalized=normalizeState(input);
  assert.deepEqual(normalized,input);assert.deepEqual(input,copy);
  normalized.channels[0].postingSchedule.slots[0].time='03:30';normalized.posts[0].tags.push('new');
  assert.deepEqual(input,copy);
});

test('channel definitions reject omissions, unknown fields, duplicate IDs and invalid rules',()=>{
  const input=state([]);
  for(const key of ['id','platform','name','handle','color','enabled','connectionStatus','postingSchedule'])assert.throws(()=>normalizeState({...input,channels:[without(input.channels[0],key)]}));
  for(const patch of [{extra:true},{postingSchedule:undefined},{postingSchedule:{...rule(),extra:true}},{postingSchedule:rule({slots:[{...rule().slots[0],extra:true}]})},{postingSchedule:rule({slots:[rule().slots[0],rule().slots[0]]})},{id:'unknown'},{platform:'unknown'},{platform:'linkedin'},{enabled:'true'},{connectionStatus:'connected'}])assert.throws(()=>normalizeState({...input,channels:[{...input.channels[0],...patch}]}));
  assert.throws(()=>normalizeState({...input,channels:[input.channels[0],input.channels[0]]}));
  assert.throws(()=>normalizeState(state([post()],{channels:[]})));
});

test('post schedule fields are explicit and hidden draft or idea timings are rejected',()=>{
  for(const key of ['scheduleBinding','scheduledInstant']) {
    assert.throws(()=>normalizeState(state([without(post(),key)])),/ausdrücklich/);
    assert.ok(validatePost(without(post(),key),NOW).some(e=>e.includes('ausdrücklich')));
  }
  for(const status of ['draft','idea']) {
    const p=post({status,channels:status==='idea'?[]:['instagram'],variantTexts:{},scheduledAt:null,scheduledInstant:null,scheduleBinding:null});
    assert.deepEqual(validatePost(p,NOW),[]);assert.deepEqual(normalizeState(state([p])).posts[0],p);
    for(const patch of [{scheduledAt:'2027-01-15T10:00'},{scheduledInstant:'2027-01-15T09:00:23.456Z'},{scheduleBinding:binding()}]) {
      assert.throws(()=>normalizeState(state([{...p,...patch}])));
      assert.notDeepEqual(validatePost({...p,...patch},NOW),[]);
    }
  }
});

test('exact fixed UTC projection preserves seconds and milliseconds on normalization and repeated reload',()=>{
  const input=state(),normalized=normalizeState(input);
  assert.deepEqual(normalized.posts[0],input.posts[0]);assert.deepEqual(validatePost(normalized.posts[0],NOW),[]);
  assert.deepEqual(normalizeState(JSON.parse(JSON.stringify(normalized))),normalized);
  assert.deepEqual(validatePost(post(),new Date('2027-01-15T09:00:23.455Z')),[]);
  assert.ok(validatePost(post(),new Date('2027-01-15T09:00:23.456Z')).some(e=>e.includes('Zukunft')));
});

test('both saved fixed DST-fold instants survive exactly without guessing a new instant',()=>{
  for(const scheduledInstant of ['2027-10-31T00:30:23.456Z','2027-10-31T01:30:59.999Z']) {
    const p=post({scheduledAt:'2027-10-31T02:30',scheduledInstant});
    assert.deepEqual(normalizeState(state([p])).posts[0],p);assert.deepEqual(validatePost(p,NOW),[]);
  }
});

test('manual null-UTC times still reject DST ambiguity, gaps, calendar overflow and malformed local time',()=>{
  for(const scheduledAt of ['2027-10-31T02:30','2027-03-28T02:30','2027-02-30T10:00','2027-01-15T25:00','2027-01-15T10:00:00']) {
    const p=post({scheduledAt,scheduledInstant:null});
    assert.throws(()=>normalizeState(state([p])));assert.notDeepEqual(validatePost(p,NOW),[]);
  }
  const p=post({scheduledInstant:null});assert.deepEqual(normalizeState(state([p])).posts[0],p);assert.deepEqual(validatePost(p,NOW),[]);
});

test('invalid UTC and changed local date or zone cannot retain an existing projection',()=>{
  for(const patch of [{scheduledAt:'2027-01-15T10:01'},{timeZone:'UTC'},{timeZone:'Unknown/Zone'},{scheduledInstant:'2027-01-15T09:00:23.456+00:00'},{scheduledInstant:'2027-02-30T09:00:23.456Z'},{scheduledInstant:'2027-01-15T09:00:61.456Z'},{scheduledInstant:'not a date'},{scheduledInstant:undefined}]) {
    assert.throws(()=>normalizeState(state([post(patch)])));
    assert.notDeepEqual(validatePost(post(patch),NOW),[]);
  }
  for(const settings of [{},null,{timezone:'Unknown/Zone'}])assert.throws(()=>normalizeState(state([],{settings})),/Zeitzone/);
});

test('queue bindings retain both explicitly selected DST-fold occurrences',()=>{
  for(const choice of ['earlier','later']) {
    const p=boundPost(choice),normalized=normalizeState(state([p]));
    assert.deepEqual(normalized.posts[0],p);assert.deepEqual(validatePost(p,NOW),[]);
    normalized.posts[0].scheduleBinding.refs[0].slotId='changed';assert.equal(p.scheduleBinding.refs[0].slotId,'sunday-fold');
  }
});

test('binding validation rejects mismatched UTC, target channels, refs and nested unknown fields',()=>{
  const p=boundPost();
  for(const patch of [{scheduledInstant:null},{scheduledInstant:'2027-10-31T00:30:00.000Z'},{channels:['linkedin']},{channels:['linkedin'],channelIds:['instagram']},{channels:['instagram','linkedin']},{scheduleBinding:{...p.scheduleBinding,extra:true}},{scheduleBinding:{...p.scheduleBinding,refs:[{...p.scheduleBinding.refs[0],extra:true}]}},{scheduleBinding:{...p.scheduleBinding,refs:[{...p.scheduleBinding.refs[0],overlapChoice:'earlier'}]}}]) {
    assert.throws(()=>normalizeState(state([{...p,...patch}])));
    assert.notDeepEqual(validatePost({...p,...patch},NOW),[]);
  }
});

test('rule changes and pause preserve stored bound instants while diagnostics require review',()=>{
  const p=boundPost(),input=state([p]);input.channels[0].postingSchedule=rule();
  assert.equal(inspectScheduleBinding(p,normalizeState(input).channels).state,'current');
  for(const postingSchedule of [null,rule({paused:true}),rule({slots:[{id:'replacement',weekday:1,time:'09:00'}]})]) {
    const changed=structuredClone(input);changed.channels[0].postingSchedule=postingSchedule;
    const normalized=normalizeState(changed);assert.deepEqual(normalized.posts[0],p);
    assert.equal(inspectScheduleBinding(normalized.posts[0],normalized.channels).state,'needs_review');
  }
});
