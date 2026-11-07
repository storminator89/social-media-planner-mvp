# Sicherheits- und Architekturprüfung: eigenständiger Social-Media-Planer auf ChatGPT Sites

Stand: 7. November 2026. Architekturprüfung, kein Audit einer bestehenden Implementierung.

## Entscheidung in Kürze

**Ein privater Redaktionsplaner mit ChatGPT-Anmeldung, dauerhaft gespeicherten Entwürfen, Kalender, Kanalvarianten und Medienbibliothek ist auf Sites grundsätzlich passend. Zuverlässiges unbeaufsichtigtes Social-Publishing ist noch nicht belegt.** Drei Voraussetzungen müssen vor einer entsprechenden Produktzusage praktisch nachgewiesen werden: autorisierte Provider-Verbindungen, ein unabhängig vom Browser arbeitender Scheduler und ein funktionierender Medienübergabeweg.

Für den ersten vertikalen Schnitt einen Workspace, einen Provider, Text und ein Bild wählen. Keine pauschale Veröffentlichung an alle Netzwerke. Die Anwendung kann zunächst Redaktionsplanung und manuelle Veröffentlichung unterstützen; sie darf einen Termin nicht als automatisch abgesichert darstellen, solange der Hintergrundweg ungeprüft ist.

## 1. Verifizierte Plattformgrenzen

- Sites unterstützt einen serverseitigen Cloudflare Worker, D1 für Produktdaten und R2 für Dateien. Statische Seiten allein reichen für diese Anwendung nicht.
- Die Plattform liefert eine Site-lokale stabile Besucher-ID. E-Mail ist Anzeige-/Kontaktfeld, kein sicherer Mandantenschlüssel. Anmeldung beweist keine Mitgliedschaft in einem anwendungseigenen Workspace.
- Private Site-Zugänge und personenbezogene Datenberechtigungen sind unterschiedliche Ebenen. Jede serverseitige Operation muss ihren Akteur und den erlaubten Workspace prüfen.
- Der Sites-Servicezugang stellt weder eine Besucheridentität noch den Consent für dessen verbundene Apps her.
- Hosted-Connector-Schreiboperationen benötigen einen angemeldeten Besucher und eine ausdrückliche Bedienhandlung. Dieser Weg darf nicht als bereits vorhandene unbeaufsichtigte Publishing-Schnittstelle behandelt werden.
- Native Social-Provider-OAuth-Verbindungen wären eine zusätzliche Integration, nicht ein Ersatz für die Sites-Anmeldung. Ihre Zulässigkeit, Callback-Erreichbarkeit und benötigten Scopes sind pro Provider zu prüfen.
- Cloudflare dokumentiert Cron Triggers; dies beweist nicht, dass ChatGPT Sites die entsprechenden Konfigurationsfelder oder Bindings verfügbar macht. Die geprüfte Sites-Oberfläche dokumentiert D1 und R2, aber keinen beliebig konfigurierbaren Cron-/Queues-Betrieb. Der aktuell sichtbare Werkzeugkatalog enthält hier keinen Schedule-Erstellungsaufruf. Daher ist die Scheduler-Verfügbarkeit **offen**, nicht als grundsätzlich unmöglich bewertet. [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- Eine private Site-URL ist keine frei abrufbare Medienquelle für Instagram/TikTok und ähnliche Provider. Eine in der Anwendung signierte URL beseitigt die vorgeschaltete Anmeldung nicht. Die R2-Worker-Bindung kann selbst keine S3-Presigned-URLs erzeugen; hierfür sind gesonderte S3-Zugangsdaten erforderlich. Deren Verfügbarkeit im verwalteten Sites-Projekt ist ungeprüft. Direkter Upload zur Provider-API ist eine mögliche Alternative. [R2 Presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)

**Nicht als Lösung zulässig:** Browser-Timer für Hintergrundjobs, öffentliche Freigabe der gesamten Site/Medienbibliothek als Medienworkaround, Wiederverwendung eines Besucher-Connector-Tokens, versteckte kostenpflichtige Zusatzdienste oder nicht abgestimmte Host-/Sicherheitsänderungen.

## 2. Empfohlene Systemgrenzen und Datenmodell

Browser → authentifizierte Sites-API → anwendungseigene Berechtigungsprüfung → D1/R2. Separater Hintergrundaufruf → begrenzter Job-Dispatcher → Provider-Adapter. Browser und Scheduler benutzen denselben fachlichen Publishing-Service, aber unterschiedliche, ausdrücklich geprüfte Identitätswege.

Kernobjekte:

- Workspace und Membership mit expliziten Rollen, für den ersten Schnitt gegebenenfalls nur Owner.
- SocialConnection: Workspace, Provider, externe Account-ID, Scopes, Ablauf, Verbindungszustand und verschlüsselte Zugangsdaten.
- Post und unveränderliche PostRevision; Inhalt, Zielaccounts und Medienverweise einer freigegebenen Revision gehören zusammen.
- PostTarget: je Zielaccount eigene Inhaltsvariante, Termin und Ergebnis.
- MediaAsset: Workspace, servergenerierter Objektschlüssel, Prüfergebnis, Typ, Größe und Referenzen.
- PublishJob und PublishAttempt: Revision, Ziel, Fälligkeit, Lease, Retry-Zähler, externe IDs und kontrollierte Fehlermeldung.
- AuditEvent: Wer hat welche Revision für welches Ziel freigegeben, geändert, abgebrochen oder veröffentlicht?

Alle produktbezogenen Tabellen enthalten einen nicht-null Workspace-Bezug. Wo möglich verhindern zusammengesetzte Fremdschlüssel auch auf Datenbankebene, dass beispielsweise ein Post in Workspace A eine Verbindung oder Datei aus B referenziert. D1 unterstützt Fremdschlüssel; parametrisierte Statements und transaktionale Batches sind vorhanden. Kein SQL aus unvalidierten Filtern zusammensetzen. [D1 Fremdschlüssel](https://developers.cloudflare.com/d1/sql-api/foreign-keys/), [D1 Batches](https://developers.cloudflare.com/d1/worker-api/d1-database/)

## 3. P0: Voraussetzungen vor echten Accounts und automatischen Posts

### A. Identität, Mandanten und Rollen

**Anforderung:** Serverseitige Mitgliedschaftsprüfung auf jedem Lesen, Schreiben, Export, Medienabruf und Publish-Vorgang. Workspace-IDs aus dem Browser sind nur Selektoren, keine Autorität. Keine benutzerbezogenen Caches über Besucher hinweg. Ein Site-Bearer ist keine universelle Berechtigung, alle Mandanten zu verändern.

**Abnahme:** Zwei Nutzer in zwei Workspaces tauschen alle Objekt-IDs aus. Keine Inhalte, Dateibytes, Existenzhinweise, Kanal-Metadaten oder Schreibmöglichkeiten werden sichtbar. Viewer kann über direkte HTTP-Aufrufe nicht publizieren. Entfernte Mitgliedschaft sperrt bestehende Tabs sofort. Fehlende oder manipulierte Identitätsheader an öffentlichem Eingang gewähren keinen Zugriff. [OWASP Authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)

### B. OAuth und Token-Lebenszyklus

**Anforderung:** Provider-Authorization-Code-Flow mit PKCE S256, wenn vom Provider unterstützt; ansonsten dokumentierte providerkonforme Alternative. Zufälliger kurzlebiger Einmal-State, gebunden an initiierenden Benutzer, Workspace und Provider. Exakt registrierte Callback-URLs; keine beliebigen Redirect-Ziele. Token-Austausch ausschließlich serverseitig. Minimale Scopes. Provider-Client-Secrets nur als Runtime-Secrets; dynamische Benutzer-Tokens verschlüsselt in D1, Schlüssel getrennt vom Datenbestand. Keine Tokens in Browser, Repository, Logs, Screenshots oder Fehlerantworten.

**Abnahme:** Falscher/abgelaufener/wiederverwendeter State wird verworfen. Wechsel von Workspace oder Provider während des Flows erlaubt kein Account-Hijacking. Gleichzeitiger Refresh erzeugt nur einen gültigen Folgezustand. Widerruf/Disconnect stoppt neue Jobs. Keine Wiederholungs-Endlosschleife bei invalid_grant. Frontend-Build und Logs enthalten keine Testgeheimnisse. [OAuth Security BCP, RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html)

Verschlüsselung schützt insbesondere vor isoliertem Datenbankabfluss, nicht vor einem vollständig kompromittierten Worker. Key-Versionierung und getestete Rotation sind erforderlich; pro Eintrag eigener kryptographischer Nonce und authentifizierte Bindung an Workspace/Verbindung.

### C. Publishing als abgesicherte Zustandsmaschine

**Anforderung:** Automatisierung bezieht sich auf eine unveränderliche, ausdrücklich eingeplante Revision und konkrete Zielaccounts. Eine spätere Text-, Medien- oder Zieländerung darf nicht still unter alter Freigabe veröffentlicht werden. Für Teams definieren, ob Änderungen die Freigabe aufheben. Content-Autosave muss vor Schedule abgeschlossen sein; Revisionskonflikte mit 409 beantworten.

Zielstatus mindestens: draft, scheduled, publishing, published, failed, unknown, cancelled. Der Gesamtbeitrag kann partial sein. Published benötigt bestätigte externe ID oder gleichwertigen Providerbeleg. Ein Timeout nach dem Senden ist unknown, nicht automatisch failed.

**Abnahme:** Direkt nach Texteingabe eingeplant wird die sichtbare letzte Revision veröffentlicht. Doppelklick und parallele Requests erzeugen einen Auftrag pro Revision/Ziel. Teilerfolg A + Fehler B wiederholt nicht A. Unklarer Provider-Ausgang wird zunächst abgeglichen oder zur Entscheidung vorgelegt.

### D. Scheduler, Parallelität und Wiederaufnahme

**Anforderung:** Persistente Jobs in D1, indexiert nach Status und Fälligkeit. Ein atomarer bedingter Claim mit Lease und eindeutigem Claim-Token; kein SELECT-dann-UPDATE ohne Konkurrenzschutz. Abgelaufene Leases, Retries und Prozessabbrüche müssen definiert sein. Fremde/alte Claims dürfen Jobzustände nicht überschreiben. Provider-Idempotenzschlüssel, wenn unterstützt; andernfalls keine Exactly-once-Zusage. Ein D1-Commit und ein externer Post sind keine gemeinsame Transaktion.

**Abnahme:** Zwei gleichzeitige Dispatcher und ein wiederholter Aufruf erzeugen keinen belegbar doppelten Post. Abbruch vor Provider-Aufruf, nach Provider-Annahme und vor lokaler Speicherung werden getrennt getestet. Cancel-vs-Publish-Rennen hat einen sichtbaren definierten Ausgang. Eine neue Cloud-Ausführung ohne offene Browser-Sitzung verarbeitet einen Testauftrag und liest das persistierte Resultat zurück. Auch Cloudflare Queues liefern mindestens einmal und können Duplikate zustellen; eine Queue allein löst dies nicht. [Cloudflare Delivery Guarantees](https://developers.cloudflare.com/queues/reference/delivery-guarantees/)

### E. Sichere Medien

**Anforderung:** R2-Objekte standardmäßig privat. Uploads nur für berechtigte Mitglieder; serverseitig generierte Schlüssel, Größen-/Anzahl-/Workspace-Quoten, erlaubte Typen und Inhaltserkennung. Kein ungeprüftes SVG/HTML als aktive gleich-origin Datei. Medien erst nach erfolgreicher Prüfung für Posts auswählbar machen. Downloadautorisierung getrennt vom R2-Schlüsselnamen. Provider erhalten nur die ausgewählten Medien.

**Abnahme:** Umbenannte HTML-Datei, falscher MIME-Type, übergroßer Upload, fremder Media-Identifier und Upload-Abbruch werden sicher behandelt. Objekt ohne fertigen Metadatensatz wird bereinigt. Abgelaufene Freigabelinks funktionieren nicht mehr. Ein Provider kann die benötigte Datei tatsächlich abrufen oder per API erhalten, ohne Zugriff auf andere Dateien zu bekommen. [OWASP File Upload](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)

### F. SSRF und fremde URLs

**Anforderung:** Kein allgemeiner URL-Proxy. Im ersten Schnitt keine beliebigen Remote-Medienimporte oder frei wählbaren Mastodon-/Webhook-Endpunkte. Providerhosts fest serverseitig konfigurieren. Wenn Remote-Import später nötig ist: HTTPS, präzise Zielprüfung einschließlich IP-/DNS-Ergebnissen und jedes Redirects, keine internen/Loopback-/Link-local-Ziele, harte Größen-/Zeitgrenzen und keine mitgesendeten fremden Credentials. Fehlt eine belastbare Netzwerkgrenze gegen DNS-Rebinding, die Funktion zurückstellen.

**Abnahme:** Redirect auf internes Ziel, alternative IP-Schreibweisen, IPv6, benutzername@host und Antworten ohne Längenende werden abgewiesen. Rückgabe eines Provider-Redirects darf keinen Authorization-Header an einen anderen Host leiten. [OWASP SSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)

## 4. P1: Vor einem produktiven Mehrbenutzerbetrieb

- **CSRF/XSS:** Same-origin-Schreibanfragen, serverseitige Origin-/CSRF-Prüfung, keine Mutation per GET/Prefetch. Text und Providerfehler als Text rendern; HTML/Markdown nur mit geeigneter Bereinigung. CSP an tatsächlichen Einbettungskontext anpassen. Test mit gespeicherten Payloads in Text, Dateinamen, Profilnamen und OAuth-Fehlern. [OWASP CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- **Quoten und Verfügbarkeit:** Rate Limits pro Nutzer, Workspace, Verbindung und Provider. Retry-After beachten, begrenzter exponentieller Backoff mit Jitter. Ungültige Inhalte nicht erneut versuchen. Medien streamen statt komplett im Speicher puffern; Sites-Worker hat 128 MB Isolate-Speicher. Videotranscoding nicht ohne separaten nachgewiesenen Verarbeitungspfad versprechen. [Workers Limits](https://developers.cloudflare.com/workers/platform/limits/)
- **Zeitmodell:** UTC-Instant und IANA-Zeitzone speichern, keine nackten lokalen Zeitstrings. Bei wiederkehrenden Slots lokale Uhrzeit und Zeitzone separat bewahren. Nicht existierende und doppelte Zeiten zur Sommer-/Winterzeit ausdrücklich behandeln. Tests für Europe/Berlin-Zeitwechsel, Mitternacht, UTC−Zonen und Nachholen nach Ausfall. Grace-Window festlegen, damit lange überfällige Beiträge nicht überraschend publiziert werden.
- **Webhooks:** Provider-Signatur am unveränderten Body prüfen, Zeitfenster und Event-ID-Replay-Schutz, klarer Mandantenbezug, keine benutzerdefinierten Ziel-URLs als Autorität. Empfang an privater Site ist vor einer Zusage separat nachzuweisen.
- **Nachvollziehbarkeit:** Audit erfasst Initiator, Zielaccount, Revision, Zeitpunkt und Ergebnis, jedoch keine Token oder vollständigen Provider-Requests. Fehlermeldungen redigieren. Status unknown und notwendige Reauthentifizierung dauerhaft sichtbar machen. [OWASP Logging](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
- **Datenlebenszyklus:** Definierte Aufbewahrung, Export und Löschung für Entwürfe/Medien/Verbindungen. Löschen einer Verbindung löscht nicht automatisch veröffentlichte Social-Posts. Backup/Wiederherstellung einschließlich verschlüsselter Tokens und Schlüsselzugriff testen. Schemaänderungen additiv und migrationsfest; fehlgeschlagene Veröffentlichung kann bereits angewandte Migrationen hinterlassen.

## 5. Aufwand und Entscheidungstore

Grobe Engineering-Schätzung für eine erfahrene Person, keine Terminzusage:

1. **Machbarkeitsnachweis: 2–4 Personentage.** Echte Identity-/Mandantentests, Callback, ein Provider, Scheduler-Aufruf aus frischer Umgebung und Medienübergabe. Ergebnis muss ein belegter vertikaler Weg oder ein konkreter Stopper sein.
2. **Sicheres Fundament: 5–8 Personentage.** Berechtigungen, Schema, Revisionen, Token-Vault, Upload-/Abrufschutz und Negativtests.
3. **Zuverlässiges Publishing: 5–10 Personentage.** Jobs, Claims, Refresh, Abgleich unklarer Ergebnisse, Retry, Zeitmodell und gezielte Fehlersimulation.
4. **Erster Provider und Produktionsabnahme: 3–7 Personentage.** Providerkonforme Validierung, Medienablauf, Zustände und autorisierte Ende-zu-Ende-Tests.

Teilpakete überlappen; als Größenordnung **15–30 Personentage für einen schmalen produktionsnahen Kern**, ohne vollständige UI, Analytics, Inbox, Billing, umfassende Plattformparität und Wartezeit für App-Reviews. Jeder weitere Provider braucht eigene Adapter-/Consent-/Medien-/Fehlertests. Unbestätigte API-Kosten, App-Freigaben und Hostingfähigkeiten können den Plan wesentlich ändern.

## 6. Offene Annahmen und Aussagegrenzen

Kein Sourcecode des neuen Planers, keine Live-Konten, keine Provider-App-Konfiguration und kein Scheduler waren Gegenstand eines Funktionstests. Daher sind dies **Anforderungen und Architekturentscheidungen, keine behaupteten gefundenen Schwachstellen**. Keine Software installiert, keine Credentials erzeugt, keine Accounts verbunden und keine externen Zustände verändert.

Vor Implementierungsfreigabe klären: Single-Owner oder Team/Mandanten; Zielnetzwerke und Accounttypen; gewünschte Posting-Pünktlichkeit; existierende Provider-Apps und Scopes; erlaubte öffentliche Medienübergabe; notwendige Webhooks; Kostenrahmen und externe Dienste; Backup-/Exportmöglichkeiten. Allgemeine Cloudflare-Funktionen sind nicht automatisch verfügbare Sites-Funktionen.
