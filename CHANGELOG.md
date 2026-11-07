# Änderungsprotokoll

## 0.4.0

- Eigener Worker-Einstieg für spätere Sites-Bereitstellung, ohne Node-Laufzeitabhängigkeiten, mit eingebettetem UI-Inventar und Dispatch-Identitätspflicht.
- Reine GET-Verbindungsübersicht für Instagram, LinkedIn und YouTube; keine fingierten Konten, OAuth-Links, Secrets oder Publikationsrouten.
- Additive Migration 0003 für Verbindungsplatzhalter und gesperrte Jobvorbereitung. Datenbankbedingungen verhindern „connected“, aktivierten Versand und ausführbare Jobs.
- Weiter identische Planungs-API/Adapter sowie die geprüften Ideen-, Varianten-, Queue- und Undo-Funktionen.
- 272 Tests in drei Host-Zeitzonen, Syntax- und reproduzierbarer Worker-Build. Cloud-D1/R2 und echte Sites-Identität sind noch nicht live nachgewiesen.

## 0.3.0

- Ideen-Inbox mit Titel, Notizen, Labels, Suche und Label-Filter; keine Kanäle oder Termine erforderlich.
- Expliziter Übergang Idee → Entwurf/geplanter Beitrag mit derselben ID, ohne vorzeitige Mutation oder separates Duplikat.
- Titel/Labels bleiben bei Varianten, Queue, Duplizieren und unabhängigen Änderungen erhalten. Unveränderte Metadaten werden nicht beim Öffnen normalisiert.
- Begrenztes Undo bewahrt kanonische Varianten-IDs, Statusnotizen und exakte UTC-Zeitpunkte. Fehlgeschlagene Wiederherstellung zeigt eine kopierbare Fassung statt stillen Verlusts.
- Weiter API-Schema 2 und unveränderte Migrationen; keine Cloud- oder Social-Verbindung.
- 214 automatisierte Tests, Syntaxprüfung und integrierte Browserprüfung. Umfang und Grenzen im Verifikationsbericht.

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
