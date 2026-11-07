# LinkedIn: konkrete nächste Schritte

Diese Anleitung ergänzt die bestehende, standardmäßig deaktivierte Implementierung. Sie setzt keine Freigabe, erzeugt keine App, kein Secret und keinen Grant. Der UI-Status kommt weiterhin ausschließlich von `/api/providers/linkedin/oauth/readiness`.

## Für den Kontoinhaber

1. Die private Takt-Site mit dem vorgesehenen ChatGPT-Konto öffnen. Die Sites-Anmeldung ist noch keine LinkedIn-Freigabe.
2. Eine geeignete LinkedIn-Developer-App bereitstellen oder ihre Einrichtung ausdrücklich beauftragen. Benötigte Produkte: „Sign In with LinkedIn using OpenID Connect“ und „Share on LinkedIn“. Diese Produkte gehören laut LinkedIn zu den Self-Service Open Permissions; eine Community-Management-App-Review wird dafür nicht pauschal vorausgesetzt. Die normale App-Erstellung dokumentiert eine LinkedIn-Page, Datenschutz-URL und ein Logo. Eine erforderliche App/Page-Zuordnung bestätigt der Page-Superadmin. Ob diese Zuordnungsbestätigung schon vor dem ersten persönlichen OIDC/Share-Test verlangt wird, ist ohne das konkrete eingeloggte Formular nicht belegt. Keine Page automatisch anlegen; die Zuordnung ist kein kostenpflichtiges Page-Verifizierungsbadge.
3. Nach sicherer technischer Einrichtung den offiziellen LinkedIn-Dialog selbst prüfen und die konkret angeforderten Berechtigungen bewusst freigeben. Ein produktiver Flow darf nicht nur durch Abhaken der Anleitung aktiviert werden.

Für die App-Registrierung ist die Rückkehradresse exakt `<private-site-origin>/api/providers/linkedin/oauth/callback`. Kein abschließender Slash, kein alternativer Host, kein localhost. Die aktuelle private Site-Origin wird bei der tatsächlichen Einrichtung separat verifiziert und nicht als Projektdefault eingebaut.

## Bereits implementiert

- Same-origin-POST für den Start, eigener Einmal-State und HttpOnly/Secure-Versuchscookie.
- Fester LinkedIn-Codeaustausch, vollständige RS256-/Issuer-/Audience-/Nonceprüfung und passender Userinfo-Subject.
- Owner-/App-/Versuchsbindung bis zum atomaren verschlüsselten Credential-Commit.
- Authentifizierter Readback, Tokenablauf, lokale Trennung und fail-closed Verhalten bei fehlender Konfiguration.

Diese Funktionen sind mit lokalen echten kryptografischen Fixtures getestet. Das beweist noch nicht die Antwortform eines echten LinkedIn-Kontos.

## Sichere Servereinrichtung

Nicht geheime Appdaten werden als feste `TAKT_LINKEDIN_CONFIGURATION` bereitgestellt: tatsächliche Site-ID und HTTPS-Origin, Client-ID, exakte Redirect-URI, persönlicher Kontotyp und Appkonfigurationsversion. Geheimnisse gehören ausschließlich in ausdrücklich autorisierte native Runtime-Secrets: `TAKT_LINKEDIN_CLIENT_SECRET` und `TAKT_TOKEN_KEYRING_JSON`. Sie werden nicht in dieser Anleitung, Browserfeldern, Quellcode, GitHub, Hostingmanifest oder Chattext eingetragen.

`TAKT_LINKEDIN_ENABLED` bleibt bis zur tatsächlichen Abnahme aus. `reviewedSiteIdentity`, `reviewedNonceContract` und `approvedPersonalAccount` sind behauptete Voraussetzungen, keine Tests, die durch das Setzen eines Flags bestanden wären. Ihr Nachweis darf nicht aus einer allgemeinen Testerlaubnis abgeleitet werden.

## Noch erforderliche echte Abnahme

1. **Sites-Rückkehr ohne Providergrant:** gleicher vertrauenswürdiger Dispatch-Besitzer und Browser nach Top-Level-Rückkehr; fremder Besitzer, fehlender Cookie, abgelaufene Site-Sitzung und fremder Origin müssen geschlossen bleiben. Service-Access-Bearer ist kein Besucher. Codes oder State dürfen nicht durch eine erneute Sites-Anmeldung weitergereicht werden. Query-/Referrer-/Plattformlogs sind zu prüfen.
2. **App und Ziel:** tatsächliche Produktberechtigungen, exakt registrierte Redirect-URI und ausdrücklich genehmigtes persönliches Konto bestätigen. Genau `openid profile w_member_social`; keine stillen Zusatzscopes.
3. **LinkedIn-Protokoll:** tatsächlich signierten Issuer, Nonce-Rückgabe, expliziten Bearer-token_type, genaues Scope-Bündel und `expires_in` prüfen. Live Discovery nennt `https://www.linkedin.com/oauth`, ein Dokumentationsbeispiel weicht ab. Der Transport akzeptiert nur den geprüften festen Issuer und rät fehlende Felder nicht.
4. **Persistenz:** verschlüsselte Tokeninstallation, passender Owner-Readback, Replay-Abweisung, Ablauf-/Trennverhalten und Verlust-/Unklarheitsfälle im echten Hosting prüfen. Erst bestätigter Readback ist eine Verbindung.

Für den noch ungeprüften Nonce-Vertrag braucht es einen getrennt geprüften, eng begrenzten Abnahmeweg. Ein möglicher Entwurf ist ein kurzlebiger Modus für einen ausdrücklich erlaubten Testbesitzer und eine registrierte App, mit unveränderten State-/Cookie-/Signatur-/Issuer-/Audience-/Nonceprüfungen, aber **ohne Tokenpersistenz, Connected-Anzeige oder Publishing**. Nur bereinigte Prüfergebnisse verlassen diesen Modus. Dieser zusätzliche Modus ist in diesem Setup-Inkrement noch nicht implementiert. Er darf nicht durch wahrheitswidrig gesetzte Produktionsflags ersetzt werden. App-/Secretbereitstellung und der konkrete Testgrant brauchen weiterhin die passende Freigabe.

## Ehrliche Nutzungsgrenzen

Eine erfolgreiche LinkedIn-Anmeldung ermöglicht in diesem Stand Kontoverifikation, noch keinen Versand. Es gibt keinen LinkedIn-Publisher in den aktiven Routen, keinen Refresh und keinen Reconnect. Das tatsächliche `expires_in` und jeder Widerruf sind maßgeblich; vorbereitete Beiträge bleiben erhalten. Programmatic Refresh ist laut LinkedIn nur ausgewählten genehmigten Partnern zugesichert und wird nicht vorausgesetzt. Lokales Trennen ist kein bestätigter LinkedIn-Widerruf.

## Primärquellen

- https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access
- https://www.linkedin.com/help/linkedin/answer/a1667239
- https://www.linkedin.com/help/linkedin/answer/a1665329
- https://www.linkedin.com/developers/apps

- https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow
- https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2
- https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin
- https://www.linkedin.com/oauth/.well-known/openid-configuration
- https://learn.microsoft.com/en-us/linkedin/shared/authentication/programmatic-refresh-tokens
- https://datatracker.ietf.org/doc/html/rfc9700

REA v60: vollständige eigene Quellbasis, deshalb normale Quell-/Test-/Browserprüfung. Kein fremder Live-Capture und keine REA-Engine behauptet.
