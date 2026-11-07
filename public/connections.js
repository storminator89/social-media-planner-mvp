import {createXConnectionController,renderXConnection,consumeXReturn} from './x-connection.js';
import {renderProviderSetup,createProviderSetupActions} from './provider-setup.js';
import {INSTAGRAM_SETUP} from './instagram-setup.js';
import {X_SETUP_DATA} from './x-setup.js';
import {LINKEDIN_SETUP_DATA} from './linkedin-setup.js';
import {YOUTUBE_SETUP_DATA} from './youtube-setup.js';
const SETUP_DATA={instagram:INSTAGRAM_SETUP,x:X_SETUP_DATA,linkedin:LINKEDIN_SETUP_DATA,youtube:YOUTUBE_SETUP_DATA};
/** Provider status plus explicitly initiated personal LinkedIn connection controls. */
import {createLinkedInConnectionController,renderLinkedInConnection} from './linkedin-connection.js';
import {createYouTubeConnectionController,renderYouTubeConnection,consumeYouTubeReturn} from './youtube-connection.js';
import {createYouTubeUploadUI} from './youtube-upload.js';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const PROVIDERS=Object.freeze([
  {id:'instagram',name:'Instagram',mark:'ig',color:'#b54488',summary:'Bilder und Stories brauchen ein passendes Konto und freigegebene Berechtigungen.',requirement:'Der unterstützte Kontotyp und die Berechtigungen hängen vom gewählten Instagram-Login-Verfahren ab. Diese Einrichtung muss vor einer Kontofreigabe feststehen.'},
  {id:'linkedin',name:'LinkedIn',mark:'in',color:'#2866aa',summary:'Profil und Organisationsseite haben unterschiedliche Berechtigungen.',requirement:'Lege zuerst fest, ob für ein persönliches Profil oder eine Organisation veröffentlicht werden soll. Die jeweilige App- und Kontoberechtigung muss geprüft werden.'},
  {id:'youtube',name:'YouTube',mark:'▶',color:'#c13f47',summary:'Video-Uploads brauchen eine eigene Freigabe und einen geprüften Upload-Ablauf.',requirement:'Ein autorisierter YouTube-Kanal allein reicht nicht für einen Video-Upload. App-Prüfung, Upload-Verarbeitung und Veröffentlichungsstatus müssen separat unterstützt und geprüft werden.'},
  {id:'x',name:'X',mark:'X',color:'#303238',summary:'X-API-Zugang und mögliche Kosten müssen vor einer Verbindung geprüft und freigegeben werden.',requirement:'Für eine spätere Verbindung müssen der verfügbare X-API-Zugang, die erforderlichen Berechtigungen und mögliche Kosten geprüft und ausdrücklich freigegeben werden. Hier wird kein kostenpflichtiger Zugang aktiviert.'}
]);
export const BLOCKERS=Object.freeze({
  OAUTH_NOT_CONFIGURED:{title:'Technische Einrichtung fehlt',description:'Die serverseitige Anbieter-Anmeldung ist noch nicht eingerichtet.'},
  COST_APPROVAL_REQUIRED:{title:'API-Zugang und Kostenfreigabe fehlen',description:'API-Zugang und mögliche Nutzungskosten müssen vor Aktivierung geprüft und ausdrücklich freigegeben werden. Hier wird nichts kostenpflichtig aktiviert.'},
  ACCOUNT_NOT_VERIFIED:{title:'Zielkonto noch nicht geprüft',description:'Das konkrete Profil, die Seite oder der Kanal wurde noch nicht verifiziert.'},
  PLATFORM_APPROVAL_REQUIRED:{title:'Plattform-Freigabe fehlt',description:'Die erforderliche Anbieterfreigabe für die App ist noch nicht nachgewiesen. Das bedeutet nicht, dass bereits eine Prüfung beantragt wurde.'},
  USER_AUTHORIZATION_REQUIRED:{title:'Deine Berechtigungsfreigabe fehlt',description:'Das Konto wurde noch nicht über einen unterstützten Anmeldeablauf für diese Anwendung freigegeben.'},
  PUBLISHING_DISABLED:{title:'Veröffentlichung deaktiviert',description:'Es ist kein Versand aus dieser Anwendung freigeschaltet.'},
  CONNECTION_ERROR:{title:'Verbindung konnte nicht geprüft werden',description:'Es liegt ein technischer Fehler vor. Der Status muss serverseitig geprüft werden.'},
  STATUS_UNAVAILABLE:{title:'Status nicht verfügbar',description:'Der aktuelle Zustand konnte nicht verlässlich abgerufen werden.'}
});
const allowedStatuses=new Set(['not_connected','setup_required','approval_required','error']);
const invalid=()=>new Error('Der Server hat keinen unterstützten Verbindungsstatus geliefert.');
export function normalizeProviderState(value){
  if(value?.schemaVersion!==1||value.capabilities?.oauth!==false||value.capabilities?.publishing!==false||!Array.isArray(value.providers)||value.providers.length!==PROVIDERS.length)throw invalid();
  const seen=new Set();const providers=value.providers.map(item=>{
    if(!item||!PROVIDERS.some(p=>p.id===item.provider)||seen.has(item.provider)||!allowedStatuses.has(item.status)||item.canPublish!==false)throw invalid();seen.add(item.provider);
    if(item.accountLabel!==null&&(typeof item.accountLabel!=='string'||item.accountLabel.length>200))throw invalid();
    if(!Array.isArray(item.blockerCodes)||item.blockerCodes.length>12||item.blockerCodes.some(code=>!Object.hasOwn(BLOCKERS,code)))throw invalid();
    const blockerCodes=[...new Set(item.blockerCodes)];
    if(item.status==='approval_required'&&!blockerCodes.some(code=>['PLATFORM_APPROVAL_REQUIRED','USER_AUTHORIZATION_REQUIRED'].includes(code)))throw invalid();
    return {provider:item.provider,status:item.status,accountLabel:item.accountLabel,canPublish:false,blockerCodes};
  });
  // Select only the public allowlisted fields. Never retain unknown server payloads.
  return {schemaVersion:1,providers,capabilities:{oauth:false,publishing:false}};
}
export function providerStatusCopy(provider){
  if(!provider)return {label:'Status unbekannt',className:'unknown',description:'Der aktuelle Status ist noch nicht verlässlich verfügbar.'};
  if(provider.status==='not_connected')return {label:'Nicht verbunden',className:'neutral',description:'Es ist kein Konto für diese Anwendung als verbunden bestätigt.'};
  if(provider.status==='setup_required')return {label:'Einrichtung erforderlich',className:'setup',description:'Vor einer Kontofreigabe fehlen noch technische Voraussetzungen.'};
  if(provider.status==='approval_required'){
    const platform=provider.blockerCodes.includes('PLATFORM_APPROVAL_REQUIRED'),user=provider.blockerCodes.includes('USER_AUTHORIZATION_REQUIRED');
    return {label:platform&&user?'Freigaben fehlen':platform?'Plattform-Freigabe fehlt':'Kontofreigabe fehlt',className:'approval',description:platform&&user?'App-Freigabe beim Anbieter und deine Kontoberechtigung fehlen.':platform?'Die erforderliche Freigabe für die Anbieter-App ist nicht nachgewiesen.':'Die persönliche Berechtigungsfreigabe für dieses Konto fehlt.'};
  }
  return {label:'Fehler gemeldet',className:'error',description:'Der Server konnte diesen Zustand nicht verlässlich bestätigen. Es wird nichts versendet.'};
}
export function renderProviderCard(definition,provider,{loading=false,expanded=false,siteOrigin=null,setupExpanded=[]}={}){
  const status=loading?{label:'Wird geladen',className:'unknown',description:'Der aktuelle Status wird abgerufen.'}:providerStatusCopy(provider);
  return `<article class="connection-card" aria-labelledby="connection-${definition.id}"><div class="connection-card-heading"><span class="connection-logo" style="--provider-color:${definition.color}" aria-hidden="true">${definition.mark}</span><div><h2 id="connection-${definition.id}">${definition.name}</h2><span class="connection-status ${status.className}"><i aria-hidden="true"></i>${status.label}</span></div></div><p class="connection-description">${status.description}</p><p class="connection-purpose">${definition.summary}</p>${!loading&&provider?.accountLabel?`<p class="connection-account"><strong>Konto zur Einrichtung:</strong> ${escape(provider.accountLabel)}<br><small>Dieser Hinweis bestätigt keine aktive Verbindung.</small></p>`:''}<div class="connection-disabled"><span aria-hidden="true">○</span> Versand hier nicht verfügbar</div><details class="connection-details" data-provider="${definition.id}" ${expanded?'open':''}><summary>Einrichtung für ${definition.name} ansehen<span aria-hidden="true">⌄</span></summary><div class="connection-details-body">${renderProviderSetup(SETUP_DATA[definition.id],{siteOrigin,expandedDetails:setupExpanded})}${provider&&!loading&&provider.blockerCodes.length?`<details class="setup-blockers" data-setup-key="setup-${definition.id}-blockers" ${setupExpanded.includes(`setup-${definition.id}-blockers`)?'open':''}><summary>Technischer Serverstatus</summary><ul class="connection-blockers">${provider.blockerCodes.map(code=>`<li><strong>${BLOCKERS[code].title}</strong><p>${BLOCKERS[code].description}</p></li>`).join('')}</ul></details>`:''}</div></details></article>`;
}
export function renderConnections({phase='idle',state=null,checkedAt=null,expanded=[],linkedin,youtube,x,siteOrigin=null,setupExpanded=[]}={}){
  const loading=phase==='loading',error=phase==='error',ready=phase==='ready'&&state;
  return `<div class="connections-intro"><div><span class="eyebrow">ECHTE KONTEN. KLARE FREIGABEN.</span><h2>Alles beginnt mit einer sicheren Verbindung.</h2><p>Hier siehst du, was für Instagram, LinkedIn, YouTube und X noch fehlt. Die Demo-Kanäle im Kalender bleiben davon getrennt.</p></div><button type="button" class="button subtle" data-connection-refresh aria-disabled="${loading}">${loading?'Wird geladen …':'Status aktualisieren'}</button></div><div class="connection-capability-note"><span class="connection-note-symbol" aria-hidden="true">i</span><div><strong>Kontofreigabe und Versand bleiben getrennt</strong><p>LinkedIn, YouTube und X zeigen ihre gesondert geprüfte Kontofreigabe. YouTube-Uploads benötigen eine ausdrückliche Bestätigung. Öffentlich und nicht gelistet erfordern eine zusätzliche, standardmäßig deaktivierte Serverfreigabe.</p></div></div><div class="connection-feedback ${error?'has-error':''}" role="${error?'alert':'status'}" aria-live="polite">${error?'<strong>Status der übrigen Anbieter nicht verfügbar.</strong> Bitte später erneut prüfen. Deine Planung bleibt nutzbar.':loading?'Status von Instagram wird geladen.':ready?`Status von Instagram abgerufen${checkedAt?` am ${escape(new Date(checkedAt).toLocaleString('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}))}`:''}. Versand aus dieser Ansicht deaktiviert.`:'Status noch nicht abgerufen.'}</div><div class="connection-grid">${PROVIDERS.map(def=>def.id==='x'?renderXConnection(x,{expanded:expanded.includes(def.id),siteOrigin,setupExpanded}):def.id==='linkedin'?renderLinkedInConnection(linkedin,{expanded:expanded.includes(def.id),siteOrigin,setupExpanded}):def.id==='youtube'?renderYouTubeConnection(youtube,{expanded:expanded.includes(def.id),siteOrigin,setupExpanded}):renderProviderCard(def,ready?state.providers.find(p=>p.provider===def.id):null,{loading,expanded:expanded.includes(def.id),siteOrigin,setupExpanded})).join('')}</div><div class="connections-footer"><p>Ein geplanter Kalenderbeitrag ist keine Veröffentlichungsbestätigung. Neue Verbindungen ändern deine vorhandenen Entwürfe nicht.</p><button type="button" class="button subtle" data-view="calendar">Zur Planung</button></div>`;
}
export function createProviderStatusClient({fetcher=globalThis.fetch.bind(globalThis),timeoutMs=10000}={}){
  return {async load(){
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const response=await fetcher('/api/providers/status',{method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Accept:'application/json','X-Planner-Request':'1'},signal:controller.signal});
      if(!response.ok)throw new Error('Verbindungsstatus nicht verfügbar.');
      if(!response.headers.get('Content-Type')?.includes('application/json'))throw invalid();
      return normalizeProviderState(await response.json());
    }finally{clearTimeout(timer);}
  }};
}
export function createConnectionsPanel({container,client=createProviderStatusClient(),linkedinClient,youtubeClient,xClient,youtubeUploadClient,navigate,now=()=>Date.now(),siteOrigin=globalThis.location?.origin,windowTarget=globalThis.window}={}){
  let phase='idle',state=null,checkedAt=null,visible=false,generation=0,disposed=false,linkedin,youtube,x,uploadUI=null,restoreAfterPageShow=false;
  const expanded=new Set(),setupExpanded=new Set();
  const setupActions=createProviderSetupActions({container,siteOrigin,visible:()=>visible&&!disposed});
  const documentTarget=container.ownerDocument||globalThis.document;
  const linkedinController=createLinkedInConnectionController({client:linkedinClient,navigate,now,siteOrigin,onChange:next=>{linkedin=next;render();}});
  linkedin=linkedinController.snapshot;
  const youtubeController=createYouTubeConnectionController({returnOutcome:consumeYouTubeReturn(windowTarget),client:youtubeClient,navigate,now,siteOrigin,onChange:next=>{youtube=next;uploadUI?.setReadiness(next);render();}});
  youtube=youtubeController.snapshot;
  const xController=createXConnectionController({returnOutcome:consumeXReturn(windowTarget),client:xClient,navigate,now,siteOrigin,onChange:next=>{x=next;render();}});
  x=xController.snapshot;
  const focusable=[...['start','renew','disconnect'].flatMap(action=>[`[data-x-action="${action}"]`,`[data-x-confirm="${action}"]`]),'[data-x-cancel]','[data-connection-refresh]','[data-linkedin-start]','[data-linkedin-disconnect]','[data-linkedin-disconnect-cancel]','[data-linkedin-disconnect-confirm]','[data-youtube-start]','[data-youtube-disconnect]','[data-youtube-disconnect-cancel]','[data-youtube-disconnect-confirm]','[data-youtube-upload]','[data-youtube-history]',...['linkedin','youtube'].map(id=>`[data-provider-setup-copy="${id}"]`),...['instagram','linkedin','youtube','x'].flatMap(id=>[...SETUP_DATA[id].steps.map(step=>step.id),'callback','limits','blockers'].map(key=>`[data-setup-key="setup-${id}-${key}"] > summary`)),...['linkedin','youtube'].map(id=>`#setup-${id}-callback-value`)];
  function focus(selector){const element=container.querySelector?.(selector);if(element&&!element.disabled&&!container.hidden)element.focus();}
  function render(){
    if(disposed)return;
    const active=(container.ownerDocument||globalThis.document)?.activeElement;
    const restore=active&&container.contains(active)?focusable.find(selector=>active.matches?.(selector)):null;
    container.innerHTML=renderConnections({phase,state,checkedAt,expanded:[...expanded],linkedin,youtube,x,siteOrigin,setupExpanded:[...setupExpanded]});
    container.setAttribute('aria-busy',String(phase==='loading'||linkedin.phase==='loading'||youtube.phase==='loading'||x.phase==='loading'));
    if(restore)focus(restore);
  }
  async function refresh(){
    if(disposed||!visible)return;
    void linkedinController.refresh();
    void youtubeController.refresh();
    void xController.refresh();
    if(phase==='loading')return;
    const request=++generation;phase='loading';state=null;render();
    try{const next=normalizeProviderState(await client.load());if(disposed||!visible||request!==generation)return;state=next;checkedAt=new Date(now()).toISOString();phase='ready';}
    catch{if(disposed||!visible||request!==generation)return;state=null;checkedAt=null;phase='error';}
    render();
  }
  function click(event){
    if(!visible||disposed)return;
    const target=event.target;
    if(target.closest?.('[data-connection-refresh]'))void refresh();
    else if(target.closest?.('[data-x-action]')){xController.ask(target.closest('[data-x-action]').dataset.xAction);focus('[data-x-cancel]');}
    else if(target.closest?.('[data-x-cancel]')){const action=x.operation.slice(7);xController.cancelAction();focus(`[data-x-action="${action}"]`);}
    else if(target.closest?.('[data-x-confirm]'))void xController.confirm(target.closest('[data-x-confirm]').dataset.xConfirm);
    else if(target.closest?.('[data-linkedin-start]'))void linkedinController.start();
    else if(target.closest?.('[data-linkedin-disconnect]')){linkedinController.askDisconnect();focus('[data-linkedin-disconnect-cancel]');}
    else if(target.closest?.('[data-linkedin-disconnect-cancel]')){linkedinController.cancelDisconnect();focus('[data-linkedin-disconnect]');}
    else if(target.closest?.('[data-linkedin-disconnect-confirm]'))void linkedinController.confirmDisconnect();
    else if(target.closest?.('[data-youtube-start]'))void youtubeController.start();
    else if(target.closest?.('[data-youtube-disconnect]')){youtubeController.askDisconnect();focus('[data-youtube-disconnect-cancel]');}
    else if(target.closest?.('[data-youtube-disconnect-cancel]')){youtubeController.cancelDisconnect();focus('[data-youtube-disconnect]');}
    else if(target.closest?.('[data-youtube-disconnect-confirm]')){uploadUI?.hide();void youtubeController.confirmDisconnect();}
    else if(target.closest?.('[data-youtube-upload]')||target.closest?.('[data-youtube-history]')){
      youtubeController.checkExpiry();
      const snapshot=youtubeController.snapshot;
      if(target.closest?.('[data-youtube-upload]')&&(snapshot.phase!=='ready'||snapshot.readiness?.stage!=='linked'||snapshot.readiness.capabilities.privateUpload!==true||snapshot.operation!=='idle'))return;
      if(!uploadUI)uploadUI=createYouTubeUploadUI({documentTarget,client:youtubeUploadClient,now});
      uploadUI.setReadiness(snapshot);uploadUI.show();
    }
  }
  function keydown(event){if(event.key==='Escape'&&x.operation.startsWith('confirm')){event.preventDefault();const action=x.operation.slice(7);xController.cancelAction();focus(`[data-x-action="${action}"]`);}else if(event.key==='Escape'&&youtube.operation==='confirmDisconnect'){event.preventDefault();youtubeController.cancelDisconnect();focus('[data-youtube-disconnect]');}else if(event.key==='Escape'&&linkedin.operation==='confirmDisconnect'){event.preventDefault();linkedinController.cancelDisconnect();focus('[data-linkedin-disconnect]');}}
  function toggle(event){const details=event.target;if(disposed||!visible||!container.contains(details))return;if(details.matches?.('details[data-setup-key]')){if(details.open)setupExpanded.add(details.dataset.setupKey);else setupExpanded.delete(details.dataset.setupKey);return;}if(!details.matches?.('details[data-provider]'))return;if(details.open)expanded.add(details.dataset.provider);else expanded.delete(details.dataset.provider);}
  function hide(){visible=false;generation++;setupActions.invalidate();phase='idle';state=null;checkedAt=null;linkedinController.hide();linkedin=linkedinController.snapshot;youtubeController.hide();youtube=youtubeController.snapshot;xController.hide();x=xController.snapshot;uploadUI?.hide();container.hidden=true;}
  function show(){if(disposed)return;visible=true;container.hidden=false;linkedinController.show();youtubeController.show();xController.show();if(phase==='idle'||(phase!=='loading'&&checkedAt&&now()-Date.parse(checkedAt)>60000))void refresh();else render();}
  function pagehide(){restoreAfterPageShow=visible;hide();}
  function pageshow(){if(restoreAfterPageShow){restoreAfterPageShow=false;show();}}
  function recheckExpiry(){if(documentTarget?.visibilityState==='hidden'){uploadUI?.hide();return;}linkedinController.checkExpiry();youtubeController.checkExpiry();xController.checkExpiry();}
  container.addEventListener('click',click);container.addEventListener('toggle',toggle,true);container.addEventListener('keydown',keydown);
  windowTarget?.addEventListener('pagehide',pagehide);windowTarget?.addEventListener('pageshow',pageshow);windowTarget?.addEventListener('focus',recheckExpiry);documentTarget?.addEventListener?.('visibilitychange',recheckExpiry);
  return {
    show,hide,refresh,
    destroy(){disposed=true;visible=false;generation++;setupActions.destroy();linkedinController.destroy();youtubeController.destroy();xController.destroy();uploadUI?.destroy();container.removeEventListener('click',click);container.removeEventListener('toggle',toggle,true);container.removeEventListener('keydown',keydown);windowTarget?.removeEventListener('pagehide',pagehide);windowTarget?.removeEventListener('pageshow',pageshow);windowTarget?.removeEventListener('focus',recheckExpiry);documentTarget?.removeEventListener?.('visibilitychange',recheckExpiry);},
    get visible(){return visible;}
  };
}
