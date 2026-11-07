import test from 'node:test';
import assert from 'node:assert/strict';
import {createContext, runInContext} from 'node:vm';
import {readFileSync} from 'node:fs';
import {webcrypto, randomBytes} from 'node:crypto';
import {D1TestAdapter} from '../data/support.mjs';
import {createProviderFixture} from './linkedin-provider-fixture.mjs';

// The same restricted named-ESM transformation as the existing Site bundler.
// Execute without process, require, Buffer, fetch, or any Node import capability.
function bundle(root) {
  const ids = new Map(); let output = '';
  function visit(url) {
    if (ids.has(url.href)) return ids.get(url.href);
    let source = readFileSync(url, 'utf8'), imports = '';
    const matches = [...source.matchAll(/^import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?\s*$/gm)];
    for (const match of matches) {
      assert.ok(match[2].startsWith('.'));
      const dependency = visit(new URL(match[2], url));
      imports += `const {${match[1]}} = ${dependency};\n`; source = source.replace(match[0], '');
    }
    const names = [...source.matchAll(/^export\s+(?:async\s+)?(?:function|class|const|let)\s+(\w+)/gm)].map(m => m[1]);
    source = source.replace(/^export\s+/gm, '');
    assert.doesNotMatch(source, /^\s*(?:import|export)\s/m);
    const id = 'module' + ids.size; ids.set(url.href, id);
    output += `const ${id} = (() => {\n${imports}${source}\nreturn {${names.join(',')}};})();\n`;
    return id;
  }
  const entry = visit(root), contract = ids.get(new URL('../../modules/oauth/linkedin-contract.mjs', import.meta.url).href);
  return output + `\nglobalThis.webFactory = ${entry}.createLinkedInConfidentialWebFlow; globalThis.configFactory = ${contract}.createLinkedInOfflineConfiguration;`;
}

test('complete signed path runs with only Worker-style Web APIs and no Node/global-fetch capability', async t => {
  const DB = new D1TestAdapter(); t.after(() => DB.sql.close());
  const now = 1794000000000, provider = await createProviderFixture({clock: () => now});
  const context = createContext({crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, URL, URLSearchParams, Request, Response, AbortController, performance, setTimeout, clearTimeout, atob, btoa,
    DB, providerTransport: provider.transport, clientSecret: provider.clientSecret, now, browserBinding: randomBytes(32).toString('base64url')});
  runInContext(bundle(new URL('../../modules/oauth/linkedin-web-transport.mjs', import.meta.url)), context);
  const attempt = await runInContext(`(async () => {
    if (typeof process !== 'undefined' || typeof Buffer !== 'undefined' || typeof fetch !== 'undefined') throw new Error('Unexpected runtime capability');
    const config = await configFactory({siteId:'worker-fixture',siteOrigin:'https://planner.example',clientId:'fixture-client',redirectUri:'https://planner.example/api/providers/linkedin/oauth/callback',accountType:'personal',appConfigVersion:'v1'});
    globalThis.flow = webFactory(DB,config,{clientSecret,transport:providerTransport,beforeExchange:async()=>true,clock:()=>now,operatingContract:{issuer:'https://www.linkedin.com/oauth',codeInjectionDefense:'oidc_nonce',serverConfirmedNonceContract:true}});
    globalThis.attempt = await flow.begin('alice',browserBinding); return attempt;
  })()`, context);
  provider.setNonce(attempt.nonce);
  const result = await runInContext(`flow.completeCallback({trustedOwner:'alice',browserBinding,callbackUrl:'https://planner.example/api/providers/linkedin/oauth/callback?state='+attempt.state+'&code=worker-fixture-code'})`, context);
  assert.equal(result.status, 'identity_verified'); assert.equal(result.accessToken, provider.accessToken);
  assert.equal(result.identity.subject, provider.subject); assert.equal(provider.requests.length, 3);
});
