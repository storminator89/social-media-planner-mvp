import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
import {readTailSource,prepareTailEdit,tailReplacement} from '../../public/video-tail-editor.js';
import {analyzeTailCuts} from '../../public/video-tail-packet-editor.mjs';
import {createComposerMedia} from '../../public/composer-media.js';
const bytes=new Uint8Array(readFileSync(new URL('../video-tail/fixtures/source.webm',import.meta.url)));
const saved={id:'owned',url:'/api/planner/media/owned',type:'video/webm',name:'original.webm',alt:'A'.repeat(2000)};
const local={type:saved.type,name:saved.name,alt:saved.alt,dataUrl:'data:video/webm;base64,'+Buffer.from(bytes).toString('base64')};
const response=()=>new Response(bytes,{headers:{'Content-Type':'video/webm','Content-Length':String(bytes.length)}});
test('local and private source retain exact bytes and2000 description; private fetch is bounded same-origin only',async()=>{
 assert.deepEqual(await readTailSource(local),bytes);let args;assert.deepEqual(await readTailSource(saved,{fetcher:async(...a)=>(args=a,response())}),bytes);assert.equal(args[0],saved.url);for(const [k,v] of Object.entries({method:'GET',credentials:'same-origin',mode:'same-origin',redirect:'error',cache:'no-store'}))assert.equal(args[1][k],v);
 const cut=analyzeTailCuts(bytes).cuts[3],result=await prepareTailEdit(bytes,cut.cutNs),replacement=tailReplacement(result,saved);assert.equal(replacement.alt,saved.alt);assert.equal(replacement.name,saved.name);assert.equal(replacement.id,undefined);assert.deepEqual(Buffer.from(replacement.dataUrl.split(',')[1],'base64'),Buffer.from(result.bytes));
});
test('source rejection never fetches invalid references or excessive local inputs',async()=>{for(const media of [{...saved,url:'https://evil.test'},{...saved,id:'../other'},{...saved,type:'video/mp4'},{...saved,alt:'A'.repeat(2001)},{...local,id:'ambiguous'},{...local,dataUrl:'data:video/webm;base64,!'},{...local,dataUrl:'data:video/webm;base64,'+'A'.repeat(12*1024*1024)}])await assert.rejects(readTailSource(media,{fetcher:()=>assert.fail('No request permitted')}));});
test('private read rejects auth errors, partial/ranged, changed MIME, oversized, truncated and redirects',async()=>{
 const bad=[()=>new Response('Denied',{status:404}),()=>new Response(bytes,{status:206,headers:{'Content-Type':'video/webm','Content-Range':'bytes 0-1/2'}}),()=>new Response(bytes,{headers:{'Content-Type':'video/mp4'}}),()=>new Response(bytes,{headers:{'Content-Type':'video/webm','Content-Length':'9000000'}}),()=>new Response(bytes,{headers:{'Content-Type':'video/webm','Content-Length':String(bytes.length+1)}}),()=>{const r=response();Object.defineProperty(r,'redirected',{value:true});return r;}];for(const make of bad)await assert.rejects(readTailSource(saved,{fetcher:async()=>make()}));
 await assert.rejects(readTailSource(saved,{fetcher:async()=>new Response(new Uint8Array(8*1024*1024+1),{headers:{'Content-Type':'video/webm'}})}));
});
test('ignored AbortSignal fetch/stream timeout and explicit cancellation do not hang',async()=>{
 await assert.rejects(readTailSource(saved,{fetcher:()=>new Promise(()=>{}),timeout:10}));
 await assert.rejects(readTailSource(saved,{fetcher:async()=>new Response(new ReadableStream({pull:()=>new Promise(()=>{})}),{headers:{'Content-Type':'video/webm'}}),timeout:10}));
 await assert.rejects(readTailSource(saved,{signal:AbortSignal.abort(),fetcher:()=>assert.fail()}));
});
test('late source changes and cancellation during yielded output calculation reject before adoption',async()=>{
 let current=true;await assert.rejects(readTailSource(saved,{current:()=>current,fetcher:async()=>{current=false;return response();}}));
 const abort=new AbortController(),promise=prepareTailEdit(bytes,analyzeTailCuts(bytes).cuts[2].cutNs,{signal:abort.signal});setTimeout(()=>abort.abort(),0);await assert.rejects(promise);
});
const app=readFileSync(new URL('../../public/app.js',import.meta.url),'utf8');
const fn=name=>{const start=app.indexOf(`function ${name}(`);return app.slice(start,app.indexOf('\nfunction ',start+1));};
function harness(fail){const images=createComposerMedia();images.reset([saved]);const target={session:1,ticket:images.ticket('replace'),identity:JSON.stringify(images.selected),checkpoint:images.checkpoint(),cover:'forms',missing:true};const fields={'#composer':{open:true},'#workspace-missing-media':{hidden:false}};const c={videoTailTarget:target,saving:false,composerGeneration:1,composerImages:images,composerMedia:images.selected,composerCover:'forms',composerMissingMedia:true,$:id=>fields[id],renderMediaEditor:()=>{if(fail==='render')throw Error('render');},renderPreview:()=>{if(fail==='capture')throw Error('capture');}};vm.createContext(c);vm.runInContext(fn('applyVideoTail'),c);return {c,images};}
test('actual app adoption keeps2000-character description and stages local bytes only',()=>{const {c,images}=harness();c.applyVideoTail(local);assert.equal(images.items[0].alt,saved.alt);assert.equal(images.items[0].id,undefined);assert.equal(images.items[0].dataUrl,local.dataUrl);assert.equal(c.videoTailTarget,null);assert.match(app,/maxlength="2000"/);});
for(const failure of ['render','capture'])test(`actual ${failure} failure rolls original reference/metadata back atomically`,()=>{const {c,images}=harness(failure);assert.throws(()=>c.applyVideoTail(local));assert.deepEqual(images.items,[saved]);assert.equal(c.composerCover,'forms');assert.equal(c.composerMissingMedia,true);});
test('actual app rejects stale session, ticket and in-place metadata mutation',()=>{for(const mutate of [h=>h.c.composerGeneration++,h=>h.images.updateAlt('changed'),h=>h.images.selected.name='other.webm',h=>h.c.saving=true]){const h=harness();mutate(h);const before=structuredClone(h.images.items);assert.throws(()=>h.c.applyVideoTail(local));assert.deepEqual(h.images.items,before);}});

test('actual openVideoTail pauses every backing composer video before opening modal without resume',()=>{
 const {c}=harness();const videos=[{paused:false,pause(){this.paused=true;}},{paused:false,pause(){this.paused=true;}}];let opened=0;
 Object.assign(c,{mediaLoading:false,savedAltEdit:null,document:{querySelector:()=>null},$$:selector=>{assert.equal(selector,'#composer video');return videos;},videoTailEditor:{open(media,{isCurrent}){assert.ok(videos.every(v=>v.paused));assert.equal(isCurrent(),true);opened++;}}});vm.runInContext(fn('openVideoTail'),c);c.openVideoTail();assert.equal(opened,1);assert.ok(videos.every(v=>v.paused));
});
