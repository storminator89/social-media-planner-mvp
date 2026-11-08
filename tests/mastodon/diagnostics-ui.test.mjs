import test from 'node:test';
import assert from 'node:assert/strict';
import {describeMastodonFailure} from '../../public/mastodon-diagnostics.js';
test('UI only displays fixed allowlisted diagnostics and ignores provider/server raw text',()=>{
 const data={error:{code:'MASTODON_PREFLIGHT_FAILED',stage:'metadata',reason:'RESPONSE_ORIGIN_INVALID',registrationAttempted:false,message:'PRIVATE_SECRET'}};
 assert.match(describeMastodonFailure(data),/Antwortursprung/);assert.doesNotMatch(describeMastodonFailure(data),/PRIVATE_SECRET/);
 for(const patch of [{reason:'PRIVATE_SECRET'},{registrationAttempted:true},{stage:'PRIVATE_SECRET'},{code:'PRIVATE_SECRET'}])assert.equal(describeMastodonFailure({error:{...data.error,...patch}}),'Ausgang unklar. Nicht erneut starten; Status prüfen.');
 for(const value of [null,{},'bad',{error:null}])assert.match(describeMastodonFailure(value),/Ausgang unklar/);
});
test('request construction failure uses fixed safe UI text',()=>{
 const value={error:{code:'MASTODON_PREFLIGHT_FAILED',stage:'metadata',reason:'REQUEST_CONSTRUCTION_FAILED',registrationAttempted:false,message:'PRIVATE'}};
 assert.match(describeMastodonFailure(value),/Serveranfrage konnte nicht erstellt werden/);
 assert.doesNotMatch(describeMastodonFailure(value),/PRIVATE/);
});
