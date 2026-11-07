# LinkedIn-Verknüpfung in 0.6

Der serverseitige Webablauf ist implementiert und mit echten lokalen RSA-Signaturen bis zur verschlüsselten Speicherung getestet. **Er ist nicht live aktiviert.** Es wurden keine App, realen Credentials, Berechtigungen, Providerzugriffe oder Sites-Ressourcen eingerichtet. Die lokale Preview bleibt vollständig gesperrt.

## Tatsächlicher Ablauf

1. Die Oberfläche lädt authentifizierte Readiness. Nur ein vollständiger, bereitstehender Serververtrag zeigt den Startknopf aktiv. Keine Query- oder Browserdaten können das freischalten.
2. Ein ausdrücklicher JSON-POST mit Same-origin-Origin, Marker und persönlichem Kontotyp erstellt State und Installticket. Kein GET, Prefetch oder automatischer Reload startet OAuth.
3. State, Nonce und Browserbindung sind getrennte 32-Byte-Zufallswerte. Jeder Versuch erhält einen eigenen `__Host-`-Cookie mit Secure, HttpOnly, SameSite=Lax, Path=/ und fünf Minuten Ablauf. Der Cookie-Name enthält nur den State-Hash; parallele Versuche überschreiben nicht dieselbe Bindung.
4. Erst nach bestätigter Ticketanlage wird die feste offizielle LinkedIn-Autorisierungsadresse zurückgegeben. Die UI prüft Provideradresse, eigenes Callbackziel, Scopes und Parameter vor der Top-Level-Weiterleitung erneut.
5. Nur exakter GET am eigenen Callbackpfad erhält eine eng begrenzte Protokollausnahme. Gleicher Dispatch-Besitzer, eigener Cookie, exakte Konfiguration und Einmal-State sind Pflicht. Ohne Sitzung wird kein Code/State in einen Sites-Anmeldelink übernommen.
6. Nach atomarem State-Claim beansprucht der Transport über einen vertrauenswürdigen Hook sein persistentes Installticket. Owner/Site/App/Aktion/Statehash werden vor Netzwerk und erneut vor Commit verglichen. Ein fremder A/B-Versuch, auch desselben Besitzers, darf nicht unter dem falschen Ticket installiert werden.
7. Einmaliger Code-POST an den festen Tokenendpunkt, anschließend feste JWKS-Abfrage. Echte RS256-Signatur, Issuer, Audience/azp, Zeiten, Nonce-Hash und optionaler at_hash werden vollständig geprüft. Erst danach wird das Token für Userinfo verwendet; dessen Subject muss übereinstimmen.
8. Nur dieses verifizierte serverinterne Ergebnis wird ownergebunden mit AES-256-GCM gespeichert. Eine erfolgreiche Tokenantwort allein ist keine gespeicherte Verbindung. Erst bestätigter CAS-Commit und authentifizierter Readback zeigen eine Verknüpfung.
9. Callback endet auf einer festen bereinigten Site-URL und löscht nur seinen Cookie. Die Query enthält höchstens einen festen Ergebniscode. Die UI vertraut ausschließlich dem anschließenden Readiness-GET.

HTTP-Start und Callback unterstützen nur Connect-new eines persönlichen LinkedIn-Kontos. Kein stiller Austausch, Reconnect, Refresh, Publishing oder providerseitiger Revocation-Call. Die lokale Trennaktion entfernt gespeicherten Zugriff und sperrt alte Tickets; sie behauptet keinen Widerruf bei LinkedIn. Der heutige UI-Trennpfad benötigt eine intakte Runtime-Konfiguration samt vorhandenem Schlüssel und authentifizierbarem Envelope. Bei Schlüsselverlust, beschädigtem Ciphertext oder Konfigurationswechsel steht keine allgemeine UI-Recovery-/Löschfunktion bereit; dies erfordert einen gesonderten autorisierten Wiederherstellungs-/Entfernungsplan.

## Runtime-Konfiguration und Freigaben

Native serverseitige Umgebungswerte, niemals Browser-JSON oder Hostingmanifest-Secrets:

- `TAKT_LINKEDIN_ENABLED`: ausdrücklich `true`; fehlend oder abweichend sperrt.
- `TAKT_LINKEDIN_CONFIGURATION`: nichtgeheime, feste JSON-Konfiguration mit `siteId`, kanonischer HTTPS-`siteOrigin`, `clientId`, exakter `redirectUri`, `accountType:"personal"`, `appConfigVersion:"v1"`, einzelnem `expectedIssuer` und den ausdrücklich gesetzten Voraussetzungen `reviewedSiteIdentity`, `reviewedNonceContract`, `approvedPersonalAccount`.
- `TAKT_LINKEDIN_CLIENT_SECRET`: ausdrücklich autorisiert bereitgestelltes Runtime-Secret.
- `TAKT_TOKEN_KEYRING_JSON`: ausdrücklich autorisierter Runtime-Secret-Keyring; Format und Rotation in `token-lifecycle.md`. Kein automatisch erzeugter Schlüssel oder Default.

Die drei Voraussetzungen sind **Betreiberbestätigungen, keine von Flags bewiesenen Tests oder Nutzerfreigaben**. Sie dürfen erst nach tatsächlicher Abnahme gesetzt werden. Das Vorhandensein irgendeiner App-ID oder eines Schlüssels reicht nicht. Secrets werden synchron erfasst, nicht in öffentliche DTOs serialisiert und nicht aus Requestfeldern übernommen. Der gesamte nicht konfigurierte Stand bleibt ohne State-/Ticket-/Credential-Mutation oder Providertransport.

Der Worker verwendet ausschließlich den ausdrücklich im Composition Root eingesetzten nativen Fetch-Transport. Die Transportbibliothek besitzt keinen versteckten globalen Fallback, keine Cookie-Jar, Redirects oder Retrylogik. Der lokale Entwicklungsserver injiziert weder Konfiguration noch Transport und kann diesen Ablauf auch bei gesetzten Shell-Umgebungswerten nicht aktivieren.

## Endpunkte

- GET `/api/providers/linkedin/oauth/readiness`: sichere Statusprojektion, keine Identität/Secrets/Tokenwerte. Ein fehlender Key oder beschädigter Ciphertext wird nicht als nutzbare Verbindung ausgegeben.
- POST `/api/providers/linkedin/oauth/start`: ausschließlich `{accountType:"personal"}`. Liefert nach Anlage `{authorizationUrl,expiresAtMs}` und den geschützten Versuchscookie.
- GET `/api/providers/linkedin/oauth/callback`: feste erlaubte Parameter, identische Besucher-/Browserbindung, validierter Codeflow, saubere Rückleitung.
- POST `/api/providers/linkedin/disconnect`: ausschließlich `{connectionId,expectedRevision}`, bestätigte lokale Entfernung, HTTP 204. Konflikte verlangen neuen Readback und werden nicht automatisch wiederholt.

Sites-reservierte `/callback`, `/signin-with-chatgpt` und `/signout-with-chatgpt` gehören unverändert Dispatch. Der eigene Providerflow ersetzt keine Site-Anmeldung. Alle anderen API-Routen behalten ihren Cross-Origin-Schutz.

## Grenzen und sichere Fehler

Fünf Minuten State-/Ticketlaufzeit und begrenzte gleichzeitige Versuche. Eine gemeinsame Transportdeadline von standardmäßig zehn Sekunden umfasst Claim, Ticket-Hook, Providerantworten, Streaming und Kryptografie. Die HTTP-Orchestrierung hat zusätzlich ein Gesamtbudget; der kleine Start-/Disconnect-Body hat Byte- und Zeitgrenzen.

Codeexchange, Ticketcheckout und Credentialcommit werden niemals blind wiederholt. Bei Timeout oder verlorenem Commit kann das Ergebnis unbekannt sein. Callback zeigt dann keine behauptete erfolgreiche Verknüpfung; ein späterer authentifizierter Readback kann den tatsächlichen gespeicherten Stand feststellen. Eine neue Anmeldung darf keine bestehende Verbindung oder einen Tombstone ersetzen.

Tokens verbleiben serverseitig. Unnötige Profile, E-Mail und Refresh-Credentials werden nicht gespeichert. Direkte Tokenaufnahme aus Browser-JSON, Tokenexport und Publishingrouten existieren nicht. Die Runtime bleibt eine vertrauenswürdige Grenze; Verschlüsselung ersetzt keine sichere Secretbereitstellung und schützt nicht gegen vollständig kompromittierten Servercode.

## Konkrete offene Live-Abnahme

1. Ausdrücklich genehmigte private Site und tatsächliche D1-/R2-/Secret-Bereitstellung. SQL-/Worker-Tests sind keine Cloud-Abnahme.
2. Nachweis der tatsächlichen Dispatch-Identität und desselben Besitzers/Browsers bei Provider-Rückkehr, insbesondere bei verlorener Site-Sitzung. Plattformseitige Query-/Zugriffslogs, Referrer und Cookieverhalten prüfen.
3. Genehmigte LinkedIn-App mit Produkten, exakt registrierter HTTPS-Redirect-URI und bestätigtem persönlichen Zielkonto. Dauerhafter OAuth-Zugriff benötigt die konkrete Freigabe.
4. Live-Verifikation des vertraulichen OIDC-Nonce-Vertrags **vor** Aktivierung. Native Loopback-PKCE ist kein Nachweis für den Webflow; es gibt keinen stillen Protokollfallback.
5. Reale signierte Tokenantwort: Discovery nennt `https://www.linkedin.com/oauth`, ein Dokumentationsbeispiel nennt einen anderen Issuer. Es wird nur der fest gepinnte Kandidat akzeptiert. Fehlende Nonce, falscher Issuer oder Signatur stoppen.
6. Antwortkompatibilität: Der strikte Transport verlangt expliziten Bearer-token_type und genau das Scope-Bündel `openid profile w_member_social`; Beispiele lassen einzelne Felder aus. Fehlende Felder werden nicht geraten. Diese Annahmen müssen am autorisierten echten Konto bestätigt oder separat geprüft angepasst werden.
7. Sichere Keyrotation, Backup/Wiederherstellung, Ablauf-/Trennabläufe und Benutzerbedienung im tatsächlichen Hosting. Keine laufende Kosten- oder Verfügbarkeitsgarantie.

Details und Primärquellen: `linkedin-web-transport.md`, `token-lifecycle.md`, `sites-runtime.md`. Die frühere rein offline Stufe ist getrennt in `oauth-preparation-0.5.md` dokumentiert.
