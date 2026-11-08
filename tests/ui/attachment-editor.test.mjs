import test from 'node:test';
import assert from 'node:assert/strict';
import {editorAttachments,updateAttachment,moveAttachment,workspaceAttachments,ATTACHMENT_LIMIT} from '../../public/attachment-editor.js';
test('single-media migration and ordered attachment input are detached',()=>{const media={id:'a',alt:'A'},post={media};assert.deepEqual(editorAttachments(post),[media]);assert.notEqual(editorAttachments(post)[0],media);assert.deepEqual(editorAttachments({media,attachments:[]}),[]);assert.deepEqual(editorAttachments({attachments:[{id:'b'},media]}).map(m=>m.id),['b','a']);});
test('append and edit preserve other attachments; stale target is rejected',()=>{const a={id:'a'},b={id:'b'},c={id:'c'},items=[a,b];assert.deepEqual(updateAttachment(items,c),[a,b,c]);assert.deepEqual(updateAttachment(items,c,a),[c,b]);assert.deepEqual(items,[a,b]);assert.throws(()=>updateAttachment(items,c,{id:'a'}));const full=Array.from({length:ATTACHMENT_LIMIT},(_,id)=>({id}));assert.throws(()=>updateAttachment(full,c));assert.equal(updateAttachment(full,c,full[3]).length,ATTACHMENT_LIMIT);});
test('reorder is bounded, immutable and exactly preserves media',()=>{const a={id:'a'},b={id:'b'},c={id:'c'},items=[a,b,c];assert.deepEqual(moveAttachment(items,1,-1),[b,a,c]);assert.deepEqual(moveAttachment(items,1,1),[a,c,b]);for(const [index,dir]of [[0,-1],[2,1],[-1,1],[0,2],[NaN,1]])assert.deepEqual(moveAttachment(items,index,dir),items);assert.deepEqual(items,[a,b,c]);});
test('workspace preserves all owned media in order and flags mixed local omissions',()=>{const a={id:'a',url:'/api/planner/media/a',type:'image/png',alt:'Bild'},local={dataUrl:'data:image/png;base64,AA=='},b={id:'b',url:'/api/planner/media/b',type:'video/mp4'};const p=workspaceAttachments([a,local,b]);assert.deepEqual(p.attachments,[{kind:'planner_image',id:'a',alt:'Bild'},{kind:'planner_video',id:'b',alt:''}]);assert.deepEqual(p.media,p.attachments[0]);assert.equal(p.localMediaOmitted,true);assert.equal(workspaceAttachments([a,b]).localMediaOmitted,false);assert.deepEqual(workspaceAttachments([]),{attachments:[],media:null,localMediaOmitted:false});});
test('duplicate local file is rejected clearly without changing attachments; own replacement remains allowed',()=>{
 const a={dataUrl:'data:image/png;base64,AAAA',name:'a.png',alt:'A'};const items=[a];
 assert.throws(()=>updateAttachment(items,{...a}),e=>e.code==='DUPLICATE_ATTACHMENT'&&e.message.includes('bereits angehängt'));assert.deepEqual(items,[a]);
 assert.deepEqual(updateAttachment(items,{...a,alt:'B'},a),[{...a,alt:'B'}]);
});
test('visible composer states actual attachment and file limits',async()=>{
 const {readFile}=await import('node:fs/promises');const html=await readFile(new URL('../../public/index.html',import.meta.url),'utf8');
 assert.match(html,/Bis zu 10 Anhänge je Beitrag, je Datei höchstens 20 MiB/);assert.doesNotMatch(html,/Ein Medium je Beitrag/);
});
