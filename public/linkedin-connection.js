import {renderProviderSetup} from './provider-setup.js';
import {LINKEDIN_SETUP_DATA} from './linkedin-setup.js';
/** Personal LinkedIn connection controls. No credentials, account PII or publishing. */
const SCOPES=Object.freeze(['openid','profile','w_member_social']);
const STAGES=new Set(['not_configured','ready','linked','expired','disconnected','error']);
export const LINKEDIN_BLOCKERS=Object.freeze({
  OAUTH_NOT_CONFIGURED:'Die LinkedIn-Anmeldung ist serverseitig noch nicht eingerichtet.',
  SITE_CALLBACK_IDENTITY_UNVERIFIED:'Die sichere Rückkehr aus der LinkedIn-Anmeldung ist noch nicht bestätigt.',
  REGISTERED_APP_CONFIGURATION_REQUIRED:'Die registrierte LinkedIn-App muss zuerst serverseitig eingerichtet werden.',
  AUTHORIZATION_RESPONSE_PROTECTION_UNVERIFIED:'Der Schutz der Anmeldeantwort ist noch nicht bestätigt.',
  SECURE_TOKEN_LIFECYCLE_UNAVAILABLE:'Die sichere serverseitige Verwaltung des Zugriffs ist noch nicht verfügbar.',
  ACCOUNT_TARGET_UNCONFIRMED:'Das persönliche LinkedIn-Konto ist als Verbindungsziel noch nicht bestätigt.',
  PUBLISHING_DISABLED:'Versand aus diesem Planer bleibt gesperrt.',
  TOKEN_STORE_UNAVAILABLE:'Der serverseitige Zugriffsspeicher ist nicht verfügbar.',
  CONNECTION_EXPIRED:'Der gespeicherte LinkedIn-Zugriff ist abgelaufen.',
  CONNECTION_REMOVED:'Der gespeicherte Zugriff wurde aus diesem Planer entfernt.',
  RECONNECT_UNAVAILABLE:'Erneutes Verbinden ist in dieser Version noch nicht verfügbar.',
  STATUS_UNAVAILABLE:'Der aktuelle LinkedIn-Status kann nicht zuverlässig bestätigt werden.'
});
const invalid=()=>new Error('LinkedIn-Daten konnten nicht sicher geprüft werden.');
const integer=value=>Number.isSafeInteger(value)&&value>=0;
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function exactKeys(value,keys){return record(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));}
function exactScopes(value){return Array.isArray(value)&&value.length===SCOPES.length&&new Set(value).size===SCOPES.length&&value.every(scope=>SCOPES.includes(scope));}
const connectionId=value=>typeof value==='string'&&value.length>=1&&value.length<=200&&/^[A-Za-z0-9_-]+$/.test(value);
export function normalizeLinkedInReadiness(value){
  if(!exactKeys(value,['schemaVersion','provider','stage','capabilities','targetConfirmed','requiredScopes','blockerCodes','authorizationUrl','connection','canDisconnect'])||value.schemaVersion!==1||value.provider!=='linkedin'||!STAGES.has(value.stage)||typeof value.targetConfirmed!=='boolean'||!exactScopes(value.requiredScopes)||value.authorizationUrl!==null||typeof value.canDisconnect!=='boolean')throw invalid();
  const c=value.capabilities;
  if(!exactKeys(c,['initiation','callback','tokenExchange','accountVerification','publishing'])||c.publishing!==false||['initiation','callback','tokenExchange','accountVerification'].some(key=>typeof c[key]!=='boolean'))throw invalid();
  if(!Array.isArray(value.blockerCodes)||value.blockerCodes.length>Object.keys(LINKEDIN_BLOCKERS).length||new Set(value.blockerCodes).size!==value.blockerCodes.length||value.blockerCodes.some(code=>typeof code!=='string'||!Object.hasOwn(LINKEDIN_BLOCKERS,code)))throw invalid();
  let connection=null;
  if(value.connection!==null){
    const item=value.connection;
    if(!exactKeys(item,['id','revision','status','expiresAtMs'])||!connectionId(item.id)||!integer(item.revision)||!['linked','expired','disconnected'].includes(item.status)||(item.expiresAtMs!==null&&!integer(item.expiresAtMs)))throw invalid();
    if((item.status==='disconnected')!==(item.expiresAtMs===null))throw invalid();
    connection={id:item.id,revision:item.revision,status:item.status,expiresAtMs:item.expiresAtMs};
  }
  if(['ready','not_configured'].includes(value.stage)&&connection!==null)throw invalid();
  if(['linked','expired','disconnected'].includes(value.stage)&&connection?.status!==value.stage)throw invalid();
  if(value.canDisconnect&&(!['linked','expired'].includes(value.stage)||!connection))throw invalid();
  if(value.stage==='ready'&&(!value.targetConfirmed||['initiation','callback','tokenExchange','accountVerification'].some(key=>!c[key])||value.blockerCodes.some(code=>code!=='PUBLISHING_DISABLED')))throw invalid();
  if(value.stage==='linked'&&!value.targetConfirmed)throw invalid();
  return {schemaVersion:1,provider:'linkedin',stage:value.stage,capabilities:{initiation:c.initiation,callback:c.callback,tokenExchange:c.tokenExchange,accountVerification:c.accountVerification,publishing:false},targetConfirmed:value.targetConfirmed,requiredScopes:[...SCOPES],blockerCodes:[...value.blockerCodes],authorizationUrl:null,connection,canDisconnect:value.canDisconnect};
}

/** Validate a server-supplied authorization URL. Never synthesize an OAuth URL. */
export function validateLinkedInAuthorization(value,{now=()=>Date.now(),siteOrigin=globalThis.location?.origin}={}){
  if(!exactKeys(value,['authorizationUrl','expiresAtMs'])||typeof value.authorizationUrl!=='string'||value.authorizationUrl.length>8192||!integer(value.expiresAtMs)||value.expiresAtMs<=now())throw invalid();
  const raw=value.authorizationUrl;
  // Match the raw authority too: URL.port normalizes an explicit :443 away.
  if(!raw.startsWith('https://www.linkedin.com/oauth/v2/authorization?')||raw.includes('#')||/[\u0000-\u0020\u007f]/.test(raw))throw invalid();
  let url;try{url=new URL(raw);}catch{throw invalid();}
  if(url.protocol!=='https:'||url.hostname!=='www.linkedin.com'||url.port||url.username||url.password||url.hash||url.pathname!=='/oauth/v2/authorization')throw invalid();
  const allowed=['response_type','client_id','redirect_uri','scope','state','nonce'];
  const entries=[...url.searchParams.entries()];
  if(entries.length!==allowed.length||allowed.some(key=>url.searchParams.getAll(key).length!==1)||entries.some(([key])=>!allowed.includes(key))||url.searchParams.get('response_type')!=='code')throw invalid();
  if(!/^[A-Za-z0-9_-]{3,128}$/.test(url.searchParams.get('client_id')))throw invalid();
  for(const key of ['state','nonce'])if(!/^[A-Za-z0-9_-]{43}$/.test(url.searchParams.get(key)))throw invalid();
  const scope=url.searchParams.get('scope');
  if(!exactScopes(scope.split(' ')))throw invalid();
  // Trust only the page's own canonical origin, never response data or query text.
  let origin;try{origin=new URL(siteOrigin);}catch{throw invalid();}
  if(typeof siteOrigin!=='string'||origin.protocol!=='https:'||origin.username||origin.password||origin.port||origin.search||origin.hash||siteOrigin!==origin.origin)throw invalid();
  if(url.searchParams.get('redirect_uri')!==siteOrigin+'/api/providers/linkedin/oauth/callback')throw invalid();
  return {authorizationUrl:raw,expiresAtMs:value.expiresAtMs};
}

export function createLinkedInConnectionClient({fetcher=globalThis.fetch.bind(globalThis),timeoutMs=10000,now=()=>Date.now(),siteOrigin=globalThis.location?.origin}={}){
  async function request(path,{method='GET',body,signal,json=true}={}){
    const controller=new AbortController(),abort=()=>controller.abort();
    if(signal?.aborted)throw invalid();
    signal?.addEventListener('abort',abort,{once:true});
    const timer=setTimeout(abort,timeoutMs);
    try{
      const response=await fetcher(path,{method,credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Accept:'application/json','X-Planner-Request':'1',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:controller.signal});
      if(controller.signal.aborted||!response.ok||response.redirected)throw invalid();
      if(!json){if(response.status!==204)throw invalid();return;}
      if(!/^application\/json(?:\s*;|$)/i.test(response.headers.get('Content-Type')||''))throw invalid();
      const payload=await response.json();
      if(controller.signal.aborted)throw invalid();
      return payload;
    }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
  }
  return {
    async load({signal}={}){return normalizeLinkedInReadiness(await request('/api/providers/linkedin/oauth/readiness',{signal}));},
    async start({signal}={}){return validateLinkedInAuthorization(await request('/api/providers/linkedin/oauth/start',{method:'POST',body:{accountType:'personal'},signal}),{now,siteOrigin});},
    async disconnect({connectionId:id,expectedRevision},{signal}={}){
      if(!connectionId(id)||!integer(expectedRevision))throw invalid();
      await request('/api/providers/linkedin/disconnect',{method:'POST',body:{connectionId:id,expectedRevision},signal,json:false});
    }
  };
}

const STATUS=Object.freeze({
  not_configured:{label:'Einrichtung erforderlich',className:'setup',description:'Die LinkedIn-Verknüpfung ist noch nicht freigeschaltet.'},
  ready:{label:'Bereit zur Kontofreigabe',className:'approval',description:'Dein persönliches LinkedIn-Konto kann über die offizielle LinkedIn-Freigabe verknüpft werden.'},
  linked:{label:'Verbunden · Versand gesperrt',className:'linked',description:'Der Server bestätigt eine Verknüpfung mit einem persönlichen LinkedIn-Konto. Es wird nichts versendet.'},
  expired:{label:'Zugriff abgelaufen',className:'setup',description:'Der gespeicherte Zugriff ist abgelaufen. Erneutes Verbinden ist noch nicht verfügbar.'},
  disconnected:{label:'Zugriff im Planer entfernt',className:'neutral',description:'Der gespeicherte Zugriff wurde aus diesem Planer entfernt. Ein Widerruf bei LinkedIn ist damit nicht bestätigt.'},
  error:{label:'Status unbekannt',className:'unknown',description:'Der aktuelle LinkedIn-Status kann nicht zuverlässig bestätigt werden. Alle Aktionen bleiben gesperrt.'}
});
export function linkedInStatusCopy({phase='idle',readiness=null}={}){
  if(phase==='loading')return {label:'Wird geladen',className:'unknown',description:'Der aktuelle LinkedIn-Status wird abgerufen.'};
  if(phase!=='ready'||!readiness)return STATUS.error;
  return STATUS[readiness.stage]||STATUS.error;
}
const canStart=s=>s.phase==='ready'&&s.readiness?.stage==='ready'&&s.operation==='idle';
const canDisconnect=s=>s.phase==='ready'&&s.readiness?.canDisconnect===true&&['linked','expired'].includes(s.readiness.stage)&&s.operation==='idle';
const initial=()=>({phase:'idle',readiness:null,operation:'idle',message:'',checkedAt:null});

/** Inject navigation for tests. Every side effect requires a visible, explicit action. */
export function createLinkedInConnectionController({siteOrigin=globalThis.location?.origin,now=()=>Date.now(),client=createLinkedInConnectionClient({siteOrigin,now}),onChange=()=>{},navigate=url=>globalThis.top.location.assign(url),setTimer=globalThis.setTimeout,clearTimer=globalThis.clearTimeout}={}){
  let state=initial(),visible=false,disposed=false,generation=0,controller=null,expiryTimer=null;
  const MAX_TIMER_DELAY=2147483647;
  const snapshot=()=>structuredClone(state);
  function emit(){if(!disposed)onChange(snapshot());}
  function clearExpiry(){if(expiryTimer!==null){clearTimer(expiryTimer);expiryTimer=null;}}
  function checkExpiry(){
    if(disposed||!visible||state.readiness?.stage!=='linked'||state.readiness.connection.expiresAtMs===null||state.readiness.connection.expiresAtMs>now())return false;
    clearExpiry();
    // A known deadline can invalidate old evidence, but cannot prove a new server status.
    // Let an already submitted disconnect finish and read back; never repeat it.
    state={...initial(),phase:'error',operation:state.operation==='disconnecting'?'disconnecting':'idle',message:'Der zuletzt bestätigte LinkedIn-Zugriff ist abgelaufen. Bitte den Serverstatus erneut prüfen.'};
    emit();return true;
  }
  function scheduleExpiry(){
    clearExpiry();
    if(disposed||!visible||state.readiness?.stage!=='linked'||state.readiness.connection.expiresAtMs===null)return;
    if(checkExpiry())return;
    const delay=Math.min(MAX_TIMER_DELAY,Math.max(1,state.readiness.connection.expiresAtMs-now()));
    expiryTimer=setTimer(()=>{expiryTimer=null;if(!checkExpiry())scheduleExpiry();},delay);
    // Node unit tests must not stay alive solely for a future UI expiry. Browsers return a number.
    expiryTimer?.unref?.();
  }
  function cancelPending(){generation++;controller?.abort();controller=null;}
  function begin(){cancelPending();controller=new AbortController();return {generation,signal:controller.signal};}
  function current(request){return !disposed&&visible&&request.generation===generation&&!request.signal.aborted;}
  async function load({message=''}={}){
    if(!visible||disposed||state.phase==='loading'||['starting','disconnecting','navigating'].includes(state.operation))return;
    const request=begin();clearExpiry();state={...initial(),phase:'loading',message};emit();
    try{
      const readiness=normalizeLinkedInReadiness(await client.load({signal:request.signal}));
      if(!current(request))return;
      // An already elapsed credential cannot be presented as a live connection.
      if(readiness.stage==='linked'&&readiness.connection.expiresAtMs!==null&&readiness.connection.expiresAtMs<=now())throw invalid();
      state={...state,phase:'ready',readiness,checkedAt:now()};scheduleExpiry();
    }catch{if(!current(request))return;state={...initial(),phase:'error',message:message||'LinkedIn-Status konnte nicht geprüft werden. Bitte erneut laden.'};}
    emit();
  }
  async function start(){
    if(!visible||disposed||checkExpiry()||!canStart(state))return;
    const request=begin();state={...state,operation:'starting',message:'Die offizielle LinkedIn-Freigabe wird vorbereitet. Versand bleibt gesperrt.'};emit();
    try{
      const result=await client.start({signal:request.signal});
      if(!current(request))return;
      const validated=validateLinkedInAuthorization(result,{now,siteOrigin});
      state={...state,operation:'navigating',message:'Du wirst zur offiziellen LinkedIn-Freigabe weitergeleitet. Versand bleibt gesperrt.'};emit();
      if(current(request))navigate(validated.authorizationUrl);
    }catch{if(!current(request))return;state={...initial(),phase:'error',message:'Die Weiterleitung konnte nicht sicher vorbereitet werden. Es wurde keine Verbindung bestätigt. Bitte den Status erneut laden.'};emit();}
  }
  function askDisconnect(){
    if(!visible||disposed||checkExpiry()||!canDisconnect(state))return;
    state={...state,operation:'confirmDisconnect',message:''};emit();
  }
  function cancelDisconnect(){
    if(!visible||disposed||checkExpiry()||state.operation!=='confirmDisconnect')return;
    state={...state,operation:'idle'};emit();
  }
  async function confirmDisconnect(){
    if(!visible||disposed||checkExpiry()||state.operation!=='confirmDisconnect'||!state.readiness?.canDisconnect)return;
    const connection=state.readiness.connection,request=begin();
    state={...state,operation:'disconnecting',message:'Der Zugriff wird aus diesem Planer entfernt. Anschließend wird der Serverstatus geprüft.'};emit();
    let message='Die Anfrage wurde verarbeitet. Maßgeblich ist der neu abgerufene Serverstatus.';
    try{await client.disconnect({connectionId:connection.id,expectedRevision:connection.revision},{signal:request.signal});}
    catch{message='Die Trennung konnte nicht bestätigt werden. Es wird nur der Status neu geprüft; die Anfrage wird nicht wiederholt.';}
    if(!current(request))return;
    state={...initial(),message};await load({message});
  }
  return {
    show(){if(disposed)return;visible=true;if(checkExpiry())return;if(state.phase==='idle'||(state.operation==='idle'&&state.checkedAt!==null&&now()-state.checkedAt>60000))void load();},
    hide(){if(disposed)return;visible=false;clearExpiry();cancelPending();state=initial();},
    refresh:load,start,askDisconnect,cancelDisconnect,confirmDisconnect,checkExpiry,
    destroy(){visible=false;disposed=true;clearExpiry();cancelPending();state=initial();},
    get snapshot(){return snapshot();}
  };
}

export function renderLinkedInConnection({phase='idle',readiness=null,operation='idle',message=''}={}, {expanded=false,siteOrigin=null,setupExpanded=[]}={}){
  const status=linkedInStatusCopy({phase,readiness}),state={phase,readiness,operation};
  const error=phase==='error',busy=['starting','disconnecting','navigating'].includes(operation),confirm=operation==='confirmDisconnect';
  const blockers=phase==='ready'?readiness?.blockerCodes||[]:[];
  const showDisconnect=phase==='ready'&&readiness?.canDisconnect===true&&['linked','expired'].includes(readiness.stage);
  const actions=showDisconnect?`<button type="button" class="button subtle" data-linkedin-disconnect ${canDisconnect(state)?'':'disabled'}>${operation==='disconnecting'?'Zugriff wird entfernt …':'Zugriff im Planer entfernen'}</button>`:`<button type="button" class="button primary" data-linkedin-start ${canStart(state)?'':'disabled'}>${busy&&operation!=='disconnecting'?'Weiterleitung wird vorbereitet …':'Persönliches LinkedIn-Konto verknüpfen'}</button>`;
  return `<article class="connection-card linkedin-connection-card" aria-labelledby="connection-linkedin" aria-busy="${phase==='loading'||busy}"><div class="connection-card-heading"><span class="connection-logo" style="--provider-color:#2866aa" aria-hidden="true">in</span><div><h2 id="connection-linkedin">LinkedIn</h2><span class="connection-status ${status.className}"><i aria-hidden="true"></i>${status.label}</span></div></div><p class="connection-description">${status.description}</p><p class="connection-purpose">Verknüpfung für ein persönliches LinkedIn-Konto. Organisationsseiten sind hier nicht unterstützt.</p><div class="connection-disabled"><span aria-hidden="true">○</span> Versand hier nicht verfügbar</div><div class="linkedin-actions">${actions}<p>Beim Verknüpfen wirst du zur offiziellen LinkedIn-Freigabe weitergeleitet. Erst deine Freigabe dort und die anschließende Serverprüfung können eine Verbindung bestätigen. Versand bleibt gesperrt.</p>${readiness&&['expired','disconnected'].includes(readiness.stage)?'<p>Erneutes Verbinden ist noch nicht verfügbar.</p>':''}</div>${confirm?'<div class="linkedin-confirm" role="group" aria-labelledby="linkedin-disconnect-title"><h3 id="linkedin-disconnect-title">Gespeicherten Zugriff entfernen?</h3><p>Der gespeicherte Zugriff wird aus diesem Planer entfernt. Ein Widerruf der Freigabe bei LinkedIn ist damit nicht bestätigt. Erneutes Verbinden ist noch nicht verfügbar.</p><div><button type="button" class="button subtle" data-linkedin-disconnect-cancel>Zugriff behalten</button><button type="button" class="button primary" data-linkedin-disconnect-confirm>Zugriff jetzt entfernen</button></div></div>':''}<div class="linkedin-feedback ${error?'has-error':''}" role="${error?'alert':'status'}" aria-live="polite">${escape(message)}</div><details class="connection-details" data-provider="linkedin" ${expanded?'open':''}><summary>Einrichtung für LinkedIn ansehen<span aria-hidden="true">⌄</span></summary><div class="connection-details-body">${renderProviderSetup(LINKEDIN_SETUP_DATA, {siteOrigin,expandedDetails:setupExpanded})}${blockers.length?`<details class="setup-blockers" data-setup-key="setup-linkedin-blockers" ${setupExpanded.includes('setup-linkedin-blockers')?'open':''}><summary>Technischer Serverstatus</summary><ul class="connection-blockers">${blockers.map(code=>`<li><p>${LINKEDIN_BLOCKERS[code]}</p></li>`).join('')}</ul></details>`:''}</div></details></article>`;
}
function escape(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
