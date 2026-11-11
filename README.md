# Takt · Social-Media-Planer

Quell-Snapshot des Entwicklungsstands v79. Keine Zugangsdaten, Nutzerdaten oder Hosting-Konfiguration enthalten. Dieser Snapshot aktiviert keine Social-Media-Verbindung und veröffentlicht keine Beiträge.

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

Die vollständige private v79-Quelle ergab in einem isolierten Lauf 4307 von 4309 erfolgreichen Tests: ein fehlendes historisches v46-Rollback-Archiv und ein zeitabhängiger YouTube-Transporttest. Der separate YouTube-Nachlauf bestand alle 118 Tests. Syntaxprüfung und Worker-Build bestanden. Der Worker dieses bereinigten Snapshots ist byteidentisch zum geprüften privaten v79-Quellbuild.

Die eingebauten Provider-Endpunkte und Test-Domains sind keine Zugangsdaten. Eigene Provider-Apps, sichere serverseitige Secrets und passende Berechtigungen sind für echte Verbindungen erforderlich.

## Erneute Prüfung des öffentlichen Teilbackups

Am 11. November 2026: Syntaxprüfung und Worker-Build erfolgreich. Die Tests dieses bereinigten Snapshots ergeben 3903 bestanden und 210 fehlgeschlagen (4113 gesamt). Ausgeschlossene Testmedien, Dokumentationsdateien und das fehlende historische v46-Archiv verhindern einen vollständigen erfolgreichen Testlauf. Die Tests wurden nicht abgeschwächt. Die beiden enthaltenen synthetischen Medien sind hashgleich zu den bereits veröffentlichten v30-Dateien. Generierte Build-Dateien sind nicht enthalten.

Dies ist ein v79-Quellcheckpoint, nicht automatisch der neueste private Entwicklungsstand. Kein Backup von Datenbank, Medienbibliothek, Zugangsdaten oder Hosting-Konfiguration.
