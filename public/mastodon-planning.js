// Read-only planning context. Never create grants, reviews, posts or credentials.
let generation=0;
export function clearMastodonPlanningStatus(){generation++;}
export function describeMastodonPlanningStatus(profile,publishing){
 const validProfile=profile?.provider==='mastodon'&&profile.instance==='https://kanoa.de'&&profile.scope==='profile'&&profile.canPublish===false&&typeof profile.phase==='string';
 const linked=validProfile&&profile.phase==='linked';
 const profileText=!validProfile?'Profilstatus nicht verfügbar.':linked?'Profilzugriff bestätigt (profile).':profile.phase==='not_configured'?'Profilzugriff nicht eingerichtet.':'Profilzugriff nicht bestätigt. Auf der Verbindungsseite prüfen.';
 const validPublishing=publishing&&typeof publishing.phase==='string'&&typeof publishing.canPublish==='boolean'&&typeof publishing.canStart==='boolean';
 const account=linked&&typeof profile.account==='string'&&profile.account.length<=200?profile.account:null;
 const ready=linked&&validPublishing&&publishing.phase==='linked'&&publishing.canPublish&&!publishing.canStart&&!publishing.accountMismatch&&!publishing.expired&&account&&publishing.account===account;
 const publishingText=ready?'Separater Veröffentlichungszugriff bestätigt (write:statuses). Veröffentlichung nur im gesonderten, ausdrücklich bestätigten Ablauf.':!validPublishing?'Veröffentlichungsstatus nicht verfügbar.':publishing.expired?'Separater Veröffentlichungszugriff abgelaufen.':publishing.accountMismatch?'Profil und Veröffentlichungszugriff gehören nicht zum selben Konto.':'Veröffentlichungszugriff nicht bestätigt.';
 return `${profileText}${account?' Konto: @'+account+'.':''} ${publishingText} Hier wird nur geplant. Keine automatische Veröffentlichung. Textplanung: 500 Zeichen; der separate Versand prüft seine eigenen Grenzen. Medien werden nicht automatisch übertragen.`;
}
export async function refreshMastodonPlanningStatus(root,{fetchImpl=globalThis.fetch,timeoutMs=8000}={}){
 const current=++generation,output=root.querySelector('[data-mastodon-status]');
 output.textContent='Profil- und Veröffentlichungsstatus werden geprüft …';
 const read=async path=>{
  const controller=new AbortController();let timer;
  try{return await Promise.race([
   (async()=>{const response=await fetchImpl('/api/providers/mastodon/'+path+'/readiness',{method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error',signal:controller.signal,headers:{'X-Planner-Request':'1'}});return response.ok?await response.json():null;})(),
   new Promise(resolve=>{timer=setTimeout(()=>{controller.abort();resolve(null);},timeoutMs);})
  ]);}catch{return null;}finally{clearTimeout(timer);}
 };
 const [profile,publishing]=await Promise.all([read('oauth'),read('publishing')]);
 if(current===generation)output.textContent=describeMastodonPlanningStatus(profile,publishing);
}
