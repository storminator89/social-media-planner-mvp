# Verifikation: Version 0.8.0

Stand: 7. November 2026. Arbeitsfassungen auf geprüftem 0.7.1. Keine Site veröffentlicht, keine Provider aktiviert. Additive Migration 0007; Planer-API 2 und UI-State 1 unverändert, eigene Workspace-API 1. Queue 0008/API 3 sind nicht enthalten.

## Integrierte Prüfung

1146/1146 Tests bestanden am finalen Produktstand jeweils unter UTC, America/Los_Angeles und Asia/Tokyo, ohne Skips. Vollständige Syntax einschließlich generiertem Worker sowie ein eigener reproduzierbarer Build sind grün. Der Worker umfasst 30 Assets und 643814 Bytes; SHA-256: `2f7ca8ef03d0a792803ba3f6a5777983c22af18d558efc95114459e0d533c32f`.

Die übernommenen Workspace-UI-/Client-/Controller-/Restore-Tests prüfen tatsächliche App-Funktionskörper und synthetische Unterbrechungen. Das Datenmodul besitzt 67 Tests für vollständige Eingaben, Ownergrenze, CAS/Mehrtab, exact writeId-Readback, Quoten, Ablauf/Discard, minimalen geschlossenen Receipt, Medienbesitz und Herkunft. Der Bodyreader kopiert geliehene Bytes sofort und prüft monotone Fristen neben dem Timeouttimer.

Zusätzliche integrierte Tests führen realen Client, Controller, Worker-/Loopback-Handler und SQLite zusammen: unvollständige CSV/Labels, verlorene Commitantwort, genau passender Save-/Discard-Readback, keine zusätzlichen Postwrites, Besitzertrennung, fixed Origin/CSRF, fehlende Konfiguration/Migration, exakter Snapshot-Getter, echter Serverneustart und ownergeprüfte Bild-/Alttext-/Omission-Fälle. Der tatsächlich erzeugte Worker wird in einer WebAPI-only-VM ohne Node-Globals oder globalen Netzaufruf ausgeführt.

Der tatsächliche LocalDatabase-Constructor wird von 6 auf 7, bei Neustart, absichtlicher Indexkollision und verändertem/zukünftigem Ledger geprüft. Frühere SQL und alle bestehenden Daten bleiben erhalten; Fehler rollen neue Tabelle und Ledger gemeinsam zurück. Alte Migrationstests wurden nur um den neuen Ledgerstand und die ausdrücklich zusätzliche Tabelle ergänzt.

## Unabhängige Prüfung

Der finale unabhängige Integrationsnachlauf bestand 1091/1091 ausgewählte Read-only-Tests jeweils unter UTC, America/Los_Angeles und Asia/Tokyo sowie Syntax. Dateisystem-/Prozessschreibtests waren in diesem unabhängigen Satz bewusst ausgeschlossen; die eigene Vollsuite umfasst sie. Tatsächlicher LocalHandler- und Constructorcode wurden zusätzlich mit In-Memory-SQLite geprüft. Zwei begrenzte UI-Lifecyclefälle wurden geschlossen: entfernte UI-Fassaden führen keine alten Listener/Asyncfortsetzungen mehr aus; verspätet abweichende Eingabe nach bestätigtem Postsave/Workspaceclosure bleibt als nur lokal/ungesichert sichtbar, statt eine laufende Sicherung vorzutäuschen. Interner Close und beforeunload warnen konsistent. Der unabhängige UI-Nachlauf bestand 304 UI-Tests, darin 93 Workspacefälle, zusätzlich eigene Lifecycle- und App/Controller-Proben sowie fünf beforeunload-Kombinationen. Alle 15 UI-/Testdateien stimmen mit dem finalen Komponentenmanifest überein.

Der echte Buildcode wurde unabhängig zweimal mit abgefangenen Dateischreibvorgängen ausgeführt: byteidentisch zum oben genannten Worker und zu allen 30 Asset-Bodies. Der tatsächliche Worker bestand in einer WebAPI-only-VM ohne Node/globales Fetch den unvollständigen Save, stale 409, fremden Owner 404/leere Liste, verlorene Discardantwort mit minimalem 410-Beleg, Lebenszeitquote und unveränderte Posts. Acht eigene Lifecycle-/Cleanup-Proben auf den integrierten Pfaden bestanden. Keine verbleibenden konkreten Quell-/Integrationsblocker in diesem Prüfumfang; keine native Sites-/D1-/Livefreigabe.

## Unveränderte Grenzen

OAuth-/Provider-/Uploadlogik und SQL 0001–0006 bleiben bytegleich 0.7.1. Außer dem readonly Snapshot-Getter sind Planermodule und öffentliche Datenclients unverändert. Eine geforderte Herkunftsrevision stammt niemals aus späteren Workspace-Reads. Normale Posts werden nur durch bewusste normale Saves verändert.

Echte Sites-Dispatch-Identität, physisch private D1-Bindings, Cloudmigration und Zwei-Besitzer-Runtimeprüfung bleiben offen. Kein Refresh, Reconnect, Scheduler oder neuer aktiver Provider. Workspace-30-Tage-Frist ist eine Wiederaufnahmefrist, keine Löschzusage; 20 aktive/100 lebenszeitliche Identitäten, keine automatische Eviktion. Keine Zusicherung von Backup oder unbegrenzter Wiederherstellung.

Das Root-Manifest bindet das aktuelle Inventar. `editorial-labels/SOURCE-v0.7.1.sha256` und `YOUTUBE-UI-v0.7.sha256` sind historische Komponentenmanifeste, keine aktuelle Releaseprüfung. Die älteren Nachweise bleiben in `verification-0.7.1.md` und vorherigen Versionsberichten erhalten.

REA v60 wurde erneut angewandt: vollständiges Quellrepository, daher normale Source-/Test-/Browserprüfung, keine REA-Engine oder Decompilation und kein fremder Live-Capture.
