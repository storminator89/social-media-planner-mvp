/** Informational setup only. No OAuth link, request, credential or readiness mutation. */
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
export const LINKEDIN_SETUP_DATA=freeze({
  provider:'linkedin',
  title:'LinkedIn einrichten',
  summary:'Einmal die App vorbereiten, danach über LinkedIn anmelden. Versand bleibt vorerst gesperrt.',
  steps:[
    {
      id:'account',title:'Persönliches Konto wählen',
      description:'Diese Verbindung ist für dein persönliches LinkedIn-Konto.',
      details:['Unternehmensseiten und fremde Konten werden hier nicht verbunden.','Die spätere Kontofreigabe erfolgt bei LinkedIn, nicht durch ein Passwortfeld in Takt.'],
      links:[{label:'Anmeldung mit LinkedIn erklärt',url:'https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2'}]
    },
    {
      id:'app',title:'LinkedIn-App vorbereiten',
      description:'Die App braucht Anmeldung, persönliche Beitragsberechtigung und die genaue Rückkehradresse.',
      details:['In der LinkedIn-Developer-App die Produkte „Sign In with LinkedIn using OpenID Connect“ und „Share on LinkedIn“ prüfen bzw. freigeben lassen. Die jeweiligen App-Voraussetzungen gelten zusätzlich.','Der geprüfte Ablauf verlangt genau openid, profile und w_member_social. Keine E-Mail- oder Organisationsberechtigung wird ergänzt.','Die Rückkehradresse muss exakt zur privaten HTTPS-Site passen. Eine lokale Vorschau ist keine gültige Live-Rückkehradresse.'],
      links:[{label:'Persönliche Beitragsberechtigung',url:'https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin'},{label:'Web-Anmeldung einrichten',url:'https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow'}]
    },
    {
      id:'verify',title:'Sicher verbinden',
      description:'Nach sicherer Servereinrichtung und Rückkehrprüfung wird der vorhandene Verbinden-Button nutzbar.',
      details:['App-Schlüssel und Verschlüsselungsschlüssel gehören ausschließlich in die geschützte Serverkonfiguration, niemals in dieses Formular, einen Chat oder den Quellcode.','Vor Freischaltung müssen dieselbe Site-Sitzung bei der Rückkehr sowie der tatsächliche LinkedIn-Antwortvertrag geprüft sein. Eine angelegte App allein genügt nicht.','Erst die vollständig geprüfte Antwort und bestätigte verschlüsselte Speicherung zeigen „Verbunden“. Eine erteilte LinkedIn-Freigabe allein ist noch kein erfolgreicher Takt-Readback.'],
      links:[{label:'Zugriffslaufzeit und Refresh-Grenzen',url:'https://learn.microsoft.com/en-us/linkedin/shared/authentication/programmatic-refresh-tokens'}]
    }
  ],
  callbackPath:'/api/providers/linkedin/oauth/callback',
  limitations:['Keine Veröffentlichung aus Takt in dieser Stufe.','Der tatsächliche Ablauf des Access-Tokens gilt. Refresh und erneutes Verbinden sind hier noch nicht verfügbar.','Lokales Trennen entfernt den Zugriff aus Takt, widerruft aber nicht automatisch die LinkedIn-Freigabe.']
});
