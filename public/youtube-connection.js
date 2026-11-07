import {renderProviderSetup} from './provider-setup.js';
import {YOUTUBE_SETUP_DATA} from './youtube-setup.js';
/** YouTube connection. Server-issued evidence only; no credential storage. */
import {YOUTUBE_SCOPES,ytExact,ytInteger,ytScopes,validateYouTubeAuthorization,youtubeUIError} from './youtube-auth.js';
export {validateYouTubeAuthorization};
const invalid=youtubeUIError,integer=ytInteger,exactKeys=ytExact;
const connectionId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,200}$/.test(value);
const channelId=value=>typeof value==='string'&&/^UC[A-Za-z0-9_-]{22}$/.test(value);
export const YOUTUBE_UPLOAD_POLICY=Object.freeze({maxBytes:8388608,maxFiles:20,mimeTypes:['video/mp4','video/webm'],refresh:false,reconnect:false,background:false,privacy:'private',notifySubscribers:false});
export const YOUTUBE_BLOCKERS=Object.freeze({
 OAUTH_NOT_CONFIGURED:'Die Google-/YouTube-Anmeldung ist serverseitig noch nicht eingerichtet.',
 SITE_CALLBACK_IDENTITY_UNVERIFIED:'Die sichere Rückkehr aus der Google-Freigabe ist noch nicht bestätigt.',
 REGISTERED_APP_CONFIGURATION_REQUIRED:'Die registrierte Google-App muss serverseitig eingerichtet werden.',
 AUTHORIZATION_RESPONSE_PROTECTION_UNVERIFIED:'Der Schutz der Anmeldeantwort ist noch nicht bestätigt.',
 SECURE_TOKEN_LIFECYCLE_UNAVAILABLE:'Die sichere serverseitige Zugriffsverwaltung ist noch nicht verfügbar.',
 ACCOUNT_TARGET_UNCONFIRMED:'Der konkrete YouTube-Zielkanal ist noch nicht bestätigt.',
 PRIVATE_UPLOAD_DISABLED:'Private Uploads sind serverseitig noch nicht freigeschaltet.',
 CONNECTION_EXPIRED:'Der gespeicherte YouTube-Zugriff ist abgelaufen.',
 CONNECTION_REMOVED:'Der gespeicherte Zugriff wurde aus diesem Planer entfernt.',
 RECONNECT_UNAVAILABLE:'Erneutes Verbinden ist in dieser Version noch nicht verfügbar.',
 TOKEN_REFRESH_UNAVAILABLE:'Der Zugriff wird nicht automatisch erneuert. Uploads sind nur bis zum Ablauf möglich.',
 PUBLISHING_DISABLED:'Öffentliche Veröffentlichung und zeitgesteuerter Versand sind gesperrt.'
});
export function normalizeYouTubeReadiness(value){
 if(!ytExact(value,['schemaVersion','provider','stage','capabilities','targetConfirmed','expectedChannelId','requiredScopes','blockerCodes','authorizationUrl','connection','canDisconnect','uploadPolicy'])||value.schemaVersion!==1||value.provider!=='youtube'||!['not_configured','ready','linked','expired','disconnected','error'].includes(value.stage)||typeof value.targetConfirmed!=='boolean'||!ytScopes(value.requiredScopes)||value.authorizationUrl!==null||typeof value.canDisconnect!=='boolean')throw invalid();
 const c=value.capabilities,keys=['initiation','callback','tokenExchange','accountVerification','mediaIngest','privateUpload','publishing'];
 if(!ytExact(c,keys)||keys.some(k=>typeof c[k]!=='boolean')||c.publishing!==false)throw invalid();
 const p=value.uploadPolicy;
 if(!ytExact(p,Object.keys(YOUTUBE_UPLOAD_POLICY))||p.maxBytes!==8388608||p.maxFiles!==20||!Array.isArray(p.mimeTypes)||p.mimeTypes.length!==2||new Set(p.mimeTypes).size!==2||p.mimeTypes.some(m=>!['video/mp4','video/webm'].includes(m))||p.refresh!==false||p.reconnect!==false||p.background!==false||p.privacy!=='private'||p.notifySubscribers!==false)throw invalid();
 if(value.expectedChannelId!==null&&!channelId(value.expectedChannelId)||value.targetConfirmed&&!channelId(value.expectedChannelId))throw invalid();
 if(!Array.isArray(value.blockerCodes)||value.blockerCodes.length>Object.keys(YOUTUBE_BLOCKERS).length||new Set(value.blockerCodes).size!==value.blockerCodes.length||value.blockerCodes.some(code=>!Object.hasOwn(YOUTUBE_BLOCKERS,code)))throw invalid();
 let connection=null;
 if(value.connection!==null){const x=value.connection;if(!ytExact(x,['id','revision','status','expiresAtMs','channelId'])||!connectionId(x.id)||!ytInteger(x.revision)||!['linked','expired','disconnected'].includes(x.status)||!channelId(x.channelId)||x.channelId!==value.expectedChannelId||(x.expiresAtMs!==null&&!ytInteger(x.expiresAtMs))||(x.status==='disconnected')!==(x.expiresAtMs===null))throw invalid();connection={...x};}
 if(['ready','not_configured'].includes(value.stage)&&connection!==null||['linked','expired','disconnected'].includes(value.stage)&&connection?.status!==value.stage)throw invalid();
 if(value.canDisconnect&&(!['linked','expired'].includes(value.stage)||!connection))throw invalid();
 if(value.stage==='ready'&&(!value.targetConfirmed||['initiation','callback','tokenExchange','accountVerification'].some(k=>!c[k])||value.blockerCodes.some(k=>!['PRIVATE_UPLOAD_DISABLED','PUBLISHING_DISABLED','TOKEN_REFRESH_UNAVAILABLE'].includes(k))))throw invalid();
 if(value.stage==='linked'&&!value.targetConfirmed||(c.mediaIngest||c.privateUpload)&&value.stage!=='linked'||c.privateUpload&&!c.mediaIngest||c.privateUpload&&value.blockerCodes.includes('PRIVATE_UPLOAD_DISABLED'))throw invalid();
 return {schemaVersion:1,provider:'youtube',stage:value.stage,capabilities:{...c},targetConfirmed:value.targetConfirmed,expectedChannelId:value.expectedChannelId,requiredScopes:[...YOUTUBE_SCOPES],blockerCodes:[...value.blockerCodes],authorizationUrl:null,connection,canDisconnect:value.canDisconnect,uploadPolicy:{...YOUTUBE_UPLOAD_POLICY,mimeTypes:[...YOUTUBE_UPLOAD_POLICY.mimeTypes]}};
}
export function createYouTubeConnectionClient({fetcher=globalThis.fetch.bind(globalThis),timeoutMs=10000,now=()=>Date.now(),siteOrigin=globalThis.location?.origin}={}){
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
    async load({signal}={}){return normalizeYouTubeReadiness(await request('/api/providers/youtube/oauth/readiness',{signal}));},
    async start({signal}={}){return validateYouTubeAuthorization(await request('/api/providers/youtube/oauth/start',{method:'POST',body:{accountType:'channel'},signal}),{now,siteOrigin});},
    async disconnect({connectionId:id,expectedRevision},{signal}={}){
      if(!connectionId(id)||!integer(expectedRevision))throw invalid();
      await request('/api/providers/youtube/disconnect',{method:'POST',body:{connectionId:id,expectedRevision},signal,json:false});
    }
  };
}

/** Return hints are untrusted navigation context, never connection evidence. */
const RETURN_MESSAGES=Object.freeze({
 linked:'Zurück von Google. Ob der Kanal verbunden ist, zeigt ausschließlich der neu geprüfte Serverstatus.',
 cancelled:'Die Google-Freigabe wurde abgebrochen. Der gespeicherte Serverstatus wird erneut geprüft.',
 failed:'Die Google-Rückkehr konnte nicht bestätigt werden. Prüfe zuerst den Serverstatus, bevor du erneut verbindest.',
 unconfirmed:'Das Ergebnis der Google-Freigabe ist unklar. Es wird nur der Serverstatus geprüft, keine Freigabe wiederholt.'
});
export function consumeYouTubeReturn(windowTarget){
 try{
  const url=new URL(windowTarget.location.href);
  if(url.pathname!=='/'||url.hash!=='#connections'||!url.searchParams.has('youtube'))return null;
  const values=url.searchParams.getAll('youtube');
  const outcome=values.length===1&&Object.hasOwn(RETURN_MESSAGES,values[0])?values[0]:null;
  url.searchParams.delete('youtube');
  windowTarget.history.replaceState(windowTarget.history.state,'',url.pathname+url.search+url.hash);
  return outcome;
 }catch{return null;}
}

const STATUS=Object.freeze({
 not_configured:{label:'Einrichtung erforderlich',className:'setup',description:'Die YouTube-Kanalverknüpfung ist noch nicht freigeschaltet.'},
 ready:{label:'Bereit zur Kanalfreigabe',className:'approval',description:'Der bestätigte Zielkanal kann über die offizielle Google-Freigabe verknüpft werden.'},
 linked:{label:'Kanal verbunden',className:'linked',description:'Der Server bestätigt den Zielkanal. Ein privater Upload benötigt eine separate Bestätigung.'},
 expired:{label:'Zugriff abgelaufen',className:'setup',description:'Uploads sind gesperrt. Automatische Erneuerung und erneutes Verbinden sind noch nicht verfügbar.'},
 disconnected:{label:'Zugriff im Planer entfernt',className:'neutral',description:'Zugriff wurde hier entfernt. Videos wurden nicht gelöscht; ein Widerruf bei Google ist nicht bestätigt.'},
 error:{label:'Status unbekannt',className:'unknown',description:'Der YouTube-Status konnte nicht zuverlässig bestätigt werden. Alle Aktionen bleiben gesperrt.'}
});
export function youTubeStatusCopy({phase='idle',readiness=null}={}){if(phase==='loading')return {label:'Wird geladen',className:'unknown',description:'YouTube-Status wird abgerufen.'};return phase==='ready'&&readiness?STATUS[readiness.stage]||STATUS.error:STATUS.error;}
const canStart=s=>s.phase==='ready'&&s.readiness?.stage==='ready'&&s.operation==='idle';
const canDisconnect=s=>s.phase==='ready'&&s.readiness?.canDisconnect===true&&['linked','expired'].includes(s.readiness.stage)&&s.operation==='idle';
const initial=()=>({phase:'idle',readiness:null,operation:'idle',message:'',checkedAt:null});

/** Inject navigation for tests. Every side effect requires a visible, explicit action. */
export function createYouTubeConnectionController({returnOutcome=null,siteOrigin=globalThis.location?.origin,now=()=>Date.now(),client=createYouTubeConnectionClient({siteOrigin,now}),onChange=()=>{},navigate=url=>globalThis.top.location.assign(url),setTimer=globalThis.setTimeout,clearTimer=globalThis.clearTimeout}={}){
  let state=initial(),visible=false,disposed=false,generation=0,controller=null,expiryTimer=null;
  let returnMessage=Object.hasOwn(RETURN_MESSAGES,returnOutcome)?RETURN_MESSAGES[returnOutcome]:'';
  const MAX_TIMER_DELAY=2147483647;
  const snapshot=()=>structuredClone(state);
  function emit(){if(!disposed)onChange(snapshot());}
  function clearExpiry(){if(expiryTimer!==null){clearTimer(expiryTimer);expiryTimer=null;}}
  function checkExpiry(){
    if(disposed||!visible||state.readiness?.stage!=='linked'||state.readiness.connection.expiresAtMs===null||state.readiness.connection.expiresAtMs>now())return false;
    clearExpiry();
    // A known deadline can invalidate old evidence, but cannot prove a new server status.
    // Let an already submitted disconnect finish and read back; never repeat it.
    state={...initial(),phase:'error',operation:state.operation==='disconnecting'?'disconnecting':'idle',message:'Der zuletzt bestätigte YouTube-Zugriff ist abgelaufen. Bitte den Serverstatus erneut prüfen.'};
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
    message=message||returnMessage;returnMessage='';
    const request=begin();clearExpiry();state={...initial(),phase:'loading',message};emit();
    try{
      const readiness=normalizeYouTubeReadiness(await client.load({signal:request.signal}));
      if(!current(request))return;
      // An already elapsed credential cannot be presented as a live connection.
      if(readiness.stage==='linked'&&readiness.connection.expiresAtMs!==null&&readiness.connection.expiresAtMs<=now())throw invalid();
      state={...state,phase:'ready',readiness,checkedAt:now()};scheduleExpiry();
    }catch{if(!current(request))return;state={...initial(),phase:'error',message:message||'YouTube-Status konnte nicht geprüft werden. Bitte erneut laden.'};}
    emit();
  }
  async function start(){
    if(!visible||disposed||checkExpiry()||!canStart(state))return;
    const request=begin();state={...state,operation:'starting',message:'Die offizielle YouTube-Freigabe wird vorbereitet. Ein privater Upload braucht danach eine eigene Bestätigung.'};emit();
    try{
      const result=await client.start({signal:request.signal});
      if(!current(request))return;
      const validated=validateYouTubeAuthorization(result,{now,siteOrigin});
      state={...state,operation:'navigating',message:'Du wirst zur offiziellen YouTube-Freigabe weitergeleitet. Ein privater Upload braucht danach eine eigene Bestätigung.'};emit();
      if(current(request))navigate(validated.authorizationUrl);
    }catch{if(!current(request))return;state={...initial(),phase:'error',message:'Die Weiterleitung konnte nicht sicher vorbereitet werden. Es wurde keine Kanalverbindung bestätigt. Bitte den Status erneut laden.'};emit();}
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

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderYouTubeConnection({phase='idle',readiness=null,operation='idle',message=''}={}, {expanded=false,siteOrigin=null,setupExpanded=[]}={}){
 const status=youTubeStatusCopy({phase,readiness}),state={phase,readiness,operation},busy=['starting','disconnecting','navigating'].includes(operation),known=phase==='ready',linked=known&&readiness?.stage==='linked';
 const canUpload=linked&&readiness.capabilities.privateUpload&&operation==='idle';
 const blockers=known?readiness.blockerCodes:[];
 const actions=known&&readiness?.canDisconnect&&['linked','expired'].includes(readiness.stage)?`<button type="button" class="button subtle" data-youtube-disconnect ${canDisconnect(state)?'':'disabled'}>Zugriff im Planer entfernen</button>`:`<button type="button" class="button primary" data-youtube-start ${canStart(state)?'':'disabled'}>${busy?'Freigabe wird vorbereitet …':'YouTube-Kanal verknüpfen'}</button>`;
 return `<article class="connection-card youtube-connection-card" aria-labelledby="connection-youtube" aria-busy="${phase==='loading'||busy}"><div class="connection-card-heading"><span class="connection-logo" style="--provider-color:#c13f47" aria-hidden="true">▶</span><div><h2 id="connection-youtube">YouTube</h2><span class="connection-status ${status.className}"><i aria-hidden="true"></i>${status.label}</span></div></div><p class="connection-description">${status.description}</p><p class="connection-purpose">Nur private Videos. Keine öffentliche Veröffentlichung und keine Planung bei YouTube.</p>${known&&readiness.expectedChannelId?`<p class="youtube-target"><strong>Bestätigtes Verbindungsziel</strong><br>${escape(readiness.expectedChannelId)}</p>`:''}<div class="youtube-actions">${actions}<button type="button" class="button subtle" data-youtube-upload ${canUpload?'':'disabled'}>Privates Video vorbereiten</button><button type="button" class="button subtle" data-youtube-history>Gespeicherten Uploadverlauf ansehen</button><p>Du gibst den Kanal bewusst bei Google frei. Das allein startet keinen Upload. Passwörter und Zugriffsschlüssel werden hier nicht eingegeben.</p><p><strong>Begrenzter Zugriff:</strong> Keine automatische Erneuerung, kein erneutes Verbinden und kein Hintergrundbetrieb. Uploads nur bis zum Ablauf des Zugriffs.${linked?` Bestätigter Ablauf: ${escape(new Date(readiness.connection.expiresAtMs).toLocaleString('de-DE'))}.`:''}</p></div><div class="connection-disabled">Privat · keine Abonnenten-Benachrichtigung</div>${operation==='confirmDisconnect'?'<div class="youtube-confirm" role="group" aria-labelledby="youtube-disconnect-title"><h3 id="youtube-disconnect-title">Zugriff aus diesem Planer entfernen?</h3><p>Künftige Schritte werden gestoppt. Bereits an Google gesendete Anfragen können trotzdem abgeschlossen werden. Videos werden nicht gelöscht und die Google-Freigabe nicht nachweislich widerrufen. Erneutes Verbinden ist noch nicht verfügbar.</p><div><button type="button" class="button subtle" data-youtube-disconnect-cancel>Zugriff behalten</button><button type="button" class="button primary" data-youtube-disconnect-confirm>Zugriff jetzt entfernen</button></div></div>':''}<div class="youtube-feedback ${phase==='error'?'has-error':''}" role="${phase==='error'?'alert':'status'}" aria-live="polite">${escape(message)}</div><details class="connection-details" data-provider="youtube" ${expanded?'open':''}><summary>Einrichtung für YouTube ansehen<span aria-hidden="true">⌄</span></summary><div class="connection-details-body">${renderProviderSetup(YOUTUBE_SETUP_DATA, {siteOrigin,expandedDetails:setupExpanded})}${blockers.length?`<details class="setup-blockers" data-setup-key="setup-youtube-blockers" ${setupExpanded.includes('setup-youtube-blockers')?'open':''}><summary>Technischer Serverstatus</summary><ul class="connection-blockers">${blockers.map(code=>`<li><p>${YOUTUBE_BLOCKERS[code]}</p></li>`).join('')}</ul></details>`:''}<p class="connection-purpose">Private Uploads: MP4/WebM, maximal 8 MiB je Datei und 20 eigene Dateien. Site-Speicherung und Google-Upload bleiben getrennt.</p></div></details></article>`;
}
