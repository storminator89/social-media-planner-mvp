# Änderungsprotokoll

## 0.2.0

- Eigene Kanaltexte, ausdrückliche Vererbung, Reset-Dialoge und kanalbezogene Zeichenprüfung.
- Queue-Vorschläge im Editor mit editierbaren temporären Wochen-Slots, Mindestabstand und expliziter Terminübernahme.
- Additive Migration 0002; API-Schema 2 weist alte schreibende Clients ab und bewahrt unabhängige Alttexte.
- Reiner Browser-only-Speicher deaktiviert, damit alte Tabs keine neuen Varianten überschreiben können. Keine automatische Datenübernahme aus localStorage.
- 143 Tests in drei Host-Zeitzonen; zusätzliche integrierte Browserprüfung. Details und Grenzen im Verifikationsbericht.
- Lokaler Prototyp ohne echtes Login, externe Konten oder automatische Veröffentlichung. Nicht veröffentlicht.

## 0.1.0

- Eigenständige deutsche Planungsoberfläche mit Kalender, Entwürfen, Vorschau und Bildauswahl.
- Persistenter lokaler SQLite-/Dateispeicher, UTC/IANA-Termine und explizite Revisionskonflikte.
- Schutz vor Metadatenverlust, unvollständigen Snapshot-Schreibvorgängen und verspäteten Editor-/Bildereignissen.
- 89 automatisierte Prüfungen sowie ergänzende Browserprüfungen.

Dieser Stand ist ein lokaler Prototyp ohne Anmeldung, Social-Konten, automatischen Versand oder Sites-Deployment. Kanalvarianten und Queue-Bedienung sind kein Bestandteil dieser Version.
