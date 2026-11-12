# Takt · Social-Media-Planer

Quell-Snapshot des Entwicklungsstands v84. Keine Zugangsdaten, Nutzerdaten oder Hosting-Konfiguration enthalten. Dieser Snapshot aktiviert keine Social-Media-Verbindung und veröffentlicht keine Beiträge.

## Lokal starten

Node.js ab 22.13, ohne Paketinstallation:

```sh
npm run dev
npm run check
npm run build
```

Der lokale Server ist ausschließlich für Entwicklung auf Loopback gedacht. Er verwendet einen gemeinsamen Testarbeitsbereich ohne Anmeldung. Keine echten Kundendaten eingeben oder den Entwicklungsserver öffentlich betreiben.

## Enthalten

- Kalender, Entwürfe, Ideen, Labels und Posting-Zeiten
- Beitragsvorlagen und direkte Navigation zu fehlerhaften Eingaben
- Kanalvarianten, Vorschauen und bildbasierte Medienbearbeitung
- Lokale Video-Auswahl, Prüfung und Bearbeitung unterstützter Formate
- Arbeitsfassungen, Archiv und Workspace-Import/-Export
- Servermodule für Provider-Verbindungen; Aktivierung und Berechtigungen werden getrennt eingerichtet

OAuth-Vorbereitung ist kein Nachweis einer funktionsfähigen Live-Verbindung. Automatischer Versand, Analytics und Teamfunktionen sind nicht als vollständig verfügbar zugesichert.

## Tests und Snapshot-Grenzen

Dieser bereinigte Quell-Snapshot enthält zwei zuvor freigegebene synthetische Video-Fixtures. 60 weitere Binärfixtures und interne Dokumentation wurden bis zur gesonderten Prüfung ausgeschlossen. Deshalb ist die vollständige Testsuite aus diesem Quell-Snapshot noch nicht reproduzierbar. Nicht als vollständiges Backup bezeichnen.

Die vollständige private v84-Quelle wurde getrennt geprüft. Dieser bereinigte öffentliche Snapshot lässt ungeklärte Testmedien und interne Dokumentation bewusst weg; dadurch sind Teile der Tests nicht reproduzierbar.

Die eingebauten Provider-Endpunkte und Test-Domains sind keine Zugangsdaten. Eigene Provider-Apps, sichere serverseitige Secrets und passende Berechtigungen sind für echte Verbindungen erforderlich.

## Änderungen bis v84

- Mehrkanal-Beiträge gemeinsam einplanen und verlustfrei in Entwürfe zurücknehmen.
- Rein lesende Kanalstatusansicht mit getrennten Inhalten, Status und Terminen.
- Kanalweise Suche und Statusfilter, ohne Änderungen an den Beiträgen.

- Wochenzeiten zwischen Kanälen kopieren, mit Vorschau und explizitem Speichern; Zielzeitzone und bestehende Termine bleiben erhalten.

## Prüfung und Grenzen

Dieser Quellcheckpoint entspricht dem bereinigten App-Code des privaten v84-Stands. Generierte Build-Dateien sind nicht enthalten. Die beiden synthetischen Testmedien sind hashgleich zu den zuvor öffentlichen Dateien. Keine Datenbank, Medienbibliothek, Zugangsdaten, lokalen QA-Daten oder Hosting-Konfiguration enthalten. Kein vollständiges Backup und keine automatische Veröffentlichung von Beiträgen.

Erneute Prüfung am 12. November 2026: Syntax und Build erfolgreich; erzeugter Worker byteidentisch zum privaten v84-Build. Vollständiger Testaufruf des bereinigten Snapshots: 3936/4147 bestanden, 211 fehlgeschlagen. Davon 210 durch ausgeschlossene Testartefakte; zusätzlich ein zeitabhängiger YouTube-Test. Der separate YouTube-OAuth-Nachlauf bestand 152/152. Tests wurden nicht abgeschwächt.
