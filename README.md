# Takt 0.7.1: lokaler Social-Media-Planer

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
- Ideen-Inbox mit optionalem Titel, Notizen, Labels, Suche und Label-Filter. Ideen brauchen weder Kanal noch Termin. Erst ein erfolgreicher Beitragssave verschiebt die Idee mit derselben ID in Entwürfe oder Planung.
- UI mit Kalender, Liste, Entwürfen, Suche/Filter, Editor, Vorschau, Duplizieren, Löschen/Rückgängig und Export. Normale Beiträge unterstützen jetzt redaktionelle Labels; exakte Label-Filter kombinieren sich mit Kanal und Suche. Labels werden nicht in den Beitragstext eingefügt.
- Eigene Kanaltexte mit expliziter Basisvererbung, Vorschau und Zeichenprüfung. Auch absichtlich leere oder aktuell identische eigene Fassungen bleiben unabhängig.
- Temporäre Queue-Slots im Editor: gemeinsame Wochentage/Uhrzeit, IANA-Zone, Mindestabstand, bis zu drei freie Vorschläge. Erst bewusste Auswahl ändert den Termin, erst normales Speichern persistiert.
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
- Queue-Regeln gelten nur im geöffneten Editor und werden nicht dauerhaft gespeichert. Keine kanalweise Queue-Einstellungsseite oder automatisch optimierte Bestzeit.
- Ein reiner localStorage-/Static-Modus ist gesperrt. Fehlender Serveradapter oder ungültige Ladeantworten erzeugen weder leere Ersatzschreibvorgänge noch Demo-Beiträge. Alte Browser-only-Daten werden nicht automatisch importiert.
- Keine tatsächlich eingerichtete Social-Verbindung oder reale Credentials in diesem Quellstand. LinkedIn-/Google-OAuth, Tokenverschlüsselung und private YouTube-Übertragung sind mit lokalen kryptografischen und HTTP-Fixtures geprüft, aber nicht live aktiviert. Kein öffentlicher Publisher, Hintergrund-Scheduler, Webhooks, Analytics oder Inbox. YouTube-Schritte funktionieren nur bis zum Ablauf des aktuellen Access-Tokens und nur über sichtbare, bewusst gestartete Interaktion. OAuth allein ist keine Uploadfreigabe.
- Ungewisse Medienablagen zählen zur Quote und können nicht als Uploadquelle verwendet werden. Gleicher Dateiinhalt ist dauerhaft gegen doppelte Reservierung gesperrt, einschließlich ausstehender Einträge. Es gibt noch keine UI für Löschung, Retention oder manuelle Wiederherstellung. Lokales Trennen löscht keine Google-Videos und widerruft den Google-Grant nicht.
- Gespeicherte Bild-Alttexte sind sichtbar schreibgeschützt mit Erklärung; zur Änderung Bild erneut auswählen. Alttexte neuer lokaler Bilder bleiben bearbeitbar. Kein Medien-Löschendpunkt. Entfernte Beiträge können Bilddateien zurücklassen.
- Rückgängig ist eine kurze Sitzungsfunktion, kein Papierkorb: UI-Angebot 12 Sekunden; kanonische Wiederherstellungsdaten höchstens 60 Sekunden und 100 Einträge pro Store. Neuladen löscht diesen Zwischenspeicher. Bei einem Konflikt bleibt die gelöschte UI-Fassung sichtbar kopierbar, sie wird nicht automatisch wiederhergestellt.
- Die temporäre Arbeitsumgebung ist kein zugesicherter langfristiger Speicher.

## Sites als nächste Stufe

Noch nicht angelegt: Site-Projekt, Hosting-ID, Cloud-Datenbank, Bucket und Zugriffsrechte. Bei ausdrücklich freigegebener Veröffentlichung sind Sites-Worker, Dispatch-Identität, D1-Migrationen, R2, Quoten und Browserabläufe separat nachzuweisen. Keine Zugangsdaten oder lokale `.local/`-Dateien hochladen. Für echtes Auto-Publishing gelten zusätzlich die Voraussetzungen in `docs/security-architecture-de.md`.

Version 0.7.1 nutzt unverändert API-Schema 2 und UI-State 1. Sie ergänzt keine Migration; alle sechs SQL-Dateien bleiben bytegleich zu 0.7. Gesicherte Editor-Arbeitsfassungen und dauerhafte kanalbezogene Posting-Zeitpläne sind noch nicht Bestandteil dieses Releases. Vor einem lokalen Upgrade Daten sichern; Migrationen werden additiv und transaktional angewandt. Alte API-Clients werden schreibend abgewiesen. Siehe `docs/migration.md`.

Weitere Details: `docs/backend.md`, `docs/workflow-integration.md`, `docs/ideas.md`, `docs/sites-runtime.md`, `docs/provider-preparation.md`, `docs/oauth-preparation.md`, `docs/token-lifecycle.md`, `docs/linkedin-web-transport.md`, `docs/editorial-labels/README.md`, `docs/youtube-http-contract.md`, `docs/youtube-operation.md` und `docs/verification.md`.

## Lizenzstatus

Es wurde noch keine Open-Source-Lizenz festgelegt. Die öffentliche Sichtbarkeit des Quellcodes erteilt für sich genommen keine darüber hinausgehenden Nutzungsrechte. Die Oberfläche und Projektmodule wurden eigenständig erstellt; es sind keine kopierten Implementierungen anderer Social-Media-Produkte enthalten.
