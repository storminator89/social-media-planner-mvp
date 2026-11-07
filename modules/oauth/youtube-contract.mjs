/** Offline server-owned contract. No registration, grant, redirect or network. */
export const YOUTUBE_REQUIRED_SCOPES = Object.freeze(['openid', 'https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly']);
export const YOUTUBE_WEB_FLOW_VERSION = 'youtube-web-pkce-v1';
export const YOUTUBE_CALLBACK_PATH = '/api/providers/youtube/oauth/callback';
export const GOOGLE_ISSUER = 'https://accounts.google.com';
export const GOOGLE_AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
export const YOUTUBE_OAUTH_CAPABILITIES = Object.freeze({initiation:false, callback:false, tokenExchange:false, accountVerification:false, publishing:false});
const configurations = new WeakSet();
export class YouTubeOAuthContractError extends Error {
  constructor(code) { super('Invalid server-owned YouTube OAuth contract.'); this.code = code; }
}
function fail(code = 'INVALID_OAUTH_CONFIGURATION') { throw new YouTubeOAuthContractError(code); }
function wellFormed(value) { return typeof value === 'string' && value.isWellFormed(); }
function textId(value) { return wellFormed(value) && value.length > 0 && value.length <= 256 && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value); }
export function youtubeContractSnapshot(source, required, optional = []) {
  if (!source || Object.getPrototypeOf(source) !== Object.prototype) fail();
  const descriptors = Object.getOwnPropertyDescriptors(source), snapshot = {};
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== 'string' || ![...required, ...optional].includes(key)) fail();
    const entry = descriptors[key];
    if (!entry.enumerable || !Object.hasOwn(entry, 'value')) fail();
    snapshot[key] = entry.value;
  }
  if (required.some(key => !Object.hasOwn(snapshot, key))) fail();
  return Object.freeze(snapshot);
}
export async function youtubeHash(value) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(n => n.toString(16).padStart(2, '0')).join('');
}
export async function createYouTubeOfflineConfiguration(source) {
  const input = youtubeContractSnapshot(source, ['siteId','siteOrigin','clientId','redirectUri','accountType','expectedChannelId','appConfigVersion']);
  if (!textId(input.siteId) || input.accountType !== 'channel' || input.appConfigVersion !== 'v1' ||
      typeof input.clientId !== 'string' || !/^[0-9]{3,30}(?:-[A-Za-z0-9_-]{1,128})?\.apps\.googleusercontent\.com$/.test(input.clientId) ||
      typeof input.expectedChannelId !== 'string' || !/^UC[A-Za-z0-9_-]{22}$/.test(input.expectedChannelId)) fail();
  let origin; try { origin = new URL(input.siteOrigin); } catch { fail(); }
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.port || origin.search || origin.hash ||
      input.siteOrigin !== origin.origin || input.redirectUri !== origin.origin + YOUTUBE_CALLBACK_PATH) fail();
  const scopeFingerprint = await youtubeHash(JSON.stringify(YOUTUBE_REQUIRED_SCOPES));
  const fields = {provider:'youtube', flowVersion:YOUTUBE_WEB_FLOW_VERSION, siteId:input.siteId, siteOrigin:input.siteOrigin,
    clientId:input.clientId, redirectUri:input.redirectUri, expectedChannelId:input.expectedChannelId, issuer:GOOGLE_ISSUER, scopeFingerprint};
  const context = Object.freeze({action:'connect_new', targetConnectionId:null, appConfigVersion:input.appConfigVersion, expectedChannelId:input.expectedChannelId});
  const result = Object.freeze({...fields, configFingerprint:await youtubeHash(JSON.stringify(fields)), contextFingerprint:await youtubeHash(JSON.stringify(context)), context, capabilities:YOUTUBE_OAUTH_CAPABILITIES});
  configurations.add(result); return result;
}
export function assertYouTubeOfflineConfiguration(config) { if (!config || !configurations.has(config)) fail('INVALID_CALLBACK_CONFIGURATION'); }
export function requireYouTubeOwner(owner) { if (!textId(owner)) fail('INVALID_CALLBACK_CONTEXT'); }
export function youtubeRandomOpaque() {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}
export async function youtubeCodeChallenge(verifier) {
  if (typeof verifier !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(verifier)) fail('INVALID_PKCE_VERIFIER');
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  return btoa(String.fromCharCode(...hash)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}

/** No callback field is authorization evidence. Token response is checked later.
 * Google discovery advertises RFC9207: this contract requires its exact issuer. */
export function parseYouTubeCallback(config, rawUrl) {
  assertYouTubeOfflineConfiguration(config);
  if (!wellFormed(rawUrl) || !rawUrl.startsWith(config.redirectUri + '?') || rawUrl.length > 8192 || rawUrl.includes('#') ||
      /[\u0000-\u001f\u007f]/.test(rawUrl) || /%(?![0-9a-fA-F]{2})/.test(rawUrl)) fail('INVALID_CALLBACK');
  let url;
  try { url = new URL(rawUrl); decodeURIComponent(url.search.replaceAll('+',' ')); } catch { fail('INVALID_CALLBACK'); }
  if (url.origin + url.pathname !== config.redirectUri || url.hash || url.username || url.password) fail('INVALID_CALLBACK');
  const allowed = ['state','code','error','error_description','scope','authuser','prompt','iss'];
  for (const key of url.searchParams.keys()) {
    if (!allowed.includes(key) || url.searchParams.getAll(key).length !== 1) fail('INVALID_CALLBACK');
    const value = url.searchParams.get(key);
    if (!wellFormed(value) || /[\u0000-\u001f\u007f]/.test(value)) fail('INVALID_CALLBACK');
  }
  if (url.searchParams.get('iss') !== GOOGLE_ISSUER) fail('CALLBACK_ISSUER_INVALID');
  const state = url.searchParams.get('state');
  if (!state || !/^[A-Za-z0-9_-]{43}$/.test(state)) fail('INVALID_CALLBACK');
  const scope = url.searchParams.get('scope'), authuser = url.searchParams.get('authuser'), prompt = url.searchParams.get('prompt');
  if (scope !== null && (scope.length > 1024 || !/^[\x21-\x7e]+(?: [\x21-\x7e]+)*$/.test(scope)) ||
      authuser !== null && !/^[0-9]{1,3}$/.test(authuser) ||
      prompt !== null && !/^(?:none|consent|select_account|consent select_account|select_account consent)$/.test(prompt)) fail('INVALID_CALLBACK');
  const code = url.searchParams.get('code'), error = url.searchParams.get('error'), description = url.searchParams.get('error_description');
  if ((code === null) === (error === null) || description !== null && error === null) fail('INVALID_CALLBACK');
  if (code !== null) {
    if (code.length < 1 || code.length > 4096 || !/^[\x21-\x7e]+$/.test(code)) fail('INVALID_CALLBACK');
    const parsed = {kind:'code', state};
    Object.defineProperty(parsed, 'authorizationCode', {value:code, enumerable:false}); return Object.freeze(parsed);
  }
  if (!error || !/^[A-Za-z0-9_-]{1,128}$/.test(error) || description !== null && description.length > 1024) fail('INVALID_CALLBACK');
  return Object.freeze({kind:'denied', state});
}

/** Returns a URL only. Routing must gate this on explicit user initiation and a
 * durably created, owner/config/channel/state-bound install ticket. */
export function youTubeAuthorizationURL(config, source) {
  assertYouTubeOfflineConfiguration(config);
  const attempt = youtubeContractSnapshot(source, ['state','nonce','codeChallenge','expiresAtMs']);
  if (['state','nonce','codeChallenge'].some(k => typeof attempt[k] !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(attempt[k])) ||
      !Number.isSafeInteger(attempt.expiresAtMs) || attempt.expiresAtMs <= 0) fail('INVALID_ATTEMPT');
  const parameters = new URLSearchParams({response_type:'code', client_id:config.clientId, redirect_uri:config.redirectUri,
    scope:YOUTUBE_REQUIRED_SCOPES.join(' '), state:attempt.state, nonce:attempt.nonce,
    code_challenge:attempt.codeChallenge, code_challenge_method:'S256', access_type:'online', include_granted_scopes:'false', prompt:'select_account'});
  return GOOGLE_AUTHORIZATION_ENDPOINT + '?' + parameters;
}
