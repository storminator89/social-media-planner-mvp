/** Read-only provider readiness. No OAuth, tokens, status mutation or publishing. */
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
export function renderProviderCard(definition,provider,{loading=false,expanded=false}={}){
  const status=loading?{label:'Wird geladen',className:'unknown',description:'Der aktuelle Status wird abgerufen.'}:providerStatusCopy(provider);
  return `<article class="connection-card" aria-labelledby="connection-${definition.id}"><div class="connection-card-heading"><span class="connection-logo" style="--provider-color:${definition.color}" aria-hidden="true">${definition.mark}</span><div><h2 id="connection-${definition.id}">${definition.name}</h2><span class="connection-status ${status.className}"><i aria-hidden="true"></i>${status.label}</span></div></div><p class="connection-description">${status.description}</p><p class="connection-purpose">${definition.summary}</p>${!loading&&provider?.accountLabel?`<p class="connection-account"><strong>Konto zur Einrichtung:</strong> ${escape(provider.accountLabel)}<br><small>Dieser Hinweis bestätigt keine aktive Verbindung.</small></p>`:''}<div class="connection-disabled"><span aria-hidden="true">○</span> Versand hier nicht verfügbar</div><details class="connection-details" data-provider="${definition.id}" ${expanded?'open':''}><summary>Einrichtung für ${definition.name} ansehen<span aria-hidden="true">⌄</span></summary><div class="connection-details-body">${provider&&!loading&&provider.blockerCodes.length?`<h3>Aktuell erforderlich</h3><ul class="connection-blockers">${provider.blockerCodes.map(code=>`<li><strong>${BLOCKERS[code].title}</strong><p>${BLOCKERS[code].description}</p></li>`).join('')}</ul>`:''}<h3>Vor einer echten Verbindung</h3><p>${definition.requirement}</p><ol class="connection-steps"><li><strong>App serverseitig einrichten</strong><p>Diese Oberfläche nimmt keine Passwörter, Tokens oder Client-Secrets entgegen.</p></li><li><strong>Konto bewusst freigeben</strong><p>Erst über einen freigeschalteten Anmeldeablauf beim Anbieter. Hier ist noch keiner aktiv.</p></li><li><strong>Versand separat prüfen</strong><p>Eine Kontofreigabe ist noch keine erfolgreiche Veröffentlichung. Upload und Versand müssen gesondert geprüft werden.</p></li></ol></div></details></article>`;
}
export function renderConnections({phase='idle',state=null,checkedAt=null,expanded=[]}={}){
  const loading=phase==='loading',error=phase==='error',ready=phase==='ready'&&state;
  return `<div class="connections-intro"><div><span class="eyebrow">ECHTE KONTEN. KLARE FREIGABEN.</span><h2>Alles beginnt mit einer sicheren Verbindung.</h2><p>Hier siehst du, was für Instagram, LinkedIn, YouTube und X noch fehlt. Die Demo-Kanäle im Kalender bleiben davon getrennt.</p></div><button type="button" class="button subtle" data-connection-refresh aria-disabled="${loading}">${loading?'Wird geladen …':'Status aktualisieren'}</button></div><div class="connection-capability-note"><span class="connection-note-symbol" aria-hidden="true">i</span><div><strong>Vorbereitung, noch keine Anmeldung oder Veröffentlichung</strong><p>Einrichtungshinweise lassen sich ansehen. Konten verbinden, Berechtigungen erteilen und Beiträge versenden sind hier nicht freigeschaltet.</p></div></div><div class="connection-feedback ${error?'has-error':''}" role="${error?'alert':'status'}" aria-live="polite">${error?'<strong>Verbindungsstatus nicht verfügbar.</strong> Bitte später erneut prüfen. Deine Planung bleibt nutzbar.':loading?'Verbindungsstatus wird geladen.':ready?`Serverstatus abgerufen${checkedAt?` am ${escape(new Date(checkedAt).toLocaleString('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}))}`:''}. Versand aus dieser Ansicht deaktiviert.`:'Status noch nicht abgerufen.'}</div><div class="connection-grid">${PROVIDERS.map(def=>renderProviderCard(def,ready?state.providers.find(p=>p.provider===def.id):null,{loading,expanded:expanded.includes(def.id)})).join('')}</div><div class="connections-footer"><p>Ein geplanter Kalenderbeitrag ist keine Veröffentlichungsbestätigung. Neue Verbindungen ändern deine vorhandenen Entwürfe nicht.</p><button type="button" class="button subtle" data-view="calendar">Zur Planung</button></div>`;
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
export function createConnectionsPanel({container,client=createProviderStatusClient(),now=()=>Date.now()}={}){
  let phase='idle',state=null,checkedAt=null,visible=false,generation=0,disposed=false;const expanded=new Set();
  function render(){if(disposed)return;const focused=container.contains(document.activeElement)?document.activeElement:null;const restore=focused?.matches('[data-connection-refresh]');container.innerHTML=renderConnections({phase,state,checkedAt,expanded:[...expanded]});container.setAttribute('aria-busy',String(phase==='loading'));if(restore&&!container.hidden)container.querySelector('[data-connection-refresh]').focus();}
  async function refresh(){
    if(disposed||phase==='loading')return;const request=++generation;phase='loading';state=null;render();
    try{const next=normalizeProviderState(await client.load());if(disposed||request!==generation)return;state=next;checkedAt=new Date(now()).toISOString();phase='ready';}
    catch{if(disposed||request!==generation)return;state=null;checkedAt=null;phase='error';}
    render();
  }
  function click(event){if(event.target.closest('[data-connection-refresh]'))void refresh();}
  function toggle(event){const details=event.target;if(!details.matches?.('details[data-provider]'))return;if(details.open)expanded.add(details.dataset.provider);else expanded.delete(details.dataset.provider);}
  container.addEventListener('click',click);container.addEventListener('toggle',toggle,true);
  return {show(){visible=true;container.hidden=false;if(phase==='idle'||(phase!=='loading'&&checkedAt&&now()-Date.parse(checkedAt)>60000))void refresh();else render();},hide(){visible=false;container.hidden=true;},refresh,destroy(){disposed=true;generation++;container.removeEventListener('click',click);container.removeEventListener('toggle',toggle,true);},get visible(){return visible;}};
}
