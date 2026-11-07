/** Informational setup only. No status evidence, secrets, persistence or OAuth. */
export const YOUTUBE_SETUP_CALLBACK_PATH = '/api/providers/youtube/oauth/callback';
export const YOUTUBE_SETUP_SCOPES = Object.freeze([
  'openid',
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly'
]);

const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
export const YOUTUBE_SETUP_DATA = freeze({
  provider: 'youtube',
  title: 'YouTube einrichten',
  summary: 'Drei Schritte bis zur geprüften Kanalfreigabe. Diese Anleitung verbindet kein Konto und startet keinen Upload.',
  callbackPath: YOUTUBE_SETUP_CALLBACK_PATH,
  steps: [
    {
      id: 'channel', title: 'Kanal wählen',
      description: 'Lege fest, welcher deiner YouTube-Kanäle zu Takt gehören soll.',
      details: [
        'Öffne YouTube im gewünschten Kanal. Unter Einstellungen → Erweiterte Einstellungen findest du die Kanal-ID. Laut Google musst du dafür als primärer Inhaber angemeldet sein.',
        'Benötigt wird die Kanal-ID mit UC am Anfang, nicht der @Name. Sie ist kein Geheimnis. Gib noch keine Passwörter, Tokens oder Schlüssel weiter.',
        'Der Server prüft später, ob der bei Google freigegebene Kanal genau zu dieser ID gehört. Eine eingegebene ID allein bestätigt keine Verbindung.'
      ],
      links: [
        {label: 'Kanal-ID bei YouTube ansehen', url: 'https://www.youtube.com/account_advanced'},
        {label: 'Googles Anleitung zur Kanal-ID', url: 'https://support.google.com/youtube/answer/3250431?hl=de'}
      ]
    },
    {
      id: 'google-app', title: 'Google-App einrichten',
      description: 'Ein eigenes Google-Projekt, ein Web-Client und die exakte Rücksprung-Adresse.',
      details: [
        'Im vorgesehenen Google-Cloud-Projekt die YouTube Data API v3 aktivieren. Falls dafür neue Kosten, weitere Berechtigungen oder unklare Bedingungen verlangt werden: erst klären, nicht einfach fortfahren.',
        'Unter Google Auth platform → Branding App-Name und Kontakt festlegen. Für ein persönliches Testprojekt Audience auf External und Publishing status auf Testing belassen, dann das eigene Google-Konto als Testnutzer hinzufügen. Internal ist nur für die passende Google-Organisation gedacht.',
        'Unter Data Access genau diese drei Scopes vorsehen: openid, https://www.googleapis.com/auth/youtube.upload und https://www.googleapis.com/auth/youtube.readonly. Kein Vollzugriff, kein Profil-/E-Mail-Scope und kein Offlinezugriff.',
        'Unter Clients einen OAuth-Client vom Typ Web application verwenden. Als Authorized redirect URI die unten angezeigte Adresse exakt registrieren, ohne zusätzliche Zeichen oder abschließenden Schrägstrich. Dieser Server-Ablauf braucht keine JavaScript-Origins und keinen API-Key.',
        'App- und Secret-Erstellung erst bewusst freigeben. Google zeigt ein neu erzeugtes Client-Secret nur beim Erstellen an. Es gehört ausschließlich in die sichere Serverkonfiguration, nie hier, in den Chat oder ins Projektarchiv.',
        'Testing ist keine Google-Verifizierung. Wenn Google Domainbesitz, eine öffentliche Datenschutzerklärung oder weitere App-Prüfungen verlangt, muss das separat geklärt werden. Eine private Sites-Adresse beweist diese Voraussetzungen nicht; die Site dafür nicht ungefragt öffentlich machen.'
      ],
      links: [
        {label: 'Google: Web-Client und API einrichten', url: 'https://developers.google.com/identity/protocols/oauth2/web-server'},
        {label: 'Google Auth: Branding öffnen', url: 'https://console.developers.google.com/auth/branding'},
        {label: 'Google Auth: Testnutzer öffnen', url: 'https://console.developers.google.com/auth/audience'},
        {label: 'Google Auth: Scopes öffnen', url: 'https://console.developers.google.com/auth/scopes'}
      ]
    },
    {
      id: 'connect', title: 'Sicher verbinden',
      description: 'Erst die Servereinrichtung prüfen, dann die offizielle Google-Freigabe nutzen.',
      details: [
        'Client-ID und Zielkanal werden serverseitig festgelegt. Client-Secret und Verschlüsselungsschlüssel benötigen einen geschützten Einrichtungsweg mit eigener Freigabe. Diese Seite hat dafür absichtlich keine Eingabefelder.',
        'Vor Aktivierung müssen die private Site, deine Identität nach der Google-Rückkehr, Cookies, Datenspeicherung und Kanalbindung geprüft sein. Eine abgehakte Anleitung ersetzt diese Prüfung nicht.',
        'Erst wenn der Server „Bereit zur Kanalfreigabe“ meldet, nutze den vorhandenen Knopf „YouTube-Kanal verknüpfen“. Prüfe bei Google App, Konto und Berechtigungen. Warnungen oder eine unerwartete App nicht überspringen.',
        'Nach der Rückkehr zählt nur „Kanal verbunden“ aus dem neu geprüften Serverstatus. Bei abgebrochenem oder unklarem Ablauf keine zweite Freigabe erzwingen; zuerst den Status prüfen. Private Uploads bleiben ein eigener, ausdrücklich zu bestätigender Schritt.'
      ],
      links: [
        {label: 'Google: Testmodus und Grenzen', url: 'https://support.google.com/cloud/answer/15549945?hl=de'},
        {label: 'Google: App- und Domainprüfung', url: 'https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification'}
      ]
    }
  ],
  limitations: [
    'Nur Vorbereitung. Der bestehende Serverstatus bleibt maßgeblich.',
    'Kein automatisches Erneuern, erneutes Verbinden oder Hintergrundversand. Die tatsächliche Tokenlaufzeit begrenzt den Zugriff; Testing bedeutet nicht sieben Tage nutzbaren Takt-Zugriff.',
    'Öffentliche Veröffentlichung und YouTube-Planung bleiben gesperrt. Ein späterer privater Testupload benötigt eine separate Freigabe.'
  ]
});

/** Display-only validation. An origin is not ownership or activation evidence. */
export function youtubeSetupCallback(siteOrigin) {
  if (typeof siteOrigin !== 'string' || siteOrigin.length > 2048 || /[\u0000-\u0020\u007f]/.test(siteOrigin)) return null;
  try {
    const u = new URL(siteOrigin);
    if (u.protocol !== 'https:' || u.origin !== siteOrigin || u.port || u.username || u.password ||
        u.search || u.hash || u.pathname !== '/' || !u.hostname.includes('.') || u.hostname.length > 253 ||
        u.hostname.endsWith('.localhost') || /^\d+(?:\.\d+){3}$/.test(u.hostname) ||
        u.hostname.split('.').some(label => label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) return null;
    return siteOrigin + YOUTUBE_SETUP_CALLBACK_PATH;
  } catch { return null; }
}

/** No implicit location/default deployment; invalid or absent origins display no callback. */
export function getYouTubeSetup({siteOrigin} = {}) {
  return freeze({...YOUTUBE_SETUP_DATA, callbackUrl: youtubeSetupCallback(siteOrigin)});
}

const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/** Optional pure renderer. The parent can render the same declarative data instead. */
export function renderYouTubeSetup({siteOrigin} = {}) {
  const setup = getYouTubeSetup({siteOrigin});
  const callback = setup.callbackUrl
    ? `<div class="youtube-setup-callback"><strong>Authorized redirect URI</strong><code data-youtube-setup-callback>${escape(setup.callbackUrl)}</code><button type="button" class="button subtle" data-youtube-setup-copy>Rücksprung-Adresse kopieren</button><span role="status" aria-live="polite" data-youtube-setup-copy-status></span></div>`
    : '<p class="youtube-setup-note">Die Rücksprung-Adresse ist erst für eine bestätigte HTTPS-Site verfügbar. Keine lokale Vorschauadresse bei Google registrieren.</p>';
  return `<section class="youtube-setup" aria-labelledby="youtube-setup-title"><h3 id="youtube-setup-title">${escape(setup.title)}</h3><p>${escape(setup.summary)}</p><ol class="youtube-setup-steps">${setup.steps.map((step, i) => `<li><details data-youtube-setup-step="${step.id}"><summary><span class="youtube-setup-number" aria-hidden="true">${i + 1}</span><span><strong>${escape(step.title)}</strong><span class="youtube-setup-description">${escape(step.description)}</span></span><span class="youtube-setup-chevron" aria-hidden="true">⌄</span></summary><div class="youtube-setup-body"><ul>${step.details.map(detail => `<li>${escape(detail)}</li>`).join('')}</ul>${step.id === 'google-app' ? callback : ''}<div class="youtube-setup-links">${step.links.map(link => `<a href="${escape(link.url)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">${escape(link.label)}<span class="youtube-setup-new-tab"> (neuer Tab)</span></a>`).join('')}</div></div></details></li>`).join('')}</ol><ul class="youtube-setup-limits">${setup.limitations.map(item => `<li>${escape(item)}</li>`).join('')}</ul></section>`;
}

/** Optional explicit-click helper. Copy only the locally derived display address. */
export async function copyYouTubeSetupCallback({siteOrigin, writeText} = {}) {
  const callback = youtubeSetupCallback(siteOrigin);
  if (!callback || typeof writeText !== 'function') return Object.freeze({status:'unavailable'});
  try { await writeText(callback); return Object.freeze({status:'copied'}); }
  catch { return Object.freeze({status:'copy_failed'}); }
}
