import test from 'node:test';
import assert from 'node:assert/strict';
import {handlePlannerRequest} from '../../modules/data/api.mjs';
import {D1TestAdapter,R2TestAdapter,request,png} from './support.mjs';
const upload=e=>handlePlannerRequest(request('/media',{method:'POST',body:png,headers:{'Content-Type':'image/png'}}),e);
function setup(t){const e={DB:new D1TestAdapter(),BUCKET:new R2TestAdapter()};t.after(()=>e.DB.sql.close());e.deletes=0;const remove=e.BUCKET.delete.bind(e.BUCKET);e.BUCKET.delete=async key=>{e.deletes++;return remove(key);};return e;}
function snapshot(e){return e.DB.sql.prepare('SELECT * FROM planner_media').all();}
test('post-commit readback failure retains registered bytes and owner can read them after recovery',async t=>{
 const e=setup(t),prepare=e.DB.prepare.bind(e.DB);e.DB.prepare=sql=>{const s=prepare(sql);if(sql.startsWith('SELECT * FROM planner_media WHERE'))s.first=async()=>{throw Error('SYNTHETIC_PRIVATE_READ_ERROR');};return s;};
 const r=await upload(e);assert.equal(r.status,503);assert.equal((await r.json()).error.code,'MEDIA_STORAGE_UNCERTAIN');const rows=snapshot(e);assert.equal(rows.length,1);assert.equal(e.BUCKET.data.size,1);assert.equal(e.deletes,0);assert.deepEqual(e.BUCKET.data.get(rows[0].object_key).value,png);
 e.DB.prepare=prepare;const owned=await handlePlannerRequest(request('/media/'+rows[0].id),e);assert.equal(owned.status,200);assert.deepEqual(new Uint8Array(await owned.arrayBuffer()),png);assert.equal((await handlePlannerRequest(request('/media/'+rows[0].id,{owner:'bob'}),e)).status,404);
});
test('lost SQL success receipt leaves the committed image and never triggers compensation or retry',async t=>{
 const e=setup(t),prepare=e.DB.prepare.bind(e.DB);let inserts=0;e.DB.prepare=sql=>{const s=prepare(sql);if(sql.startsWith('INSERT INTO planner_media')){const run=s.run;s.run=async()=>{inserts++;await run();throw Error('SYNTHETIC_PRIVATE_COMMIT_RESPONSE_LOST');};}return s;};
 const r=await upload(e);assert.equal(r.status,503);assert.equal(inserts,1);assert.equal(snapshot(e).length,1);assert.equal(e.BUCKET.data.size,1);assert.equal(e.deletes,0);assert.doesNotMatch(await r.text(),/SYNTHETIC|object_key|planner-media/);
});
for(const receipt of [undefined,{}, {meta:{}},{meta:{changes:'0'}},{meta:{changes:2}},{success:false,meta:{changes:0}},{success:false,meta:{changes:1}}])test(`malformed or failed SQL receipt ${JSON.stringify(receipt)} is uncertain, never quota or deletion`,async t=>{
 const e=setup(t),prepare=e.DB.prepare.bind(e.DB);e.DB.prepare=sql=>{const s=prepare(sql);if(sql.startsWith('INSERT INTO planner_media')){const run=s.run;s.run=async()=>{await run();return receipt;};}return s;};
 const r=await upload(e);assert.equal(r.status,503);assert.equal((await r.json()).error.code,'MEDIA_STORAGE_UNCERTAIN');assert.equal(snapshot(e).length,1);assert.equal(e.BUCKET.data.size,1);assert.equal(e.deletes,0);
});
test('missing post-commit readback row is uncertain and never removes the object',async t=>{
 const e=setup(t),prepare=e.DB.prepare.bind(e.DB);e.DB.prepare=sql=>{const s=prepare(sql);if(sql.startsWith('SELECT * FROM planner_media WHERE'))s.first=async()=>null;return s;};
 const r=await upload(e);assert.equal(r.status,503);assert.equal(snapshot(e).length,1);assert.equal(e.BUCKET.data.size,1);assert.equal(e.deletes,0);
});
test('put that stores bytes then loses its response is never compensated and exposes no private key',async t=>{
 const e=setup(t),put=e.BUCKET.put.bind(e.BUCKET);e.BUCKET.put=async(...args)=>{await put(...args);throw Error('SYNTHETIC_PRIVATE_PUT_ERROR');};const r=await upload(e);assert.equal(r.status,500);assert.equal(snapshot(e).length,0);assert.equal(e.BUCKET.data.size,1);assert.equal(e.deletes,0);assert.doesNotMatch(await r.text(),/SYNTHETIC|planner-media/);
});
