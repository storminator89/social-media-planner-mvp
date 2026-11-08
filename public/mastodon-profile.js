const button=document.getElementById('read-profile'),status=document.getElementById('profile-status'),result=document.getElementById('profile-result');
let generation=0,busy=false,linked=false;
export function setProfileLinked(value){clear();linked=value===true;button.hidden=!linked;button.disabled=!linked;document.getElementById('profile-panel').hidden=!linked;}
export function profileRows(p){
 if(!p||typeof p.acct!=='string'||typeof p.id!=='string')throw Error();
 const labels={id:'Konto-ID',acct:'Benutzername bei kanoa.de',username:'Benutzername',display_name:'Anzeigename',note:'Profilbeschreibung (HTML als Text)',created_at:'Konto erstellt',last_status_at:'Letztes Beitragsdatum',followers_count:'Follower (Anzahl)',following_count:'Gefolgte Konten (Anzahl)',statuses_count:'Beiträge (Anzahl)',locked:'Folgeanfragen bestätigen',bot:'Automatisiertes Konto',discoverable:'Im Profilverzeichnis auffindbar'};
 return Object.entries(labels).filter(([key])=>Object.hasOwn(p,key)).map(([key,label])=>[label,typeof p[key]==='boolean'?(p[key]?'Ja':'Nein'):String(p[key])]);
}
function clear(){generation++;result.replaceChildren();result.hidden=true;status.textContent='';busy=false;button.disabled=!linked;}
button.onclick=async()=>{
 if(busy||!linked)return;clear();busy=true;button.disabled=true;const current=generation;status.textContent='Eigenes Profil wird gelesen …';
 try{
  const r=await fetch('/api/providers/mastodon/oauth/profile',{headers:{'X-Planner-Request':'1'},credentials:'same-origin',cache:'no-store',redirect:'error'}),v=await r.json();
  if(current!==generation)return;
  if(!r.ok||v.provider!=='mastodon'||v.scope!=='profile'||v.canPublish!==false||!Number.isSafeInteger(v.fetchedAtMs))throw Error();
  for(const [label,value] of profileRows(v.profile)){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;result.append(dt,dd);}
  result.hidden=false;status.textContent='Profil gelesen am '+new Date(v.fetchedAtMs).toLocaleString('de-DE')+'. Nur diese Profildaten wurden angezeigt.';
 }catch{if(current===generation){result.replaceChildren();result.hidden=true;status.textContent='Profil nicht abrufbar. Prüfe den Verbindungsstatus. Es wurden keine Berechtigungen erweitert und keine Kontodaten verändert.';}}
 finally{if(current===generation){busy=false;button.disabled=!linked;}}
};
// Never retain a prior result across navigation, revocation, recovery, or status checks.
window.addEventListener('pagehide',()=>setProfileLinked(false));window.addEventListener('pageshow',()=>setProfileLinked(false));
for(const id of ['revoke','recover','refresh','start','diagnose'])document.getElementById(id)?.addEventListener('click',clear);
