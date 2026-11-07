import {renderProviderSetup} from './provider-setup.js';
import {X_SETUP_DATA} from './x-setup.js';
const invalid=()=>new Error('X-Status konnte nicht sicher geprüft werden.');
const integer=v=>Number.isSafeInteger(v)&&v>=0;
const connectionId=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
const exact=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const BLOCKERS={X_RUNTIME_AND_AUTHORIZATION_REQUIRED:'Sichere Servereinrichtung und Aktionsfreigabe fehlen.',X_COST_APPROVAL_REQUIRED:'API-Zugang und mögliches Kostenlimit müssen ausdrücklich freigegeben werden.',PUBLISHING_DISABLED:'Veröffentlichung bleibt deaktiviert.'};
export function normalizeXReadiness(v){
 if(!exact(v,['schemaVersion','provider','stage','connected','canPublish','canStart','canRefresh','canDisconnect','connection','blockerCodes'])||v.schemaVersion!==1||v.provider!=='x'||!['not_configured','not_connected','linked','expired','disconnected','outcome_unknown'].includes(v.stage)||v.canPublish!==false||['connected','canStart','canRefresh','canDisconnect'].some(k=>typeof v[k]!=='boolean'))throw invalid();
 if(!Array.isArray(v.blockerCodes)||new Set(v.blockerCodes).size!==v.blockerCodes.length||v.blockerCodes.some(k=>!Object.hasOwn(BLOCKERS,k))||!v.blockerCodes.includes('PUBLISHING_DISABLED'))throw invalid();
 const hasConnection=['linked','expired','disconnected','outcome_unknown'].includes(v.stage),c=v.connection;
 if(hasConnection){if(!exact(c,['id','revision','expiresAtMs'])||!connectionId(c.id)||!integer(c.revision)||c.revision<1||(v.stage==='disconnected'?c.expiresAtMs!==null:!integer(c.expiresAtMs)))throw invalid();}else if(c!==null)throw invalid();
 if(v.connected!==(v.stage==='linked')||v.canStart!==(v.stage==='not_connected')||v.canDisconnect!==['linked','expired','outcome_unknown'].includes(v.stage)||v.canRefresh&&!['linked','expired'].includes(v.stage)||v.canStart&&v.blockerCodes.some(k=>k!=='PUBLISHING_DISABLED'))throw invalid();
 return structuredClone(v);
}
export function validateXAuthorization(v,{now=Date.now,siteOrigin=globalThis.location?.origin}={}){
 if(!exact(v,['authorizationUrl','expiresAtMs'])||!integer(v.expiresAtMs)||v.expiresAtMs<=now()||v.expiresAtMs>now()+300000||typeof v.authorizationUrl!=='string'||v.authorizationUrl.length>8192||!v.authorizationUrl.startsWith('https://x.com/i/oauth2/authorize?')||/[\u0000-\u0020\u007f#]/.test(v.authorizationUrl))throw invalid();
 let url,origin;try{url=new URL(v.authorizationUrl);origin=new URL(siteOrigin);}catch{throw invalid();}
 if(origin.origin!==siteOrigin||origin.protocol!=='https:'||origin.port||origin.username||origin.password)throw invalid();
 const keys=['response_type','client_id','redirect_uri','scope','state','code_challenge','code_challenge_method'];
 if([...url.searchParams].length!==keys.length||keys.some(k=>url.searchParams.getAll(k).length!==1)||url.searchParams.get('response_type')!=='code'||url.searchParams.get('code_challenge_method')!=='S256'||url.searchParams.get('redirect_uri')!==siteOrigin+'/api/providers/x/oauth/callback'||!/^[A-Za-z0-9_-]{8,256}$/.test(url.searchParams.get('client_id')))throw invalid();
 for(const k of ['state','code_challenge'])if(!/^[A-Za-z0-9_-]{43}$/.test(url.searchParams.get(k)))throw invalid();
 const scopes=url.searchParams.get('scope').split(' '),required=['tweet.read','tweet.write','users.read'];
 if(new Set(scopes).size!==scopes.length||!required.every(s=>scopes.includes(s))||scopes.some(s=>![...required,'offline.access'].includes(s)))throw invalid();
 return {authorizationUrl:v.authorizationUrl,expiresAtMs:v.expiresAtMs};
}
const RETURN_MESSAGES={linked:'Rückkehr von X. Erst der neu geladene Serverstatus bestätigt die Verbindung.',cancelled:'Die X-Freigabe wurde abgebrochen. Es wurde keine neue Verbindung bestätigt.',failed:'Die Rückkehr von X konnte nicht geprüft werden.',unconfirmed:'Der Ausgang der X-Freigabe ist unklar. Nur der Serverstatus wird geprüft; kein automatischer neuer Versuch.'};
export function consumeXReturn(w){try{const u=new URL(w.location.href);if(u.pathname!=='/'||u.hash!=='#connections'||!u.searchParams.has('x'))return null;const values=u.searchParams.getAll('x'),outcome=values.length===1&&Object.hasOwn(RETURN_MESSAGES,values[0])?values[0]:null;u.searchParams.delete('x');w.history.replaceState(w.history.state,'',u.pathname+u.search+u.hash);return outcome;}catch{return null;}}
export function createXConnectionClient({fetcher=globalThis.fetch.bind(globalThis),timeoutMs=10000,now=()=>Date.now(),siteOrigin=globalThis.location?.origin}={}){
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
    async load({signal}={}){return normalizeXReadiness(await request('/api/providers/x/oauth/readiness',{signal}));},
    async start({signal}={}){return validateXAuthorization(await request('/api/providers/x/oauth/start',{method:'POST',body:{},signal}),{now,siteOrigin});},
    async renew({connectionId:id,expectedRevision},{signal}={}){
      if(!connectionId(id)||!integer(expectedRevision)||expectedRevision<1)throw invalid();
      await request('/api/providers/x/refresh',{method:'POST',body:{connectionId:id,expectedRevision},signal});
    },
    async disconnect({connectionId:id,expectedRevision},{signal}={}){
      if(!connectionId(id)||!integer(expectedRevision))throw invalid();
      await request('/api/providers/x/disconnect',{method:'POST',body:{connectionId:id,expectedRevision},signal});
    }
  };
}
const initial=()=>({phase:'idle',readiness:null,operation:'idle',message:'',checkedAt:null});
export function createXConnectionController({siteOrigin=globalThis.location?.origin,now=Date.now,client=createXConnectionClient({siteOrigin,now}),onChange=()=>{},navigate=url=>globalThis.top.location.assign(url),returnOutcome=null,setTimer=setTimeout,clearTimer=clearTimeout}={}){
 let state=initial(),visible=false,disposed=false,generation=0,abort=null,timer=null,returnMessage=RETURN_MESSAGES[returnOutcome]||'';
 const emit=()=>{if(!disposed)onChange(structuredClone(state));};
 const cancel=()=>{generation++;abort?.abort();abort=null;clearTimer(timer);timer=null;};
 const begin=()=>{cancel();abort=new AbortController();return {generation,signal:abort.signal};};
 const current=r=>visible&&!disposed&&r.generation===generation&&!r.signal.aborted;
 const available=action=>state.phase==='ready'&&state.operation==='idle'&&state.readiness?.[{start:'canStart',renew:'canRefresh',disconnect:'canDisconnect'}[action]]===true;
 function checkExpiry(){if(!visible||disposed||state.readiness?.stage!=='linked'||state.readiness.connection.expiresAtMs>now())return false;clearTimer(timer);state={...initial(),phase:'error',operation:['renewing','disconnecting'].includes(state.operation)?state.operation:'idle',message:'Der zuletzt bestätigte X-Zugriff ist abgelaufen. Bitte den Status aktualisieren.'};emit();return true;}
 function schedule(){clearTimer(timer);if(state.readiness?.stage!=='linked')return;if(checkExpiry())return;timer=setTimer(()=>{if(!checkExpiry())schedule();},Math.min(2147483647,Math.max(1,state.readiness.connection.expiresAtMs-now())));timer?.unref?.();}
 async function load(){if(!visible||disposed||state.phase==='loading'||['starting','navigating','renewing','disconnecting'].includes(state.operation))return;const r=begin(),message=state.message||returnMessage;returnMessage='';state={...initial(),phase:'loading',message};emit();try{const readiness=normalizeXReadiness(await client.load({signal:r.signal}));if(!current(r))return;if(readiness.connected&&readiness.connection.expiresAtMs<=now())throw invalid();state={...state,phase:'ready',readiness,checkedAt:now()};schedule();}catch{if(!current(r))return;state={...initial(),phase:'error',message:message||'X-Status nicht verfügbar. Aktionen bleiben gesperrt. Bitte Status aktualisieren.'};}emit();}
 function ask(action){if(!visible||disposed||checkExpiry()||!available(action))return;state={...state,operation:'confirm'+action,message:''};emit();}
 function cancelAction(){if(!visible||disposed||!state.operation.startsWith('confirm'))return;state={...state,operation:'idle'};checkExpiry();emit();}
 async function confirm(action){if(!visible||disposed||checkExpiry()||state.operation!=='confirm'+action||!availableWithConfirmation(action))return;const connection=state.readiness.connection,r=begin();state={...state,operation:{start:'starting',renew:'renewing',disconnect:'disconnecting'}[action],message:action==='start'?'Offizielle X-Freigabe wird vorbereitet …':'Anfrage wird einmal gesendet. Danach wird der Serverstatus geprüft.'};emit();
  if(action==='start'){try{const result=validateXAuthorization(await client.start({signal:r.signal}),{now,siteOrigin});if(!current(r))return;state={...state,operation:'navigating',message:'Weiterleitung zu X. Noch keine bestätigte Verbindung.'};emit();navigate(result.authorizationUrl);}catch{if(!current(r))return;state={...initial(),phase:'error',message:'Weiterleitung nicht bestätigt. Bitte Status prüfen; kein automatischer neuer Versuch.'};emit();}return;}
  let message='Anfrage verarbeitet. Maßgeblich ist der neu geladene Serverstatus.';try{await client[action]({connectionId:connection.id,expectedRevision:connection.revision},{signal:r.signal});}catch{message='Ausgang der Anfrage unklar. Nur der Status wird neu geprüft; die Aktion wird nicht wiederholt.';}
  if(!current(r))return;state={...initial(),message};await load();
 }
 function availableWithConfirmation(action){return state.phase==='ready'&&state.readiness?.[{start:'canStart',renew:'canRefresh',disconnect:'canDisconnect'}[action]]===true;}
 return {show(){if(disposed)return;visible=true;if(state.phase==='idle')void load();},hide(){visible=false;cancel();state=initial();},refresh:load,ask,cancelAction,confirm,checkExpiry,destroy(){disposed=true;visible=false;cancel();state=initial();},get snapshot(){return structuredClone(state);}};
}
const COPY={
 not_configured:['Einrichtung erforderlich','Servereinrichtung, Aktionsfreigabe und API-Kosten müssen zuerst geprüft werden. Verbinden ist noch gesperrt.'],
 not_connected:['Bereit zur Kontofreigabe','Noch kein X-Konto verbunden. Du kannst die offizielle Freigabe bewusst starten; der Server prüft dabei die erforderlichen Berechtigungen.'],
 linked:['Verbunden · Versand gesperrt','Der Server bestätigt einen gespeicherten X-Zugriff. Es werden keine Beiträge veröffentlicht.'],
 expired:['Zugriff abgelaufen','Die bisherige Freigabe ist abgelaufen. Falls freigegeben, kannst du den Zugriff bewusst erneuern.'],
 disconnected:['Zugriff im Planer entfernt','Die lokale Verbindung wurde entfernt. Die Freigabe bei X ist damit nicht widerrufen. Erneutes Verbinden wird noch nicht unterstützt.'],
 outcome_unknown:['Ausgang unklar','Eine Erneuerung ist nicht bestätigt. Nicht erneut versuchen. Du kannst den Status prüfen oder den lokalen Zugriff entfernen.']
};
export function renderXConnection({phase='idle',readiness=null,operation='idle',message=''}={},options={}){
 const known=phase==='ready'&&readiness,stage=known?readiness.stage:null,[label,description]=operation==='renewing'?['Erneuerung läuft · Status unbestätigt','Eine neue Verbindung wird erst nach bestätigtem Serverstatus angezeigt.']:phase==='loading'?['Wird geprüft','Der aktuelle X-Status wird vom Server geladen.']:COPY[stage]||['Status unbekannt','Der X-Status konnte nicht bestätigt werden. Alle Aktionen bleiben gesperrt.'];
 const idle=operation==='idle',busy=['starting','navigating','renewing','disconnecting'].includes(operation),button=(action,text,enabled)=>`<button type="button" class="button ${action==='start'?'primary':'subtle'}" data-x-action="${action}" ${enabled&&idle?'':'disabled'}>${text}</button>`;
 const action=operation.startsWith('confirm')?operation.slice(7):null;
 const confirmations={start:['X-Konto freigeben?','Du wechselst zur offiziellen X-Anmeldung. Angefordert werden tweet.read, users.read und tweet.write. Schreiben wäre damit bei X erlaubt, bleibt in Takt aber gesperrt. Falls separat eingerichtet, wird zusätzlich offline.access für spätere bewusste Erneuerungen angefordert. API-Abfragen können Kosten verursachen; der Server muss die konkrete Freigabe prüfen.','Weiter zur X-Freigabe'],renew:['X-Zugriff einmal erneuern?','Es wird genau eine Erneuerungsanfrage gesendet. Das ist keine Veröffentlichung und aktiviert keine automatische Erneuerung. Nur mit zuvor genehmigtem API-Zugang und Kostenlimit fortfahren.','Jetzt einmal erneuern'],disconnect:['Zugriff aus Takt entfernen?','Der gespeicherte Zugriff wird lokal entfernt. Bereits gesendete Anfragen können weiterlaufen. Die X-Freigabe wird nicht widerrufen, Beiträge werden nicht gelöscht. Erneutes Verbinden ist noch nicht verfügbar.','Zugriff jetzt entfernen']};
 const c=confirmations[action];
 return `<article class="connection-card x-connection-card" aria-labelledby="connection-x" aria-busy="${phase==='loading'||busy}"><div class="connection-card-heading"><span class="connection-logo" style="--provider-color:#303238" aria-hidden="true">X</span><div><h2 id="connection-x">X</h2><span class="connection-status ${stage==='linked'?'linked':'setup'}"><i aria-hidden="true"></i>${label}</span></div></div><p class="connection-description">${description}</p><div class="connection-disabled">Veröffentlichung gesperrt · kein automatischer Betrieb</div><div class="x-actions">${known&&readiness.canDisconnect?button('disconnect','Zugriff im Planer entfernen',true):button('start',stage==='not_configured'?'Verbinden noch nicht verfügbar':'X-Konto verknüpfen',known&&readiness.canStart)}${known&&readiness.canRefresh?button('renew','Zugriff einmal erneuern',true):''}<p>Keine Passwörter, Zugriffsschlüssel oder Zahlungsdaten hier eingeben. Kostenfreigabe und Kontofreigabe sind getrennte Voraussetzungen.</p>${known&&readiness.connection?.expiresAtMs?`<p>Zuletzt bestätigter Ablauf: ${escape(new Date(readiness.connection.expiresAtMs).toLocaleString('de-DE'))}.</p>`:''}${busy?'<p role="status">Anfrage läuft. Bitte nicht erneut starten.</p>':''}</div>${c?`<div class="x-confirm" role="group" aria-labelledby="x-confirm-title"><h3 id="x-confirm-title">${c[0]}</h3><p>${c[1]}</p><div><button type="button" class="button subtle" data-x-cancel>Abbrechen</button><button type="button" class="button primary" data-x-confirm="${action}">${c[2]}</button></div></div>`:''}<div class="x-feedback ${phase==='error'?'has-error':''}" role="${phase==='error'?'alert':'status'}" aria-live="polite">${escape(message)}</div><details class="connection-details" data-provider="x" ${options.expanded?'open':''}><summary>Einrichtung für X ansehen<span aria-hidden="true">⌄</span></summary><div class="connection-details-body">${renderProviderSetup(X_SETUP_DATA,{...options,expandedDetails:options.setupExpanded||[]})}${known?`<ul class="connection-blockers">${readiness.blockerCodes.map(k=>`<li><p>${BLOCKERS[k]}</p></li>`).join('')}</ul>`:''}</div></details></article>`;
}
