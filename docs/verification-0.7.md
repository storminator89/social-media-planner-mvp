# Verifikation: Version 0.7

Stand: 7. November 2026. Lokaler Quell-/Worker-Kandidat, keine Site angelegt oder veröffentlicht. Google-/YouTube- und LinkedIn-Pfade bleiben ohne ausdrücklich bereitgestellte, geprüfte Runtime-Konfiguration vollständig gesperrt. Sämtliche Providerantworten der Tests sind lokale Fixtures, keine echten Konten oder Uploads.

## Automatisierte Integration

956 Tests bestanden jeweils unter UTC, America/Los_Angeles und Asia/Tokyo. Syntaxprüfung und Worker-Build sind grün. Wiederholte Builds erzeugen identische Bytes mit 23 öffentlichen Assets. Der tatsächliche generierte Worker wird in Tests direkt aufgerufen; der lokale Server erhält keine Aktivierungswerte aus der Shell.

Neue Abdeckung gegenüber 0.6:

- Google-Web-OAuth mit PKCE S256, verschlüsseltem Verifier und Einmal-State, identischer Dispatch-/Browserbindung, Installticket und sechsfacher Attemptbindung einschließlich Zielkanal. Tatsächliche lokale RSA-/OIDC-Prüfung, Nonce, Issuer, Audience, Zeiten, Userinfo-Subject und eindeutiger `channels.mine`-Abgleich vor AEAD-Installation.
- Feste Providerendpunkte, tatsächliche Response-Provenienz, begrenzte Antworten, ablehnendes JOSE/JWKS/JSON, keine Redirects oder automatischen Retries. Streambytes werden kopiert. Monotone Gesamtdeadlines verhindern nach Fristablauf neu beginnende Providerrequests; bereits gestartete externe, Datenbank- oder R2-Operationen können unklar oder spät abschließen.
- Explizite Trennung von OAuth, Site-Medienspeicherung, unveränderlichem Uploadplan und bestätigtem privaten Google-Start. Pflichtangaben ohne Voreinstellung; keine öffentliche Sichtbarkeit oder Planung. Nur eigene servergehashte MP4/WebM bis 8 MiB.
- Medienquote vor R2, positive Objektbestätigung vor Ready und frische Credential-/Epoch-/Ablauffences vor Reserve, unmittelbar vor Put und bei Ready-Commit. Null/unklare R2-Antworten bleiben pending; ein langsamer Body kann nach Disconnect/Ablauf keinen neuen Put beginnen. Bereits laufende Writes werden nicht blind gelöscht.
- Dauerhafte Medien-Inhaltseindeutigkeit einschließlich pending/ready und Uploadintent-Eindeutigkeit unabhängig von operationId. Umbenennen, Reload, Unknown und Cancel erlauben keine automatische Ersatzübertragung.
- Verschlüsselte Resumable-Sitzungen, feste Chunkgröße, monotone bestätigte Offsets, Probe derselben Sitzung nach unklarem Chunk. Unklarer Start oder Sessionverlust führt nicht zu neuem POST. Keine Roh-URL im Browser oder DTO.
- Cancel während erstem oder letztem Tokenread vor Start-POST, Chunk-PUT und Probe-PUT verhindert den noch nicht gesendeten Request. Die konkrete Lease wird innerhalb des Tokenhooks unmittelbar am Sendepunkt geprüft. Ein bereits gesendeter externer Request kann dagegen nicht atomar zurückgenommen werden.
- Redigierte feste Outcome-Codes und manuelle Klärung bleiben nach Readback/Reload/Cancel bestehen. Unerwartete Sichtbarkeit auch bei späterem Inspect wird an eigene Video-ID und Revision gebunden gespeichert. Verspätete Inspection überschreibt keine neuere Cancellation; erfolgreiche spätere Beobachtung löscht eine Warnung nicht still.
- Browser-DTOs werden gegen die echten HTTP-Antworten normalisiert. Zweckgebundene Unsicherheit übersteht Patch/Select, unveränderte prepared-Readbacks lösen keine Sperre. Positive Beobachtungen werden durch neue Revision/Warnung invalidiert. Historie bleibt nach Ablauf/Trennung lesbar, zukünftige Takt-Schritte können bewusst gestoppt werden.
- Begin-Fehler unterscheiden volle Statequote und unklaren Commit von Konfigurationsfehlern, ohne Link oder automatische Wiederholung. Bereits laufende Datenbankbatches können spät committen und einen begrenzten Stateplatz bis zur fünfminütigen TTL belegen.
- Tatsächlicher lokaler Constructor für 5→6, Wiederstart, unveränderte Altbestände und Ledger, geänderte vorherige Digests sowie vollständiger DDL-/Ledger-Rollback bei erzwungenem Indexkonflikt. Alle fünf früheren SQL-Dateien bleiben bytegleich.

Die integrierte Suite enthält 152 Google-OAuth-, 101 neue Persistenz-, 52 private Adapter/Medien/Runtime-, 31 HTTP-Kompositions- und drei zusätzliche Migrationsprüfungen sowie alle vorhandenen Planer-/LinkedIn-/UI-Regressionsfälle. Einzelne Komponentensummen sind Teil der Gesamtsuite, nicht zusätzliche Gesamtzahlen.

## Unabhängige Nachprüfung

Die unabhängige integrierte Prüfung bestand 907 rein speicherbasierte Tests jeweils unter UTC, America/Los_Angeles und Asia/Tokyo sowie die gesamte Syntaxprüfung. Zusätzlich wurden 195 UI-, 152 Google-OAuth- und 101 Datenprüfungen gegen die jeweiligen Abschlussstände bestätigt; diese Zahlen überlappen und werden nicht addiert. Zwölf UI-/Testdateien stimmen bytegenau mit dem separat nachgeprüften Stand überein.

Die vier ursprünglichen HTTP-Repros wurden unabhängig erneut ausgeführt: Null-R2-Antwort bleibt 503/pending, Disconnect während Bodyread verhindert jeden späteren Put, Cancel während Tokenbeschaffung verhindert den noch nicht gesendeten Providerwrite, und eine 404-Sitzung bleibt dauerhaft manuell zu klären ohne weitere Probes. Revisions-/Token-/UI- und Inhalts-Eindeutigkeitsschutz wurden ebenfalls nachgeprüft. Ein Test-Flake bei extrem kurzer Deadline wurde ausschließlich testseitig korrigiert: Die Frist darf bereits vor Eintritt in den wartenden Stub ablaufen. Die Produktbytes blieben dabei unverändert.

Der echte Buildcode wurde unabhängig zweimal ausschließlich im Speicher ausgeführt und entspricht exakt dem generierten Worker sowie allen 23 Asset-Bodies. Der tatsächliche Worker wurde in einer WebAPI-only-VM ohne Node-Globals ausgeführt: PKCE/RS256 → AEAD → R2/D1 → privater Upload → Inspect → fremder Besitzer mit 409 → eigenes Disconnect mit 204. Genau acht synthetische Providerantworten, kein externer Netzaufruf. Der echte LocalDatabase-Constructor bestand zusätzlich im Memory-SQL-Ersatz Upgrade 5→6, Wiederstart, Bestandserhalt, falschen Altdigest und Rollback.

Keine verbleibenden konkreten Produktquellblocker im geprüften, weiterhin deaktivierten Umfang. Dies ist ausdrücklich keine gehostete Sites-, Google- oder aktive Providerfreigabe. Das Quellinventar wird separat mit `MANIFEST.sha256` gebunden.

## Unverändert und offen

Planer-Datenmodule, Workflowmodule, öffentliche Clientkopien, LinkedIn-Produktmodule und SQL 0001–0005 sind bytegleich zu reviewed 0.6. Der ursprüngliche Planer bleibt lokal persistent, inklusive Ideen, Kanalvarianten, IANA/DST, Konflikt- und Undo-Schutz. Der Worker besitzt keine Node-/SQLite-Laufzeitabhängigkeiten. Testfixtures gehören nicht zum Runtimegraph.

Nicht nachgewiesen: echte Sites-Dispatch-Sitzungen und Callback-Cookies, gehostete D1-/R2-Migrationen/Quoten, zwei reale Besitzer, Google-App-/Scope-/Kanalfreigaben, tatsächliche Providerantworten und Worker-Ressourcen bei realen Videos. Es wurde kein Hosting, Secret, Grant, Konto oder Video erzeugt. Serverflags ersetzen weder diese Nachweise noch die notwendige Nutzerfreigabe.

Kein Refresh, Reconnect, Hintergrundscheduler, öffentlicher Publisher, automatischer Retry oder allgemeiner Recovery-/Retentionpfad. Online-Access endet beim Tokenablauf. Lokales Trennen ist kein Google-Widerruf und löscht keine Videos; Schlüsselverlust benötigt gesonderte autorisierte Wiederherstellung. Details und notwendige Freigaben: `youtube-operation.md`, `youtube-data.md`, `youtube-http-contract.md` und `sites-runtime.md`.

REA v60 wurde angewandt: Vollständiger Quellbaum bedeutet normale Source-/Runtime-Prüfung statt REA-Engine/Decompilation. Keine entsprechende Engine-Ausführung wurde behauptet. Historische Versionen sind in `verification-0.3.md` bis `verification-0.6.md` getrennt dokumentiert.
