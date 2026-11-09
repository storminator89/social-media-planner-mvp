# Verifikation: Version 0.3

Stand: 7. November 2026. Getrennter lokaler Prototyp, keine Veröffentlichung.

## Automatisierte Prüfungen

**214 Tests bestanden**, jeweils in der Standardumgebung UTC sowie mit `TZ=America/Los_Angeles` und `TZ=Asia/Tokyo`. Alle JavaScript-Dateien bestanden die Syntaxprüfung. Aufruf: `npm test` und `npm run check`.

Abgedeckt sind unter anderem:

- Vollständige Snapshot-Saves, atomare Revisionen/409, API-Schema 2, Besitzertrennung, Medienberechtigungen und fehlende Identität. Identitäten sind simuliert, kein echter Login.
- Reale lokale SQLite-Dateien und Upgrade 0001→0002: unveränderte Migrationen, konservative Textvererbung, Erhalt von Daten/Revisionen, Wiederöffnung und transaktionales Rollback bei ungültigem Ledger oder DDL-Fehler. 0.3 benötigt keine neue Migration.
- Ideen-Normalisierung, Titel-/Notizgrenzen, Label-Syntax, Suche und Label-Filter einschließlich echtem Label „all“, CRLF und nicht gepaarten UTF-16-Surrogaten. Unveränderte Titel/Notizen/Labels behalten ihre kanonische Form, einschließlich Rand-Leerzeichen und vorhandener Duplikate.
- Vorbereiten ohne Mutation; expliziter Übergang gleicher ID; Titel-only-Ideen sind keine veröffentlichungsfähigen Beiträge. Durchgehender Idee→Queue→Adapter→SQLite-Pfad mit Titel, Labels, Varianten und UTC-Zeitpunkt.
- Echte alte 0.2-Adapter werden bei stale write durch 409 geschützt; nach Neuladen lehnen sie Ideen/Tags ausdrücklich ab. Kein stiller Rückfall in alten localStorage.
- Varianten einschließlich leerer/identischer unabhängiger Texte; Titel, Statusnotizen, Medien und Labels bei unabhängigen Änderungen. Nicht unterstützte reichere Daten werden abgewiesen.
- Bestätigtes Delete/Undo bewahrt Varianten-ID, Statusnotiz, Erstelldatum und exakten UTC-Zeitpunkt in der doppelten DST-Stunde. Prüfung mit unabhängiger Änderung zwischen Delete/Undo, Fehler/409, TTL, Neuladen und begrenztem Wiederherstellungscache.
- Tatsächliche UI-Funktionskörper: Commit-Sperren, verzögerte Texte/Varianten/Medien, Dirty-Close, Ideenübergang, unveränderte Metadaten und readonly Recovery bei gescheitertem Undo. Bestehende gleiche IDs werden nicht ersetzt.
- Queue-Vorschläge ohne Save, ausdrückliche Übernahme, Fingerabdruck-/Belegungsprüfung, Mindestabstände und IANA-/DST-Grenzen. Mobile Wochenansicht filtert den gewählten Zeitraum.
- Medien-Signaturprüfung, Quoten, Besitzertrennung, dateibasierter Medien-Roundtrip und statische Pfadgrenzen. Kein neuer Browser-Dateiupload in diesem Ausbau.

Die unabhängige Quellprüfung hat dieselben 186 rein speicherbasierten Tests in drei Host-Zeitzonen sowie Syntax und eigene zusätzliche Reproduktionen geprüft. Gemeldete Datenverlustfälle in Undo und unveränderten Metadaten wurden behoben und erneut nachgeprüft. Die verbleibenden Tests verwenden temporäre lokale SQLite-/Dateiadapter. Die Anzahl enthält auch Bibliotheksfunktionen, die nicht vollständig in der UI erreichbar sind.

## Aussagegrenzen

Echte Sites-Dispatch-Identität, Cloud-D1/R2, gehostete Migrationen, Produktionssicherheit, Backup/Wiederherstellung, Social-OAuth, Provider-API, autonome Veröffentlichung und Hintergrundscheduler wurden nicht verifiziert. Lokale kompatible Adapter und simulierte Besitzer sind kein Cloud- oder Mehrbenutzernachweis. Unabhängige Prüfung ist keine allgemeine Sicherheitsgarantie.

Der Entwicklungsserver bindet ausschließlich an Loopback und verwendet einen gemeinsamen Testarbeitsbereich ohne Anmeldung. Keine vertraulichen Daten eingeben. Er ist nicht zur öffentlichen Bereitstellung vorgesehen. Queue-Regeln sind temporär. Undo ist kein dauerhafter Papierkorb; Recovery-JSON ist keine vollständige kanonische Daten- oder Mediendateisicherung.
