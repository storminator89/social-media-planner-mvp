import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {LINKEDIN_SETUP_DATA as data} from '../../public/linkedin-setup.js';

test('LinkedIn setup is three concise informational steps with implemented callback',()=>{
  assert.deepEqual(Object.keys(data),['provider','title','summary','steps','callbackPath','limitations']);
  assert.equal(data.provider,'linkedin');assert.equal(data.steps.length,3);
  assert.equal(data.callbackPath,'/api/providers/linkedin/oauth/callback');
  for(const step of data.steps){assert.deepEqual(Object.keys(step),['id','title','description','details','links']);assert.ok(step.title.length<65);assert.ok(step.description.length<150);assert.ok(step.details.length<=3);}
});
test('all setup data are deeply frozen and contain no synthetic completion state',()=>{
  function check(v){if(v&&typeof v==='object'){assert.ok(Object.isFrozen(v));for(const x of Object.values(v))check(x);}}
  check(data);assert.throws(()=>{data.steps[0].title='Freigeschaltet';},TypeError);
  assert.ok(!Object.hasOwn(data,'connected'));assert.ok(!Object.hasOwn(data,'enabled'));assert.ok(!Object.hasOwn(data,'completed'));
});
test('only fixed official HTTPS help links, no authorization or local targets',()=>{
  for(const step of data.steps)for(const link of step.links){const u=new URL(link.url);assert.equal(u.origin,'https://learn.microsoft.com');assert.equal(u.search,'');assert.equal(u.hash,'');assert.equal(u.username,'');assert.ok(!u.pathname.includes('/oauth/v2/authorization'));}
});
test('instructions preserve real setup and token limits without refresh promises',()=>{
  const text=JSON.stringify(data);for(const word of ['openid','profile','w_member_social','Share on LinkedIn','OpenID Connect','noch nicht verfügbar','verschlüsselte Speicherung'])assert.ok(text.includes(word));
  assert.ok(!text.includes('takt-private-test'));assert.ok(!text.includes('client_secret='));
});
test('metadata module performs no network, storage, DOM or runtime activation',async()=>{
  const source=await readFile(new URL('../../public/linkedin-setup.js',import.meta.url),'utf8');
  for(const word of ['fetch(','localStorage','sessionStorage','document.','globalThis.','location.','TAKT_LINKEDIN_ENABLED','window.'])assert.ok(!source.includes(word),word);
});
