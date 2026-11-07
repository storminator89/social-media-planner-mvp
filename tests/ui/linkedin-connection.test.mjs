import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeLinkedInReadiness,validateLinkedInAuthorization,createLinkedInConnectionClient,createLinkedInConnectionController,linkedInStatusCopy,renderLinkedInConnection,LINKEDIN_BLOCKERS} from '../../public/linkedin-connection.js';
import {renderConnections,createConnectionsPanel,PROVIDERS} from '../../public/connections.js';

const NOW=1794052800000;
const SITE_ORIGIN='https://planner.example';
const now=()=>NOW;
const flush=()=>new Promise(setImmediate);
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8'}});
function readiness(stage='not_configured'){
  const configured=!['not_configured','error'].includes(stage);
  return {schemaVersion:1,provider:'linkedin',stage,capabilities:{initiation:configured,callback:configured,tokenExchange:configured,accountVerification:configured,publishing:false},targetConfirmed:configured,requiredScopes:['openid','profile','w_member_social'],blockerCodes:stage==='not_configured'?['OAUTH_NOT_CONFIGURED','PUBLISHING_DISABLED']:stage==='expired'?['CONNECTION_EXPIRED','RECONNECT_UNAVAILABLE','PUBLISHING_DISABLED']:stage==='disconnected'?['CONNECTION_REMOVED','RECONNECT_UNAVAILABLE','PUBLISHING_DISABLED']:['PUBLISHING_DISABLED'],authorizationUrl:null,connection:['linked','expired','disconnected'].includes(stage)?{id:'connection-123',revision:2,status:stage,expiresAtMs:stage==='expired'?NOW-1:stage==='disconnected'?null:NOW+600000}:null,canDisconnect:['linked','expired'].includes(stage)};
}
function authorization(){return {authorizationUrl:'https://www.linkedin.com/oauth/v2/authorization?'+new URLSearchParams({response_type:'code',client_id:'client123',redirect_uri:'https://planner.example/api/providers/linkedin/oauth/callback',scope:'openid profile w_member_social',state:'S'.repeat(43),nonce:'N'.repeat(43)}),expiresAtMs:NOW+60000};}
function controllerHarness({stage='ready',load=async()=>readiness(stage),start=async()=>authorization(),disconnect=async()=>{},...extra}={}){
  const events=[],navigations=[];
  const client={load,start,disconnect};
  const controller=createLinkedInConnectionController({client,now,siteOrigin:SITE_ORIGIN,onChange:s=>events.push(s),navigate:url=>navigations.push(url),...extra});
  return {controller,events,navigations,client};
}
const readySnapshot=stage=>({phase:'ready',readiness:readiness(stage),operation:'idle',message:'',checkedAt:NOW});
const general=()=>({schemaVersion:1,providers:PROVIDERS.map(p=>({provider:p.id,status:'not_connected',accountLabel:p.id==='linkedin'?'OLD ACCOUNT PII':null,canPublish:false,blockerCodes:['OAUTH_NOT_CONFIGURED','PUBLISHING_DISABLED']})),capabilities:{oauth:false,publishing:false}});
const linkedInCard=html=>html.split('aria-labelledby="connection-linkedin"')[1]?.split('</article>')[0]||'';

test('readiness accepts all exact public stages without adding a connected or publishing state',()=>{
  for(const stage of ['not_configured','ready','linked','expired','disconnected','error'])assert.deepEqual(normalizeLinkedInReadiness(readiness(stage)),readiness(stage));
  assert.equal(new Set(['not_configured','ready','linked','expired','disconnected','error'].map(stage=>linkedInStatusCopy(readySnapshot(stage)).label)).size,6);
});
test('unknown, missing, extended and old DTOs fail closed at every boundary',()=>{
  const mutations=[v=>delete v.connection,v=>v.schemaVersion=2,v=>v.provider='x',v=>v.stage='offline_preparation',v=>v.secret='SECRET',v=>v.capabilities.oauth=true,v=>delete v.capabilities.callback,v=>v.capabilities.initiation='yes',v=>v.capabilities.publishing=true,v=>v.targetConfirmed=1,v=>v.authorizationUrl=authorization().authorizationUrl,v=>v.requiredScopes.push('email'),v=>v.requiredScopes[1]='openid',v=>v.blockerCodes=['RAW_SECRET'],v=>v.blockerCodes=['PUBLISHING_DISABLED','PUBLISHING_DISABLED'],v=>v.connection={},v=>v.canDisconnect='yes'];
  for(const mutate of mutations){const value=readiness();mutate(value);assert.throws(()=>normalizeLinkedInReadiness(value));}
  for(const bad of [null,undefined,[],{},'linked'])assert.throws(()=>normalizeLinkedInReadiness(bad));
});
test('contradictory ready, linked and disconnect capabilities fail closed',()=>{
  for(const mutate of [v=>v.capabilities.callback=false,v=>v.targetConfirmed=false,v=>v.blockerCodes.push('OAUTH_NOT_CONFIGURED'),v=>v.canDisconnect=true,v=>v.connection=readiness('linked').connection]){const v=readiness('ready');mutate(v);assert.throws(()=>normalizeLinkedInReadiness(v));}
  for(const mutate of [v=>v.connection=null,v=>v.connection.status='expired',v=>v.connection.revision=-1,v=>v.connection.revision=0.5,v=>v.connection.expiresAtMs=Infinity,v=>v.connection.accessToken='SECRET',v=>v.targetConfirmed=false]){const v=readiness('linked');mutate(v);assert.throws(()=>normalizeLinkedInReadiness(v));}
  for(const stage of ['disconnected','error','not_configured']){const v=readiness(stage);v.canDisconnect=true;assert.throws(()=>normalizeLinkedInReadiness(v));}
});
test('authorization requires the sole exact official endpoint and all six unique parameters',()=>{
  assert.deepEqual(validateLinkedInAuthorization(authorization(),{now,siteOrigin:SITE_ORIGIN}),authorization());
  const urls=[
    'http://www.linkedin.com/oauth/v2/authorization?',
    'https://linkedin.com/oauth/v2/authorization?',
    'https://www.linkedin.com.evil.example/oauth/v2/authorization?',
    'https://www.linkedin.com:443/oauth/v2/authorization?',
    'https://user:pass@www.linkedin.com/oauth/v2/authorization?',
    'https://@www.linkedin.com/oauth/v2/authorization?',
    'https://www.linkedin.com/oauth/v2/authorization/extra?',
    'https://www.linkedin.com/oauth/v2/%61uthorization?'
  ];
  for(const base of urls)assert.throws(()=>validateLinkedInAuthorization({...authorization(),authorizationUrl:base+authorization().authorizationUrl.split('?')[1]},{now,siteOrigin:SITE_ORIGIN}));
  for(const suffix of ['#','#fragment','&state=again','&%73tate=again','&unknown=value','&client_secret=SECRET','&scope=email'])assert.throws(()=>validateLinkedInAuthorization({...authorization(),authorizationUrl:authorization().authorizationUrl+suffix},{now,siteOrigin:SITE_ORIGIN}));
});
test('authorization refuses missing, wrong, repeated and stale parameter values',()=>{
  for(const key of ['response_type','client_id','redirect_uri','scope','state','nonce']){const v=authorization(),url=new URL(v.authorizationUrl);url.searchParams.delete(key);v.authorizationUrl=url.href;assert.throws(()=>validateLinkedInAuthorization(v,{now,siteOrigin:SITE_ORIGIN}));}
  for(const [key,value] of [['response_type','token'],['scope','openid profile'],['scope','openid profile w_member_social email'],['scope','openid profile profile'],['scope','openid  profile w_member_social'],['state',''],['nonce',''],['client_id',' a'],['redirect_uri','javascript:alert(1)'],['redirect_uri','https://user:pass@planner.example/callback'],['redirect_uri','https://planner.example/callback#']]){const v=authorization(),url=new URL(v.authorizationUrl);url.searchParams.set(key,value);v.authorizationUrl=url.href;assert.throws(()=>validateLinkedInAuthorization(v,{now,siteOrigin:SITE_ORIGIN}));}
  for(const expiresAtMs of [NOW,NOW-1,Infinity,-1,'123',NOW+0.1])assert.throws(()=>validateLinkedInAuthorization({...authorization(),expiresAtMs},{now,siteOrigin:SITE_ORIGIN}));
  assert.throws(()=>validateLinkedInAuthorization({...authorization(),accessToken:'SECRET'},{now,siteOrigin:SITE_ORIGIN}));
});
test('readiness client is same-origin GET and start is explicit marked personal-account JSON POST',async()=>{
  const calls=[];const client=createLinkedInConnectionClient({siteOrigin:SITE_ORIGIN,now,fetcher:async(path,options)=>{calls.push({path,options});return response(path.endsWith('readiness')?readiness('ready'):authorization());}});
  await client.load();assert.equal(calls.length,1);assert.equal(calls[0].path,'/api/providers/linkedin/oauth/readiness');assert.equal(calls[0].options.method,'GET');assert.equal(calls[0].options.body,undefined);
  await client.start();assert.equal(calls.length,2);assert.equal(calls[1].path,'/api/providers/linkedin/oauth/start');assert.equal(calls[1].options.method,'POST');assert.deepEqual(JSON.parse(calls[1].options.body),{accountType:'personal'});assert.equal(calls[1].options.headers['Content-Type'],'application/json');
  for(const {options} of calls){assert.equal(options.headers['X-Planner-Request'],'1');assert.equal(options.credentials,'same-origin');assert.equal(options.cache,'no-store');assert.equal(options.redirect,'error');}
});
test('disconnect sends only optimistic connection identity and requires 204',async()=>{
  let call;const client=createLinkedInConnectionClient({siteOrigin:SITE_ORIGIN,fetcher:async(path,options)=>{call={path,options};return new Response(null,{status:204});}});
  await client.disconnect({connectionId:'connection-123',expectedRevision:2});assert.equal(call.path,'/api/providers/linkedin/disconnect');assert.equal(call.options.method,'POST');assert.equal(call.options.headers['Content-Type'],'application/json');assert.equal(call.options.headers['X-Planner-Request'],'1');assert.deepEqual(JSON.parse(call.options.body),{connectionId:'connection-123',expectedRevision:2});
  for(const status of [200,202,409,500])await assert.rejects(createLinkedInConnectionClient({siteOrigin:SITE_ORIGIN,fetcher:async()=>response({},status)}).disconnect({connectionId:'connection-123',expectedRevision:2}));
});
test('client rejects raw errors, HTML, unexpected media types and malformed JSON without exposing them',async()=>{
  for(const reply of [new Response('SECRET',{status:500}),new Response('<html>SECRET</html>'),new Response('{}',{headers:{'Content-Type':'application/json-other'}}),new Response('not json',{headers:{'Content-Type':'application/json'}}),response({...readiness(),raw:'SECRET'})])await assert.rejects(createLinkedInConnectionClient({siteOrigin:SITE_ORIGIN,fetcher:async()=>reply}).load());
});
test('caller cancellation and timeout abort the request without retries',async()=>{
  let calls=0;const fetcher=async(_path,{signal})=>{calls++;return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted'))));};
  const client=createLinkedInConnectionClient({siteOrigin:SITE_ORIGIN,fetcher,timeoutMs:5});await assert.rejects(client.load());assert.equal(calls,1);
  const controller=new AbortController(),pending=client.start({signal:controller.signal});controller.abort();await assert.rejects(pending);assert.equal(calls,2);
  const aborted=new AbortController();aborted.abort();await assert.rejects(client.load({signal:aborted.signal}));assert.equal(calls,2);
});
test('show and refresh only load status; every blocked stage denies start',async()=>{
  for(const stage of ['not_configured','linked','expired','disconnected','error']){
    let calls=0;const h=controllerHarness({stage,start:async()=>{calls++;return authorization();}});h.controller.show();await flush();await h.controller.start();assert.equal(calls,0);assert.equal(h.navigations.length,0);h.controller.destroy();
  }
  const h=controllerHarness();h.controller.show();await flush();assert.deepEqual(h.navigations,[]);assert.equal(h.controller.snapshot.operation,'idle');
});
test('readiness failures discard past linked data and never leak raw errors',async()=>{
  let fail=false;const h=controllerHarness({load:async()=>{if(fail)throw new Error('SECRET');return readiness('linked');}});h.controller.show();await flush();assert.equal(h.controller.snapshot.readiness.stage,'linked');fail=true;await h.controller.refresh();assert.equal(h.controller.snapshot.readiness,null);assert.equal(h.controller.snapshot.phase,'error');assert.doesNotMatch(renderLinkedInConnection(h.controller.snapshot),/SECRET|Verbunden ·/);
});
test('elapsed linked expiry is treated as unknown, never a live connection',async()=>{
  const v=readiness('linked');v.connection.expiresAtMs=NOW;
  const h=controllerHarness({load:async()=>v});h.controller.show();await flush();assert.equal(h.controller.snapshot.phase,'error');assert.equal(h.controller.snapshot.readiness,null);
});
test('single explicit start navigates once and repeated clicks are locked',async()=>{
  const pending=deferred();let calls=0;const h=controllerHarness({start:()=>{calls++;return pending.promise;}});h.controller.show();await flush();const first=h.controller.start();await h.controller.start();assert.equal(calls,1);assert.equal(h.controller.snapshot.operation,'starting');pending.resolve(authorization());await first;assert.deepEqual(h.navigations,[authorization().authorizationUrl]);await h.controller.start();assert.equal(calls,1);assert.equal(h.controller.snapshot.operation,'navigating');
});
test('stale start after hide, show or destroy never navigates or revives status',async()=>{
  for(const transition of ['hide','reshow','destroy']){
    const pending=deferred();const h=controllerHarness({start:()=>pending.promise});h.controller.show();await flush();const first=h.controller.start();if(transition==='destroy')h.controller.destroy();else{h.controller.hide();if(transition==='reshow'){h.controller.show();await flush();}}const before=h.controller.snapshot;pending.resolve(authorization());await first;assert.deepEqual(h.navigations,[]);assert.deepEqual(h.controller.snapshot,before);
  }
});
test('invalid or expired authorization response cannot navigate or claim a connection',async()=>{
  for(const result of [{...authorization(),expiresAtMs:NOW},{...authorization(),authorizationUrl:'https://evil.example/'},{...authorization(),accessToken:'SECRET'}]){const h=controllerHarness({start:async()=>result});h.controller.show();await flush();await h.controller.start();assert.deepEqual(h.navigations,[]);assert.equal(h.controller.snapshot.phase,'error');assert.equal(h.controller.snapshot.readiness,null);assert.doesNotMatch(renderLinkedInConnection(h.controller.snapshot),/evil|SECRET|Verbunden ·/);}
});
test('navigation exception becomes an unknown state and never silently retries',async()=>{
  let calls=0;const h=controllerHarness({navigate:()=>{calls++;throw new Error('private failure');}});h.controller.show();await flush();await h.controller.start();await h.controller.start();assert.equal(calls,1);assert.equal(h.controller.snapshot.phase,'error');assert.doesNotMatch(h.controller.snapshot.message,/private/);
});
test('repeated refresh is serialized and late reads after hide are ignored',async()=>{
  const pending=deferred();let calls=0;const h=controllerHarness({load:()=>{calls++;return pending.promise;}});h.controller.show();await h.controller.refresh();await h.controller.refresh();assert.equal(calls,1);h.controller.hide();pending.resolve(readiness('linked'));await flush();assert.equal(h.controller.snapshot.phase,'idle');assert.equal(h.controller.snapshot.readiness,null);
});
test('newer readiness wins when old read returns after another visit',async()=>{
  const first=deferred();let calls=0;const h=controllerHarness({load:()=>++calls===1?first.promise:Promise.resolve(readiness('not_configured'))});h.controller.show();h.controller.hide();h.controller.show();await flush();first.resolve(readiness('linked'));await flush();assert.equal(h.controller.snapshot.readiness.stage,'not_configured');
});
test('disconnect requires a second explicit action and cancel performs no mutation',async()=>{
  let calls=0;const h=controllerHarness({stage:'linked',disconnect:async()=>{calls++;}});h.controller.show();await flush();await h.controller.confirmDisconnect();assert.equal(calls,0);h.controller.askDisconnect();assert.equal(h.controller.snapshot.operation,'confirmDisconnect');assert.match(renderLinkedInConnection(h.controller.snapshot),/Gespeicherten Zugriff entfernen\?/);h.controller.cancelDisconnect();await h.controller.confirmDisconnect();assert.equal(calls,0);assert.equal(h.controller.snapshot.operation,'idle');
});
test('confirmed disconnect carries revision and waits for actual reload before displaying removal',async()=>{
  const write=deferred(),reload=deferred();let reads=0,writes=0,submitted;
  const h=controllerHarness({load:()=>++reads===1?Promise.resolve(readiness('linked')):reload.promise,disconnect:args=>{writes++;submitted=args;return write.promise;}});h.controller.show();await flush();h.controller.askDisconnect();const pending=h.controller.confirmDisconnect();await h.controller.confirmDisconnect();assert.equal(writes,1);assert.deepEqual(submitted,{connectionId:'connection-123',expectedRevision:2});assert.equal(h.controller.snapshot.readiness.stage,'linked');write.resolve();await flush();assert.equal(reads,2);assert.equal(h.controller.snapshot.phase,'loading');assert.equal(h.controller.snapshot.readiness,null);reload.resolve(readiness('disconnected'));await pending;assert.equal(h.controller.snapshot.readiness.stage,'disconnected');assert.equal(writes,1);
});
test('a 204 is not proof of removal if freshly loaded server state still says linked',async()=>{
  const h=controllerHarness({stage:'linked'});h.controller.show();await flush();h.controller.askDisconnect();await h.controller.confirmDisconnect();assert.equal(h.controller.snapshot.readiness.stage,'linked');assert.match(renderLinkedInConnection(h.controller.snapshot),/Verbunden · Versand gesperrt/);
});
test('disconnect conflict or ambiguous failure reloads once and never retries mutation',async()=>{
  for(const message of ['409','timeout','network']){
    let reads=0,writes=0;const h=controllerHarness({load:async()=>{reads++;return readiness('linked');},disconnect:async()=>{writes++;throw new Error(message);}});h.controller.show();await flush();h.controller.askDisconnect();await h.controller.confirmDisconnect();assert.equal(reads,2);assert.equal(writes,1);assert.equal(h.controller.snapshot.readiness.stage,'linked');assert.match(h.controller.snapshot.message,/Anfrage wird nicht wiederholt/);
  }
});
test('disconnect then failed status reload gives unknown rather than optimistic disconnection',async()=>{
  let reads=0;const h=controllerHarness({load:async()=>{if(++reads>1)throw new Error('SECRET');return readiness('linked');}});h.controller.show();await flush();h.controller.askDisconnect();await h.controller.confirmDisconnect();assert.equal(h.controller.snapshot.phase,'error');assert.equal(h.controller.snapshot.readiness,null);assert.doesNotMatch(renderLinkedInConnection(h.controller.snapshot),/Zugriff im Planer entfernt/);
});
test('hide during disconnect cancels UI update; returning reloads state but never repeats mutation',async()=>{
  const write=deferred();let reads=0,writes=0;const h=controllerHarness({load:async()=>{reads++;return readiness(reads===1?'linked':'disconnected');},disconnect:()=>{writes++;return write.promise;}});h.controller.show();await flush();h.controller.askDisconnect();const pending=h.controller.confirmDisconnect();h.controller.hide();write.resolve();await pending;assert.equal(reads,1);h.controller.show();await flush();assert.equal(reads,2);assert.equal(writes,1);assert.equal(h.controller.snapshot.readiness.stage,'disconnected');
});
test('refresh dismisses confirmation, and stale confirm action cannot mutate',async()=>{
  let writes=0;const h=controllerHarness({stage:'linked',disconnect:async()=>writes++});h.controller.show();await flush();h.controller.askDisconnect();await h.controller.refresh();await h.controller.confirmDisconnect();assert.equal(writes,0);assert.equal(h.controller.snapshot.operation,'idle');
});
test('snapshot mutations cannot grant capabilities or change the internal connection',async()=>{
  const h=controllerHarness({stage:'not_configured'});h.controller.show();await flush();const snapshot=h.controller.snapshot;snapshot.readiness.stage='ready';snapshot.operation='idle';await h.controller.start();assert.deepEqual(h.navigations,[]);assert.equal(h.controller.snapshot.readiness.stage,'not_configured');
});
test('linked card replaces legacy LinkedIn status while YouTube awaits its own readiness',()=>{
  const html=renderConnections({phase:'ready',state:general(),linkedin:readySnapshot('linked')});const card=linkedInCard(html);assert.match(card,/Verbunden · Versand gesperrt/);assert.doesNotMatch(card,/Nicht verbunden|OLD ACCOUNT PII/);assert.equal((html.match(/Nicht verbunden/g)||[]).length,2);assert.match(html,/youtube-connection-card/);assert.equal((html.match(/id="connection-linkedin"/g)||[]).length,1);assert.match(html,/X-API-Zugang und mögliche Kosten/);assert.equal((html.match(/<article/g)||[]).length,4);
});
test('unknown LinkedIn remains unknown even when general route claims not connected',()=>{
  for(const phase of ['idle','error']){const html=renderConnections({phase:'ready',state:general(),linkedin:{phase}});const card=linkedInCard(html);assert.match(card,/Status unbekannt/);assert.doesNotMatch(card,/Nicht verbunden|OLD ACCOUNT PII|Verbunden ·/);assert.match(card,/data-linkedin-start disabled/);}
});
test('blocked card explains official personal-account flow without links, tokens or enabled starts',()=>{
  for(const stage of ['not_configured','expired','disconnected','error']){const html=renderLinkedInConnection(readySnapshot(stage));assert.match(html,/persönliches LinkedIn-Konto|Persönliches LinkedIn-Konto/);assert.match(html,/offiziellen LinkedIn-Freigabe/);assert.match(html,/Versand bleibt gesperrt/);assert.doesNotMatch(html,/<(?:a|input|form)\b|https?:|data-publish/);if(stage!=='expired')assert.match(html,/data-linkedin-start disabled/);}
  const html=renderLinkedInConnection(readySnapshot('ready'));assert.match(html,/data-linkedin-start >/);assert.doesNotMatch(html,/data-linkedin-start disabled/);
});
test('disconnect disclosure does not claim provider revocation and names absent reconnect',()=>{
  const html=renderLinkedInConnection({...readySnapshot('linked'),operation:'confirmDisconnect'});assert.match(html,/role="group" aria-labelledby="linkedin-disconnect-title"/);assert.match(html,/Ein Widerruf der Freigabe bei LinkedIn ist damit nicht bestätigt/);assert.match(html,/Erneutes Verbinden ist noch nicht verfügbar/);assert.match(html,/data-linkedin-disconnect-cancel/);assert.match(html,/data-linkedin-disconnect-confirm/);
});
test('blocker labels are finite, human-readable, and server status data never enters the DOM',()=>{
  const v=readiness();v.blockerCodes=Object.keys(LINKEDIN_BLOCKERS);const html=renderLinkedInConnection({phase:'ready',readiness:normalizeLinkedInReadiness(v)});for(const code of v.blockerCodes)assert.doesNotMatch(html,new RegExp(code));assert.doesNotMatch(renderLinkedInConnection(readySnapshot('linked')),/connection-123|expiresAtMs|revision|accessToken|refreshToken/);
});
test('no polling, browser storage, callback-query trust or generated provider authorization link exists',()=>{
  const source=readFileSync(new URL('../../public/linkedin-connection.js',import.meta.url),'utf8');assert.doesNotMatch(source,/setInterval|localStorage|sessionStorage|document\.cookie|location\.search|new URLSearchParams|\.searchParams\.set/);assert.match(source,/globalThis\.top\.location\.assign/);const css=readFileSync(new URL('../../public/connections.css',import.meta.url),'utf8');assert.match(css,/@media\(max-width:760px\)\{\.linkedin-actions/);assert.match(css,/min-height:44px/);
});

function panelHarness(linkedinClient,{clock=now}={}){
  const events=new Map(),windowEvents=new Map(),documentEvents=new Map(),focus=[];
  const container={hidden:true,innerHTML:'',attrs:{},ownerDocument:{activeElement:null,visibilityState:'visible',addEventListener(k,v){documentEvents.set(k,v);},removeEventListener(k){documentEvents.delete(k);}},contains:()=>false,setAttribute(k,v){this.attrs[k]=v;},addEventListener(k,v){events.set(k,v);},removeEventListener(k){events.delete(k);},querySelector(selector){return {disabled:false,focus:()=>focus.push(selector)};}};
  const windowTarget={addEventListener(k,v){windowEvents.set(k,v);},removeEventListener(k){windowEvents.delete(k);}};
  const navigations=[];const panel=createConnectionsPanel({container,client:{load:async()=>general()},linkedinClient,now:clock,siteOrigin:SITE_ORIGIN,windowTarget,navigate:url=>navigations.push(url)});
  const click=selector=>events.get('click')({target:{closest:query=>query===selector?{}:null}});
  return {panel,container,events,windowEvents,documentEvents,navigations,click,focus};
}
test('real panel click path starts only once and pagehide suppresses a late navigation',async()=>{
  const pending=deferred();let writes=0;const h=panelHarness({load:async()=>readiness('ready'),start:()=>{writes++;return pending.promise;}});h.panel.show();await flush();h.click('[data-linkedin-start]');h.click('[data-linkedin-start]');assert.equal(writes,1);h.windowEvents.get('pagehide')();pending.resolve(authorization());await flush();assert.deepEqual(h.navigations,[]);assert.equal(h.container.hidden,true);h.panel.destroy();assert.equal(h.windowEvents.size,0);
});
test('real panel confirmation supports Cancel, Escape and focus restoration without writes',async()=>{
  let writes=0;const h=panelHarness({load:async()=>readiness('linked'),disconnect:async()=>writes++});h.panel.show();await flush();h.click('[data-linkedin-disconnect]');assert.match(h.container.innerHTML,/Gespeicherten Zugriff entfernen\?/);assert.equal(h.focus.at(-1),'[data-linkedin-disconnect-cancel]');h.click('[data-linkedin-disconnect-cancel]');assert.doesNotMatch(h.container.innerHTML,/Gespeicherten Zugriff entfernen\?/);assert.equal(h.focus.at(-1),'[data-linkedin-disconnect]');h.click('[data-linkedin-disconnect]');let prevented=false;h.events.get('keydown')({key:'Escape',preventDefault:()=>prevented=true});assert.equal(prevented,true);assert.doesNotMatch(h.container.innerHTML,/Gespeicherten Zugriff entfernen\?/);assert.equal(writes,0);h.panel.destroy();
});
test('real panel confirmation calls disconnect then re-renders verified removal',async()=>{
  let writes=0;const h=panelHarness({load:async()=>readiness(writes?'disconnected':'linked'),disconnect:async()=>writes++});h.panel.show();await flush();h.click('[data-linkedin-disconnect]');h.click('[data-linkedin-disconnect-confirm]');await flush();assert.equal(writes,1);assert.match(linkedInCard(h.container.innerHTML),/Zugriff im Planer entfernt/);assert.doesNotMatch(linkedInCard(h.container.innerHTML),/Nicht verbunden|Verbunden ·/);h.panel.destroy();
});
test('real panel ignores delayed old general and LinkedIn responses on navigation',async()=>{
  const pending=deferred();const h=panelHarness({load:()=>pending.promise});h.panel.show();h.panel.hide();const before=h.container.innerHTML;pending.resolve(readiness('linked'));await flush();assert.equal(h.container.innerHTML,before);assert.equal(h.container.hidden,true);h.panel.destroy();
});

test('Back/Forward page restoration reloads real readiness and never repeats OAuth start',async()=>{
  let reads=0,starts=0;const h=panelHarness({load:async()=>{reads++;return readiness('ready');},start:async()=>{starts++;return authorization();}});h.panel.show();await flush();h.click('[data-linkedin-start]');await flush();assert.equal(starts,1);h.windowEvents.get('pagehide')();assert.equal(h.container.hidden,true);h.windowEvents.get('pageshow')({persisted:true});await flush();assert.equal(h.container.hidden,false);assert.equal(reads,2);assert.equal(starts,1);assert.equal(h.navigations.length,1);assert.match(linkedInCard(h.container.innerHTML),/Bereit zur Kontofreigabe/);h.panel.destroy();
});
test('Back/Forward restoration cannot force the connections view over another active view',async()=>{
  let reads=0;const h=panelHarness({load:async()=>{reads++;return readiness('not_configured');}});h.panel.show();await flush();h.panel.hide();h.windowEvents.get('pagehide')();h.windowEvents.get('pageshow')({persisted:true});await flush();assert.equal(h.container.hidden,true);assert.equal(reads,1);h.panel.destroy();
});

test('redirect URI is pinned to this exact canonical HTTPS site and callback path',()=>{
  const callback=SITE_ORIGIN+'/api/providers/linkedin/oauth/callback';
  for(const redirect of ['https://other.example/api/providers/linkedin/oauth/callback',SITE_ORIGIN+'/callback',callback+'/',callback+'?next=elsewhere',callback+'?',callback+'#',callback+'#extra','https://planner.example:443/api/providers/linkedin/oauth/callback','https://planner.example:8443/api/providers/linkedin/oauth/callback','https://PLANNER.example/api/providers/linkedin/oauth/callback',SITE_ORIGIN+'/api/providers/linkedin/oauth/%63allback',SITE_ORIGIN+'/api/providers/linkedin/oauth/../oauth/callback']){
    const value=authorization(),url=new URL(value.authorizationUrl);url.searchParams.set('redirect_uri',redirect);value.authorizationUrl=url.href;assert.throws(()=>validateLinkedInAuthorization(value,{now,siteOrigin:SITE_ORIGIN}),redirect);
  }
  for(const siteOrigin of [undefined,null,'','http://planner.example','https://planner.example/','https://planner.example:443','https://planner.example:8443','https://planner.example?x=1','https://planner.example#x','https://user@planner.example'])assert.throws(()=>validateLinkedInAuthorization(authorization(),{now,siteOrigin}));
});
test('state and nonce are exactly 43 base64url characters and client ID follows server format',()=>{
  for(const key of ['state','nonce'])for(const text of ['S','S'.repeat(42),'S'.repeat(44),'S'.repeat(42)+'=','S'.repeat(42)+'.','S'.repeat(42)+'~','S'.repeat(42)+'+','S'.repeat(42)+'/']){
    const value=authorization(),url=new URL(value.authorizationUrl);url.searchParams.set(key,text);value.authorizationUrl=url.href;assert.throws(()=>validateLinkedInAuthorization(value,{now,siteOrigin:SITE_ORIGIN}));
  }
  for(const client of ['a','ab','C'.repeat(129),'valid.client','valid~client','valid client']){
    const value=authorization(),url=new URL(value.authorizationUrl);url.searchParams.set('client_id',client);value.authorizationUrl=url.href;assert.throws(()=>validateLinkedInAuthorization(value,{now,siteOrigin:SITE_ORIGIN}));
  }
  for(const client of ['a_-','C'.repeat(128)]){
    const value=authorization(),url=new URL(value.authorizationUrl);url.searchParams.set('client_id',client);url.searchParams.set('state','_-0'.repeat(14)+'A');value.authorizationUrl=url.href;assert.deepEqual(validateLinkedInAuthorization(value,{now,siteOrigin:SITE_ORIGIN}),value);
  }
});
test('HTTP client and final navigation guard each independently reject another callback origin',async()=>{
  const value=authorization(),url=new URL(value.authorizationUrl);url.searchParams.set('redirect_uri','https://other.example/api/providers/linkedin/oauth/callback');value.authorizationUrl=url.href;
  await assert.rejects(createLinkedInConnectionClient({siteOrigin:SITE_ORIGIN,now,fetcher:async()=>response(value)}).start());
  const h=controllerHarness({start:async()=>value});h.controller.show();await flush();await h.controller.start();assert.equal(h.navigations.length,0);assert.equal(h.controller.snapshot.phase,'error');
});
test('the default trusted origin is captured from location.origin, not the server payload',async()=>{
  const prior=Object.getOwnPropertyDescriptor(globalThis,'location');
  try{
    Object.defineProperty(globalThis,'location',{configurable:true,value:{origin:SITE_ORIGIN}});
    const client=createLinkedInConnectionClient({now,fetcher:async()=>response(authorization())});
    globalThis.location.origin='https://later.example';
    assert.deepEqual(await client.start(),authorization());
    const badClient=createLinkedInConnectionClient({now,fetcher:async()=>response(authorization())});await assert.rejects(badClient.start());
  }finally{if(prior)Object.defineProperty(globalThis,'location',prior);else delete globalThis.location;}
});
test('connected and expired records require a finite deadline; removed records require null',()=>{
  for(const stage of ['linked','expired']){const value=readiness(stage);value.connection.expiresAtMs=null;assert.throws(()=>normalizeLinkedInReadiness(value));}
  const value=readiness('disconnected');value.connection.expiresAtMs=NOW;assert.throws(()=>normalizeLinkedInReadiness(value));
});
function fakeClock(initial=NOW){
  let current=initial,nextId=1;const timers=new Map(),delays=[];
  return {
    now:()=>current,
    setTimer(fn,delay){assert.ok(delay>=1&&delay<=2147483647);const id=nextId++;timers.set(id,{fn,due:current+delay});delays.push(delay);return id;},
    clearTimer:id=>timers.delete(id),
    advance(ms,{fire=true}={}){current+=ms;if(fire){for(let count=0;count<100;count++){const next=[...timers].filter(([,timer])=>timer.due<=current).sort((a,b)=>a[1].due-b[1].due)[0];if(!next)return;timers.delete(next[0]);next[1].fn();}assert.fail('Unexpected timer loop');}},
    get pending(){return timers.size;},delays
  };
}
function expiryHarness({clock=fakeClock(),deadline=NOW+1000,...options}={}){
  const value=readiness('linked');value.connection.expiresAtMs=deadline;
  return {...controllerHarness({load:async()=>value,now:clock.now,setTimer:clock.setTimer,clearTimer:clock.clearTimer,...options}),clock};
}
test('a once-loaded link expiring in one second is unknown after ten minutes without polling',async()=>{
  let reads=0;const value=readiness('linked');value.connection.expiresAtMs=NOW+1000;
  const h=expiryHarness({load:async()=>{reads++;return value;}});h.controller.show();await flush();assert.equal(h.controller.snapshot.readiness.stage,'linked');assert.equal(h.clock.pending,1);h.clock.advance(600000);assert.equal(h.controller.snapshot.phase,'error');assert.equal(h.controller.snapshot.readiness,null);assert.equal(h.clock.pending,0);assert.equal(reads,1);const html=renderLinkedInConnection(h.controller.snapshot);assert.doesNotMatch(html,/Verbunden ·|data-linkedin-disconnect/);assert.match(html,/data-linkedin-start disabled/);assert.match(html,/zuletzt bestätigte LinkedIn-Zugriff ist abgelaufen/);
});
test('long expiry deadlines use bounded timer segments, never premature expiration or HTTP polling',async()=>{
  const MAX=2147483647;let reads=0;const value=readiness('linked');value.connection.expiresAtMs=NOW+MAX+1000;
  const h=expiryHarness({load:async()=>{reads++;return value;}});h.controller.show();await flush();assert.deepEqual(h.clock.delays,[MAX]);h.clock.advance(MAX-1);assert.equal(h.controller.snapshot.readiness.stage,'linked');h.clock.advance(1);assert.deepEqual(h.clock.delays,[MAX,1000]);assert.equal(h.controller.snapshot.readiness.stage,'linked');h.clock.advance(1000);assert.equal(h.controller.snapshot.phase,'error');assert.equal(h.clock.pending,0);assert.equal(reads,1);
});
test('hidden and destroyed panels clear expiry timers without resurrecting old evidence',async()=>{
  for(const action of ['hide','destroy']){
    const h=expiryHarness();h.controller.show();await flush();assert.equal(h.clock.pending,1);h.controller[action]();assert.equal(h.clock.pending,0);const before=h.controller.snapshot;h.clock.advance(600000);assert.deepEqual(h.controller.snapshot,before);
  }
});
test('a newer visit cannot be expired by the previous visit timer',async()=>{
  let reads=0;const h=expiryHarness({load:async()=>{const value=readiness('linked');value.connection.expiresAtMs=NOW+(++reads===1?1000:600000);return value;}});h.controller.show();await flush();h.controller.hide();h.controller.show();await flush();assert.equal(h.clock.pending,1);h.clock.advance(2000);assert.equal(h.controller.snapshot.readiness.stage,'linked');assert.equal(h.controller.snapshot.readiness.connection.expiresAtMs,NOW+600000);h.controller.destroy();
});
test('expired evidence invalidates disconnect confirmation before any mutation even if timer is suspended',async()=>{
  for(const action of ['ask','confirm','cancel']){
    let writes=0;const h=expiryHarness({disconnect:async()=>writes++});h.controller.show();await flush();if(action!=='ask')h.controller.askDisconnect();h.clock.advance(2000,{fire:false});if(action==='ask')h.controller.askDisconnect();else if(action==='confirm')await h.controller.confirmDisconnect();else h.controller.cancelDisconnect();assert.equal(writes,0);assert.equal(h.controller.snapshot.phase,'error');assert.equal(h.controller.snapshot.readiness,null);assert.equal(h.clock.pending,0);
  }
});
test('deadline reached during confirmation dismisses it safely and ignores an old confirm click',async()=>{
  let writes=0;const h=expiryHarness({disconnect:async()=>writes++});h.controller.show();await flush();h.controller.askDisconnect();h.clock.advance(1000);await h.controller.confirmDisconnect();assert.equal(writes,0);assert.equal(h.controller.snapshot.operation,'idle');assert.doesNotMatch(renderLinkedInConnection(h.controller.snapshot),/Gespeicherten Zugriff entfernen\?/);
});
test('expiry during an in-flight disconnect removes live status but lets one mutation read back',async()=>{
  let reads=0,writes=0;const pending=deferred();const h=expiryHarness({load:async()=>{if(++reads>1)return readiness('disconnected');const value=readiness('linked');value.connection.expiresAtMs=NOW+1000;return value;},disconnect:()=>{writes++;return pending.promise;}});h.controller.show();await flush();h.controller.askDisconnect();const submitted=h.controller.confirmDisconnect();h.clock.advance(1000);assert.equal(h.controller.snapshot.phase,'error');assert.equal(h.controller.snapshot.readiness,null);assert.equal(h.controller.snapshot.operation,'disconnecting');assert.doesNotMatch(renderLinkedInConnection(h.controller.snapshot),/Verbunden ·/);pending.resolve();await submitted;assert.equal(writes,1);assert.equal(reads,2);assert.equal(h.controller.snapshot.readiness.stage,'disconnected');
});
test('visibility and focus return recheck the clock without a status request',async()=>{
  for(const event of ['visibilitychange','focus']){
    let at=NOW,reads=0;const value=readiness('linked');value.connection.expiresAtMs=NOW+1000;
    const h=panelHarness({load:async()=>{reads++;return value;}},{clock:()=>at});h.panel.show();await flush();assert.match(linkedInCard(h.container.innerHTML),/Verbunden ·/);at+=600000;
    if(event==='visibilitychange'){h.container.ownerDocument.visibilityState='hidden';h.documentEvents.get(event)();assert.match(linkedInCard(h.container.innerHTML),/Verbunden ·/);h.container.ownerDocument.visibilityState='visible';h.documentEvents.get(event)();}else h.windowEvents.get(event)();
    assert.doesNotMatch(linkedInCard(h.container.innerHTML),/Verbunden ·/);assert.match(linkedInCard(h.container.innerHTML),/Status unbekannt/);assert.equal(reads,1);h.panel.destroy();assert.equal(h.documentEvents.size,0);assert.equal(h.windowEvents.size,0);
  }
});
test('blocked, ready, expired and disconnected states do not create expiry timers',async()=>{
  for(const stage of ['not_configured','ready','expired','disconnected','error']){
    const clock=fakeClock(),h=controllerHarness({stage,now:clock.now,setTimer:clock.setTimer,clearTimer:clock.clearTimer});h.controller.show();await flush();assert.equal(clock.pending,0);h.controller.destroy();
  }
});
