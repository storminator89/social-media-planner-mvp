# Verifikation: Version 0.7.1

Stand: 7. November 2026. Lokales redaktionelles UI-Inkrement auf geprüftem 0.7. Keine Site veröffentlicht, keine Provider aktiviert, keine neue Migration oder API-Version. API-Schema 2 und UI-State 1 bleiben unverändert; serverseitige Editor-Arbeitsfassungen und dauerhafte kanalbezogene Posting-Zeitpläne sind nicht enthalten.

## Integrierte Tests

974 Tests jeweils unter UTC, America/Los_Angeles und Asia/Tokyo bestanden. Syntax und Worker-Build sind grün. Wiederholter Build byteidentisch, 25 öffentliche Assets. Die acht übernommenen Source-/Testdateien entsprechen exakt `editorial-labels/SOURCE.sha256`.

Neue Abdeckung: 16 UI-Regressionsfälle plus zwei tatsächliche lokale SQLite-/API-Roundtrips. Geprüft sind exakte Labels und Filterkombinationen, unveränderte kanonische Metadaten einschließlich CRLF/Whitespace/Unicode, bewusstes Parsen bearbeiteter CSV, Sentinel und HTML-Escaping, getrennte Ideenfilter, Dirty-/Async-/Mehrtab-409-Pfade, Erhalt von Varianten/Medien/Titel/Zone, zugängliche Buttonnamen sowie schreibgeschützter gespeicherter und editierbarer neuer Bild-Alttext.

Alle Modul-, Server-, Worker- und Build-/Check-Dateien bleiben bytegleich zur geprüften 0.7-Basis. Das gilt für OAuth-/Providerlogik, Planeradapter, Workflows und SQL 0001–0006. Der geänderte Worker enthält denselben Servercode mit den aktualisierten UI-Assets. Kein Übergang auf die noch separat entwickelten Migrationen 0007/0008.

## Unabhängige Nachprüfung

Die ursprüngliche isolierte UI-Prüfung bestand die damalige Vollsuite mit 973 Tests. Ein kleiner Hinweis zur Zugänglichkeit wurde vor Übernahme korrigiert: sichtbare Labels sind nun auch im expliziten Namen der Beitragsbuttons enthalten. Der zusätzliche Regressionstest sowie die fokussierte Nachprüfung mit 229 UI-/Integrationsfällen bestanden.

Die erneute unabhängige Prüfung des vollständigen 0.7.1-Baums bestand 974/974 Tests ohne Skips, Syntax einschließlich generiertem Worker und einen eigenen reproduzierbaren Build. Der Worker entspricht bytegenau dem integrierten Artefakt mit 25 Assets. Alle acht Dateien stimmen mit UX-Quelle/Implementierungsmanifest überein; Module, Server, Worker, Buildskripte und SQL 0001–0006 sind unverändert zur Basis.

Fünf zusätzliche unabhängige Proben bestanden: echte SQLite-Roundtrips mit CRLF/Whitespace/Duplikaten und einzelnen UTF-16-Surrogaten durch Save, Duplizieren, Löschen/Undo und Neustart; tatsächlicher Select-/Change-Handler; tatsächlicher Alttext-Handler für gespeicherte und neue Bilder; Dirty-/Abbruch-/Fehlerpfade. Leere Labels werden bereits von UI und Backend abgewiesen, daher besteht im zulässigen Zustand kein Sentinel-Konflikt. Escaping und zugängliche Namen wurden geprüft, ohne eine zusätzliche Browser-/Screenreader-Laufprüfung zu behaupten.

Keine verbleibenden konkreten Release-Blocker im geprüften lokalen Quellumfang. Dies ist keine Hosting- oder Providerfreigabe. Das eingefrorene Inventar wird separat gegen diesen geprüften Arbeitsbaum gebunden.

## Grenzen und Integrität

Alle Live-Grenzen aus 0.7 gelten weiter: echte Sites-Identität, Cloud-D1/R2, Provider-App-/Scope-/Callback-Kompatibilität und ausdrücklich genehmigte Übertragungen sind weiterhin separat nachzuweisen. Keine neue Fähigkeit für Refresh, Reconnect, Hintergrundpublishing oder öffentliche Videos. Kein Gesamtversprechen von Buffer-Gleichwertigkeit.

Das vollständige Quellinventar wird im Root-Manifest gebunden. `YOUTUBE-UI-v0.7.sha256` ist ein unverändertes historisches Komponentenmanifest; dessen damalige index.html ist nicht das aktuelle Labels-HTML. Es ist ausdrücklich keine aktuelle Releaseprüfung. Historische Nachweise einschließlich des WebAPI-only-Workerablaufs stehen in `verification-0.7.md`.

REA v60 wurde erneut berücksichtigt: vollständige Quellen erfordern normale Source-/Testprüfung statt REA-Engine/Decompilation. Es wird weder eine Engine-Ausführung noch ein Live-Capture behauptet.
