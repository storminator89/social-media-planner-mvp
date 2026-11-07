# LinkedIn-OAuth: isolierte Vorbereitung, kein aktiver Zugang

Stand: 7. November 2026. Diese Version erstellt keine App, Anmeldung, Berechtigung oder Verbindung. Sie akzeptiert keine Tokens und publiziert nichts. Die vorgeschlagene persönliche LinkedIn-Verbindung ist noch keine bestätigte Zielkontoentscheidung.

## Implementiert und tatsächlich gesperrt

- `modules/oauth/linkedin-contract.mjs`: servereigene Konfiguration und Callbackparser. Erlaubt sind eine kanonische HTTPS-Origin ohne Portalternative und exakt `/api/providers/linkedin/oauth/callback` auf derselben Origin. Site-ID, öffentliche Client-ID, Redirect, Scopes, Flowversion und Aktion werden gebunden. Konfiguration wird vor asynchronen Operationen in einen eigenen primitiven Snapshot kopiert; Getter, zusätzliche/verborgene Felder und fremde Prototypen werden abgewiesen. Das beweist Syntax, nicht Site-Eigentum oder registrierte App-Freigabe.
- `modules/oauth/linkedin-flow.mjs`: gekapselte Offline-Factory. Sie erzeugt das Repository selbst aus exakt derselben validierten Konfiguration wie der Parser. Parser und Repository können nicht unabhängig ausgetauscht werden. Es gibt nur `begin` und `claimCallback`, keinen Fetch, Redirect, Tokenaustausch oder Kontomutator. Dieses Modul und das State-Repository sind nicht im HTTP-/Worker-Importgraphen.
- `modules/oauth/state-repository.mjs`: D1-kompatibler Speicher für Hash-State, Browserbindung und Nonce-Fingerprint. Keine rohen Codes, Verifier, Tokens oder Schlüssel. Eine erfolgreiche Claim-Antwort bedeutet ausschließlich, dass eine lokale Einmal-Transaktion passt. Sie ist keine verifizierte Identität oder Versandfreigabe.
- `GET /api/providers/linkedin/oauth/readiness`: authentifizierte, nicht mutierende Beschreibung der offenen Voraussetzungen; `authorizationUrl:null`, Ziel unbestätigt, sämtliche Fähigkeiten false. POST wird abgewiesen. Start-/Callback-/Exchange-URLs sind nicht angeschlossen. Kein Browserknopf leitet zu LinkedIn weiter.

## State, Browser und Nonce

State und OIDC-Nonce sind unabhängige 32-Byte-Zufallswerte. Der State wird intern erzeugt und nur als SHA-256 gespeichert. Browserbindung muss später ein dritter, unabhängiger 32-Byte-Wert aus einem servergesetzten Secure-/HttpOnly-/SameSite-Lax-Cookie oder einer separat nachgewiesenen Sitzung sein. Niemals Browser-JSON, localStorage oder die Owner-ID aus einem State-Lookup als Vertrauen verwenden. Cookies und Rückkehrverhalten wurden hier nicht implementiert oder live geprüft.

Ein State gilt fünf Minuten. SQL begrenzt ihn zusätzlich auf höchstens zehn Minuten. Claim prüft Besitzer, Site, Browserhash, Provider, exakten Redirect, Scope-/Config-/Context-Fingerprint, Flowversion, Zeitpunkt und Einmaligkeit. Ein falscher Besitzer oder Browser verbraucht den legitimen State nicht. Ein atomarer Batch aus bedingtem UPDATE mit frischem Receipt und dazugehörigem SELECT liefert den Nonce-Fingerprint genau einmal. Eine unklare Commitantwort bleibt unklar und wird nicht automatisch wiederholt.

Höchstens fünf nicht abgelaufene Versuche pro Site/Besitzer; konsumierte Versuche zählen bis zum Ablauf mit. Ein neuer Begin entfernt begrenzt abgelaufene Zeilen dieses Besitzers. Es gibt noch keinen eigenständigen Cloud-Bereinigungsjob. Repository und Serverclock sind vertrauenswürdige Grenzen; Hashing schützt nicht gegen einen vollständig kompromittierten Runtime-/Datenbankschreiber.

Der Parser akzeptiert ausschließlich die exakt konfigurierte URL und bekannte Parameter. Doppelte Schlüssel, code+error, fehlende States, unbekannte Felder, überlange Werte, ungültiges UTF-8, rohe Kontrollzeichen und URL-Normalisierungsalternativen werden abgewiesen. Providertexte werden nicht gespiegelt. Interne Ergebnisse können einen Autorisierungscode enthalten und dürfen niemals geloggt oder als HTTP-DTO ausgeliefert werden. Eine spätere echte Verarbeitung müsste unmittelbar auf eine feste bereinigte URL zurückleiten, ohne Fremdressourcen, mit no-store und no-referrer.

## Exakte nichtgeheime Bindungen

SHA-256, lowercase Hex, jeweils UTF-8 der folgenden JSON-Struktur mit dieser Reihenfolge:

- Scopes: `["openid","profile","w_member_social"]`.
- Konfiguration: `{provider,flowVersion,siteId,siteOrigin,clientId,redirectUri,scopeFingerprint}`.
- Kontext: `{action:"connect_new",targetConnectionId:null,appConfigVersion:"v1"}`.

Der Nonce-Fingerprint gehört zur einzelnen Transaktion, nicht zur Factorykonfiguration. Reconnect, Organisationskonten und der Austausch vorhandener Verbindungen sind nicht implementiert. Eine spätere Erweiterung muss Zielverbindung und erwartetes Konto ausdrücklich binden.

## Geprüfter LinkedIn-Vertrag und offene Entscheidung

Die offiziellen Web-Endpunkte sind `https://www.linkedin.com/oauth/v2/authorization` und `https://www.linkedin.com/oauth/v2/accessToken`. Die Standarddokumentation beschreibt einen vertraulichen Web-Client mit registriertem HTTPS-Redirect und serverseitigem Client-Secret. Dieses Projekt hat keine solche Konfiguration provisioniert.

Die gelesene Native-PKCE-Dokumentation beschreibt einen anderen, besonders freigeschalteten Loopback-Flow. Daraus folgt keine verifizierte S256-Unterstützung für unsere HTTPS-Web-Variante. Es wird weder ein Native-Endpunkt als Ersatz gewählt noch still auf einen schwächeren Flow zurückgefallen.

RFC 9700 beschreibt für vertrauliche OIDC-Clients unter Bedingungen eine Nonce-Alternative. Vor Nutzung irgendeines zurückgegebenen Tokens müssten Signatur, exakter Issuer, Audience, Zeiten und transaktionsgebundene Nonce vollständig geprüft werden. Kein JWT-decode genügt. Die tatsächliche Nonce-Rückgabe und die konkrete App-/Clientvariante sind noch nicht live geprüft. Der vorliegende Nonce-Hash ist Vorbereitung, keine solche Validierung.

Die öffentliche Discovery lieferte als Issuer `https://www.linkedin.com/oauth`; das eingebettete Dokumentationsbeispiel nennt `https://www.linkedin.com`. Die Discovery-Angabe ist nur der festgehaltene Kandidat. Echte signierte Tokens wurden nicht beobachtet. Ein späterer Widerspruch muss stoppen; niemals beide Issuer vorsorglich akzeptieren.

`openid profile w_member_social` ist das aus den geprüften offiziellen Seiten gestützte Bündel für den vorgesehenen Userinfo-/Personal-Post-Pfad. E-Mail und Organisationsscopes werden nicht angefordert. Ein hypothetischer engerer Subject-only-Pfad ist nicht verifiziert. Userinfo allein belegt keine Postingberechtigung und keine Identitätsprüfung im realen Leben.

Programmatic Refresh ist nur für freigegebene Marketing-Developer-Platform-Partner zugesichert. Es gibt kein allgemeines Self-Service-Refreshversprechen, kein erfundenes offline_access und keine zugesicherte dauerhafte Hintergrundverbindung.

## Vor einer echten Aktivierung zwingend offen

1. Ausdrücklich freigegebene private Site, echte Dispatch-Identität und unveränderte Rückkehr desselben Besitzers/Browserkontexts. Ein Service-Bearer ersetzt keine Besucheridentität.
2. Bestätigtes Zielkonto und eigene Provider-App samt Produkten, exakter registrierter Redirect-URI und aktuell nachgewiesenem Schutz gegen Code-Injection/Mix-up.
3. Autorisierte serverseitige Secretbereitstellung und geprüfte benutzerspezifische Tokenablage. Allgemeine Runtime-Secrets sind noch kein per-Visitor-Vault.
4. Verschlüsselung mit owner-/connectiongebundenem AAD, Key-Version/Rotation, Zugriffskontrolle, Refresh-CAS/Fencing, Ablauf/Widerruf sowie sichere Backups und Löschung. Nichts davon ist als Tokenstore bereits implementiert.
5. Fester Token-Transport ohne Redirect, Cookies oder automatische Wiederholung, mit Gesamtdeadline/Antwortlimit und eindeutiger Behandlung unklarer Ergebnisse; vollständige OIDC-/Subjectprüfung vor Tokenverwendung.
6. Konto- und Publishingfreigabe getrennt prüfen. Ein eigener Postingtest braucht die konkrete autorisierte Zielkonto-/Inhaltsfreigabe. X benötigt zusätzlich geprüften API-Zugang und ausdrückliche Kostenfreigabe.

## Primärquellen

- [LinkedIn Web Authorization](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow)
- [LinkedIn Native PKCE](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow-native)
- [LinkedIn OpenID Connect](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2)
- [Share on LinkedIn](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin)
- [LinkedIn Discovery](https://www.linkedin.com/oauth/.well-known/openid-configuration)
- [LinkedIn Refresh Rules](https://learn.microsoft.com/en-us/linkedin/shared/authentication/programmatic-refresh-tokens)
- [RFC 9700](https://datatracker.ietf.org/doc/html/rfc9700)
- [OIDC ID Token Validation](https://openid.net/specs/openid-connect-core-1_0.html#IDTokenValidation)
