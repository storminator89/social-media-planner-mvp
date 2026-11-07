# Lokales Upgrade auf 0.5

## Vorher

Jede Version ist ein getrennter lokaler Quellstand. Ein Upgrade sollte erst nach Sicherung des gesamten `.local/`-Ordners bei beendetem Server erfolgen. Die Datenbank und die zugehörigen Medien gehören zusammen; JSON-Export allein ist keine vollständige Sicherung. Die bereitgestellten Quellsnapshots enthalten keine Nutzerdaten.

Keine automatische Übernahme fremder Arbeitsverzeichnisse, Browserprofile oder veröffentlichter Cloud-Daten. Den alten Server nicht parallel gegen dieselbe Datenbank weiterbetreiben. Eine Downgrade-Migration ist nicht implementiert; für eine Rückkehr die zuvor gesicherte Datenkopie in einer separaten Umgebung verwenden.

## Ablauf

`LocalDatabase` prüft die gespeicherte Migrationsliste unter `BEGIN IMMEDIATE`. Bekannte Versionen müssen lückenlos und mit unveränderter SHA256-Prüfsumme vorliegen. Unbekannte, geänderte oder unvollständige Historie wird abgewiesen. Alle noch fehlenden SQL-Schritte sowie ihre Ledger-Einträge werden in einer Transaktion ausgeführt; Fehler rollen beides zurück.

- `0001_planner.sql` bleibt bytegleich.
- `0002_variant_inheritance.sql` fügt `inherits_body` hinzu. Default ist 0: bestehende Kanaltexte bleiben ausdrücklich unabhängig, selbst wenn sie der Basis gleichen. Gleichheit beweist keine beabsichtigte Vererbung.
- IDs, Titel, Notizen, Medienverweise, Revisionen und Besitzer werden nicht umgeschrieben.
- Ein neuer aktueller Adapter stellt vererbte Texte durch fehlende Keys in `variantTexts` dar. Ein vorhandener Key ist eine unabhängige Fassung. Die bewusste Rücksetzung erfolgt in der UI.

GET/PUT verwenden danach API-Schema 2. Ein alter oder fehlender Schemastand wird vor Schreiboperationen mit 409 `STATE_SCHEMA_CHANGED` abgewiesen, auch bei passender Revision. Ein Konflikt ist kein Anlass zum automatischen Überschreiben.

## Browser-only-Altbestände

Der integrierte Stand unterstützt nur den expliziten Serveradapter. Er liest oder schreibt keine alten localStorage-Schlüssel und führt keine stille Migration durch. Fehlende Adapter und `null`-Antworten sperren das Laden/Speichern, statt Demos anzulegen. Browser-only-Altbestände müssen separat gesichert und mit einem ausdrücklich entworfenen Import übernommen werden. Solch ein Import gehört nicht zu dieser Version.

## Nachweisgrenze

Tests prüfen echte lokale SQLite-Dateien, wiederholte Starts, alte Mehrbesitzerdaten und absichtliche Fehler im Ledger/DDL. Die unabhängige Nachprüfung übt den echten Constructor zusätzlich mit isoliertem Memory-SQLite aus. Gehostete D1-Migrationen und authentifizierte Sites-Dispatch-Aufrufe sind damit nicht nachgewiesen.

## Von 0.2 auf 0.3

0.3 ergänzt nur UI, Adapter und reine Workflowfunktionen. Beide SQL-Migrationen, API-Schema 2, Repository und lokaler Server bleiben unverändert. Ideen nutzen den vorhandenen `stage:'idea'` mit Titel und Tags. Es gibt keine separate Ideen-Tabelle oder neue Datenmigration.

Auch hier vor dem Upgrade Server stoppen und den gesamten lokalen Datenordner sichern. Alten Server nicht parallel gegen dieselbe Datei laufen lassen. Ein alter 0.2-UI-Adapter mit veralteter Revision erhält 409. Nach erneutem Laden weist dieser Adapter Ideen/Tags bewusst ab, anstatt sie zu reduzieren. Das gilt für den geprüften vollständigen 0.2-Adapter, nicht als pauschales Kompatibilitätsversprechen beliebiger Drittclients.

Unveränderte Metadaten werden exakt übernommen; neue bzw. bewusst bearbeitete Labels werden auf die UI-Regeln normalisiert. Ein Undo-Zwischenspeicher wird nicht migriert oder persistent gemacht. Für eine Rückkehr auf einen älteren Stand eine getrennte Sicherung verwenden, nicht durch alte UI-Normalisierung schreiben.

## Von 0.3 auf 0.4

`0003_provider_jobs.sql` ergänzt nur `planner_provider_connections`, `planner_publication_jobs` und einen Index. Bestehende Tabellen, IDs, Revisionen und beide alten SQL-Dateien bleiben unverändert. Es gibt keine Seed-Konten oder automatisch vorbereiteten Jobs. Status-GETs verändern keine Tabellen. Die lokale Migrationsliste umfasst danach 1, 2 und 3; Fehler rollen die gesamte noch ausstehende Migration samt Ledger zurück.

Verbindungen sind ausschließlich unverbundene Einrichtungszustände. Jobs können nur `blocked` oder `cancelled` sein; `publishing_enabled=0` wird in beiden Tabellen erzwungen. Weder Credential-Felder noch eine ausführbare Lease oder Versandfreigabe sind vorhanden. Die Vorbereitung besitzt keinen öffentlichen Schreibendpunkt.

Geprüft: tatsächlicher lokaler Constructor mit Daten mehrerer Besitzer, unveränderte Alt-Revisionsdaten, wiederholte Öffnung, leere neue Tabellen sowie Rollback, wenn Migration 0003 auf widersprüchliches vorhandenes Schema trifft. Diese Tests ersetzen nicht die spätere gehostete Migrationsabnahme. Der Worker führt keine DDL während HTTP-Anfragen aus.

## Von 0.4 auf 0.5

`0004_oauth_state.sql` fügt ausschließlich `planner_oauth_states` und einen owner-/ablaufgebundenen Index hinzu. Migrationen 0001–0003 bleiben bytegleich. Kein Tabellenneuaufbau, keine Rückfüllung, keine Änderung vorhandener Planer-, Medien-, Verbindungs- oder Jobdaten. Der lokale Ledger umfasst danach 1, 2, 3 und 4.

Die neue Tabelle speichert nur Hashes von State und Browserbindung, einen Nonce-Fingerprint sowie nichtgeheime, exakt gebundene Konfiguration. Sie enthält keine Autorisierungscodes, PKCE-Verifier, Tokens oder Schlüssel. HTTP-Leseaufrufe erzeugen oder konsumieren keine Versuche. Es gibt keine Start-/Callback-Schreibroute. Die State-Tabelle ist kein Token-Vault und beweist keinen durchgeführten OAuth-Flow.

X wird als vierter gesperrter Status angezeigt, aber nicht in den bestehenden Provider-/Jobtabellen gespeichert. Deren unveränderte CHECKs erlauben weiterhin nur drei Provider. X-Mutatoren werden vor Persistenz abgewiesen. Eine spätere X-Persistenzerweiterung braucht einen getrennt geprüften Tabellen-/Datenmigrationsplan; es gibt absichtlich keine Migration 0005.

Regressionen prüfen den echten lokalen Constructor mit nichtleeren Planer- und gesperrten Jobbeständen mehrerer Besitzer, unveränderte Revisionen/Digests, Wiederstart und Rollback bei kollidierendem Migrationsindex. Gehostete Anwendung, reale D1-Transaktionen und Aufbewahrung/Bereinigung in der Cloud sind nicht nachgewiesen. Abgelaufene State-Zeilen werden nur begrenzt beim nächsten Begin desselben Besitzers entfernt; ein eigenständiger Bereinigungslauf ist nicht implementiert.
