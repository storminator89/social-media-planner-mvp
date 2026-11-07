import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes, createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createYouTubeOfflineConfiguration, GOOGLE_ISSUER, GOOGLE_TOKEN_ENDPOINT, YOUTUBE_REQUIRED_SCOPES} from '../../modules/oauth/youtube-contract.mjs';
import {createYouTubeConfidentialWebFlow, YouTubeWebBeginError, YOUTUBE_JWKS_ENDPOINT, YOUTUBE_USERINFO_ENDPOINT, YOUTUBE_CHANNELS_ENDPOINT} from '../../modules/oauth/youtube-web-transport.mjs';
import {createProviderFixture, fixtureResponse} from './youtube-provider-fixture.mjs';
import {D1TestAdapter, fixtureCipher} from './support.mjs';
const NOW = 1794000000000;
const clock = () => NOW;
const operatingContract = () => ({issuer: GOOGLE_ISSUER, codeInjectionDefense: 'pkce_s256_and_oidc_nonce', serverConfirmedWebContract: true});
const configuration = () => createYouTubeOfflineConfiguration({siteId: 'fixture-site', siteOrigin: 'https://planner.example', clientId: '123456789012-fixture.apps.googleusercontent.com', redirectUri: 'https://planner.example/api/providers/youtube/oauth/callback', accountType: 'channel', expectedChannelId: 'UC1234567890123456789012', appConfigVersion: 'v1'});
async function setup(t, options = {}) {
  const db = new D1TestAdapter(); t.after(() => db.sql.close());
  const config = await configuration(), provider = await createProviderFixture({clock});
  let hookCalls = 0;
  const dependencies = {cipher: await fixtureCipher(), clientSecret: provider.clientSecret, transport: provider.transport, clock, operatingContract: operatingContract(), beforeExchange: async (...args) => {
    assert.equal(args.length, 1); assert.ok(Object.isFrozen(args[0]));
    assert.equal(args[0].ownerId, 'alice'); assert.equal(args[0].siteId, config.siteId);
    assert.equal(args[0].configFingerprint, config.configFingerprint); assert.equal(args[0].contextFingerprint, config.contextFingerprint);
    assert.match(args[0].stateHash, /^[0-9a-f]{64}$/); hookCalls++;
    assert.notEqual(db.sql.prepare('SELECT consumed_at_ms FROM planner_youtube_oauth_states').get().consumed_at_ms, null);
    assert.equal(provider.requests.length, 0);
    return true;
  }, ...options};
  const flow = createYouTubeConfidentialWebFlow(db, config, dependencies);
  const browserBinding = randomBytes(32).toString('base64url');
  const attempt = await flow.begin('alice', browserBinding); provider.setAttempt(attempt);
  const context = {trustedOwner: 'alice', browserBinding, callbackUrl: config.redirectUri + '?state=' + attempt.state + '&code=fixture-authorization-code&iss=' + encodeURIComponent(GOOGLE_ISSUER)};
  return {db, config, provider, flow, dependencies, attempt, context, get hookCalls() { return hookCalls; }};
}
async function runFailure(t, mutate, {code, status = 'verification_failed', calls} = {}) {
  const c = await setup(t); await mutate(c);
  const result = await c.flow.completeCallback(c.context);
  assert.equal(result.status, status); if (code) assert.equal(result.code, code);
  assert.equal(result.connected, false); assert.equal(result.publishing, false); assert.equal(result.retryAllowed, false);
  assert.equal(result.accessToken, undefined); if (calls !== undefined) assert.equal(c.provider.requests.length, calls);
  const serialized = JSON.stringify(result);
  for (const secret of [c.provider.clientSecret, c.provider.accessToken, c.attempt.nonce, 'fixture-authorization-code']) assert.ok(!serialized.includes(secret));
  const count = c.provider.requests.length;
  assert.equal((await c.flow.completeCallback(c.context)).status, 'invalid_attempt');
  assert.equal(c.provider.requests.length, count);
  return {c, result};
}

test('cryptographic happy path: one claimed state → POST → JWKS → matching userinfo → exact channel; no connection, refresh or profile persistence', async t => {
  const c = await setup(t); c.provider.options.token.refresh_token = 'unexpected-refresh-do-not-store';
  c.provider.options.userinfo = {email: 'discard@example.invalid', name: 'Discard profile'};
  assert.equal(c.hookCalls, 0);
  const result = await c.flow.completeCallback(c.context);
  assert.equal(result.status, 'identity_verified'); assert.equal(c.hookCalls, 1);
  assert.deepEqual(result.identity, {issuer: GOOGLE_ISSUER, subject: c.provider.subject, channelId:'UC1234567890123456789012'});
  assert.deepEqual(result.grantedScopes, YOUTUBE_REQUIRED_SCOPES);
  assert.equal(result.accessToken, c.provider.accessToken); assert.equal(result.expiresAtMs, NOW + 3600000);
  assert.equal(result.connected, false); assert.equal(result.publishing, false); assert.equal(result.refreshSupported, false);
  assert.ok(Object.isFrozen(result)); assert.ok(Object.isFrozen(result.identity)); assert.ok(Object.isFrozen(result.grantedScopes));
  assert.ok(!JSON.stringify(result).includes(c.provider.accessToken)); assert.equal({...result}.accessToken, undefined);
  assert.equal(result.refreshToken, undefined); assert.ok(!JSON.stringify(result).includes('discard'));
  assert.deepEqual(c.provider.requests.map(r => r.url), [GOOGLE_TOKEN_ENDPOINT, YOUTUBE_JWKS_ENDPOINT, YOUTUBE_USERINFO_ENDPOINT, YOUTUBE_CHANNELS_ENDPOINT]);
  for (const request of c.provider.requests) {
    assert.equal(request.redirect, 'error'); assert.equal(request.credentials, 'omit'); assert.equal(request.cache, 'no-store');
    assert.equal(request.referrerPolicy, 'no-referrer'); assert.equal(request.headers.get('cookie'), null);
  }
  const post = c.provider.requests[0], params = new URLSearchParams(await post.text());
  assert.equal(post.method, 'POST'); assert.equal(post.headers.get('content-type'), 'application/x-www-form-urlencoded');
  assert.deepEqual(Object.fromEntries(params), {grant_type: 'authorization_code', code: 'fixture-authorization-code', client_id: c.config.clientId, client_secret: c.provider.clientSecret, redirect_uri: c.config.redirectUri, code_verifier: params.get('code_verifier')});
  assert.equal(createHash('sha256').update(params.get('code_verifier')).digest('base64url'), c.attempt.codeChallenge);
  assert.equal(post.headers.get('authorization'), null); assert.equal(c.provider.requests[1].headers.get('authorization'), null);
  assert.equal(c.provider.requests[2].headers.get('authorization'), 'Bearer ' + c.provider.accessToken);
  assert.equal(c.db.sql.prepare('SELECT COUNT(*) n FROM planner_youtube_credentials').get().n, 0);
  const persisted = JSON.stringify(c.db.sql.prepare('SELECT * FROM planner_youtube_oauth_states').all());
  for (const value of [c.attempt.nonce, c.attempt.state, c.provider.clientSecret, c.provider.accessToken, 'unexpected-refresh-do-not-store']) assert.ok(!persisted.includes(value));
});

test('concurrent callbacks claim exactly once and do not exchange the same code twice', async t => {
  const c = await setup(t);
  const results = await Promise.all([c.flow.completeCallback(c.context), c.flow.completeCallback(c.context)]);
  assert.deepEqual(results.map(r => r.status).sort(), ['identity_verified', 'invalid_attempt']);
  assert.equal(c.hookCalls, 1); assert.equal(c.provider.requests.filter(r => r.url === GOOGLE_TOKEN_ENDPOINT).length, 1);
});

test('wrong owner, browser, malformed callback and denial never invoke hook or transport', async t => {
  const c = await setup(t);
  for (const patch of [{trustedOwner: 'bob'}, {browserBinding: randomBytes(32).toString('base64url')}, {callbackUrl: c.context.callbackUrl + '&code=duplicate'}]) {
    const result = await c.flow.completeCallback({...c.context, ...patch}); assert.notEqual(result.status, 'identity_verified');
  }
  assert.equal(c.hookCalls, 0); assert.equal(c.provider.requests.length, 0);
  const denial = await c.flow.completeCallback({...c.context, callbackUrl: c.config.redirectUri + '?state=' + c.attempt.state + '&error=access_denied&error_description=private-provider-text&iss=' + encodeURIComponent(GOOGLE_ISSUER)});
  assert.equal(denial.status, 'provider_denied'); assert.ok(!JSON.stringify(denial).includes('private-provider-text'));
  assert.equal(c.hookCalls, 0); assert.equal(c.provider.requests.length, 0);
});

test('unknown committed claim is redacted and never progresses to hook or exchange', async t => {
  const c = await setup(t), original = c.db.batch.bind(c.db); let batches = 0;
  c.db.batch = async statements => { batches++; await original(statements); throw new Error(c.provider.clientSecret); };
  assert.equal((await c.flow.completeCallback(c.context)).status, 'claim_outcome_unknown');
  assert.equal(batches, 1); assert.equal(c.hookCalls, 0); assert.equal(c.provider.requests.length, 0);
  c.db.batch = original; assert.equal((await c.flow.completeCallback(c.context)).status, 'invalid_attempt');
});

for (const [name, claims, code] of [
  ['documentation sample issuer is NOT another accepted issuer', {iss: 'https://accounts.google.com.evil.example'}, 'ID_TOKEN_ISSUER_INVALID'],
  ['wrong audience', {aud: 'other-client'}, 'ID_TOKEN_AUDIENCE_INVALID'],
  ['extra audience even with matching azp', {aud: ['123456789012-fixture.apps.googleusercontent.com', 'other-client'], azp: '123456789012-fixture.apps.googleusercontent.com'}, 'ID_TOKEN_AUDIENCE_INVALID'],
  ['duplicate audience', {aud: ['123456789012-fixture.apps.googleusercontent.com', '123456789012-fixture.apps.googleusercontent.com']}, 'ID_TOKEN_AUDIENCE_INVALID'],
  ['wrong azp', {azp: 'other-client'}, 'ID_TOKEN_AUDIENCE_INVALID'],
  ['null azp', {azp: null}, 'ID_TOKEN_AUDIENCE_INVALID'],
  ['wrong nonce', {nonce: randomBytes(32).toString('base64url')}, 'ID_TOKEN_NONCE_INVALID'],
  ['missing nonce', {nonce: undefined}, 'ID_TOKEN_NONCE_INVALID'],
  ['malformed nonce', {nonce: 'short'}, 'ID_TOKEN_NONCE_INVALID'],
  ['missing subject', {sub: undefined}, 'ID_TOKEN_SUBJECT_INVALID'],
  ['non-string subject', {sub: 123}, 'ID_TOKEN_SUBJECT_INVALID'],
  ['expired', {exp: NOW / 1000}, 'ID_TOKEN_TIME_INVALID'],
  ['future issued at', {iat: NOW / 1000 + 31}, 'ID_TOKEN_TIME_INVALID'],
  ['stale issued at', {iat: NOW / 1000 - 601}, 'ID_TOKEN_TIME_INVALID'],
  ['missing issued at', {iat: undefined}, 'ID_TOKEN_TIME_INVALID'],
  ['noninteger expiration', {exp: NOW / 1000 + 600.5}, 'ID_TOKEN_TIME_INVALID'],
  ['expiration not after issued at', {iat: NOW / 1000 + 10, exp: NOW / 1000 + 5}, 'ID_TOKEN_TIME_INVALID'],
  ['future not-before', {nbf: NOW / 1000 + 31}, 'ID_TOKEN_TIME_INVALID'],
  ['wrong at_hash', {at_hash: 'wrong'}, 'ID_TOKEN_ACCESS_HASH_INVALID']
]) test('signed JWT rejects ' + name + ' before any userinfo', async t => {
  await runFailure(t, c => { c.provider.options.claims = claims; }, {code, calls: 2});
});

test('optional at_hash and azp; exact singleton aud array is supported', async t => {
  const c = await setup(t); c.provider.options.claims = {at_hash: undefined, aud: [c.config.clientId], azp: c.config.clientId};
  assert.equal((await c.flow.completeCallback(c.context)).status, 'identity_verified');
});

test('modified RS256 signature fails before userinfo', async t => {
  await runFailure(t, async c => {
    const jwt = await c.provider.signJWT(), parts = jwt.split('.'), signature = Buffer.from(parts[2], 'base64url');
    signature[10] ^= 1; parts[2] = signature.toString('base64url'); c.provider.options.jwt = parts.join('.');
  }, {code: 'ID_TOKEN_SIGNATURE_INVALID', calls: 2});
});

for (const header of [{alg: 'none'}, {alg: 'HS256'}, {kid: ''}, {kid: undefined}, {jku: 'https://attacker.invalid/jwks'}, {x5u: 'https://attacker.invalid/key'}, {jwk: {}}, {crit: []}, {b64: false}, {typ: 'JOSE'}]) {
  test('rejects unsafe JOSE header ' + JSON.stringify(header), async t => {
    await runFailure(t, c => { c.provider.options.header = header; }, {code: 'ID_TOKEN_HEADER_INVALID', calls: 1});
  });
}

test('signed duplicate JWT claim and escaped duplicate header are rejected', async t => {
  for (const field of ['claim', 'header']) {
    await runFailure(t, async c => { c.provider.options.jwt = await c.provider.signJWT(field === 'claim' ? {rawClaims: '{"sub":"a","s\\u0075b":"b"}'} : {rawHeader: '{"alg":"RS256","a\\u006cg":"RS256","kid":"a"}'}); }, {code: 'ID_TOKEN_INVALID', calls: 1});
  }
});

test('userinfo subject mismatch or missing sub cannot bind account', async t => {
  for (const sub of ['OtherSubject', 'fixturesubject_123', undefined, 123]) {
    await runFailure(t, c => { c.provider.options.userinfo = {sub}; }, {code: 'USERINFO_SUBJECT_INVALID', calls: 3});
  }
});

for (const scope of [undefined, '', YOUTUBE_REQUIRED_SCOPES.slice(0,2).join(' '), YOUTUBE_REQUIRED_SCOPES.join(' ')+' email', YOUTUBE_REQUIRED_SCOPES.join(' ')+' '+YOUTUBE_REQUIRED_SCOPES[1], YOUTUBE_REQUIRED_SCOPES.join('%20'), YOUTUBE_REQUIRED_SCOPES.join(','), YOUTUBE_REQUIRED_SCOPES, YOUTUBE_REQUIRED_SCOPES.join('  ')]) {
  test('strict explicit scope contract rejects ' + JSON.stringify(scope), async t => {
    await runFailure(t, c => { c.provider.options.token.scope = scope; }, {code: 'GRANTED_SCOPES_INVALID', calls: 1});
  });
}

test('returned scope ordering is irrelevant but result ordering is fixed', async t => {
  const c = await setup(t); c.provider.options.token.scope = [...YOUTUBE_REQUIRED_SCOPES].reverse().join(' ');
  assert.equal((await c.flow.completeCallback(c.context)).status, 'identity_verified');
});

for (const patch of [{token_type: undefined}, {token_type: 'MAC'}, {expires_in: '3600'}, {expires_in: 0}, {expires_in: -1}, {expires_in: 31536001}, {access_token: 'line\nbreak'}, {access_token: 'x'.repeat(8193)}, {access_token: ''}, {error: 'mixed-error'}]) {
  test('token response rejects invalid shape ' + Object.keys(patch).join(), async t => {
    await runFailure(t, c => { c.provider.options.token = patch; }, {code: 'TOKEN_RESPONSE_INVALID', calls: 1});
  });
}

test('JWKS unknown kid, duplicate kid, private keys, wrong algorithm/use/key_ops fail closed', async t => {
  for (const mutate of [
    c => ({keys: [{...c.provider.jwk, kid: 'other'}]}),
    c => ({keys: [c.provider.jwk, c.provider.jwk]}),
    c => ({keys: [{...c.provider.jwk, d: 'private'}]}),
    c => ({keys: [{...c.provider.jwk, alg: 'HS256'}]}),
    c => ({keys: [{...c.provider.jwk, use: 'enc'}]}),
    c => ({keys: [{...c.provider.jwk, key_ops: ['sign', 'verify']}]}),
    c => ({keys: [{...c.provider.jwk, n: Buffer.alloc(128, 255).toString('base64url')}]}),
    c => ({keys: [{...c.provider.jwk, e: 'Ag'}]}),
    () => ({keys: []})
  ]) await runFailure(t, c => { c.provider.options.jwks = mutate(c); }, {code: 'JWKS_INVALID', calls: 2});
});

test('bounded key rotation uses one fresh pinned JWKS request per attempt; no token retry', async t => {
  const c = await setup(t); c.provider.options.jwks = {keys: [{...c.provider.jwk, kid: 'old-key'}, c.provider.jwk]};
  assert.equal((await c.flow.completeCallback(c.context)).status, 'identity_verified');
  assert.equal(c.provider.requests.filter(r => r.url === YOUTUBE_JWKS_ENDPOINT).length, 1);
  assert.equal(c.provider.requests.filter(r => r.url === GOOGLE_TOKEN_ENDPOINT).length, 1);
});

test('transport throw has unknown outcome and redacts exception detail', async t => {
  await runFailure(t, c => { c.provider.overrides.set(GOOGLE_TOKEN_ENDPOINT, () => { throw new Error(c.provider.clientSecret + c.provider.accessToken); }); }, {status: 'exchange_outcome_unknown', code: 'TRANSPORT_OUTCOME_UNKNOWN', calls: 1});
});

test('provider OAuth error is definite rejection but no provider error text is returned', async t => {
  await runFailure(t, c => { c.provider.overrides.set(GOOGLE_TOKEN_ENDPOINT, () => fixtureResponse(GOOGLE_TOKEN_ENDPOINT, {error: 'invalid_grant', error_description: c.provider.clientSecret}, {status: 400})); }, {status: 'exchange_rejected', code: 'PROVIDER_EXCHANGE_REJECTED', calls: 1});
});

for (const [name, build, code] of [
  ['malformed JSON', () => fixtureResponse(GOOGLE_TOKEN_ENDPOINT, '{bad json', {raw: true}), 'RESPONSE_MALFORMED'],
  ['duplicate response keys', () => fixtureResponse(GOOGLE_TOKEN_ENDPOINT, '{"access_token":"a","access_token":"b"}', {raw: true}), 'RESPONSE_MALFORMED'],
  ['nested escaped duplicate', () => fixtureResponse(GOOGLE_TOKEN_ENDPOINT, '{"ignored":{"sub":"a","s\\u0075b":"b"}}', {raw: true}), 'RESPONSE_MALFORMED'],
  ['bad UTF-8', () => fixtureResponse(GOOGLE_TOKEN_ENDPOINT, null, {body: new Uint8Array([0xc3, 0x28])}), 'RESPONSE_MALFORMED'],
  ['unpaired surrogate', () => fixtureResponse(GOOGLE_TOKEN_ENDPOINT, '{"x":"\\ud800"}', {raw: true}), 'RESPONSE_MALFORMED'],
  ['deep nesting', () => fixtureResponse(GOOGLE_TOKEN_ENDPOINT, '{"x":' + '['.repeat(18) + '0' + ']'.repeat(18) + '}', {raw: true}), 'RESPONSE_MALFORMED'],
  ['oversized streamed response', () => fixtureResponse(GOOGLE_TOKEN_ENDPOINT, 'x'.repeat(65537), {raw: true}), 'RESPONSE_TOO_LARGE'],
  ['oversized declared response', () => fixtureResponse(GOOGLE_TOKEN_ENDPOINT, '{}', {raw: true, headers: {'content-length': '65537'}}), 'RESPONSE_TOO_LARGE'],
  ['invalid content length', () => fixtureResponse(GOOGLE_TOKEN_ENDPOINT, '{}', {raw: true, headers: {'content-length': '2,2'}}), 'RESPONSE_TOO_LARGE'],
  ['mismatching content length', () => fixtureResponse(GOOGLE_TOKEN_ENDPOINT, '{}', {raw: true, headers: {'content-length': '3'}}), 'RESPONSE_LENGTH_INVALID'],
  ['HTML content type', () => fixtureResponse(GOOGLE_TOKEN_ENDPOINT, '{}', {raw: true, headers: {'content-type': 'text/html'}}), 'RESPONSE_TYPE_INVALID'],
  ['redirect', () => fixtureResponse(LINKIN(), {}, {status: 302}), 'REDIRECT_REJECTED'],
  ['followed redirect', () => fixtureResponse(LINKIN(), {}, {redirected: true}), 'RESPONSE_ORIGIN_INVALID'],
  ['wrong URL', () => fixtureResponse('https://attacker.invalid/token', {}), 'RESPONSE_ORIGIN_INVALID'],
  ['empty URL', () => new Response('{}', {headers: {'content-type': 'application/json'}}), 'RESPONSE_ORIGIN_INVALID'],
  ['plain object pretending to be Response', () => ({url: LINKIN(), redirected: false, status: 200, headers: new Headers({'content-type': 'application/json'}), body: new Blob(['{}']).stream()}), 'RESPONSE_ORIGIN_INVALID'],
  ['provider 500', () => fixtureResponse(LINKIN(), {error: 'server_error'}, {status: 500}), 'TOKEN_HTTP_INVALID']
]) test('token endpoint rejects ' + name + ' without replay', async t => {
  await runFailure(t, c => { c.provider.overrides.set(GOOGLE_TOKEN_ENDPOINT, build); }, {status: 'exchange_outcome_unknown', code, calls: 1});
});
function LINKIN() { return GOOGLE_TOKEN_ENDPOINT; }

test('userinfo and JWKS response origin, duplicates and byte limits are enforced too', async t => {
  for (const endpoint of [YOUTUBE_JWKS_ENDPOINT, YOUTUBE_USERINFO_ENDPOINT]) {
    for (const response of [() => fixtureResponse(endpoint + '?redirected=1', {}), () => fixtureResponse(endpoint, '{"sub":"a","sub":"a"}', {raw: true}), () => fixtureResponse(endpoint, 'x'.repeat(65537), {raw: true})]) {
      await runFailure(t, c => { c.provider.overrides.set(endpoint, response); }, {calls: endpoint === YOUTUBE_JWKS_ENDPOINT ? 2 : 3});
    }
  }
});

test('total deadline includes a transport that ignores AbortSignal', async t => {
  const c = await setup(t, {deadlineMs: 40});
  c.provider.overrides.set(GOOGLE_TOKEN_ENDPOINT, () => new Promise(() => {}));
  const start = performance.now(), result = await c.flow.completeCallback(c.context);
  assert.equal(result.status, 'exchange_outcome_unknown'); assert.equal(result.code, 'DEADLINE_EXCEEDED');
  assert.ok(performance.now() - start < 1000); assert.equal(c.provider.requests.length, 1);
  assert.equal((await c.flow.completeCallback(c.context)).status, 'invalid_attempt');
});

test('total deadline includes a stalled streaming body and cancels it', async t => {
  let cancelled = 0;
  const c = await setup(t, {deadlineMs: 40});
  c.provider.overrides.set(GOOGLE_TOKEN_ENDPOINT, () => fixtureResponse(GOOGLE_TOKEN_ENDPOINT, null, {body: new ReadableStream({start(controller) {controller.enqueue(new TextEncoder().encode('{'));}, cancel() {cancelled++;}})}));
  const result = await c.flow.completeCallback(c.context);
  assert.equal(result.status, 'exchange_outcome_unknown'); assert.equal(result.code, 'DEADLINE_EXCEEDED'); assert.equal(cancelled, 1);
  assert.equal(c.provider.requests.length, 1);
});

test('one deadline is shared across stages, not reset for JWKS or userinfo', async t => {
  const c = await setup(t, {deadlineMs: 90}), original = c.provider.transport;
  const delayed = async request => {await new Promise(r => setTimeout(r, 55)); return original(request);};
  const flow = createYouTubeConfidentialWebFlow(c.db, c.config, {...c.dependencies, transport: delayed});
  const start = performance.now(), result = await flow.completeCallback(c.context);
  assert.equal(result.status, 'verification_failed'); assert.equal(result.code, 'DEADLINE_EXCEEDED');
  assert.ok(performance.now() - start < 1000);
  await new Promise(r => setTimeout(r, 80));
  assert.ok(!c.provider.requests.some(r => r.url === YOUTUBE_USERINFO_ENDPOINT));
});

test('late successful exchange response never advances after deadline', async t => {
  const c = await setup(t, {deadlineMs: 25}), original = c.provider.transport;
  const flow = createYouTubeConfidentialWebFlow(c.db, c.config, {...c.dependencies, transport: async request => {await new Promise(r => setTimeout(r, 60)); return original(request);}});
  assert.equal((await flow.completeCallback(c.context)).status, 'exchange_outcome_unknown');
  await new Promise(r => setTimeout(r, 80));
  assert.equal(c.provider.requests.length, 1);
});

test('required pre-exchange fence runs after claim; rejection or uncertainty never calls provider', async t => {
  for (const [beforeExchange, expected] of [[() => false, 'before_exchange_rejected'], [() => ({}), 'before_exchange_rejected'], [() => {throw new Error('sensitive-fence-detail');}, 'before_exchange_outcome_unknown'], [() => new Promise(() => {}), 'before_exchange_outcome_unknown']]) {
    const c = await setup(t, {beforeExchange, deadlineMs: 30});
    const result = await c.flow.completeCallback(c.context);
    assert.equal(result.status, expected); assert.equal(c.provider.requests.length, 0);
    assert.equal((await c.flow.completeCallback(c.context)).status, 'invalid_attempt');
  }
});

test('claim deadline cannot lead to a late provider call', async t => {
  const c = await setup(t, {deadlineMs: 25}), original = c.db.batch.bind(c.db);
  c.db.batch = async statements => {await new Promise(r => setTimeout(r, 60)); return original(statements);};
  assert.equal((await c.flow.completeCallback(c.context)).status, 'claim_outcome_unknown');
  await new Promise(r => setTimeout(r, 80)); assert.equal(c.hookCalls, 0); assert.equal(c.provider.requests.length, 0);
  c.db.batch = original; assert.equal((await c.flow.completeCallback(c.context)).status, 'invalid_attempt');
});

test('begin deadline reports unknown storage outcome; an already started late commit yields no auth attempt or retry', async t => {
  const c = await setup(t), original = c.db.batch.bind(c.db);
  let release, started, committed, batchCalls = 0, returnedAttempt;
  const gate = new Promise(r => { release = r; });
  const dispatched = new Promise(r => { started = r; });
  const finished = new Promise(r => { committed = r; });
  c.db.batch = async statements => { batchCalls++; started(); await gate; const result = await original(statements); committed(); return result; };
  const flow = createYouTubeConfidentialWebFlow(c.db, c.config, {...c.dependencies, deadlineMs: 30});
  const pending = flow.begin('alice', c.context.browserBinding).then(value => { returnedAttempt = value; return value; });
  const rejected = assert.rejects(pending, error => {
    assert.ok(error instanceof YouTubeWebBeginError);
    assert.equal(error.code, 'STATE_BEGIN_OUTCOME_UNKNOWN'); assert.equal(error.status, 'begin_outcome_unknown');
    assert.equal(error.retryAllowed, false); assert.equal(error.connected, false); assert.equal(error.publishing, false);
    assert.equal(error.cause, undefined); assert.equal(error.state, undefined); assert.equal(error.nonce, undefined);
    return true;
  });
  await dispatched; await rejected;
  assert.equal(c.db.sql.prepare('SELECT count(*) AS n FROM planner_youtube_oauth_states').get().n, 1);
  release(); await finished; await new Promise(r => setTimeout(r, 10));
  assert.equal(c.db.sql.prepare('SELECT count(*) AS n FROM planner_youtube_oauth_states').get().n, 2);
  assert.equal(returnedAttempt, undefined); assert.equal(batchCalls, 1); assert.equal(c.provider.requests.length, 0);
});

test('begin deadline before PKCE encryption finishes prevents any late database write', async t => {
  const c = await setup(t), originalEncrypt = crypto.subtle.encrypt.bind(crypto.subtle), originalBatch = c.db.batch.bind(c.db);
  let release, entered, encrypted, batchCalls = 0;
  const gate = new Promise(r => { release = r; });
  const encryptionStarted = new Promise(r => { entered = r; });
  const encryptionFinished = new Promise(r => { encrypted = r; });
  t.mock.method(crypto.subtle, 'encrypt', async (...args) => {
    entered(); await gate; const value = await originalEncrypt(...args); encrypted(); return value;
  });
  c.db.batch = async statements => { batchCalls++; return originalBatch(statements); };
  const flow = createYouTubeConfidentialWebFlow(c.db, c.config, {...c.dependencies, deadlineMs: 30});
  const rejected = assert.rejects(flow.begin('alice', c.context.browserBinding), error => error.code === 'STATE_BEGIN_OUTCOME_UNKNOWN');
  await encryptionStarted; await rejected; release(); await encryptionFinished; await new Promise(r => setTimeout(r, 10));
  assert.equal(batchCalls, 0);
  assert.equal(c.db.sql.prepare('SELECT count(*) AS n FROM planner_youtube_oauth_states').get().n, 1);
  assert.equal(c.provider.requests.length, 0);
});

test('begin checks its deadline immediately before batch dispatch, not only before statement preparation', async t => {
  const c = await setup(t), originalPrepare = c.db.prepare.bind(c.db);
  let prepared = 0, batchCalls = 0;
  c.db.prepare = (...args) => {
    const statement = originalPrepare(...args), originalBind = statement.bind;
    statement.bind = function (...values) {
      if (++prepared === 2) { const until = performance.now() + 50; while (performance.now() < until) {} }
      return originalBind.apply(this, values);
    };
    return statement;
  };
  c.db.batch = async () => { batchCalls++; throw new Error('must not dispatch'); };
  const flow = createYouTubeConfidentialWebFlow(c.db, c.config, {...c.dependencies, deadlineMs: 30});
  await assert.rejects(flow.begin('alice', c.context.browserBinding), error => error.code === 'STATE_BEGIN_OUTCOME_UNKNOWN');
  assert.equal(prepared, 2); assert.equal(batchCalls, 0); assert.equal(c.provider.requests.length, 0);
  assert.equal(c.db.sql.prepare('SELECT count(*) AS n FROM planner_youtube_oauth_states').get().n, 1);
});

test('begin quota has a separate fixed runtime code; a deliberate new attempt succeeds after the five minute TTL', async t => {
  let time = NOW;
  const c = await setup(t, {clock: () => time});
  for (let i = 0; i < 4; i++) await c.flow.begin('alice', c.context.browserBinding);
  await assert.rejects(c.flow.begin('alice', c.context.browserBinding), error => {
    assert.ok(error instanceof YouTubeWebBeginError);
    assert.equal(error.code, 'STATE_LIMIT_REACHED'); assert.equal(error.status, 'begin_limit_reached');
    assert.equal(error.retryAllowed, false); assert.equal(error.cause, undefined);
    return true;
  });
  assert.equal(c.db.sql.prepare('SELECT count(*) AS n FROM planner_youtube_oauth_states').get().n, 5);
  time += 300000;
  const attempt = await c.flow.begin('alice', c.context.browserBinding);
  assert.match(attempt.state, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(c.db.sql.prepare('SELECT count(*) AS n FROM planner_youtube_oauth_states').get().n, 1);
  assert.equal(c.provider.requests.length, 0);
});

for (const commitFirst of [false, true]) test(`begin storage rejection is redacted and never misclassified as config or quota; committed=${commitFirst}`, async t => {
  const c = await setup(t), original = c.db.batch.bind(c.db);
  c.db.batch = async statements => { if (commitFirst) await original(statements); throw new Error('secret database connection detail'); };
  await assert.rejects(c.flow.begin('alice', c.context.browserBinding), error => {
    assert.equal(error.code, 'STATE_BEGIN_OUTCOME_UNKNOWN'); assert.equal(error.retryAllowed, false);
    assert.doesNotMatch(error.message + JSON.stringify(error) + error.stack, /secret database connection detail/);
    assert.equal(error.cause, undefined); return true;
  });
  assert.equal(c.db.sql.prepare('SELECT count(*) AS n FROM planner_youtube_oauth_states').get().n, commitFirst ? 2 : 1);
  assert.equal(c.provider.requests.length, 0);
});

test('configuration must be explicit, server-owned, immutable primitives; never default to global fetch', async t => {
  const c = await setup(t); let calls = 0; const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {calls++; throw new Error('global fetch forbidden');}; t.after(() => {globalThis.fetch = originalFetch;});
  for (const patch of [{transport: undefined}, {beforeExchange: undefined}, {clientSecret: ''}, {operatingContract: undefined}, {operatingContract: {...operatingContract(), serverConfirmedWebContract: false}}, {operatingContract: {...operatingContract(), issuer: 'https://accounts.google.com.evil.example'}}, {operatingContract: {...operatingContract(), codeInjectionDefense: 'pkce'}}, {deadlineMs: 0}, {deadlineMs: 30001}, {clock: undefined}]) {
    assert.throws(() => createYouTubeConfidentialWebFlow(c.db, c.config, {...c.dependencies, ...patch}), error => error.code === 'INVALID_WEB_CONFIGURATION');
  }
  assert.throws(() => createYouTubeConfidentialWebFlow(c.db, {...c.config}, c.dependencies));
  let getterCalls = 0; const options = {...c.dependencies}; Object.defineProperty(options, 'transport', {enumerable: true, get() {getterCalls++; return c.provider.transport;}});
  assert.throws(() => createYouTubeConfidentialWebFlow(c.db, c.config, options)); assert.equal(getterCalls, 0);
  assert.equal((await c.flow.completeCallback(c.context)).status, 'identity_verified'); assert.equal(calls, 0);
});

test('post-construction config mutation and callback mutation across awaits do not change destination or owner', async t => {
  const c = await setup(t);
  c.dependencies.clientSecret = 'mutated-secret'; c.dependencies.operatingContract.issuer = 'https://attacker.invalid';
  const context = {...c.context}, completion = c.flow.completeCallback(context);
  context.trustedOwner = 'bob'; context.callbackUrl = 'https://attacker.invalid/callback';
  assert.equal((await completion).status, 'identity_verified');
  const form = new URLSearchParams(await c.provider.requests[0].text()); assert.equal(form.get('client_secret'), c.provider.clientSecret);
});

test('production module contains no Node imports, bare dependencies, global fetch or logging', () => {
  const source = readFileSync(new URL('../../modules/oauth/youtube-web-transport.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /from ['"](?:node:|[^.])/); assert.doesNotMatch(source, /\b(?:globalThis\.)?fetch\s*\(/); assert.doesNotMatch(source, /console\./);
});

test('opaque JWT decoding alone never suffices, including missing/oversized/malformed ID tokens', async t => {
  for (const id_token of [undefined, '', 'e30.e30.', 'not.a.jwt.extra', 'x'.repeat(16385)]) {
    await runFailure(t, c => { c.provider.options.token.id_token = id_token; }, {code: id_token === 'e30.e30.' ? 'ID_TOKEN_HEADER_INVALID' : 'ID_TOKEN_INVALID', calls: 1});
  }
});

test('streamed byte limit applies without Content-Length and cancels before subsequent reads', async t => {
  let reads = 0, cancelled = 0;
  await runFailure(t, c => {
    c.provider.overrides.set(GOOGLE_TOKEN_ENDPOINT, () => fixtureResponse(GOOGLE_TOKEN_ENDPOINT, null, {body: new ReadableStream({
      pull(controller) {reads++; controller.enqueue(new Uint8Array(20000).fill(32));}, cancel() {cancelled++;}
    }, {highWaterMark: 0})}));
  }, {status: 'exchange_outcome_unknown', code: 'RESPONSE_TOO_LARGE', calls: 1});
  assert.equal(reads, 4); assert.equal(cancelled, 1);
});

test('fetch-decompressed body is bounded independently of compressed Content-Length', async t => {
  const c = await setup(t);
  c.provider.overrides.set(YOUTUBE_USERINFO_ENDPOINT, () => fixtureResponse(YOUTUBE_USERINFO_ENDPOINT, {sub: c.provider.subject}, {headers: {'content-encoding': 'gzip', 'content-length': '1'}}));
  assert.equal((await c.flow.completeCallback(c.context)).status, 'identity_verified');
});

test('access token expiring during userinfo is not returned for vault storage', async t => {
  let time = NOW;
  const c = await setup(t, {clock: () => time}); c.provider.options.token.expires_in = 1;
  c.provider.overrides.set(YOUTUBE_USERINFO_ENDPOINT, () => {time += 2000; return fixtureResponse(YOUTUBE_USERINFO_ENDPOINT, {sub: c.provider.subject});});
  const result = await c.flow.completeCallback(c.context);
  assert.equal(result.status, 'verification_failed'); assert.equal(result.code, 'ACCESS_TOKEN_EXPIRED'); assert.equal(result.accessToken, undefined);
});

test('new factory after restart cannot retry an already consumed unknown exchange', async t => {
  const c = await setup(t); c.provider.overrides.set(GOOGLE_TOKEN_ENDPOINT, () => {throw new Error('connection lost after submit');});
  assert.equal((await c.flow.completeCallback(c.context)).status, 'exchange_outcome_unknown');
  const restarted = createYouTubeConfidentialWebFlow(c.db, c.config, c.dependencies);
  assert.equal((await restarted.completeCallback(c.context)).status, 'invalid_attempt'); assert.equal(c.provider.requests.length, 1);
});

test('attempt binding rejects A/B hook mixups even for the same owner before any network call', async t => {
  const c = await setup(t);
  const second = await c.flow.begin('alice', c.context.browserBinding);
  const expectedA = {ownerId: 'alice', siteId: c.config.siteId, configFingerprint: c.config.configFingerprint, contextFingerprint: c.config.contextFingerprint, stateHash: createHash('sha256').update(c.attempt.state).digest('hex'), expectedChannelId:c.config.expectedChannelId};
  let seenBinding;
  const fenced = createYouTubeConfidentialWebFlow(c.db, c.config, {...c.dependencies, beforeExchange: binding => {
    seenBinding = binding; return JSON.stringify(binding) === JSON.stringify(expectedA);
  }});
  const wrong = await fenced.completeCallback({...c.context, callbackUrl: c.config.redirectUri + '?state=' + second.state + '&code=second-code&iss=' + encodeURIComponent(GOOGLE_ISSUER)});
  assert.equal(wrong.status, 'before_exchange_rejected'); assert.equal(seenBinding.ownerId, 'alice');
  assert.notEqual(seenBinding.stateHash, expectedA.stateHash); assert.equal(c.provider.requests.length, 0);
  const correct = await fenced.completeCallback(c.context);
  assert.equal(correct.status, 'identity_verified'); assert.deepEqual(correct.attemptBinding, expectedA);
  assert.equal(correct.attemptBinding, seenBinding); assert.ok(Object.isFrozen(correct.attemptBinding));
  assert.deepEqual(Object.keys(correct.attemptBinding), ['ownerId', 'siteId', 'configFingerprint', 'contextFingerprint', 'stateHash', 'expectedChannelId']);
});

test('two genuine successful verifications retain distinct same-owner binding for ticket commit checks', async t => {
  const c = await setup(t);
  let hookBinding;
  const flow = createYouTubeConfidentialWebFlow(c.db, c.config, {...c.dependencies, beforeExchange: binding => {hookBinding = binding; return true;}});
  const second = await flow.begin('alice', c.context.browserBinding);
  const resultA = await flow.completeCallback(c.context), ticketA = hookBinding;
  c.provider.setAttempt(second, 'second-code');
  const resultB = await flow.completeCallback({...c.context, callbackUrl: c.config.redirectUri + '?state=' + second.state + '&code=second-code&iss=' + encodeURIComponent(GOOGLE_ISSUER)}), ticketB = hookBinding;
  assert.equal(resultA.status, 'identity_verified'); assert.equal(resultB.status, 'identity_verified');
  assert.equal(resultA.attemptBinding, ticketA); assert.equal(resultB.attemptBinding, ticketB);
  assert.equal(ticketA.ownerId, ticketB.ownerId); assert.notEqual(ticketA.stateHash, ticketB.stateHash);
  assert.notDeepEqual(resultA.attemptBinding, ticketB); assert.notDeepEqual(resultB.attemptBinding, ticketA);
  assert.equal(c.provider.requests.filter(r => r.url === GOOGLE_TOKEN_ENDPOINT).length, 2);
});

for (const kind of ['Buffer', 'Uint8Array subclass']) {
  test('streamed response owns a stable copy when the transport reuses a ' + kind + ' chunk', async t => {
    const c = await setup(t);
    const payload = new TextEncoder().encode(JSON.stringify({
      access_token: c.provider.accessToken, token_type: 'Bearer', expires_in: 3600,
      scope: YOUTUBE_REQUIRED_SCOPES.join(' '), id_token: await c.provider.signJWT()
    }));
    class ViewSliceBytes extends Uint8Array {
      slice(start, end) { return this.subarray(start, end); }
    }
    const chunk = kind === 'Buffer' ? Buffer.from(payload) : new ViewSliceBytes(payload);
    let pulls = 0;
    c.provider.overrides.set(GOOGLE_TOKEN_ENDPOINT, () => fixtureResponse(GOOGLE_TOKEN_ENDPOINT, null, {
      body: new ReadableStream({
        pull(controller) {
          if (pulls++ === 0) controller.enqueue(chunk);
          else { chunk.fill(32); controller.close(); }
        }
      }, {highWaterMark: 0})
    }));
    const result = await c.flow.completeCallback(c.context);
    assert.equal(pulls, 2); assert.ok(chunk.every(byte => byte === 32));
    assert.equal(result.status, 'identity_verified');
    assert.equal(result.accessToken, c.provider.accessToken); assert.equal(c.provider.requests.length, 4);
  });
}

test('Google documented bare ID-token issuer normalizes, while callback issuer remains HTTPS', async t => {
  const c = await setup(t); c.provider.options.claims.iss = 'accounts.google.com';
  const result = await c.flow.completeCallback(c.context);
  assert.equal(result.status,'identity_verified'); assert.equal(result.identity.issuer,GOOGLE_ISSUER);
});

test('same-owner authorizations cannot exchange a code using the other attempt verifier', async t => {
  const c = await setup(t), second = await c.flow.begin('alice',c.context.browserBinding);
  c.provider.setAttempt(second,'second-code');
  const mixed = await c.flow.completeCallback({...c.context,callbackUrl:c.context.callbackUrl.replace('fixture-authorization-code','second-code')});
  assert.equal(mixed.status,'exchange_rejected');
  assert.equal(c.provider.requests.length,1);
  const form = new URLSearchParams(await c.provider.requests[0].text());
  const actualChallenge = createHash('sha256').update(form.get('code_verifier')).digest('base64url');
  assert.equal(actualChallenge,c.attempt.codeChallenge); assert.notEqual(actualChallenge,second.codeChallenge);
  assert.equal((await c.flow.completeCallback(c.context)).status,'invalid_attempt');
});

test('different expected channel configuration cannot claim same-owner state or invoke a provider', async t => {
  const c=await setup(t);
  const other=await createYouTubeOfflineConfiguration({siteId:c.config.siteId,siteOrigin:c.config.siteOrigin,clientId:c.config.clientId,
    redirectUri:c.config.redirectUri,accountType:'channel',expectedChannelId:'UCabcdefghijklmnopqrstuv',appConfigVersion:'v1'});
  const changed=createYouTubeConfidentialWebFlow(c.db,other,c.dependencies);
  assert.equal((await changed.completeCallback(c.context)).status,'invalid_attempt'); assert.equal(c.provider.requests.length,0);
  const result=await c.flow.completeCallback(c.context);
  assert.equal(result.status,'identity_verified'); assert.equal(result.attemptBinding.expectedChannelId,c.config.expectedChannelId);
  assert.equal(result.identity.channelId,c.config.expectedChannelId);
});

test('corrupted encrypted PKCE is consumed without exchange and cannot be replayed',async t=>{
  const c=await setup(t);
  c.db.sql.prepare("UPDATE planner_youtube_oauth_states SET ciphertext='invalid-ciphertext'").run();
  const result=await c.flow.completeCallback(c.context);
  assert.equal(result.status,'claim_outcome_unknown');assert.equal(c.provider.requests.length,0);assert.equal(c.hookCalls,0);
  assert.equal((await c.flow.completeCallback(c.context)).status,'invalid_attempt');
});

test('PKCE verifier never appears in state plaintext, begin, result, hook, JWKS or resource URLs',async t=>{
  const c=await setup(t);const result=await c.flow.completeCallback(c.context);
  const form=new URLSearchParams(await c.provider.requests[0].text()),verifier=form.get('code_verifier');
  assert.match(verifier,/^[A-Za-z0-9_-]{43}$/); assert.equal(result.status,'identity_verified');
  assert.ok(!JSON.stringify(c.attempt).includes(verifier));assert.ok(!JSON.stringify(result).includes(verifier));
  assert.ok(!JSON.stringify(c.db.sql.prepare('SELECT * FROM planner_youtube_oauth_states').all()).includes(verifier));
  for(const request of c.provider.requests)assert.ok(!request.url.includes(verifier));
  for(const request of c.provider.requests.slice(1))assert.equal(request.method,'GET');
});

for(const channels of [{items:[]},{items:[null]},{items:[{id:'UCabcdefghijklmnopqrstuv'}]},
  {items:[{id:'UC1234567890123456789012'},{id:'UCabcdefghijklmnopqrstuv'}]},
  {items:[{id:'UC1234567890123456789012'}],nextPageToken:'next'}, {items:'invalid'}, {}])
  test('channel response must be exact and unambiguous '+JSON.stringify(channels),async t=>{
    await runFailure(t,c=>{c.provider.options.channels=channels;},{code:'YOUTUBE_CHANNEL_INVALID',calls:4});
  });

test('channel response origin and 32 KiB limit are enforced',async t=>{
  for(const response of [()=>fixtureResponse(YOUTUBE_CHANNELS_ENDPOINT+'&other=1',{}),
    ()=>fixtureResponse(YOUTUBE_CHANNELS_ENDPOINT,'x'.repeat(32769),{raw:true})])
    await runFailure(t,c=>c.provider.overrides.set(YOUTUBE_CHANNELS_ENDPOINT,response),{calls:4});
});

test('token expiring during channel verification is not returned to the credential store',async t=>{
  let time=NOW; const c=await setup(t,{clock:()=>time});c.provider.options.token.expires_in=1;
  c.provider.overrides.set(YOUTUBE_CHANNELS_ENDPOINT,()=>{time+=2000;return fixtureResponse(YOUTUBE_CHANNELS_ENDPOINT,{items:[{id:c.config.expectedChannelId}]});});
  const result=await c.flow.completeCallback(c.context);assert.equal(result.status,'verification_failed');assert.equal(result.code,'ACCESS_TOKEN_EXPIRED');assert.equal(result.accessToken,undefined);
});

test('stalled channel verification shares the callback deadline, never returns credentials',async t=>{
  const c=await setup(t,{deadlineMs:50});
  c.provider.overrides.set(YOUTUBE_CHANNELS_ENDPOINT,()=>new Promise(()=>{}));
  const result=await c.flow.completeCallback(c.context);assert.equal(result.status,'verification_failed');assert.equal(result.code,'DEADLINE_EXCEEDED');assert.equal(result.accessToken,undefined);
  assert.equal((await c.flow.completeCallback(c.context)).status,'invalid_attempt');
});
