# Lokales Upgrade von 0.1 auf 0.2

## Vorher

0.2 ist eine getrennte lokale Version. Ein Upgrade sollte erst nach Sicherung des gesamten `.local/`-Ordners bei beendetem Server erfolgen. Die Datenbank und die zugehörigen Medien gehören zusammen; JSON-Export allein ist keine vollständige Sicherung. Die bereitgestellten Quellsnapshots enthalten keine Nutzerdaten.

Keine automatische Übernahme fremder Arbeitsverzeichnisse, Browserprofile oder veröffentlichter Cloud-Daten. Den alten Server nicht parallel gegen dieselbe Datenbank weiterbetreiben. Eine Downgrade-Migration ist nicht implementiert; für eine Rückkehr die zuvor gesicherte 0.1-Datenkopie in einer separaten Umgebung verwenden.

## Ablauf

`LocalDatabase` prüft die gespeicherte Migrationsliste unter `BEGIN IMMEDIATE`. Bekannte Versionen müssen lückenlos und mit unveränderter SHA256-Prüfsumme vorliegen. Unbekannte, geänderte oder unvollständige Historie wird abgewiesen. Alle noch fehlenden SQL-Schritte sowie ihre Ledger-Einträge werden in einer Transaktion ausgeführt; Fehler rollen beides zurück.

- `0001_planner.sql` bleibt bytegleich.
- `0002_variant_inheritance.sql` fügt `inherits_body` hinzu. Default ist 0: bestehende Kanaltexte bleiben ausdrücklich unabhängig, selbst wenn sie der Basis gleichen. Gleichheit beweist keine beabsichtigte Vererbung.
- IDs, Titel, Notizen, Medienverweise, Revisionen und Besitzer werden nicht umgeschrieben.
- Ein neuer aktueller Adapter stellt vererbte Texte durch fehlende Keys in `variantTexts` dar. Ein vorhandener Key ist eine unabhängige Fassung. Die bewusste Rücksetzung erfolgt in der UI.

GET/PUT verwenden danach API-Schema 2. Ein alter oder fehlender Schemastand wird vor Schreiboperationen mit 409 `STATE_SCHEMA_CHANGED` abgewiesen, auch bei passender Revision. Ein Konflikt ist kein Anlass zum automatischen Überschreiben.

## Browser-only-Altbestände

Der integrierte 0.2-Stand unterstützt nur den expliziten Serveradapter. Er liest oder schreibt keine alten localStorage-Schlüssel und führt keine stille Migration durch. Fehlende Adapter und `null`-Antworten sperren das Laden/Speichern, statt Demos anzulegen. Browser-only-Altbestände müssen separat gesichert und mit einem ausdrücklich entworfenen Import übernommen werden. Solch ein Import gehört nicht zu dieser Version.

## Nachweisgrenze

Tests prüfen echte lokale SQLite-Dateien, wiederholte Starts, alte Mehrbesitzerdaten und absichtliche Fehler im Ledger/DDL. Die unabhängige Nachprüfung übt den echten Constructor zusätzlich mit isoliertem Memory-SQLite aus. Gehostete D1-Migrationen und authentifizierte Sites-Dispatch-Aufrufe sind damit nicht nachgewiesen.
