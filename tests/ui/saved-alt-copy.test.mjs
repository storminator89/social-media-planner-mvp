import test from 'node:test';
import assert from 'node:assert/strict';
import {copySavedImage} from '../../public/saved-alt-copy.js';
const media=type=>({id:'image_1',url:'/api/planner/media/image_1',name:'Original ü.'+type.split('/')[1],type,alt:'Old'});
const samples={'image/png':[137,80,78,71,13,10,26,10,0,9,255], 'image/jpeg':[255,216,255,224,0,9,255], 'image/webp':[82,73,70,70,20,0,0,0,87,69,66,80,0,9,255]};
for(const [type,bytes] of Object.entries(samples))test(`exact ${type} bytes, filename and MIME survive copy; read is same-origin without redirects`,async()=>{
 const input=media(type);let calls=0;
 const result=await copySavedImage(input,'雪 👩‍💻 & <Bild>',{fetcher:async(url,options)=>{calls++;assert.equal(url,input.url);assert.equal(options.method,'GET');assert.equal(options.credentials,'same-origin');assert.equal(options.mode,'same-origin');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');return new Response(new Uint8Array(bytes),{headers:{'Content-Type':type}})}});
 assert.equal(calls,1);assert.deepEqual([...new Uint8Array(await result.arrayBuffer())],bytes);assert.equal(result.name,input.name);assert.equal(result.type,type);assert.equal(input.alt,'Old');
});
for(const alt of ['', '  ', 'x'.repeat(501),null])test(`reject invalid alt ${String(alt).length} before request`,async()=>{await assert.rejects(copySavedImage(media('image/png'),alt,{fetcher:()=>assert.fail('no request')}));});
test('500 UTF-16 units accepted without Unicode normalization',async()=>{const file=await copySavedImage(media('image/png'),'🦋'.repeat(250),{fetcher:async()=>new Response(new Uint8Array(samples['image/png']),{headers:{'content-type':'image/png'}})});assert.ok(file);});
for(const url of ['https://evil.example/image','//evil.example/image','/api/planner/media/image_1?x=1','/api/planner/media/../x','/api/planner/media/other'])test('reject unsafe route '+url,async()=>{await assert.rejects(copySavedImage({...media('image/png'),url},'New',{fetcher:()=>assert.fail('no request')}));});
for(const kind of ['status','partial','redirect','mime','signature','empty','header-limit','length-mismatch','stream-limit'])test('fail closed on '+kind,async()=>{
 const type='image/png';let body=new Uint8Array(samples[type]),headers={'content-type':type};if(kind==='mime')headers['content-type']='image/jpeg';if(kind==='empty')body=new Uint8Array();if(kind==='signature')body=new Uint8Array([1,2,3]);if(kind==='stream-limit')body=new Uint8Array(2*1024*1024+1);if(kind==='header-limit')headers['content-length']='2097153';if(kind==='length-mismatch')headers['content-length']='200';
 await assert.rejects(copySavedImage(media(type),'New',{fetcher:async()=>{const response=new Response(body,{headers,status:kind==='status'?404:kind==='partial'?206:200});if(kind==='redirect')Object.defineProperty(response,'redirected',{value:true});return response;}}));
});
test('aborted request never fetches',async()=>{const c=new AbortController();c.abort();await assert.rejects(copySavedImage(media('image/png'),'New',{signal:c.signal,fetcher:()=>assert.fail('no fetch')}));});
test('cancel and timeout abort the private request',async()=>{for(const timeout of [false,true]){const c=new AbortController();let seen;const pending=copySavedImage(media('image/png'),'New',{signal:c.signal,timeout:timeout?5:15000,fetcher:(_url,{signal})=>new Promise((resolve,reject)=>{seen=signal;signal.addEventListener('abort',()=>reject(Error('aborted')));})});if(!timeout)c.abort();await assert.rejects(pending);assert.equal(seen.aborted,true);}});

test('timeout bounds fetch and body reads even when transport ignores abort',async()=>{for(const body of [false,true]){await assert.rejects(copySavedImage(media('image/png'),'New',{timeout:5,fetcher:()=>body?Promise.resolve({ok:true,status:200,headers:new Headers({'content-type':'image/png'}),body:{getReader:()=>({read:()=>new Promise(()=>{}),cancel:()=>new Promise(()=>{})})}}):new Promise(()=>{})}),/rechtzeitig/);}});
