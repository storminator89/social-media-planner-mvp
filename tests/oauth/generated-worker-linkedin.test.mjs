import {checkCallbackLandings} from '../worker/oauth-landing-support.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext, runInContext} from 'node:vm';
import {randomBytes, webcrypto} from 'node:crypto';
import {D1TestAdapter} from '../data/support.mjs';
import {createProviderFixture} from './linkedin-provider-fixture.mjs';

const origin = 'https://planner.example';
const root = '/api/providers/linkedin';
const callback = root + '/oauth/callback';
const source = readFileSync(new URL('../../dist/server/index.js', import.meta.url), 'utf8');

async function setup(t) {
  const DB = new D1TestAdapter();
  t.after(() => DB.sql.close());
  const provider = await createProviderFixture();
  // Exercise the actual built entry and its global fetch composition. The VM has
  // no Node globals, network implementation, credentials or external access.
  const context = createContext({crypto: webcrypto, TextEncoder, TextDecoder,
    Uint8Array, URL, URLSearchParams, Request, Response, Headers, AbortController,
    performance, setTimeout, clearTimeout, atob, btoa, fetch: provider.transport});
  assert.equal((source.match(/export default /g) ?? []).length, 1);
  runInContext(source.replace('export default ', 'globalThis.worker = '), context);
  assert.equal(runInContext('typeof process + ":" + typeof Buffer', context), 'undefined:undefined');
  checkCallbackLandings(context.worker,'linkedin',()=>provider.requests.length);
  const env = {DB, TAKT_LINKEDIN_ENABLED: 'true',
    TAKT_LINKEDIN_CONFIGURATION: JSON.stringify({siteId:'built-fixture', siteOrigin:origin,
      clientId:provider.clientId, redirectUri:origin+callback, accountType:'personal',
      appConfigVersion:'v1', expectedIssuer:provider.issuer, reviewedSiteIdentity:true,
      reviewedNonceContract:true, approvedPersonalAccount:true}),
    TAKT_LINKEDIN_CLIENT_SECRET:provider.clientSecret,
    TAKT_TOKEN_KEYRING_JSON:JSON.stringify({activeKeyId:'fixture',keys:{fixture:randomBytes(32).toString('base64')}})};
  async function request(path, {method='GET', owner='alice', body, headers={}}={}) {
    return context.worker.fetch(new Request(origin+path, {method,
      headers:{'oai-authenticated-user-id':owner,
        ...(method==='POST'?{Origin:origin,'Content-Type':'application/json','X-Planner-Request':'1'}:{}),...headers},
      ...(body===undefined?{}:{body:JSON.stringify(body)})}), env);
  }
  async function begin() {
    const response = await request(root+'/oauth/start', {method:'POST',body:{accountType:'personal'}});
    assert.equal(response.status,200);
    assert.match(response.headers.get('Set-Cookie'),/; Secure; HttpOnly; SameSite=Lax;/);
    const url = new URL((await response.json()).authorizationUrl);
    provider.setNonce(url.searchParams.get('nonce'));
    return {state:url.searchParams.get('state'),cookie:response.headers.get('Set-Cookie').split(';')[0]};
  }
  const complete=(attempt, query='code=fixture-code', owner='alice')=>request(callback+'?state='+attempt.state+'&'+query,
    {owner,headers:{Cookie:attempt.cookie,'Sec-Fetch-Site':'cross-site'}});
  return {DB,provider,env,request,begin,complete};
}
const outcome=response=>new URL(response.headers.get('Location')).searchParams.get('linkedin');

test('built Worker completes signed LinkedIn linking, rejects replay and removes local credentials',async t=>{
  const c=await setup(t), attempt=await c.begin();
  assert.equal(c.provider.requests.length,0);
  assert.equal(outcome(await c.complete(attempt)),'linked');
  assert.equal(c.provider.requests.length,3);
  const readiness=await (await c.request(root+'/oauth/readiness')).json();
  assert.equal(readiness.stage,'linked');
  assert.equal(readiness.capabilities.publishing,false);
  const stored=JSON.stringify(c.DB.sql.prepare('SELECT * FROM planner_provider_credentials').all());
  for(const secret of [c.provider.accessToken,c.provider.clientSecret,attempt.state])assert.ok(!stored.includes(secret));
  assert.equal(outcome(await c.complete(attempt)),'failed');
  assert.equal(c.provider.requests.length,3);
  const response=await c.request(root+'/disconnect',{method:'POST',body:{connectionId:readiness.connection.id,expectedRevision:readiness.connection.revision}});
  assert.equal(response.status,204);
  const row=c.DB.sql.prepare('SELECT lifecycle,ciphertext,subject FROM planner_provider_credentials').get();
  assert.equal(row.lifecycle,'disconnected');assert.equal(row.ciphertext,null);assert.equal(row.subject,null);
  assert.equal(c.provider.requests.length,3);
});

test('built Worker rejects a valid signature for a wrong nonce without storing a token or calling userinfo',async t=>{
  const c=await setup(t),attempt=await c.begin();
  c.provider.options.claims.nonce=randomBytes(32).toString('base64url');
  assert.equal(outcome(await c.complete(attempt)),'failed');
  assert.equal(c.provider.requests.length,2);
  assert.equal(c.DB.sql.prepare("SELECT COUNT(*) n FROM planner_provider_credentials WHERE lifecycle='active'").get().n,0);
});

test('built Worker protects owner binding and processes consent denial without provider calls',async t=>{
  const c=await setup(t),attempt=await c.begin();
  assert.equal(outcome(await c.complete(attempt,'code=fixture-code','bob')),'failed');
  assert.equal(c.DB.sql.prepare('SELECT consumed_at_ms FROM planner_oauth_states').get().consumed_at_ms,null);
  const denied=await c.complete(attempt,'error=access_denied');
  assert.equal(outcome(denied),'cancelled');
  assert.match(denied.headers.get('Set-Cookie'),/Max-Age=0/);
  assert.equal(c.provider.requests.length,0);
  assert.equal(outcome(await c.complete(attempt)),'failed');
});
