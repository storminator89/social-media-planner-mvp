# Verifikation: Version 0.4

Stand: 7. November 2026. Nur lokaler Quell-/Worker-Kandidat, kein Deployment.

## Automatisierte Prüfungen

272 Tests jeweils unter UTC, America/Los_Angeles und Asia/Tokyo bestanden. JavaScript-Syntaxprüfung und Worker-Build erfolgreich. `npm test` erstellt den Worker vor dem Testlauf; dessen tatsächlicher Default-Fetch-Export wird direkt geprüft. Der Determinismus-Test baut in ein isoliertes temporäres Verzeichnis und vergleicht die Bytes mit dem Hauptartefakt.

Neue Abdeckung zusätzlich zum geprüften 0.3-Bestand:

- Worker: verpflichtende Sites-Identität, kein lokaler Ersatzbesitzer, keine eigene Auth-Callback-Implementierung, fehlendes D1-Binding fail-closed, Origin-/CSRF-Schutz und sichere Antwortheader.
- Eingebettetes statisches Inventar ohne Zugriff auf Serverquellen, Datenbank oder fremde Dateipfade; eigene Server-Bootstrap-Konfiguration ohne Node-Abhängigkeiten.
- Bestehende Planungs-API durch den real erzeugten Worker: getrennte Besitzer, Save/409, R2-kompatibler Medienzugriff, fehlender Bucket und keine Medienfreigabe an fremde Besitzer.
- Read-only Providerstatus vom Repository über Worker bis zur tatsächlichen UI-Normalisierung; nicht mutierend, keine Ownerübernahme aus Query/JSON, kein Credential-/Account-/Payload-Leak.
- Fehlende Provider-Migration liefert 503; bestehende Planung bleibt lesbar. Kein erfundener „nicht verbunden“-Status bei Speicherfehlern. Lokaler Header-Schutz bleibt wirksam.
- Wirklicher lokaler SQLite-Upgradepfad 2→3, Erhalt sämtlicher Altzeilen/Revisionen/SQL-Prüfsummen, Wiederöffnung und vollständiger Rollback bei widersprüchlicher Tabelle.
- Provider-Repository: ownergebundene Platzhalter, nur gesperrte/cancelled Jobs, Payloadhash, aktuelle Quellrevision, idempotente Vorbereitung, CAS-Cancellation, keine ausführbaren Zustände oder Credential-Spalten.
- Verbindungen-UI: vier erlaubte Einrichtungszustände; unterschiedliche Plattform-/Nutzerfreigaben; unbekannte oder „connected“ behauptende Daten werden abgewiesen; rein lesender Client, Fehler-/Loadingzustände, Schutz gegen wiederholte/verspätete Antworten, Escaping und native aufklappbare Hinweise.

Die unabhängige Nachprüfung hat zusätzlich 240 rein speicherbasierte Tests jeweils unter UTC/Los_Angeles/Tokio und die Syntaxprüfung selbst ausgeführt. Der echte Buildcode wurde zweimal mit ausschließlich abgefangenen Dateischreibvorgängen ausgeführt: Beide Ergebnisse waren byteidentisch zum erzeugten Worker, sämtliche 17 eingebetteten Assets stimmten mit ihren Quellen überein. Der echte lokale Migrationsconstructor wurde zusätzlich mit Memory-SQLite für Upgrade, Wiederstart und Fehler-Rollback geprüft. Keine neuen konkreten Blocker für den ausdrücklich nicht gehosteten Vorbereitungsstand.

D1/R2 werden in diesen Tests durch kompatible SQLite-/Memory-/Dateiadapter repräsentiert. Keine Testanfrage kontaktiert einen Social-Provider oder eine echte Cloud-Datenbank. Das Worker-Artefakt enthält keine Provider-Publisher oder externen Provider-Transporte.

## Offene Live-Nachweise

Keine Site-ID oder Hostingkonfiguration angelegt, keine private oder öffentliche Runtime bereitgestellt. Tatsächliche Dispatch-Identität mit mehreren Besuchern, gehostete D1-Migrationen, R2-Quoten, Sicherungen und Cloud-Neustartverhalten bleiben offen. In der vorhandenen Umgebung war keine Wrangler-/workerd-Runtime verfügbar; es wurde kein alternativer Server- oder Sicherheitsweg eingerichtet.

Keine OAuth-App, Tokenablage, Konto-Verknüpfung, Providerroute, Testübertragung, Social-Veröffentlichung oder Hintergrundjob aktiviert. Read-only Einrichtungszustände und gesperrte Jobvorbereitung sind keine Providerintegration. Für spätere echte Freigaben gelten `sites-runtime.md` und `provider-preparation.md`.
