import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateMedia} from '../../modules/data/media-validation.mjs';
import {handlePlannerRequest} from '../../modules/data/api.mjs';
import {createTaktStore} from '../../modules/data/takt-adapter.mjs';
import {createPlannerClient} from '../../modules/data/client.mjs';
import {D1TestAdapter,R2TestAdapter,request,fixture} from './support.mjs';
const data=ext=>new Uint8Array(readFileSync(new URL(`../fixtures/media/tiny.${ext}`,import.meta.url)));
for(const [ext,mime] of Object.entries({png:'image/png',jpg:'image/jpeg',gif:'image/gif',webp:'image/webp',mp4:'video/mp4',webm:'video/webm'})){
 test(`real ${ext} container is accepted, short signature and wrong MIME rejected`,()=>{const b=data(ext);assert.equal(validateMedia(b,mime).byteSize,b.length);assert.throws(()=>validateMedia(b.slice(0,12),mime));assert.throws(()=>validateMedia(b,mime.startsWith('image')?'video/mp4':'image/png'));});
}
test('malformed PNG length and dimension bombs rejected',()=>{let b=data('png');new DataView(b.buffer).setUint32(8,0xffffffff);assert.throws(()=>validateMedia(b,'image/png'));b=data('png');new DataView(b.buffer).setUint32(16,999999);assert.throws(()=>validateMedia(b,'image/png'));});
test('private MP4 survives adapter save and fresh load without provider call',async()=>{
 const env={DB:new D1TestAdapter(),BUCKET:new R2TestAdapter()};const fetcher=(url,options={})=>handlePlannerRequest(new Request('https://planner.example'+url,{...options,headers:{...options.headers,'oai-authenticated-user-id':'alice'}}),env);
 const store=createTaktStore({client:createPlannerClient({fetcher}),timezone:'UTC',channels:[{id:'instagram',name:'Instagram',color:'#aabbcc'}]});const state=await store.load();state.posts=[{id:'video-post',scheduleBinding:null,scheduledInstant:null,title:'Video',tags:[],text:'Private draft',channels:['instagram'],status:'draft',scheduledAt:null,timeZone:'UTC',media:{type:'video/mp4',name:'tiny.mp4',alt:'Blue frame',dataUrl:'data:video/mp4;base64,'+Buffer.from(data('mp4')).toString('base64')}}];
 const saved=await store.save(state);const media=saved.posts[0].media;assert.equal(media.type,'video/mp4');assert.equal(media.dataUrl,undefined);assert.deepEqual((await store.load()).posts[0].media,media);
 const response=await handlePlannerRequest(request('/media/'+media.id),env);assert.equal(response.headers.get('Cross-Origin-Resource-Policy'),'same-origin');assert.deepEqual(new Uint8Array(await response.arrayBuffer()),data('mp4'));assert.equal((await handlePlannerRequest(request('/media/'+media.id,{owner:'bob'}),env)).status,404);
});
test('15-byte GIF without descriptor and malformed WebM segment VINT rejected',()=>{
 const gif=new Uint8Array([...Buffer.from('GIF89a'),1,0,1,0,0,0,0,0x2c,0x3b]);
 const webm=new Uint8Array([0x1a,0x45,0xdf,0xa3,0x87,0x42,0x82,0x84,...Buffer.from('webm'),0x18,0x53,0x80,0x67,0,0,0,0]);
 assert.throws(()=>validateMedia(gif,'image/gif'));assert.throws(()=>validateMedia(webm,'video/webm'));
});
test('confirmed INSERT does not depend on a follow-up metadata read',async()=>{
 const env={DB:new D1TestAdapter(),BUCKET:new R2TestAdapter()};const prepare=env.DB.prepare.bind(env.DB);let reads=0;
 env.DB.prepare=sql=>{const stmt=prepare(sql);if(sql.startsWith('SELECT * FROM planner_media WHERE'))stmt.first=async()=>{reads++;throw Error('read unavailable');};return stmt;};
 const response=await handlePlannerRequest(request('/media',{method:'POST',body:data('png'),headers:{'Content-Type':'image/png'}}),env);
 assert.equal(response.status,201);assert.equal(reads,0);assert.equal(env.BUCKET.data.size,1);assert.equal(env.DB.sql.prepare('SELECT count(*) n FROM planner_media').get().n,1);
});
for(const outcome of ['throw-after-commit','missing-receipt','explicit-failed-receipt'])test(`uncertain INSERT ${outcome} never deletes committed media`,async()=>{
 const env={DB:new D1TestAdapter(),BUCKET:new R2TestAdapter()};const prepare=env.DB.prepare.bind(env.DB);
 env.DB.prepare=sql=>{const stmt=prepare(sql);if(sql.startsWith('INSERT INTO planner_media')){const run=stmt.run;stmt.run=async()=>{await run();if(outcome==='throw-after-commit')throw Error('transport failed after commit');return outcome==='missing-receipt'?{}:{success:false,meta:{changes:0}};};}return stmt;};
 const response=await handlePlannerRequest(request('/media',{method:'POST',body:data('mp4'),headers:{'Content-Type':'video/mp4'}}),env);
 assert.equal(response.status,503);assert.equal((await response.json()).error.code,'MEDIA_STORAGE_UNCERTAIN');assert.equal(env.BUCKET.data.size,1);const row=env.DB.sql.prepare('SELECT * FROM planner_media').get();assert.ok(row);env.DB.prepare=prepare;const read=await handlePlannerRequest(request('/media/'+row.id),env);assert.equal(read.status,200);assert.deepEqual(new Uint8Array(await read.arrayBuffer()),data('mp4'));
});
test('composer permits video drafts without image alt text while images still require it',async()=>{
 const {validatePost}=await import('../../public/model.js');
 const post={id:'alt-check',title:'Video',tags:[],text:'Video draft',variantTexts:{},channels:['instagram'],status:'draft',scheduledAt:null,scheduledInstant:null,scheduleBinding:null,timeZone:'UTC'};
 for(const type of ['video/mp4','video/webm'])assert.deepEqual(validatePost({...post,media:{type,alt:'',id:'m',url:'/api/planner/media/m'}}),[]);
 for(const type of ['image/png','image/jpeg','image/webp','image/gif'])assert.ok(validatePost({...post,media:{type,alt:'',id:'m',url:'/api/planner/media/m'}}).includes('Ergänze einen Alternativtext für jedes Bild.'));
});
