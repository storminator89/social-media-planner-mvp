import test from 'node:test';
import assert from 'node:assert/strict';
import {createYouTubeOfflineConfiguration, parseYouTubeCallback, youTubeAuthorizationURL, YOUTUBE_REQUIRED_SCOPES,
  GOOGLE_ISSUER, GOOGLE_AUTHORIZATION_ENDPOINT, youtubeRandomOpaque, youtubeCodeChallenge} from '../../modules/oauth/youtube-contract.mjs';
const CHANNEL = 'UC1234567890123456789012';
const input = () => ({siteId:'fixture-site', siteOrigin:'https://planner.example', clientId:'123456789012-fixture.apps.googleusercontent.com',
  redirectUri:'https://planner.example/api/providers/youtube/oauth/callback', accountType:'channel', expectedChannelId:CHANNEL, appConfigVersion:'v1'});
const setup = async () => {
  const config = await createYouTubeOfflineConfiguration(input());
  const state = youtubeRandomOpaque();
  const callback = config.redirectUri + '?' + new URLSearchParams({state,code:'fixture-code',iss:GOOGLE_ISSUER});
  return {config,state,callback};
};
test('offline configuration stays default-off and fingerprints the exact channel', async () => {
  const a = await createYouTubeOfflineConfiguration(input()), b = await createYouTubeOfflineConfiguration({...input(),expectedChannelId:'UCabcdefghijklmnopqrstuv'});
  assert.equal(a.provider,'youtube'); assert.ok(Object.values(a.capabilities).every(value=>value===false));
  assert.notEqual(a.configFingerprint,b.configFingerprint); assert.notEqual(a.contextFingerprint,b.contextFingerprint);
  assert.equal(a.context.expectedChannelId,CHANNEL); assert.ok(Object.isFrozen(a)); assert.ok(Object.isFrozen(a.context));
});
test('configuration cannot be copied, mutated across awaits, or read through accessors', async () => {
  const source=input(), pending=createYouTubeOfflineConfiguration(source); source.expectedChannelId='UCabcdefghijklmnopqrstuv';
  const config=await pending; assert.equal(config.expectedChannelId,CHANNEL);
  assert.throws(()=>parseYouTubeCallback({...config},config.redirectUri+'?state=x'));
  let read=0; const getter=input(); Object.defineProperty(getter,'clientId',{enumerable:true,get(){read++;return source.clientId;}});
  await assert.rejects(createYouTubeOfflineConfiguration(getter)); assert.equal(read,0);
});
for (const changes of [{siteOrigin:'http://planner.example'},{siteOrigin:'https://planner.example/'},{siteOrigin:'https://planner.example:443'},
  {redirectUri:'https://other.example/api/providers/youtube/oauth/callback'},{redirectUri:'https://planner.example/callback'},
  {redirectUri:'https://planner.example/api/providers/youtube/oauth/callback?next=x'}, {clientId:'anything'},
  {accountType:'personal'},{expectedChannelId:'UCshort'},{extra:true},{appConfigVersion:'v2'}])
  test('rejects unsafe offline configuration '+JSON.stringify(changes),async()=>assert.rejects(createYouTubeOfflineConfiguration({...input(),...changes})));
test('exact scope and S256 authorization URL contains no offline access or verifier',async()=>{
  const {config,state}=await setup(), verifier=youtubeRandomOpaque();
  const attempt={state,nonce:youtubeRandomOpaque(),codeChallenge:await youtubeCodeChallenge(verifier),expiresAtMs:1794000000000};
  const url=new URL(youTubeAuthorizationURL(config,attempt));
  assert.equal(url.origin+url.pathname,GOOGLE_AUTHORIZATION_ENDPOINT);
  assert.equal(url.searchParams.get('scope'),YOUTUBE_REQUIRED_SCOPES.join(' '));
  assert.equal(url.searchParams.get('code_challenge_method'),'S256'); assert.equal(url.searchParams.get('access_type'),'online');
  assert.equal(url.searchParams.get('include_granted_scopes'),'false'); assert.equal(url.searchParams.get('prompt'),'select_account');
  assert.equal(url.searchParams.get('code_verifier'),null); assert.ok(!url.href.includes(verifier));
  assert.throws(()=>youTubeAuthorizationURL(config,{...attempt,codeVerifier:verifier}));
});
test('callback accepts code only with exact issuer and keeps code non-enumerable',async()=>{
  const {config,callback}=await setup(); const parsed=parseYouTubeCallback(config,callback);
  assert.equal(parsed.kind,'code'); assert.equal(parsed.authorizationCode,'fixture-code'); assert.ok(!JSON.stringify(parsed).includes('fixture-code'));
  assert.equal(parseYouTubeCallback(config,callback+'&scope=openid&authuser=0&prompt=consent').kind,'code');
});
for(const suffix of ['&code=again','&c%6fde=again','&state=again','&iss='+encodeURIComponent(GOOGLE_ISSUER),'&unknown=x','&error=access_denied','&error_description=x',
  '&scope=openid%00','&scope=openid%0A','&scope=%FF','&scope=%','&scope=%2','&scope=%GG','&authuser=no','&prompt=unexpected','#fragment','#'])
  test('callback rejects duplicate/ambiguous/malformed suffix '+suffix,async()=>{const {config,callback}=await setup();assert.throws(()=>parseYouTubeCallback(config,callback+suffix));});
test('callback requires issuer, fixed route and no raw controls',async()=>{
  const {config,state,callback}=await setup();
  for(const bad of [config.redirectUri+'?state='+state+'&code=x',callback.replace(encodeURIComponent(GOOGLE_ISSUER),'accounts.google.com'),
    callback.replace(encodeURIComponent(GOOGLE_ISSUER),encodeURIComponent('https://evil.example')),callback.replace('/callback?','/%63allback?'),
    callback.replace('https://planner.example','https://planner.example.evil.example'),callback+'\t']) assert.throws(()=>parseYouTubeCallback(config,bad));
});
test('explicit OAuth refusal is redacted and not mixed with success',async()=>{
  const {config,state}=await setup(); const url=config.redirectUri+'?'+new URLSearchParams({state,iss:GOOGLE_ISSUER,error:'access_denied',error_description:'private provider text'});
  assert.deepEqual(parseYouTubeCallback(config,url),{kind:'denied',state});
});
