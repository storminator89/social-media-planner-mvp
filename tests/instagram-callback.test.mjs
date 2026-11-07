import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseInstagramCallback as parse} from '../modules/instagram/callback-contract.mjs';
import {InstagramStateRepository} from '../modules/instagram/state-repository.mjs';
import {LocalDatabase} from '../server/storage.mjs';
import {opaque,hash} from './oauth/support.mjs';
const uri='https://takt.example/api/providers/instagram/oauth/callback',state='a'.repeat(43);
test('callback validates exact configured destination and redacts provider denial text',()=>{
 assert.deepEqual(parse(uri,`${uri}?state=${state}&code=fixture-code`),{kind:'code',state,authorizationCode:'fixture-code'});
 const denied=parse(uri,`${uri}?state=${state}&error=access_denied&error_reason=user_denied&error_description=private`);
 assert.deepEqual(denied,{kind:'denied',state});assert(!JSON.stringify(denied).includes('private'));
});
test('callback rejects duplicates, smuggled fields, invalid encoding, ambiguous results and foreign targets',()=>{
 for(const query of [`state=${state}&code=a&code=b`,`state=${state}&%63ode=a&code=b`,`state=${state}&state=${state}&code=a`,`state=${state}&code=a&error=denied`,`state=${state}&code=a&access_token=forged`,`state=${state}&code=%00`,`state=${state}&code=%FF`,`state=${state}&code=%xx`,`state=${state}&code=a&error_reason=denied`,`state=${state}&error=`,`state=${state}`,`code=a`,`state=${state}&code=a#ignored`])assert.throws(()=>parse(uri,uri+'?'+query),{code:'INVALID_CALLBACK'});
 for(const bad of [uri.replace('takt.example','evil.example'),uri.replace('https:','http:'),uri+'/other'])assert.throws(()=>parse(uri,bad+`?state=${state}&code=a`));
});
test('Instagram state survives restart and is atomically single-use across database handles',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'takt-ig-state-'));let db=new LocalDatabase(directory),second;
 t.after(async()=>{db.close();second?.close();await rm(directory,{recursive:true,force:true});});
 const cfg={siteId:'fixture-site',provider:'instagram',redirectUri:uri,scopeFingerprint:hash('scopes'),configFingerprint:hash('cfg'),flowVersion:'instagram-offline-v1',contextFingerprint:hash('context')};
 const binding=opaque(),attemptFingerprint=hash(opaque());
 const attempt=await new InstagramStateRepository(db,cfg).begin('owner',binding,{attemptFingerprint});
 db.close();db=new LocalDatabase(directory);second=new LocalDatabase(directory);
 const results=await Promise.all([db,second].map(handle=>new InstagramStateRepository(handle,cfg).claim('owner',attempt.state,binding)));
 assert.equal(results.filter(Boolean).length,1);assert.deepEqual(results.find(Boolean),{claimed:true,attemptFingerprint});
 const row=db.sql.prepare('SELECT * FROM planner_oauth_states').get();assert.equal(row.provider,'instagram');assert(!JSON.stringify(row).includes(attempt.state));assert(!JSON.stringify(row).includes(binding));
 assert.equal(db.sql.prepare('SELECT COUNT(*) n FROM planner_provider_credentials').get().n,0);
});
