# Verifikation: Version 0.2

Stand: 7. November 2026. Getrennter lokaler Prototyp, keine Veröffentlichung.

## Automatisierte Prüfungen

**143 Tests bestanden**, jeweils in der Standardumgebung sowie mit `TZ=America/Los_Angeles` und `TZ=Asia/Tokyo`. Alle JavaScript-Dateien bestanden die Syntaxprüfung. Aufruf: `npm test` und `npm run check`.

Abgedeckt sind unter anderem:

- API-Schema 2, atomare Revisionskonflikte, Besitzertrennung und fehlende Identität. Tests mit simuliertem vertrauenswürdigem Besucherheader, nicht mit echter Anmeldung.
- Realer lokaler SQLite-Upgradepfad von 0001 auf 0002: bytegleiche alte Migration, konservative Textvererbung, Erhalt aller Daten/Revisionen, Wiederöffnung und Abbruch/Rollback bei geänderter oder unbekannter Historie und DDL-Fehler.
- Alte API-Schreibanfragen werden auch mit passender Revision abgewiesen. Der Browser-only-Fallback liest/schreibt keine alten localStorage-Daten; null-Ladeantworten erzeugen keine Demos.
- Varianten-Roundtrips einschließlich absichtlich leerer/identischer Texte, späterer Basisänderung, explizitem Reset, verborgenen Titeln und Statusnotizen. Bilder ohne Kanäle werden vor Mutation abgewiesen.
- Queue-Vorschau ohne Mutation, explizite Übernahme, Belegungen, gemeinsame Kanäle, Mindestabstände, geänderte Regeln/Inhalte, IANA-Zonen und DST-Lücken/doppelte Stunden.
- Durchgehende Queue→Adapter→SQLite-Prüfung inklusive UTC-Erhaltung, eigenem Kanaltext und 409 gegen konkurrierende Clients.
- API-Medienprüfung, Besitzerschutz, Quoten und dateibasierter Medien-Roundtrip. Dieser Ausbau hat keine neuen Browser-Dateiuploads durchgeführt.
- Statische Modulpfade, keine Freigabe der Datenbank, Serverquellen oder fremder Symlinks.
- Tatsächliche Editorfunktionen mit verzögertem I/O: volle Commit-Feldsperre, Schutz neuerer Texte/Varianten, Doppelklick, späte Bild-Callbacks, Dirty-Duplicate und mobile Wochenfilterung.
- Queue-Panel-Bedienlogik: Vorschau allein speichert nichts, Auswahl liefert eine Kopie, veraltete Vorschläge werden verworfen, Commit-Sperre und temporäre Regeln.

Die unabhängige Nachprüfung wird separat am eingefrorenen Quellsnapshot dokumentiert. Die Testanzahl umfasst auch weiterführende Workflow-Bibliotheksfunktionen, die nicht vollständig in der Oberfläche verfügbar sind.

## Integrierte Browserprüfung

Im Chromium-Hauptfenster beobachtet:

- Leerer Serverzustand und wahrheitsgemäße lokale Speicherkennzeichnung.
- Instagram-Basis plus eigene Bluesky-Fassung; Basisänderung verändert eigene Fassung nicht. Save, Reload und vollständiger Entwicklungsserver-Neustart bewahren die Fassung.
- Queue-Suche mit bearbeiteter Uhrzeit 09:30 liefert drei gemeinsame freie Slots. Textänderung verwirft die Vorschläge. Bewusste Übernahme ändert erst das Formular; reguläres Einplanen speichert.
- Ein belegter gemeinsamer Kanaltermin wird bei der nächsten Suche ausgelassen. Ein Abstand von genau 30 Minuten bleibt bei Mindestabstand 30 zulässig.
- Ein veralteter Tab erhält einen sichtbaren Konflikthinweis und behält seine eigene Kanaltext-Eingabe. Kein automatisches Retry oder Überschreiben.
- 301 Zeichen für Bluesky blockieren Planung, bleiben aber als Entwurf speicherbar und nach Reload vollständig vorhanden.
- Expliziter Reset-Dialog stellt Basisvererbung her; nach Save/Reload ist der Kanal wieder als Basistext gekennzeichnet.
- Commit sperrt auch sämtliche Queue-Eingaben. Selbst erstellte Testbeiträge wurden abschließend entfernt; der neu geladene Serverzustand zeigt 0 geplante und 0 Entwurfsbeiträge.

## Responsive Prüfung und Grenze

Die integrierte Oberfläche wurde zusätzlich in einem vorübergehenden 390-Pixel-Testframe mit 375 CSS-Pixeln tatsächlicher Inhaltsbreite geprüft. Dokumentbreite und Scrollbreite waren beide 375 Pixel; das Queue-Panel war 320 Pixel breit und hatte keinen horizontalen Überlauf. Suche und explizite Übernahme waren bedienbar.

Dies ist ein Layoutnachweis, kein vollständiger mobiler End-to-End-Nachweis: Das `srcdoc`-Prüfharness kann nach einem erfolgreichen Schreibvorgang den History-URL-Wechsel nicht ausführen. Die Speicherung wurde anschließend im Hauptfenster verifiziert; der Harnessfehler wurde nicht als erfolgreicher Abschluss ausgegeben. Der Prüfharness wurde entfernt und ist nicht Teil des Produkts. Einbettung in fremde Frames ist kein unterstützter Betriebsmodus. Kein echtes Smartphone-/Safari-/Screenreader-Audit.

## Aussagegrenzen

Echte Sites-Dispatch-Identität, Cloud-D1/R2, gehostete Migrationen, Produktionssicherheit, Backup/Wiederherstellung, Social-OAuth, Provider-API, autonome Veröffentlichung und Hintergrundscheduler wurden nicht verifiziert. Lokale kompatible Adapter und simulierte Besitzer sind kein Cloud- oder Mehrbenutzernachweis.

Der Entwicklungsserver bindet ausschließlich an Loopback und verwendet einen gemeinsamen Testarbeitsbereich ohne Anmeldung. Keine vertraulichen Daten eingeben. Er ist nicht zur öffentlichen Bereitstellung vorgesehen. Queue-Regeln gelten nur für den geöffneten Editor und sind keine dauerhaft gespeicherte Kanalplanung oder Empfehlung einer optimalen Reichweitenzeit.
