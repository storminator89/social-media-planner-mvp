import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as server from '../../modules/workflows/workflows.mjs';
import * as browser from '../../public/workflows/workflows.mjs';

function countParts(t) {
  const original=Intl.DateTimeFormat.prototype.formatToParts;
  let count=0;
  t.mock.method(Intl.DateTimeFormat.prototype,'formatToParts',function(...args){count++;return original.apply(this,args);});
  return ()=>count;
}
function outcome(fn) {
  try{return {value:fn()};}
  catch(error){return {error:{name:error.name,code:error.code,message:error.message,detail:error.detail}};}
}
for(const [name,{resolveLocalTime,withCivilTimeCache}] of [['server',server],['browser',browser]]) {
  test(`${name} cache retains exact civil results and gap/fold errors for all choices`,()=>{
    const cases=[['2030-04-01','01:00','UTC'],['2030-03-31','02:30','Europe/Berlin'],['2030-10-27','02:30','Europe/Berlin'],['2030-03-10','02:30','America/New_York'],['2030-11-03','01:30','America/New_York'],['2030-04-07','01:45','Australia/Lord_Howe'],['2030-10-06','02:15','Australia/Lord_Howe'],['2030-04-01','09:00','Asia/Kathmandu'],['2011-12-30','12:00','Pacific/Apia']];
    const inputs=cases.flatMap(c=>[undefined,'reject','earlier','later','unknown',null].map(choice=>[...c,choice]));
    const expected=inputs.map(args=>outcome(()=>resolveLocalTime(...args)));
    withCivilTimeCache(()=>{for(let repeat=0;repeat<3;repeat++)assert.deepEqual(inputs.map(args=>outcome(()=>resolveLocalTime(...args))),expected);});
  });
  test(`${name} cache exists only inside one synchronous invocation`,t=>{
    const count=countParts(t),args=['2030-04-01','01:00','UTC'];
    const first=resolveLocalTime(...args),cold=count();assert.ok(cold>=18);
    resolveLocalTime(...args);assert.equal(count(),cold*2);
    withCivilTimeCache(()=>{
      resolveLocalTime(...args);const warmed=count();assert.equal(warmed,cold*3);
      for(let i=0;i<20;i++)assert.deepEqual(resolveLocalTime(...args),first);
      assert.equal(count(),warmed);
    });
    resolveLocalTime(...args);assert.equal(count(),cold*4);
    withCivilTimeCache(()=>resolveLocalTime(...args));assert.equal(count(),cold*5);
  });
  test(`${name} cached candidates never share mutable success values or error details`,()=>withCivilTimeCache(()=>{
    const args=['2030-10-27','02:30','Europe/Berlin'];
    const first=resolveLocalTime(...args,'earlier');first.instant='corrupt';first.ambiguous=false;
    assert.deepEqual(resolveLocalTime(...args,'earlier'),{instant:'2030-10-27T00:30:00.000Z',ambiguous:true,disambiguation:'earlier'});
    const firstError=outcome(()=>resolveLocalTime(...args)).error;firstError.detail.candidates.splice(0,2,'corrupt');firstError.code='corrupt';
    const secondError=outcome(()=>resolveLocalTime(...args)).error;
    assert.equal(secondError.code,'DST_AMBIGUOUS');assert.deepEqual(secondError.detail.candidates,['2030-10-27T00:30:00.000Z','2030-10-27T01:30:00.000Z']);
    assert.equal(resolveLocalTime(...args,'later').instant,'2030-10-27T01:30:00.000Z');
    assert.equal(outcome(()=>resolveLocalTime('2030-03-31','02:30','Europe/Berlin')).error.code,'DST_GAP');
    assert.equal(outcome(()=>resolveLocalTime('2030-03-31','02:30','Europe/Berlin')).error.code,'DST_GAP');
  }));
  test(`${name} validation still rejects malformed inputs after warming similar keys`,()=>withCivilTimeCache(()=>{
    resolveLocalTime('2030-04-01','01:00','UTC');
    for(const args of [['2030-02-30','01:00','UTC'],['2030-04-01','24:00','UTC'],['2030-04-01','01:60','UTC'],['2030-4-01','01:00','UTC']])assert.equal(outcome(()=>resolveLocalTime(...args)).error.code,'INVALID_LOCAL_TIME');
    assert.equal(outcome(()=>resolveLocalTime('2030-04-01','01:00','Moon/Sea')).error.code,'INVALID_TIMEZONE');
    assert.notEqual(resolveLocalTime('2030-04-01','01:00','Asia/Kathmandu').instant,resolveLocalTime('2030-04-01','01:00','UTC').instant);
  }));
  test(`${name} nested scopes and throws restore the preceding cache`,t=>{
    const count=countParts(t),args=['2030-04-01','01:00','UTC'],problem=new Error('stop');
    withCivilTimeCache(()=>{
      resolveLocalTime(...args);const cold=count();
      assert.throws(()=>withCivilTimeCache(()=>{resolveLocalTime(...args);throw problem;}),error=>error===problem);
      assert.equal(count(),cold*2);resolveLocalTime(...args);assert.equal(count(),cold*2);
    });
    const before=count();resolveLocalTime(...args);assert.ok(count()>before);
    assert.throws(()=>withCivilTimeCache(()=>{resolveLocalTime(...args);throw problem;}),error=>error===problem);
    const failed=count();resolveLocalTime(...args);assert.ok(count()>failed);
  });
  test(`${name} cache evicts at 4096 candidates without changing resolutions`,t=>{
    const count=countParts(t),args=index=>new Date(Date.parse('2040-01-01T00:00:00Z')+index*60000).toISOString().slice(0,16).split('T');
    withCivilTimeCache(()=>{
      for(let i=0;i<4096;i++)resolveLocalTime(...args(i),'UTC');
      let before=count();resolveLocalTime(...args(0),'UTC');assert.equal(count(),before);
      resolveLocalTime(...args(4096),'UTC');before=count();resolveLocalTime(...args(4096),'UTC');assert.equal(count(),before);
      assert.equal(resolveLocalTime(...args(0),'UTC').instant,'2040-01-01T00:00:00.000Z');assert.ok(count()>before);
    });
  });
}
test('civil cache and reflow source remain byte-identical in browser and server mirrors',()=>{
  for(const name of ['workflows','queue-reflow'])assert.equal(readFileSync(new URL(`../../modules/workflows/${name}.mjs`,import.meta.url),'utf8'),readFileSync(new URL(`../../public/workflows/${name}.mjs`,import.meta.url),'utf8'));
});
