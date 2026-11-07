/** Static guidance, not a status source, credential form or OAuth controller.
 * callbackPath is intentionally null: no Instagram callback route is integrated.
 */
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
export const INSTAGRAM_SETUP=freeze({
  provider:'instagram',
  title:'Instagram vorbereiten',
  summary:'Bereite dein professionelles Konto und die Meta-App vor. Verbinden und Veröffentlichen sind hier noch nicht freigeschaltet.',
  steps:[
    {id:'professional-account',title:'Professionelles Konto wählen',
      description:'Wähle das Instagram-Business- oder Creator-Konto, das du später mit Takt verbinden möchtest.',
      details:['Diese Vorbereitung nutzt Instagram Login. Ein persönliches Standardkonto ist dafür nicht vorgesehen.','Ein Profilname oder Demo-Kanal im Kalender bestätigt keine Kontoverbindung. Die Identität muss später direkt bei Instagram geprüft werden.'],
      links:[{label:'Instagram Login bei Meta',url:'https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/business-login'}]},
    {id:'meta-app',title:'Meta-App und Einrichtung prüfen',
      description:'Prüfe, welche Meta-App du verwenden möchtest. App-Einrichtung und sichere Speicherung erfolgen erst nach der nötigen Freigabe.',
      details:['Benötigt werden die Instagram-App-ID sowie die Berechtigungen instagram_business_basic und instagram_business_content_publish. App-ID und App-Secret aus anderen Login-Verfahren dürfen nicht verwechselt werden.','Für eigene oder verwaltete Testkonten und weitere Nutzer gelten unterschiedliche Access-Level. Der tatsächliche App- und Reviewstatus muss geprüft werden.','Die Instagram-Rücksprungroute ist noch nicht eingebaut. Deshalb zeigt Takt hier keine registrierbare Callback-Adresse. Passwörter, App-Secrets und Tokens gehören nicht in diese Oberfläche oder in den Chat.'],
      links:[{label:'App- und Login-Anforderungen',url:'https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/business-login'}]},
    {id:'authorize-and-verify',title:'Konto später bewusst freigeben',
      description:'Sobald die sichere Verbindung eingerichtet und freigegeben ist, autorisierst du das gewählte Konto bei Instagram. Versand wird danach separat geprüft.',
      details:['Noch wird kein Anmeldevorgang gestartet und kein dauerhafter Zugriff erteilt. Technische Vorbereitung allein macht ein Konto nicht verbunden.','Der vorbereitete Publishing-Kern unterstützt Einzelbilder und Reels. Stories und Carousels sind hier noch nicht umgesetzt.','Private Bilder im Planer werden nicht automatisch für Meta erreichbar. Medienübergabe und ein konkreter Testpost brauchen einen geeigneten, freigegebenen Weg.','Ein veröffentlichter Post kann trotz Medien-ID eine fehlende Caption melden. Solche Fälle werden als Veröffentlichung mit Warnung behandelt, nicht erneut gesendet.'],
      links:[{label:'Offizieller Publishing-Ablauf',url:'https://developers.facebook.com/documentation/instagram-platform/content-publishing'}]}
  ],
  callbackPath:null,
  limitations:['Diese Anleitung ändert keinen Kontostatus und speichert keine Zugangsdaten.','Ein Termin im Kalender löst weiterhin keinen automatischen Instagram-Versand aus.']
});

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/** Optional pure renderer; the integrator can use the same data in its shared renderer.
 * No arbitrary data/HTML/URLs are accepted and no listeners/network calls are installed.
 */
export function renderInstagramSetup(){
  const guide=INSTAGRAM_SETUP;
  return `<section class="instagram-setup-guide" aria-label="${escape(guide.title)}"><h3>${escape(guide.title)}</h3><p>${escape(guide.summary)}</p><ol class="connection-steps">${guide.steps.map(step=>`<li><strong>${escape(step.title)}</strong><p>${escape(step.description)}</p><details class="instagram-setup-technical"><summary>Details zu „${escape(step.title)}“</summary><ul>${step.details.map(detail=>`<li>${escape(detail)}</li>`).join('')}</ul>${step.links.map(link=>`<p><a href="${escape(link.url)}" target="_blank" rel="noopener noreferrer">${escape(link.label)}</a></p>`).join('')}</details></li>`).join('')}</ol>${guide.limitations.map(note=>`<p class="connection-purpose">${escape(note)}</p>`).join('')}</section>`;
}
