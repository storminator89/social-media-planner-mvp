/** Public instructions only. No status authority, grant, runtime configuration or transport. */
function freeze(value){
  for(const child of Object.values(value))if(child!==null&&typeof child==='object')freeze(child);
  return Object.freeze(value);
}
export const X_SETUP_DATA=freeze({
  provider:'x',
  title:'X einrichten',
  summary:'Bereite Zugang, Kostenfreigabe und sichere Servereinrichtung vor. Der geprüfte Serverstatus entscheidet, ob eine Kontofreigabe möglich ist.',
  steps:[
    {
      id:'access-and-costs',
      title:'Zugang und Kosten klären',
      description:'Prüfe den X-API-Zugang und die aktuellen Preise. Vor möglichen Kosten brauchst du eine konkrete Freigabe mit Kostenlimit.',
      details:[
        'X rechnet die API nach Nutzung ab. Auch eine Kontoabfrage zur Verifikation kann kostenpflichtig sein.',
        'Die maßgeblichen Preise stehen in der X Developer Console. Guthaben, Sonderkonditionen und ein bestehendes Kostenlimit sind hier nicht geprüft.',
        'Diese Anleitung kauft keine Credits und aktiviert weder automatische Aufladung noch kostenpflichtige API-Aufrufe.'
      ],
      links:[{label:'Aktuelle X-API-Preise ansehen',url:'https://docs.x.com/x-api/getting-started/pricing'}]
    },
    {
      id:'secure-server-setup',
      title:'Sichere Anbindung fertigstellen',
      description:'Die X-App und der geschützte Rückweg zum Planer müssen eingerichtet und geprüft werden. Dieser Schritt muss vor der Kontofreigabe abgeschlossen sein.',
      details:[
        'Vorgesehen ist eine serverseitige Web-App mit OAuth 2.0 und PKCE S256. Die bei X registrierte Rücksprungadresse muss exakt zum geprüften Planer passen.',
        'OAuth-Kern, verschlüsselte Speicherung und geschützte Serverrouten sind lokal vorbereitet. Die freigegebene Live-Konfiguration, Prüfung auf dem echten Host fehlen noch. Die Browser-Bedienung ist vorbereitet und bleibt ohne diese Voraussetzungen gesperrt.',
        'Die vorbereitete X-Rücksprungroute ist ohne freigegebene Live-Einrichtung nicht aktiv. Client-Secrets und Tokens gehören ausschließlich in eine freigegebene sichere Serverablage, nicht in diese Ansicht oder einen Chat.'
      ],
      links:[{label:'Offizielle X-OAuth-Anleitung lesen',url:'https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code'}]
    },
    {
      id:'authorize-account',
      title:'Konto bewusst bei X freigeben',
      description:'Erst nach technischer Prüfung und Kostenfreigabe wird der offizielle X-Anmeldeweg freigeschaltet. Prüfe dort Konto, App und Berechtigungen.',
      details:[
        'Der vorbereitete Ablauf sieht tweet.read, users.read und tweet.write vor. tweet.write erlaubt der App auf X das Schreiben von Beiträgen; Versand aus diesem Planer bleibt trotzdem gesondert gesperrt.',
        'offline.access für dauerhaften Zugriff und Erneuerung wäre eine zusätzliche bewusste Freigabe. Es wird nicht automatisch mit angefordert.',
        'Eine Verbindung darf erst nach erfolgreicher serverseitiger Kontoprüfung und geprüftem Lesen der gespeicherten Verbindung erscheinen. Abbruch oder unklarer Ausgang ist keine bestätigte Verbindung.'
      ],
      links:[]
    }
  ],
  callbackPath:null,
  limitations:[
    'Die Schritte sind eine Anleitung, keine Bestätigung einer abgeschlossenen Einrichtung.',
    'Eine Kontofreigabe ersetzt weder eine Kostenfreigabe noch die Freigabe für einen bestimmten Beitrag. Veröffentlichung bleibt deaktiviert.',
    'Diese Ansicht nimmt keine Passwörter, Client-Secrets, Tokens oder Zahlungsdaten entgegen.'
  ]
});

function escape(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
/** Optional static rendering. The host owns expansion/focus and authoritative status. */
export function renderXSetup(){
  const data=X_SETUP_DATA;
  return `<section class="x-setup" aria-labelledby="x-setup-title"><h3 id="x-setup-title">${escape(data.title)}</h3><p>${escape(data.summary)}</p><ol class="connection-steps">${data.steps.map(step=>`<li><strong>${escape(step.title)}</strong><p>${escape(step.description)}</p></li>`).join('')}</ol><details class="connection-details x-setup-technical"><summary>Technik, Berechtigungen und Kosten ansehen<span aria-hidden="true">⌄</span></summary><div class="connection-details-body">${data.steps.map(step=>`<h4>${escape(step.title)}</h4>${step.details.map(detail=>`<p>${escape(detail)}</p>`).join('')}${step.links.map(link=>`<p><a href="${escape(link.url)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">${escape(link.label)} (neuer Tab)</a></p>`).join('')}`).join('')}</div></details><p>${data.limitations.map(escape).join(' ')}</p></section>`;
}
