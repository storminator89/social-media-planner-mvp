import {setProfileLinked} from './mastodon-profile.js';
import {describeMastodonFailure} from './mastodon-diagnostics.js';
import {boundedMastodonRequest} from './mastodon-request.js';
const $=id=>document.getElementById(id),start=$('start'),refresh=$('refresh'),status=$('status'),confirmation=$('confirmation');
let busy=false,generation=0,ready=null,pending=null;
const requestOptions={cache:'no-store',redirect:'error',credentials:'same-origin'};
function action(text){const node=$('action-message');if(node){node.textContent=text;node.hidden=!text;}if(text)status.textContent=text;}
function invalidate(){generation++;pending?.abort();pending=null;ready=null;setProfileLinked(false);start.disabled=true;}
function begin(){invalidate();busy=true;pending=new AbortController();refresh.disabled=true;$('diagnose').disabled=true;$('revoke').disabled=true;$('recover').disabled=true;return generation;}
function finish(current){if(current!==generation)return false;pending=null;busy=false;refresh.disabled=false;$('diagnose').disabled=false;$('confirm').disabled=false;$('cancel').disabled=false;return true;}
function close(){confirmation.hidden=true;start.focus();}
const labels={recovered:'Lokal zurückgesetzt nach deiner Bestätigung des manuellen Widerrufs. Der Server hat den externen Widerruf nicht selbst bestätigt.',recovery_pending:'Lokaler Versuch gesperrt. Warte mindestens eine Minute, prüfe und widerrufe dann Takt-Freigaben bei kanoa.de. Danach erneut Wiederherstellung bestätigen.',verification_pending:'Token erhalten, Profilprüfung nicht bestätigt. Bitte Zugriff widerrufen.',revocation_pending:'Widerruf nicht bestätigt. Erneut widerrufen oder bei kanoa.de prüfen.',revoked:'Profilzugriff widerrufen. Du kannst neu verbinden.',not_configured:'Noch nicht eingerichtet. Eine sichere Server-Einrichtung und ausdrückliche Freigabe fehlen.',not_connected:'Bereit für einen bewusst gestarteten Profiltest.',pending:'Autorisierung ausstehend. Bitte den bereits geöffneten Ablauf abschließen.',registration_outcome_unknown:'Registrierung nicht bestätigt. Nicht erneut starten; zuerst den Zustand prüfen.',authorization_outcome_unknown:'Freigabe nicht bestätigt. Nicht erneut starten; zuerst den Zustand prüfen.',exchange_outcome_unknown:'Verbindung nicht bestätigt. Nicht erneut starten; zuerst den Zustand prüfen.',declined:'Zugriff abgelehnt. Es wurde kein Profilzugriff gespeichert.',linked:'Profilverbindung bestätigt. Dieser Profilzugriff erlaubt keine Veröffentlichung. Ein separater Schreibzugriff wird hier nicht geprüft.'};
async function load(){
 if(busy)return;invalidate();const current=generation;pending=new AbortController();$('revoke').hidden=true;$('recover').hidden=true;status.textContent='Status wird geprüft …';
 try{
  const {response:r,value:v}=await boundedMastodonRequest('/api/providers/mastodon/oauth/readiness',{...requestOptions,signal:pending.signal});
  if(current!==generation)return;
  if(!r.ok||v.provider!=='mastodon'||v.canPublish!==false||!Object.hasOwn(labels,v.phase)||v.scope!=='profile'||v.instance!=='https://kanoa.de'||typeof v.canStart!=='boolean'||v.canStart!==(['not_connected','revoked','recovered'].includes(v.phase)))throw Error();
  ready=v;setProfileLinked(v.phase==='linked');start.hidden=v.phase==='linked';$('instance').textContent=new URL(v.instance).hostname;
  status.textContent=labels[v.phase]+(v.phase==='linked'&&Number.isSafeInteger(v.verifiedAtMs)?' Zuletzt geprüft: '+new Date(v.verifiedAtMs).toLocaleString('de-DE')+'.':'');start.disabled=!v.canStart;
  $('revoke').hidden=!['linked','verification_pending','revocation_pending'].includes(v.phase);$('revoke').disabled=false;
  $('recover').hidden=['not_connected','not_configured','revoked','recovered'].includes(v.phase)||!Number.isSafeInteger(v.recoveryVersion)||v.recoveryVersion<1;$('recover').disabled=false;
  $('recover').textContent=v.phase==='recovery_pending'?'Manuellen Widerruf bestätigen und lokal zurücksetzen':'Versuch zuerst lokal sperren';
 }catch{if(current===generation)status.textContent='Profilstatus nicht verfügbar. Eine bestehende Verbindung kann gerade nicht beurteilt werden. Diese Statusprüfung startet keine Verbindung.';}
 finally{if(current===generation)pending=null;}
}
start.onclick=()=>{if(busy||!ready?.canStart)return;confirmation.hidden=false;$('cancel').focus();};$('cancel').onclick=close;
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!confirmation.hidden&&!busy){e.preventDefault();close();}});
$('confirm').onclick=async()=>{
 if(busy||!ready?.canStart||confirmation.hidden)return;const instance=ready.instance,current=begin();$('confirm').disabled=true;$('cancel').disabled=true;action('Verbindung wird vorbereitet. Bitte nicht erneut starten.');
 try{
  const {response:r,value:v}=await boundedMastodonRequest('/api/providers/mastodon/oauth/start',{...requestOptions,signal:pending.signal,method:'POST',headers:{'Content-Type':'application/json','X-Planner-Request':'1'},body:JSON.stringify({consent:'kanoa-profile-v1'})});
  if(current!==generation)return;if(!r.ok)throw new Error(describeMastodonFailure(v));
  const u=new URL(v.authorizationUrl);if(u.username||u.password||u.origin!==instance||u.pathname!=='/oauth/authorize'||u.hash||u.searchParams.get('scope')!=='profile'||u.searchParams.get('redirect_uri')!==location.origin+'/api/providers/mastodon/oauth/callback'||u.searchParams.get('code_challenge_method')!=='S256')throw Error();location.assign(u.href);
 }catch(error){if(current!==generation)return;confirmation.hidden=true;action(typeof error?.message==='string'&&error.message.startsWith('Vorprüfung fehlgeschlagen.')?error.message:'Ausgang unklar. Nicht erneut starten; Status prüfen. Ein Zeitlimit bestätigt keinen Abbruch beim Server.');finish(current);}
};
refresh.onclick=()=>{confirmation.hidden=true;void load();};
window.addEventListener('pageshow',()=>{busy=false;invalidate();$('diagnose').disabled=false;confirmation.hidden=true;refresh.disabled=false;$('confirm').disabled=false;$('cancel').disabled=false;void load();});
window.addEventListener('pagehide',()=>{invalidate();confirmation.hidden=true;});
const url=new URL(location.href);if(url.search){history.replaceState(null,'',url.pathname);status.textContent='Rückkehr von Mastodon. Der tatsächliche Serverstatus wird geprüft.';}void load();
$('revoke').onclick=async()=>{
 if(busy||!ready||!['linked','verification_pending','revocation_pending'].includes(ready.phase))return;
 if(!window.confirm('Profilzugriff bei kanoa.de widerrufen und den gespeicherten Zugriff entfernen?'))return;
 const current=begin();action('Widerruf wird angefragt. Bitte nicht erneut auslösen.');
 try{const{response:r}=await boundedMastodonRequest('/api/providers/mastodon/oauth/revoke',{...requestOptions,signal:pending.signal,method:'POST',headers:{'Content-Type':'application/json','X-Planner-Request':'1'},body:JSON.stringify({consent:'revoke-kanoa-profile-v1'})},{json:false});if(current!==generation)return;if(!r.ok)throw Error();action('Widerrufsanfrage beantwortet. Maßgeblich ist der aktuelle Profilstatus darunter.');}
 catch{if(current===generation)action('Ausgang des Widerrufs unklar. Nicht automatisch wiederholen. Prüfe den Profilstatus und die autorisierten Anwendungen bei kanoa.de. Ein Zeitlimit bestätigt keinen Abbruch beim Server.');}
 finally{if(finish(current))void load();}
};
$('recover').onclick=async()=>{
 if(busy||!ready||!Number.isSafeInteger(ready.recoveryVersion)||ready.recoveryVersion<1||['not_connected','not_configured','revoked','recovered'].includes(ready.phase))return;const expectedPhase=ready.phase,expectedVersion=ready.recoveryVersion,finalStep=expectedPhase==='recovery_pending';const consent=finalStep?'confirmed-manual-kanoa-profile-revocation-v2':'fence-kanoa-profile-v2';let conflict=false;
 if(!window.confirm(!finalStep?'Zuerst den lokalen Versuch sperren? Danach mindestens eine Minute warten, die Freigaben bei kanoa.de prüfen und erneut hier bestätigen.':'Zuerst bei kanoa.de unter Einstellungen → Autorisierte Anwendungen den Takt-Zugriff widerrufen. Hast du alle Takt-Profiltest-Freigaben widerrufen bzw. geprüft, dass keine bestehen? Erst dann bestätigen. Dies verwirft den lokalen Versuch und seine gespeicherten Zugangsdaten.'))return;
 const current=begin();action(finalStep?'Lokales Zurücksetzen wird angefragt. Bitte nicht erneut auslösen.':'Lokale Sperre wird angefragt. Bitte nicht erneut auslösen.');
 try{const{response:r}=await boundedMastodonRequest('/api/providers/mastodon/oauth/recover',{...requestOptions,signal:pending.signal,method:'POST',headers:{'Content-Type':'application/json','X-Planner-Request':'1'},body:JSON.stringify({consent,expectedPhase,expectedVersion})},{json:false});if(current!==generation)return;if(r.status===409){conflict=true;action('Wiederherstellung nicht ausgeführt: Stand geändert oder Wartezeit noch nicht beendet. Status prüfen und den angezeigten Schritt erneut bewusst bestätigen.');return;}if(!r.ok)throw Error();action('Wiederherstellungsanfrage beantwortet. Prüfe den aktuellen Profilstatus darunter, bevor du fortfährst.');}
 catch{if(current===generation)action('Ausgang der Wiederherstellung unklar. Nicht automatisch wiederholen. Status prüfen. Ein Zeitlimit bestätigt keinen Abbruch beim Server.');}
 finally{if(finish(current)&&!conflict)void load();}
};
$('diagnose').onclick=async()=>{
 if(busy)return;const current=begin();confirmation.hidden=true;status.textContent='Vorprüfung ohne Registrierung läuft …';
 try{const{response:r,value:v}=await boundedMastodonRequest('/api/providers/mastodon/oauth/diagnostics',{...requestOptions,signal:pending.signal,headers:{'X-Planner-Request':'1'}});if(current!==generation)return;status.textContent=r.ok&&v.provider==='mastodon'&&v.diagnostic==='preflight_passed'&&v.registrationAttempted===false&&v.canPublish===false?'Vorprüfung erfolgreich. Durch diese Prüfung wurde keine App registriert und keine Verbindung gestartet. Bestehende Versuche bleiben unverändert. Zum Fortfahren zuerst Status aktualisieren.':describeMastodonFailure(v);}
 catch{if(current===generation)status.textContent='Diagnose nicht verfügbar. Es wurde durch diese Prüfung keine Verbindung gestartet.';}
 finally{finish(current);}
};
