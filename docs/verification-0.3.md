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

## Integrierte Desktop-Browserprüfung

Mit der echten lokalen SQLite-API in Chromium beobachtet:

- Neue Datenbank leer; Kanalprofile als unverbundene Beispiele und Speicher als lokaler Entwicklungsmodus gekennzeichnet.
- Titel-only-Idee ohne Kanal/Termin gespeichert und neu geladen; Labels mit Komma und Anführungszeichen exakt erhalten. Reales Label „all“ separat filterbar.
- Vorbereiten wählt keinen Kanal vor und erzeugt keinen Beitrag. Fehlender Beitragstext/Kanal verhindert Save. Abbrechen lässt die Idee unverändert.
- Zwei Tabs: neuere Ideenänderung gewinnt; stale Umwandlung erhält sichtbaren 409 und behält eigene Eingabe. Keine automatische Wiederholung.
- Idee mit LinkedIn/Bluesky und eigenem Bluesky-Text über Queue in Planung verschoben. Gleiche ID, ein Objekt, Idee aus Inbox entfernt, keine Zwischenveröffentlichung.
- Löschen und sofortiges Undo wiederhergestellt. Zweites Delete mit konkurrierender Idee im anderen Tab: Undo bekommt 409, die gelöschte Fassung bleibt als kopierbare readonly Wiederherstellung sichtbar. Fremde Änderung bleibt erhalten.
- Mehrzeilige Titel/Labels, Filter nach mehrzeiligem Label und reine Notizänderung gespeichert; Reload sowie vollständiger lokaler Serverneustart bewahren Metadaten und neuen Notiztext.
- Eigene synthetische Testideen/-beiträge anschließend per UI entfernt. Keine Nutzerdaten, Testmedien oder Laufzeitdaten im Quellsnapshot.

## Responsive Prüfung und Grenze

Der getrennt entwickelte Ideen-UI-Stand wurde vor Integration in einem echten schmalen Browserfenster mit 400 CSS-Pixeln Außen- und 388 Pixeln Inhaltsbreite geprüft: Idee→Entwurf→geplanter Beitrag mit echten SQLite-Saves, ohne Frame-Harness oder Lockerung der CSP. Am final integrierten Stand wurde zusätzlich ein eigenes natives Chromium-Fenster schmal gezogen und auf 125 % gezoomt: 400 CSS-Pixel Ansichtsbreite, 388 Pixel Client- und Scrollbreite. Mehrzeilige Titel/Labels ließen sich ohne horizontalen Überlauf speichern, neu laden und über bewusste Kanalauswahl zum Entwurf umwandeln. Der Dialog war ebenfalls 388 Pixel breit. Der Testentwurf wurde entfernt, der Zoom zurückgesetzt und das eigene Fenster geschlossen. Die Recovery-Ansicht wurde im Desktop und per Funktionskörpertests geprüft. Ein tatsächliches Smartphone-, Safari- oder Screenreader-Audit ist nicht erfolgt.

## Aussagegrenzen

Echte Sites-Dispatch-Identität, Cloud-D1/R2, gehostete Migrationen, Produktionssicherheit, Backup/Wiederherstellung, Social-OAuth, Provider-API, autonome Veröffentlichung und Hintergrundscheduler wurden nicht verifiziert. Lokale kompatible Adapter und simulierte Besitzer sind kein Cloud- oder Mehrbenutzernachweis. Unabhängige Prüfung ist keine allgemeine Sicherheitsgarantie.

Der Entwicklungsserver bindet ausschließlich an Loopback und verwendet einen gemeinsamen Testarbeitsbereich ohne Anmeldung. Keine vertraulichen Daten eingeben. Er ist nicht zur öffentlichen Bereitstellung vorgesehen. Queue-Regeln sind temporär. Undo ist kein dauerhafter Papierkorb; Recovery-JSON ist keine vollständige kanonische Daten- oder Mediendateisicherung.
