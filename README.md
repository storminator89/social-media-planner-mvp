# Takt 0.9.0: lokaler Social-Media-Planer

Dieser Prototyp führt Oberfläche, Planungslogik und eine persistente lokale Daten-API zusammen. Er ist **nicht auf Sites veröffentlicht**. Es wurden keine externen Konten verbunden und keine Beiträge an Social-Media-Dienste gesendet.

## Starten

Node.js 22.13 oder neuer, keine Paketinstallation nötig:

```sh
cd takt-social-mvp
npm test
npm run check
npm run dev
```

Die lokale Adresse wird beim Start ausgegeben. Eine Entwicklungsansicht ist keine veröffentlichte Site.

## Daten und tatsächlicher Funktionsumfang

- Lesende Verbindungsübersicht für Instagram, LinkedIn, YouTube und X. X bleibt ohne gespeicherte Verbindung; möglicher API-Zugang und Kosten erfordern eine ausdrückliche Freigabe. Sie zeigt echte lokale Serverzustände und unterscheidet technische Einrichtung, Plattformfreigabe und persönliche Berechtigung. Der ausgelieferte Stand hat keine aktivierte Provider-Konfiguration. Für LinkedIn und YouTube sind kontrollierte Verknüpfungs- und lokale Trennabläufe implementiert. LinkedIn-Versand bleibt gesperrt; YouTube besitzt einen gesondert deaktivierten privaten Uploadpfad.
- Vollständiger serverseitiger LinkedIn-Webablauf: expliziter Start, pro Versuch geschützter Cookie, Einmal-State/Installticket, begrenzter Codeaustausch, echte RS256-/Issuer-/Audience-/Nonceprüfung, passender Userinfo-Subject und erst dann verschlüsselte Tokenablage. Ohne ausdrücklich bereitgestellte Runtime-Konfiguration/Schlüssel und bestätigte Sicherheitsvoraussetzungen ist jeder aktive Pfad gesperrt. Der lokale Previewserver kann keinen Provider starten.
- LinkedIn-Bedienung liest den tatsächlichen Serverzustand, akzeptiert nur die offizielle Autorisierungsadresse mit eigenem Callback und entfernt gespeicherten Zugriff erst nach ausdrücklicher Bestätigung. Keine fingierte Verbindung, kein Reconnect, Refresh oder Posting.
- Google-/YouTube-Webflow mit PKCE S256, vollständiger OIDC-Prüfung und Abgleich eines vorab bestätigten Zielkanals. Eigene verschlüsselte State-, Credential- und Installticket-Persistenz; kein Refresh oder Reconnect. Ohne Runtime-Freigaben bleibt auch dieser Pfad gesperrt.
- Private YouTube-Uploads als eigener bewusster Ablauf: MP4/WebM bis 8 MiB und 20 gespeicherte Dateien, erst private Site-Speicherung, dann unveränderliche Zusammenfassung und ausdrücklicher Uploadstart. Kinder-/KI-Angaben sind Pflichtentscheidungen. Sichtbarkeit ist fest privat, Abonnentenbenachrichtigung aus; keine öffentliche Planung. Ungewisse Übertragungen werden nicht automatisch neu gestartet.
- Dependency-freier Sites-Worker-Entwurf mit eingebetteten UI-Dateien und identitätsgebundener Daten-API. `npm run build:worker` erzeugt ein lokales Worker-Artefakt, keinen gehosteten Dienst.
- Separate serverseitige Arbeitsfassungen sichern unvollständige Composer-Eingaben nach bestätigtem Speicherzugang. Sie verändern keine Beiträge. Wiederaufnahme prüft die aktuelle Planung; veränderte Herkunft erlaubt nur eine bewusste neue Kopie. Mehrtab-Konflikte und unklare Speicherantworten lösen keinen automatischen Retry aus.
- Ideen-Inbox mit optionalem Titel, Notizen, Labels, Suche und Label-Filter. Ideen brauchen weder Kanal noch Termin. Erst ein erfolgreicher Beitragssave verschiebt die Idee mit derselben ID in Entwürfe oder Planung.
- UI mit Kalender, Liste, Entwürfen, Suche/Filter, Editor, Vorschau, Duplizieren, Löschen/Rückgängig und Export. Normale Beiträge unterstützen jetzt redaktionelle Labels; exakte Label-Filter kombinieren sich mit Kanal und Suche. Labels werden nicht in den Beitragstext eingefügt.
- Eigene Kanaltexte mit expliziter Basisvererbung, Vorschau und Zeichenprüfung. Auch absichtlich leere oder aktuell identische eigene Fassungen bleiben unabhängig.
- Gespeicherte Posting-Zeiten je Kanal: IANA-Zone, Wochentage, Uhrzeit, Pause und Mindestabstand. Der Editor bietet gemeinsame freie Termine für die gewählten Kanäle. Erst eine bewusste Auswahl und das normale Speichern binden einen Beitrag an einen Slot; Regeländerungen verschieben keine bestehenden Termine.
- SQLite-Daten unter `.local/planner.sqlite`, Bilddateien unter `.local/media/`. Beide überstehen einen Serverneustart in derselben Arbeitsumgebung. Kein Synchronisations- oder Backupversprechen.
- Neue Datenbank startet leer. Die angezeigten Kanalprofile sind unverbundene Beispiele.
- Termine werden als UTC-Zeitpunkt plus IANA-Zeitzone gespeichert. Nicht existierende/doppelte Ortszeiten werden nicht stillschweigend verschoben.
- Optimistische Revisionen verhindern stilles Überschreiben bei konkurrierenden Änderungen. Ein 409 erfordert Neuladen und manuelles Übernehmen des eigenen Entwurfs.
- Bilder werden geprüft und über interne relative Medienpfade geladen. SVG/HTML und inkonsistente MIME-Signaturen werden abgewiesen. Kein Malware-Scan oder vollständiger Dateidecoder.

## Sicherheitsgrenze

Der lokale Entwicklungsserver verwendet **einen gemeinsamen Testarbeitsbereich ohne Anmeldung**. Er bindet nur an Loopback, lehnt fremde Host-/Origin-Angaben und eingehende Identitätsheader ab. Keine vertraulichen oder realen Kundendaten eintragen. Das ist ausdrücklich keine produktive Mandantentrennung oder ChatGPT-Anmeldung.

Die wiederverwendbare API in `modules/data/api.mjs` ist dagegen für die serverseitig von Sites Dispatch eingefügte Besucher-ID ausgelegt. Tests verwenden getrennte simulierte Besitzer. Ein echter gehosteter Identitätsnachweis ist offen. Niemals den lokalen Server öffentlich deployen oder die ID aus Browserdaten übernehmen.

## Bekannte Grenzen

- Eigene Kanaltexte sind verfügbar; Bild, Format und Termin bleiben je Beitrag gemeinsam. Review-Prozesse, Teams und manuelle Publishing-Resultate sind noch nicht in dieser Oberfläche editierbar. Reichere Backend-Daten werden bewusst abgewiesen, nicht stillschweigend abgeflacht.
- Die separate Workflow-Bibliothek enthält weiterführende Zustands- und Freigabelogik; nicht alle dieser Funktionen sind über die UI erreichbar.
- Keine automatisch optimierte Bestzeit oder stille Neuverteilung. Leere oder pausierte Posting-Zeiten erzeugen keine neuen Vorschläge; vorhandene Termine bleiben bestehen und können eine Prüfung erfordern. Eine Queue-Bindung startet keinen Versand.
- Ein reiner localStorage-/Static-Modus ist gesperrt. Fehlender Serveradapter oder ungültige Ladeantworten erzeugen weder leere Ersatzschreibvorgänge noch Demo-Beiträge. Alte Browser-only-Daten werden nicht automatisch importiert.
- Keine tatsächlich eingerichtete Social-Verbindung oder reale Credentials in diesem Quellstand. LinkedIn-/Google-OAuth, Tokenverschlüsselung und private YouTube-Übertragung sind mit lokalen kryptografischen und HTTP-Fixtures geprüft, aber nicht live aktiviert. Kein öffentlicher Publisher, Hintergrund-Scheduler, Webhooks, Analytics oder Inbox. YouTube-Schritte funktionieren nur bis zum Ablauf des aktuellen Access-Tokens und nur über sichtbare, bewusst gestartete Interaktion. OAuth allein ist keine Uploadfreigabe.
- Ungewisse Medienablagen zählen zur Quote und können nicht als Uploadquelle verwendet werden. Gleicher Dateiinhalt ist dauerhaft gegen doppelte Reservierung gesperrt, einschließlich ausstehender Einträge. Es gibt noch keine UI für Löschung, Retention oder manuelle Wiederherstellung. Lokales Trennen löscht keine Google-Videos und widerruft den Google-Grant nicht.
- Gespeicherte Bild-Alttexte sind sichtbar schreibgeschützt mit Erklärung; zur Änderung Bild erneut auswählen. Alttexte neuer lokaler Bilder bleiben bearbeitbar. Kein Medien-Löschendpunkt. Entfernte Beiträge können Bilddateien zurücklassen.
- Rückgängig ist eine kurze Sitzungsfunktion, kein Papierkorb: UI-Angebot 12 Sekunden; kanonische Wiederherstellungsdaten höchstens 60 Sekunden und 100 Einträge pro Store. Neuladen verwirft normale Sitzungsdaten. Bei Queue-Löschungen darf ein passender besitzergebundener Digest innerhalb derselben Frist einen bereits gehaltenen Originalpost bestätigen; dies ist kein Papierkorb und stellt keine verlorenen Texte aus dem Serverhash wieder her. Bei einem Konflikt bleibt die gelöschte UI-Fassung sichtbar kopierbar, sie wird nicht automatisch wiederhergestellt.
- Arbeitsfassungen haben eine Wiederaufnahmefrist von 30 Tagen seit letzter bestätigter neuer Sicherung, höchstens 20 aktive und 100 insgesamt während der Lebenszeit eines Besitzerbereichs. Verwerfen/Ablauf schließen die normale Wiederaufnahme, löschen aber keine Daten und geben keinen Gesamtplatz frei. Kein automatisches Archiv, Purge oder Backup.
- Lokale Bilddateien werden durch die separate Sicherung nicht hochgeladen. Der Hinweis auf eine fehlende Datei bleibt nach Wiederaufnahme erhalten; vorhandene Bilder werden nur über besitzergeprüfte Referenzen verwendet.
- Die temporäre Arbeitsumgebung ist kein zugesicherter langfristiger Speicher.

## Sites als nächste Stufe

Dieser Quellkandidat enthält keine Site-ID, Hosting-Konfiguration, Cloud-Ressourcen oder eingerichteten Zugriffsrechte. Eine separate private Testbereitstellung ist kein Nachweis für diesen 0.9-Stand. Bei ausdrücklich freigegebener Bereitstellung sind Sites-Worker, Dispatch-Identität, D1-Migrationen, R2, Quoten und Browserabläufe separat nachzuweisen. Keine Zugangsdaten oder lokale `.local/`-Dateien hochladen. Für echtes Auto-Publishing gelten zusätzlich die Voraussetzungen in `docs/security-architecture-de.md`.

Version 0.9.0 verwendet Planer-API 3 und UI-State 2. Die Arbeitsfassungs-API bleibt Schema 1 und kann den vollständigen Planungskontext optional bewahren; alte Arbeitsfassungen bleiben unverändert lesbar. Migration 0008 ergänzt nullable Zeitplanfelder und kurzlebige Queue-Undo-Nachweise. SQL 0001–0007 bleiben unverändert. Alte Planerclients werden vor Schreiboperationen abgewiesen. Vor einem lokalen Upgrade Daten sichern; Migrationen werden additiv und transaktional angewandt. Für gehostete Arbeitsfassungen sind ein fest konfigurierter Site-Kontext und physisch Site-private D1-Datenbank notwendig. Siehe `docs/workspaces/integration.md` und `docs/migration.md`.

Weitere Details: `docs/posting-schedules.md`, `docs/backend.md`, `docs/workflow-integration.md`, `docs/ideas.md`, `docs/sites-runtime.md`, `docs/provider-preparation.md`, `docs/oauth-preparation.md`, `docs/token-lifecycle.md`, `docs/linkedin-web-transport.md`, `docs/editorial-labels/README.md`, `docs/workspaces/integration.md`, `docs/youtube-http-contract.md`, `docs/youtube-operation.md` und `docs/verification.md`.

## Lizenzstatus

Es wurde noch keine Open-Source-Lizenz festgelegt. Die öffentliche Sichtbarkeit des Quellcodes erteilt für sich genommen keine darüber hinausgehenden Nutzungsrechte. Die Oberfläche und Projektmodule wurden eigenständig erstellt; es sind keine kopierten Implementierungen anderer Social-Media-Produkte enthalten.
