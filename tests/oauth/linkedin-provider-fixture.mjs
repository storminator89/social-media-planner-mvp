import {webcrypto, randomBytes, createHash} from 'node:crypto';
import {
  LINKEDIN_JWKS_ENDPOINT, LINKEDIN_USERINFO_ENDPOINT
} from '../../modules/oauth/linkedin-web-transport.mjs';
import {LINKEDIN_TOKEN_ENDPOINT, LINKEDIN_DISCOVERY_ISSUER} from '../../modules/oauth/linkedin-contract.mjs';

/** TEST ONLY. Every key, client secret, access token and nonce is ephemeral.
 * No DNS, fetch, provider request, credential, grant or persistent key is used. */
export async function createProviderFixture({clientId = 'fixture-client', issuer = LINKEDIN_DISCOVERY_ISSUER, clock = Date.now, subject = 'FixtureSubject_123'} = {}) {
  const pair = await webcrypto.subtle.generateKey({name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256'}, true, ['sign', 'verify']);
  const jwk = {...await webcrypto.subtle.exportKey('jwk', pair.publicKey), kid: randomBytes(12).toString('base64url'), alg: 'RS256', use: 'sig'};
  const clientSecret = randomBytes(32).toString('base64url');
  const accessToken = randomBytes(64).toString('base64url');
  let nonce = randomBytes(32).toString('base64url');
  const requests = [], overrides = new Map();
  const options = {claims: {}, header: {}, token: {}, userinfo: {}, jwks: null, jwt: null};
  function setNonce(value) { nonce = value; }
  async function signJWT({claims = {}, header = {}, rawClaims, rawHeader, signingKey = pair.privateKey} = {}) {
    const seconds = Math.floor(clock() / 1000);
    const h = Buffer.from(rawHeader ?? JSON.stringify({alg: 'RS256', typ: 'JWT', kid: jwk.kid, ...header})).toString('base64url');
    const c = Buffer.from(rawClaims ?? JSON.stringify({iss: issuer, aud: clientId, sub: subject, iat: seconds, exp: seconds + 600, nonce, at_hash: createHash('sha256').update(accessToken).digest().subarray(0, 16).toString('base64url'), ...claims})).toString('base64url');
    const signed = h + '.' + c;
    const signature = Buffer.from(await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5', signingKey, new TextEncoder().encode(signed))).toString('base64url');
    return signed + '.' + signature;
  }
  async function transport(request) {
    requests.push(request.clone());
    const custom = overrides.get(request.url);
    if (custom) return custom(request);
    if (request.url === LINKEDIN_TOKEN_ENDPOINT) return fixtureResponse(request.url, {
      access_token: accessToken, token_type: 'Bearer', expires_in: 3600,
      scope: 'openid profile w_member_social',
      id_token: options.jwt ?? await signJWT({claims: options.claims, header: options.header}),
      ...options.token
    });
    if (request.url === LINKEDIN_JWKS_ENDPOINT) return fixtureResponse(request.url, options.jwks ?? {keys: [jwk]});
    if (request.url === LINKEDIN_USERINFO_ENDPOINT) return fixtureResponse(request.url, {sub: subject, ...options.userinfo});
    throw new Error('Unexpected fixture endpoint');
  }
  return {clientId, issuer, clientSecret, accessToken, subject, jwk, requests, overrides, options, setNonce, signJWT, transport};
}

/** Test Response metadata only. Production uses authentic transport metadata. */
export function fixtureResponse(url, payload, {status = 200, headers = {}, raw = false, redirected = false, body} = {}) {
  const response = new Response(body ?? (raw ? payload : JSON.stringify(payload)), {status, headers: {'content-type': 'application/json', ...headers}});
  Object.defineProperties(response, {url: {value: url}, redirected: {value: redirected}});
  return response;
}
