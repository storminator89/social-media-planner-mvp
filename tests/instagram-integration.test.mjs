import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createContext,runInContext} from 'node:vm';
import {createLocalHandler} from '../server/handler.mjs';
const path='/api/providers/instagram/oauth/';
function assertClosed(dto){assert.equal(dto.connected,false);assert.equal(dto.canPublish,false);assert.equal(dto.authorizationUrl,null);assert.equal(dto.callbackPath,null);assert.ok(Object.values(dto.capabilities).every(v=>v===false));}
test('built Worker keeps Instagram disabled even with activation flags and never invokes transport',async()=>{
 let calls=0;
 const source=readFileSync(new URL('../dist/server/index.js',import.meta.url),'utf8');
 const context=createContext({Request,Response,Headers,URL,URLSearchParams,TextEncoder,TextDecoder,Uint8Array,AbortController,setTimeout,clearTimeout,fetch(){calls++;throw new Error('Unexpected provider call');}});
 runInContext(source.replace('export default ','globalThis.worker = '),context);
 const env={DB:{prepare(){throw new Error('Unexpected storage call');},batch(){throw new Error('Unexpected storage call');}},TAKT_INSTAGRAM_ENABLED:'true'};
 const request=(suffix,headers={'oai-authenticated-user-id':'owner'},method='GET')=>context.worker.fetch(new Request('https://takt.example'+path+suffix,{headers,method}),env);
 assertClosed(await (await request('readiness')).json());
 assert.equal((await request('readiness',{})).status,401);
 assert.equal((await request('readiness',{'oai-authenticated-user-id':'owner',Origin:'https://evil.example'})).status,403);
 assert.equal((await request('readiness',{'oai-authenticated-user-id':'owner'},'POST')).status,405);
 assert.equal((await request('start')).status,404);
 assert.equal((await request('callback?code=fixture')).status,404);
 assert.equal(calls,0);
});
test('local router exposes only closed Instagram readiness',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'takt-instagram-integrated-'));
 const app=createLocalHandler({directory});t.after(async()=>{app.close();await rm(directory,{recursive:true,force:true});});
 const response=await app.fetch(new Request('http://localhost:3000'+path+'readiness'));
 assert.equal(response.status,200);assertClosed(await response.json());
 assert.equal((await app.fetch(new Request('http://localhost:3000'+path+'callback?code=fixture'))).status,404);
});
