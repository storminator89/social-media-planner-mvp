import {createOfflineLinkedInFlow} from './linkedin-flow.mjs';
import {
  assertLinkedInOfflineConfiguration,
  LINKEDIN_REQUIRED_SCOPES,
  LINKEDIN_TOKEN_ENDPOINT,
  LINKEDIN_DISCOVERY_ISSUER
} from './linkedin-contract.mjs';

export const LINKEDIN_JWKS_ENDPOINT = 'https://www.linkedin.com/oauth/openid/jwks';
export const LINKEDIN_USERINFO_ENDPOINT = 'https://api.linkedin.com/v2/userinfo';
const RESPONSE_LIMITS = Object.freeze({token: 65536, jwks: 65536, userinfo: 32768});
const encoder = new TextEncoder();

// All failures are locally selected constants. Never include a cause, response,
// URL, provider text, code, credential, JWT, request or transport error here.
class Rejected extends Error {
  constructor(code) { super('LinkedIn verification failed.'); this.code = code; }
}
export class LinkedInWebConfigurationError extends Error {
  constructor() { super('Invalid server-owned LinkedIn web configuration.'); this.code = 'INVALID_WEB_CONFIGURATION'; }
}
const reject = code => { throw new Rejected(code); };
const configurationError = () => { throw new LinkedInWebConfigurationError(); };
const own = (object, key) => Object.hasOwn(object, key);

function wellFormed(text) {
  for (let i = 0; i < text.length; i++) {
    const n = text.charCodeAt(i);
    if (n >= 0xd800 && n <= 0xdbff) {
      const next = text.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (n >= 0xdc00 && n <= 0xdfff) return false;
  }
  return true;
}

function snapshot(source, required, optional = []) {
  if (!source || Object.getPrototypeOf(source) !== Object.prototype) configurationError();
  const descriptors = Object.getOwnPropertyDescriptors(source), result = {};
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== 'string' || ![...required, ...optional].includes(key)) configurationError();
    const d = descriptors[key];
    if (!d.enumerable || !own(d, 'value')) configurationError();
    result[key] = d.value;
  }
  for (const key of required) if (!own(result, key)) configurationError();
  return Object.freeze(result);
}

function now(clock) {
  let time;
  try { time = clock(); } catch { reject('CLOCK_INVALID'); }
  if (!Number.isSafeInteger(time) || time < 0 || time > Number.MAX_SAFE_INTEGER - 31536000000) reject('CLOCK_INVALID');
  return time;
}

// One monotonic deadline covers state claim, all three HTTP exchanges, streaming,
// and cryptography. A stalled or abort-ignoring transport cannot delay the result.
// Checks after every await also prevent late completions from advancing the flow.
function createDeadline(milliseconds) {
  const controller = new AbortController(), expires = performance.now() + milliseconds;
  let expired = false, rejectTimeout;
  const timeout = new Promise((_, rejectPromise) => { rejectTimeout = rejectPromise; });
  timeout.catch(() => {});
  function expire() {
    if (!expired) { expired = true; controller.abort(); rejectTimeout(new Rejected('DEADLINE_EXCEEDED')); }
  }
  const timer = setTimeout(expire, milliseconds);
  function check() {
    if (expired || performance.now() >= expires) { expire(); reject('DEADLINE_EXCEEDED'); }
  }
  return {
    signal: controller.signal,
    check,
    async run(promise) {
      check();
      const value = await Promise.race([promise, timeout]);
      check();
      return value;
    },
    close() { clearTimeout(timer); controller.abort(); }
  };
}

function cancelBody(body) {
  try { Promise.resolve(body?.cancel()).catch(() => {}); } catch { /* Deliberately redacted. */ }
}

// JSON.parse alone silently overwrites duplicate members. This bounded parser
// rejects duplicates after escape decoding at EVERY nesting level, invalid UTF-8
// (handled before this call), unpaired surrogates and pathological nesting.
function parseUniqueJSON(text) {
  let at = 0, nodes = 0;
  const bad = () => reject('RESPONSE_MALFORMED');
  function space() { while (at < text.length && /[\x20\t\r\n]/.test(text[at])) at++; }
  function string() {
    if (text[at] !== '"') bad();
    const start = at++;
    while (at < text.length) {
      const character = text[at++];
      if (character === '\\') { at++; continue; }
      if (character === '"') {
        let value;
        try { value = JSON.parse(text.slice(start, at)); } catch { bad(); }
        if (!wellFormed(value)) bad();
        return value;
      }
    }
    bad();
  }
  function value(depth) {
    if (++nodes > 4096 || depth > 16) bad();
    space();
    if (text[at] === '"') return string();
    if (text[at] === '{') {
      at++; space();
      const result = Object.create(null);
      if (text[at] === '}') { at++; return result; }
      while (at < text.length) {
        space(); const key = string(); space();
        if (own(result, key) || text[at++] !== ':') bad();
        result[key] = value(depth + 1); space();
        const end = text[at++];
        if (end === '}') return result;
        if (end !== ',') bad();
      }
      bad();
    }
    if (text[at] === '[') {
      at++; space(); const result = [];
      if (text[at] === ']') { at++; return result; }
      while (at < text.length) {
        result.push(value(depth + 1)); space();
        const end = text[at++];
        if (end === ']') return result;
        if (end !== ',') bad();
      }
      bad();
    }
    for (const [literal, result] of [['true', true], ['false', false], ['null', null]]) {
      if (text.startsWith(literal, at)) { at += literal.length; return result; }
    }
    const number = text.slice(at).match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/);
    if (!number || !Number.isFinite(Number(number[0]))) bad();
    at += number[0].length; return Number(number[0]);
  }
  const result = value(0); space();
  if (at !== text.length || !result || Array.isArray(result) || typeof result !== 'object') bad();
  return result;
}

async function readJSON(response, url, limit, deadline) {
  let reader;
  try {
    if (!(response instanceof Response) || response.url !== url || response.redirected !== false ||
        !Number.isInteger(response.status) || response.status < 100 || response.status > 599 ||
        response.type === 'opaqueredirect' || response.type === 'opaque') reject('RESPONSE_ORIGIN_INVALID');
    if (response.status >= 300 && response.status < 400) reject('REDIRECT_REJECTED');
    const contentType = response.headers.get('content-type');
    if (typeof contentType !== 'string' || !/^application\/json(?:\s*;\s*charset\s*=\s*"?utf-8"?)?\s*$/i.test(contentType)) reject('RESPONSE_TYPE_INVALID');
    const declared = response.headers.get('content-length');
    if (declared !== null && (!/^(?:0|[1-9][0-9]*)$/.test(declared) || Number(declared) > limit)) reject('RESPONSE_TOO_LARGE');
    if (!response.body || typeof response.body.getReader !== 'function') reject('RESPONSE_MALFORMED');
    reader = response.body.getReader();
    const parts = []; let length = 0;
    while (true) {
      deadline.check();
      const part = await deadline.run(reader.read());
      if (part.done) break;
      if (!(part.value instanceof Uint8Array)) reject('RESPONSE_MALFORMED');
      length += part.value.byteLength;
      if (length > limit) reject('RESPONSE_TOO_LARGE');
      // Own each chunk; a custom transport must not mutate an already-read view.
      if (part.value.byteLength) parts.push(new Uint8Array(part.value));
    }
    // Fetch exposes decompressed bytes while Content-Length may describe the
    // compressed wire body. The streamed (decoded) byte limit always applies.
    const encoding = response.headers.get('content-encoding');
    if (declared !== null && (!encoding || encoding.toLowerCase() === 'identity') && Number(declared) !== length) reject('RESPONSE_LENGTH_INVALID');
    const bytes = new Uint8Array(length); let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
    let text;
    try { text = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(bytes); }
    catch { reject('RESPONSE_MALFORMED'); }
    deadline.check();
    return parseUniqueJSON(text);
  } catch (error) {
    if (reader) { try { Promise.resolve(reader.cancel()).catch(() => {}); } catch {} }
    else cancelBody(response?.body);
    throw error;
  } finally {
    try { reader?.releaseLock(); } catch { /* A timed-out read may still be pending. */ }
  }
}

async function requestJSON(transport, url, init, kind, deadline) {
  deadline.check();
  const request = new Request(url, {
    ...init, redirect: 'error', credentials: 'omit', cache: 'no-store',
    referrerPolicy: 'no-referrer', signal: deadline.signal
  });
  let response;
  try {
    // The injected transport is part of the trusted server boundary: it must
    // enforce TLS, these Request flags, no cookie jar, no redirects or retries,
    // and accurate Response.url metadata. There is intentionally NO fetch fallback.
    const pending = Promise.resolve().then(() => { deadline.check(); return transport(request); });
    pending.then(late => { if (deadline.signal.aborted) cancelBody(late?.body); }, () => {});
    response = await deadline.run(pending);
  } catch (error) {
    if (error instanceof Rejected) throw error;
    reject('TRANSPORT_OUTCOME_UNKNOWN');
  }
  const body = await readJSON(response, url, RESPONSE_LIMITS[kind], deadline);
  return {status: response.status, body};
}

function base64url(bytes) {
  let text = ''; for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
function decodeBase64url(text, maximum) {
  if (typeof text !== 'string' || text.length === 0 || text.length > maximum * 4 / 3 + 4 || !/^[A-Za-z0-9_-]+$/.test(text)) reject('ID_TOKEN_INVALID');
  let binary;
  try { binary = atob(text.replaceAll('-', '+').replaceAll('_', '/')); }
  catch { reject('ID_TOKEN_INVALID'); }
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  if (bytes.length > maximum || base64url(bytes) !== text) reject('ID_TOKEN_INVALID');
  return bytes;
}
function decodeJWTObject(text, maximum) {
  let decoded;
  try { decoded = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(decodeBase64url(text, maximum)); }
  catch { reject('ID_TOKEN_INVALID'); }
  try { return parseUniqueJSON(decoded); } catch { reject('ID_TOKEN_INVALID'); }
}
function equalASCII(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let difference = 0; for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
async function sha256(text, deadline) {
  return new Uint8Array(await deadline.run(crypto.subtle.digest('SHA-256', encoder.encode(text))));
}

function validateScopes(scope) {
  // RFC 6749 permits omitted scope when unchanged. This stricter local contract
  // requires explicit returned evidence and rejects omissions rather than guessing.
  if (typeof scope !== 'string' || scope.length > 256 || !/^[a-z_]+(?: [a-z_]+)*$/.test(scope)) reject('GRANTED_SCOPES_INVALID');
  const scopes = scope.split(' ');
  if (scopes.length !== LINKEDIN_REQUIRED_SCOPES.length || new Set(scopes).size !== scopes.length ||
      scopes.some(value => !LINKEDIN_REQUIRED_SCOPES.includes(value))) reject('GRANTED_SCOPES_INVALID');
  return LINKEDIN_REQUIRED_SCOPES;
}

function validateTokenResponse(body) {
  if (own(body, 'error')) reject('TOKEN_RESPONSE_INVALID');
  if (typeof body.access_token !== 'string' || body.access_token.length > 8192 ||
      !/^[A-Za-z0-9\-._~+/]+=*$/.test(body.access_token)) reject('TOKEN_RESPONSE_INVALID');
  if (typeof body.token_type !== 'string' || body.token_type.toLowerCase() !== 'bearer') reject('TOKEN_RESPONSE_INVALID');
  if (!Number.isSafeInteger(body.expires_in) || body.expires_in <= 0 || body.expires_in > 31536000) reject('TOKEN_RESPONSE_INVALID');
  if (typeof body.id_token !== 'string' || body.id_token.length > 16384) reject('ID_TOKEN_INVALID');
  const grantedScopes = validateScopes(body.scope);
  // Do not retain refresh credentials or arbitrary profile/response fields.
  return {accessToken: body.access_token, idToken: body.id_token, expiresIn: body.expires_in, grantedScopes};
}

async function verifyIDToken(token, config, contract, nonceFingerprint, transport, clock, deadline) {
  const segments = token.idToken.split('.');
  if (segments.length !== 3) reject('ID_TOKEN_INVALID');
  const header = decodeJWTObject(segments[0], 2048), claims = decodeJWTObject(segments[1], 12000);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !/^[\x21-\x7e]{1,128}$/.test(header.kid) ||
      Object.keys(header).some(key => !['alg', 'kid', 'typ'].includes(key)) ||
      (own(header, 'typ') && header.typ !== 'JWT')) reject('ID_TOKEN_HEADER_INVALID');
  const signature = decodeBase64url(segments[2], 512);
  const {status, body} = await requestJSON(transport, LINKEDIN_JWKS_ENDPOINT, {method: 'GET', headers: {Accept: 'application/json'}}, 'jwks', deadline);
  if (status !== 200 || !Array.isArray(body.keys) || body.keys.length < 1 || body.keys.length > 16) reject('JWKS_INVALID');
  const ids = new Set(); let selected;
  for (const key of body.keys) {
    if (!key || typeof key !== 'object' || Array.isArray(key) || typeof key.kid !== 'string' ||
        !/^[\x21-\x7e]{1,128}$/.test(key.kid) || ids.has(key.kid)) reject('JWKS_INVALID');
    ids.add(key.kid);
    if (key.kid === header.kid) selected = key;
  }
  if (!selected || selected.kty !== 'RSA' || (own(selected, 'alg') && selected.alg !== 'RS256') ||
      (own(selected, 'use') && selected.use !== 'sig') ||
      (own(selected, 'key_ops') && (!Array.isArray(selected.key_ops) || selected.key_ops.length !== 1 || selected.key_ops[0] !== 'verify')) ||
      ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth'].some(key => own(selected, key))) reject('JWKS_INVALID');
  const modulus = decodeBase64url(selected.n, 512), exponent = decodeBase64url(selected.e, 4);
  if (modulus.length < 256 || modulus[0] < 128 || signature.length !== modulus.length || exponent[0] === 0) reject('JWKS_INVALID');
  let exponentValue = 0; for (const byte of exponent) exponentValue = exponentValue * 256 + byte;
  if (exponentValue < 3 || exponentValue % 2 !== 1) reject('JWKS_INVALID');
  let key, verified;
  try {
    key = await deadline.run(crypto.subtle.importKey('jwk', {kty: 'RSA', n: selected.n, e: selected.e, alg: 'RS256', key_ops: ['verify'], ext: false}, {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'}, false, ['verify']));
    verified = await deadline.run(crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, encoder.encode(segments[0] + '.' + segments[1])));
  } catch (error) {
    if (error instanceof Rejected) throw error;
    reject('ID_TOKEN_SIGNATURE_INVALID');
  }
  if (!verified) reject('ID_TOKEN_SIGNATURE_INVALID');
  if (claims.iss !== contract.issuer) reject('ID_TOKEN_ISSUER_INVALID');
  const audiences = typeof claims.aud === 'string' ? [claims.aud] : claims.aud;
  if (!Array.isArray(audiences) || audiences.length !== 1 || audiences[0] !== config.clientId ||
      (own(claims, 'azp') && claims.azp !== config.clientId)) reject('ID_TOKEN_AUDIENCE_INVALID');
  const seconds = Math.floor(now(clock) / 1000);
  if (!Number.isSafeInteger(claims.exp) || !Number.isSafeInteger(claims.iat) || claims.iat < 0 ||
      claims.exp <= seconds || claims.exp <= claims.iat || claims.iat > seconds + 30 || claims.iat < seconds - 600 ||
      (own(claims, 'nbf') && (!Number.isSafeInteger(claims.nbf) || claims.nbf < 0 || claims.nbf > seconds + 30))) reject('ID_TOKEN_TIME_INVALID');
  if (typeof claims.sub !== 'string' || !/^[\x21-\x7e]{1,255}$/.test(claims.sub)) reject('ID_TOKEN_SUBJECT_INVALID');
  if (typeof claims.nonce !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(claims.nonce)) reject('ID_TOKEN_NONCE_INVALID');
  const nonceHash = Array.from(await sha256(claims.nonce, deadline), byte => byte.toString(16).padStart(2, '0')).join('');
  if (!equalASCII(nonceHash, nonceFingerprint)) reject('ID_TOKEN_NONCE_INVALID');
  if (own(claims, 'at_hash')) {
    const hash = base64url((await sha256(token.accessToken, deadline)).slice(0, 16));
    if (!equalASCII(claims.at_hash, hash)) reject('ID_TOKEN_ACCESS_HASH_INVALID');
  }
  // No issued token has been used for userinfo, persistence, identity or posting.
  return Object.freeze({issuer: claims.iss, subject: claims.sub});
}

function failure(status, code) {
  return Object.freeze({status, code, connected: false, publishing: false, retryAllowed: false, restartRequired: true});
}

/**
 * Isolated server-internal confidential web flow, NOT an HTTP handler.
 * No app products, credentials, registration, consent, publishing authorization,
 * cookie/session establishment or vault persistence is provisioned by this API.
 * The caller must capture its connection/revocation CAS fence BEFORE this method
 * and persist only after success. Never serialize this result as an HTTP DTO.
 */
export function createLinkedInConfidentialWebFlow(db, config, options) {
  assertLinkedInOfflineConfiguration(config);
  const input = snapshot(options, ['clientSecret', 'transport', 'operatingContract', 'beforeExchange'], ['clock', 'deadlineMs']);
  const contract = snapshot(input.operatingContract, ['issuer', 'codeInjectionDefense', 'serverConfirmedNonceContract']);
  if (contract.issuer !== LINKEDIN_DISCOVERY_ISSUER || contract.codeInjectionDefense !== 'oidc_nonce' || contract.serverConfirmedNonceContract !== true) configurationError();
  if (typeof input.clientSecret !== 'string' || input.clientSecret.length < 1 || input.clientSecret.length > 4096 ||
      !/^[\x21-\x7e]+$/.test(input.clientSecret) || typeof input.transport !== 'function' || typeof input.beforeExchange !== 'function') configurationError();
  const clock = own(input, 'clock') ? input.clock : Date.now;
  const deadlineMs = own(input, 'deadlineMs') ? input.deadlineMs : 10000;
  if (typeof clock !== 'function' || !Number.isSafeInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > 30000) configurationError();
  const {clientSecret, transport, beforeExchange} = input;
  const stateFlow = createOfflineLinkedInFlow(db, config, {clock});
  return Object.freeze({
    begin(trustedOwner, browserBinding) { return stateFlow.begin(trustedOwner, browserBinding); },
    async completeCallback(context) {
      // Snapshot before the first await. The router supplies verified session
      // identity and browser binding, never owner/contract data from JSON.
      let callback;
      try { callback = snapshot(context, ['trustedOwner', 'callbackUrl', 'browserBinding']); }
      catch { return failure('callback_rejected', 'CALLBACK_INVALID'); }
      const deadline = createDeadline(deadlineMs);
      let stage = 'claim', exchange = 'not_started';
      try {
        const claimed = await deadline.run(stateFlow.claimCallback(callback));
        if (claimed.status !== 'code_validated_not_exchanged') {
          const statuses = {invalid_attempt: 'INVALID_ATTEMPT', claim_outcome_unknown: 'CLAIM_OUTCOME_UNKNOWN', provider_denied: 'PROVIDER_DENIED'};
          return failure(claimed.status, statuses[claimed.status] ?? 'CLAIM_OUTCOME_UNKNOWN');
        }
        stage = 'fence'; deadline.check();
        // The callback has been strictly parsed and atomically claimed by our
        // own state flow. Bind the installation ticket and later verified result
        // to THIS attempt, including when another attempt has the same owner.
        const stateHash = Array.from(await sha256(new URL(callback.callbackUrl).searchParams.get('state'), deadline), byte => byte.toString(16).padStart(2, '0')).join('');
        const attemptBinding = Object.freeze({
          ownerId: callback.trustedOwner, siteId: config.siteId,
          configFingerprint: config.configFingerprint,
          contextFingerprint: config.contextFingerprint, stateHash
        });
        // Trusted factory dependency, never a browser callback field. The router
        // verifies this binding when capturing its installation/CAS ticket and
        // again when committing. No authorization code or nonce is passed out.
        const fenced = await deadline.run(Promise.resolve().then(() => { deadline.check(); return beforeExchange(attemptBinding); }));
        if (fenced !== true) return failure('before_exchange_rejected', 'PRE_EXCHANGE_FENCE_REJECTED');
        stage = 'exchange'; deadline.check();
        const startedAtMs = now(clock);
        const form = new URLSearchParams({grant_type: 'authorization_code', code: claimed.authorizationCode, client_id: config.clientId, client_secret: clientSecret, redirect_uri: config.redirectUri});
        exchange = 'unknown';
        const response = await requestJSON(transport, LINKEDIN_TOKEN_ENDPOINT, {
          method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json'}, body: form.toString()
        }, 'token', deadline);
        if ((response.status === 400 || response.status === 401) && typeof response.body.error === 'string' &&
            /^[a-z_]{1,128}$/.test(response.body.error) && !own(response.body, 'access_token') && !own(response.body, 'id_token')) {
          return failure('exchange_rejected', 'PROVIDER_EXCHANGE_REJECTED');
        }
        if (response.status !== 200) reject('TOKEN_HTTP_INVALID');
        exchange = 'received';
        const token = validateTokenResponse(response.body);
        // Drop the raw response (including any unexpected refresh credential).
        response.body = null;
        stage = 'verification';
        const identity = await verifyIDToken(token, config, contract, claimed.nonceFingerprint, transport, clock, deadline);
        const expiresAtMs = startedAtMs + token.expiresIn * 1000;
        if (expiresAtMs <= now(clock)) reject('ACCESS_TOKEN_EXPIRED');
        stage = 'userinfo';
        const userinfo = await requestJSON(transport, LINKEDIN_USERINFO_ENDPOINT, {
          method: 'GET', headers: {Accept: 'application/json', Authorization: 'Bearer ' + token.accessToken}
        }, 'userinfo', deadline);
        if (userinfo.status !== 200 || userinfo.body.sub !== identity.subject) reject('USERINFO_SUBJECT_INVALID');
        deadline.check();
        if (expiresAtMs <= now(clock)) reject('ACCESS_TOKEN_EXPIRED');
        const result = {status: 'identity_verified', identity, attemptBinding, expiresAtMs, grantedScopes: token.grantedScopes, connected: false, publishing: false, refreshSupported: false};
        // Direct property access permits the trusted vault to encrypt the token;
        // accidental JSON.stringify/spread does not leak a credential.
        Object.defineProperty(result, 'accessToken', {value: token.accessToken, enumerable: false});
        return Object.freeze(result);
      } catch (error) {
        const code = error instanceof Rejected ? error.code : stage === 'claim' ? 'CALLBACK_INVALID' : stage === 'fence' ? 'PRE_EXCHANGE_FENCE_UNKNOWN' : 'VERIFICATION_REJECTED';
        const status = stage === 'claim' ? (code === 'DEADLINE_EXCEEDED' ? 'claim_outcome_unknown' : 'callback_rejected') : stage === 'fence' ? 'before_exchange_outcome_unknown' : exchange === 'unknown' ? 'exchange_outcome_unknown' : 'verification_failed';
        return failure(status, code);
      } finally { deadline.close(); }
    }
  });
}
