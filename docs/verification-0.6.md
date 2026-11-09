# Verifikation: Version 0.6

Stand: 7. November 2026. Lokaler Quell-/Worker-Kandidat, keine Site angelegt oder veröffentlicht. Der implementierte LinkedIn-Webflow bleibt ohne ausdrücklich bereitgestellte und geprüfte Runtime-Konfiguration vollständig gesperrt.

## Automatisierte Integration

568 Tests jeweils unter UTC, America/Los_Angeles und Asia/Tokyo bestanden; Syntaxprüfung und Worker-Build erfolgreich. Der tatsächliche generierte Worker enthält 18 öffentliche Assets und wird in Tests direkt aufgerufen. Wiederholte Builds sind byteidentisch. Alle Providerantworten sind lokale Testgegenstücke; kein Test ruft LinkedIn oder einen anderen Social-Dienst auf.

Neue Abdeckung gegenüber 0.5:

- Vollständiger HTTP-Ablauf von explizitem Same-origin-POST über geschützten Versuchscookie, State-Claim und Installticket bis zu echter lokaler RS256-/Nonce-/Audience-/Issuer-/Subjectprüfung, AES-256-GCM-Speicherung und öffentlichem Readback.
- Identischer vertrauenswürdiger Besitzer, Site-/App-/Aktionskontext und Attemptbindung vom Start bis zum Commit. Falsche Besitzer, vertauschte oder doppelte Cookies, A/B-Versuche desselben Besitzers, parallele Starts und Replay können keinen fremden Zugriff installieren.
- Nur die exakt eigene GET-Callbackroute erhält eine eng begrenzte Protokollausnahme. Andere API-Routen behalten Origin-/CSRF-Schutz. Fehlende Site-Sitzung führt nicht zur Weitergabe von Code/State an eine Anmeldung.
- Standardmäßig gesperrte Runtime, keine lokale Aktivierung über Shellwerte und keine Browser-Tokenaufnahme. Ungültige Konfiguration und fehlender Schlüssel werden nicht durch Erfolgs- oder Demoantworten ersetzt.
- Feste Token-/JWKS-/Userinfo-Endpunkte; begrenzte Requests und Antworten, monotone Gesamtlaufzeiten, keine Redirects, Cookies oder automatischen Retries. Stream-Chunks werden nach Empfang wirklich kopiert, einschließlich Buffer-Unterklassen. Auch unmittelbar aufeinander folgende Microtasks können die monotone Body-Deadline nicht umgehen.
- Vollständige echte Signaturprüfung und ablehnende JOSE-/JWKS-/JSON-Parser, Nonce/at_hash, Audience/azp, Issuer, Zeiten und Userinfo-Subjectvergleich. Fehler, ungewisse Exchanges und verlorene Commitantworten erzeugen keine behauptete Verbindung und keinen wiederholten Code-POST.
- Verschlüsselte, besitzer-/kontextgebundene Credentials, nur einmal beanspruchbare Installtickets und first-writer-wins. Lokale Trennung und Schlüsselrotation sind revisionsgeschützt; verspätete Writer können sie nicht rückgängig machen. Manipulierter Ciphertext und fehlende alte Schlüssel werden nicht als nutzbare Verbindung angezeigt. SQL-Adapterfehler werden redigiert.
- Additive Migration 0005 mit tatsächlichem lokalen SQLite-Constructor: 4→5, Wiederstart, alte Besitzer-/State-Daten und Revisionen, unveränderte Digests sowie vollständiger DDL-/Ledger-Rollback bei erzwungenem Indexkonflikt. SQL 0001–0004 und sämtliche Planer-Daten-/Workflowmodule bleiben bytegleich zu 0.5.
- UI-Validierung der exakten offiziellen Weiterleitungsadresse und des eigenen Callbacks, explizite lokale Trennbestätigung, neuer Readback bei Konflikten, Schutz vor veralteten asynchronen Ergebnissen. Ablauf-Timer und Wiederaufnahmeprüfung entfernen einen überholten Verbindungszustand ohne Polling. Eine Callback-Query kann keinen Erfolg vortäuschen.
- Vorhandene Ideen-, Planungs-, Kanalvarianten-, Queue-, Medien-, DST-, 409- und Undo-Regressionsprüfungen sind weiterhin enthalten. Bibliothekstests behaupten nicht, dass jede interne Funktion eine UI-Aktion besitzt.

## Unabhängige Nachprüfung

Die unabhängige Prüfung umfasst den integrierten HTTP-/Runtimevertrag, die echten Kryptografie- und Persistenzmodule, die UI-Nachhärtung und die tatsächlich erzeugten Workerbytes. 523 rein speicherbasierte Tests wurden unabhängig jeweils unter UTC, America/Los_Angeles und Asia/Tokyo ausgeführt, ebenso Syntax. Der echte Buildcode wurde zweimal ausschließlich im Speicher ausgeführt; beide Ergebnisse entsprechen exakt dem erzeugten Worker und allen 18 Assets. Die UI-Dateien stimmen bytegenau mit der separat nachgeprüften Fassung überein. Keine verbleibenden konkreten Quellblocker für diesen nicht aktivierten Stand.

Zusätzlich wurde der gebaute Worker in einer WebAPI-only-VM ohne Node-Globals ausgeführt: HTTP-Start → echte lokale RSA-/OIDC-Prüfung → AEAD-Speicherung → öffentliches DTO → fremde Trennanfrage mit 409 → eigene Trennanfrage mit 204 → gesperrter Replay. Der Ablauf verwendet genau drei lokale Provider-Fixtureantworten und keinerlei Netzaufruf. Der echte lokale Migrationsconstructor wurde unabhängig mit isoliertem Memory-SQLite in Upgrade-, Wiederstart- und Fehlerfällen geprüft.

Konkret reproduzierte Randfälle wurden vor Übergabe behoben: Tokenformat-/Ciphertext-Limitkonsistenz, Redigierung synchroner Prepare-/Bind-Fehler, Eigentum an Stream-Bytes, monotone Body-Deadline, exaktes UI-Callback-Pinning und Ablauf-Invalidierung einer offen bleibenden Karte. Diese Korrekturen wurden unabhängig nachgeprüft. Der A/B-Ticket-/Grant-Vertrag wird durch echte Repository- und Ende-zu-Ende-Negativtests geprüft, nicht nur durch frei austauschbare Claim-Stummel.

## Grenzen

Keine echten Sites-Dispatch-Sitzungen, gehosteten D1-/R2-Migrationen oder zwei realen Besucher getestet. Keine Site, App, Secrets, OAuth-Grants, Provider-/Zahlungsaktivierung oder Posts erstellt. Der Worker enthält keinen Publisher, Refresh-Transport oder Hintergrundscheduler. Lokale Testschlüssel und Providerantworten sind ausschließlich flüchtige Fixtures, keine echten Zugangsdaten.

Offen bleiben die ausdrücklich genehmigte Site/App/Secretbereitstellung, tatsächliche Session-/Cookie-Rückkehr und Plattformlogs, LinkedIns echte Nonce-/Issuer-/Tokenantwort-Kompatibilität und gesonderte Nutzerfreigabe für dauerhaften Zugriff. Das Vorhandensein serverseitiger Bestätigungsflags ersetzt diese Nachweise nicht. Die heute implementierte lokale Trennung erfordert intakte Konfiguration/Schlüssel und authentifizierbaren Ciphertext; Schlüsselverlust oder beschädigter Bestand benötigt einen gesonderten autorisierten Recoveryplan. Sie ist kein Provider-Widerruf.

Siehe `oauth-preparation.md`, `linkedin-web-transport.md`, `token-lifecycle.md` und `sites-runtime.md`. Historische Nachweise sind in `verification-0.3.md`, `verification-0.4.md` und `verification-0.5.md` getrennt dokumentiert.
