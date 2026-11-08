import {fail,own,XOAuthError} from './contract.mjs';
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

// One monotonic deadline covers state claim, all HTTP exchanges, streaming,
// and cryptography. A stalled or abort-ignoring transport cannot delay the result.
// Checks after every await also prevent late completions from advancing the flow.
export function createDeadline(milliseconds) {
  const controller = new AbortController(), expires = performance.now() + milliseconds;
  let expired = false, rejectTimeout;
  const timeout = new Promise((_, rejectPromise) => { rejectTimeout = rejectPromise; });
  timeout.catch(() => {});
  function expire() {
    if (!expired) { expired = true; controller.abort(); rejectTimeout(new XOAuthError('DEADLINE_EXCEEDED')); }
  }
  const timer = setTimeout(expire, milliseconds);
  function check() {
    if (expired || performance.now() >= expires) { expire(); fail('DEADLINE_EXCEEDED'); }
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
  const bad = () => fail('RESPONSE_MALFORMED');
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

async function readJSON(response, url, limit, deadline, allowEmpty = false) {
  let reader;
  try {
    if (!(response instanceof Response) || response.url !== url || response.redirected !== false ||
        !Number.isInteger(response.status) || response.status < 100 || response.status > 599 ||
        response.type === 'opaqueredirect' || response.type === 'opaque') fail('RESPONSE_ORIGIN_INVALID');
    if (response.status >= 300 && response.status < 400) fail('REDIRECT_REJECTED');
    const contentType = response.headers.get('content-type');
    if ((typeof contentType !== 'string' || !/^application\/json(?:\s*;\s*charset\s*=\s*"?utf-8"?)?\s*$/i.test(contentType)) && !(allowEmpty && contentType === null)) fail('RESPONSE_TYPE_INVALID');
    const declared = response.headers.get('content-length');
    if (declared !== null && (!/^(?:0|[1-9][0-9]*)$/.test(declared) || Number(declared) > limit)) fail('RESPONSE_TOO_LARGE');
    if (!response.body) { if (allowEmpty && (declared === null || declared === '0')) return {}; fail('RESPONSE_MALFORMED'); }
    if (typeof response.body.getReader !== 'function') fail('RESPONSE_MALFORMED');
    reader = response.body.getReader();
    const parts = []; let length = 0;
    while (true) {
      deadline.check();
      const part = await deadline.run(reader.read());
      if (part.done) break;
      if (!(part.value instanceof Uint8Array)) fail('RESPONSE_MALFORMED');
      length += part.value.byteLength;
      if (length > limit) fail('RESPONSE_TOO_LARGE');
      // Own each chunk; a custom transport must not mutate an already-read view.
      if (part.value.byteLength) parts.push(new Uint8Array(part.value));
    }
    // Fetch exposes decompressed bytes while Content-Length may describe the
    // compressed wire body. The streamed (decoded) byte limit always applies.
    const encoding = response.headers.get('content-encoding');
    if (declared !== null && (!encoding || encoding.toLowerCase() === 'identity') && Number(declared) !== length) fail('RESPONSE_LENGTH_INVALID');
    if (allowEmpty && length === 0) return {};
    if (contentType === null) fail('RESPONSE_TYPE_INVALID');
    const bytes = new Uint8Array(length); let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
    let text;
    try { text = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(bytes); }
    catch { fail('RESPONSE_MALFORMED'); }
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


/** Explicit server-owned native transport only. No global fetch fallback. */
export function createHTTP(transport,{requestCache=true,requestRedirect='error'}={}){
  if(typeof transport!=='function')fail('TRANSPORT_REQUIRED');
  return async function request(url,init,deadline,{allowEmpty=false}={}){
    deadline.check();
    let request;
    try{request=new Request(url,{...init,redirect:requestRedirect,credentials:'omit',...(requestCache?{cache:'no-store'}:{}),referrerPolicy:'no-referrer',signal:deadline.signal});}
    catch{fail('REQUEST_CONSTRUCTION_FAILED');}
    let response;
    try{
      const pending=Promise.resolve().then(()=>{deadline.check();return transport(request);});
      pending.then(late=>{if(deadline.signal.aborted)cancelBody(late?.body);},()=>{});
      response=await deadline.run(pending);
    }catch(error){if(error instanceof XOAuthError)throw error;fail('TRANSPORT_OUTCOME_UNKNOWN');}
    // RFC 7009 allows an empty revocation response, but still verify origin,
    // headers, streamed length and the shared deadline before accepting it.
    return {status: response.status, body: await readJSON(response,url,65536,deadline,allowEmpty)};
  };
}
