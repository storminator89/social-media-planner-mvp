# Gespeicherte Posting-Zeiten: UI-Übergabe

## Umfang

Isolierte Erweiterung auf dem geprüften Stand 0.8.0. Der Dialog „Posting-Zeiten“ speichert kanalweise Wochenzeiten, IANA-Zone, Pause, Mindestabstand und eine bewusste Wahl für die doppelte Herbststunde. Der Composer findet gemeinsame freie Zeiten und übernimmt einen Vorschlag erst nach Auswahl. Bereits geplante Beiträge werden durch Regeländerungen nie verschoben. Betroffene Beiträge tragen „Termin prüfen“.

Keine Veröffentlichung, Anbieteranmeldung, Dateiuploads, neuen Dienste oder Remoteänderungen. Die bestehenden LinkedIn-/YouTube-Module sind unverändert.

## Integration

Historischer Komponenten-Handoff: Im vorliegenden 0.9-Release sind die unten beschriebenen Dateien bereits gezielt integriert und der Ideenhelper gespiegelt. Die folgenden Kopierhinweise beschreiben die Herkunft, nicht noch offene Arbeiten. Der Root-Verifikationsbericht enthält die abgeschlossene Integrationsprüfung.

Nur die 26 Dateien aus `DELTA-FILES.txt` übernehmen. Der übrige isolierte Baum enthält absichtlich den alten Backendstand und darf nicht als komplettes Release kopiert werden.

- 12 Produktdateien unter `public/`, 14 UI-Testdateien.
- `public/workflows/posting-schedules.mjs` ist bytegleich zum finalen Integrator-Helfer (SHA-256 `f1fbd899d42876a82f55f2705d92fdd9c40a60ccb4b97b802b608b6ce59e9023`). `queue.mjs` stammt ebenfalls aus dem abgestimmten Schedule-Modul.
- Den engen eigenen `public/workflows/ideas.mjs`-Diff zusätzlich nach `modules/workflows/ideas.mjs` spiegeln. `ideas-workflow.patch` dokumentiert ihn. Neue Idee/Entwurf tragen explizit beide Timingfelder als null; explizit ausgewählte gebundene Fold-Zeit wird beim Ideenübergang erhalten.
- Backend/API3, UI-State2-Adapter, 0008, die bereits geprüfte Workspace-Planning-Erweiterung und deren Migrationen kommen vom Integrator, nicht aus diesem isolierten Baum.
- Der in der finalen QA verwendete Adapter hat in beiden Pfaden SHA-256 `971238c1aed891aaef27b4f2ec2608e5f2373f06e3c0827cb448cf468c10bb52`.

## Verträge und Sicherheit

- UI-State2 mit `revision`, vollständigen `channels` einschließlich `postingSchedule`, sowie expliziten `posts.scheduledInstant` und `scheduleBinding`. UI-State1 bleibt abgewiesen; keine verlustbehaftete automatische Aufwertung.
- Settings erfassen die Planungsrevision beim Öffnen. Erst „Zeiten speichern“ schreibt. Betroffene vorhandene Termine erfordern eine zweite Bestätigung. Konflikt, unklare Antwort oder falsches Receipt sperren weitere Schreibversuche; Eingaben bleiben kopierbar. Kein automatischer Retry.
- Slotwahl setzt lokale Zeit, IANA-Zone, UTC-Instant und Binding zusammen. Auswahl ersetzt einen vorhandenen festen Termin nur nach ausdrücklicher Bestätigung. Draft/Kopie leert canonical Timing. Manuelle Bearbeitung einer Bindung verlangt „Bindung lösen & manuell planen“.
- Unveränderte bestätigte feste UTC-Zeiten bleiben einschließlich Sekunden/Millisekunden und Fold-Vorkommen erhalten. Neue mehrdeutige manuelle Termine werden nicht geraten. Vorschläge nennen Offset und IANA-Zone; DST-Lücken werden übersprungen.
- Neue Workspace-Writes enthalten immer `planning:{schemaVersion:1,scheduledInstant,scheduleBinding}`. Alte gespeicherte Payloads ohne planning bleiben beim Lesen/Receipt exakt legacy. Fehlender Kontext wird nicht erfunden.
- Nur dieselbe bestätigte Quelle mit identischer lokaler Projektion und identischem Kontext darf ihre bestätigte Zeit wiederverwenden. Alte Quelle, neue Kopie oder Legacy-Zeit erfordern eine sichtbare bewusste Neuplanung. Rich Kontext bleibt bis zu dieser Entscheidung erhalten. Wiederaufnahme führt keinen Postsave aus.
- Workspace-Quellrevision bleibt die beim Editoröffnen erfasste `store.plannerRevision`. Bestehende Teardown-, Late-Event-, Unsicherheits-, 409- und Beforeunload-Abwehr bleibt erhalten.

## Module

- `posting-times-controller.js`: lokale Settings-Transaktion, CAS, Bestätigung, Receipt und Lifecycle.
- `posting-times-ui.js` / `.css`: responsiver Dialog, kurze Normalansicht, optionale erweiterte Regeln, Fokus/Close-Guard.
- `saved-queue-panel.js`: reine Vorschlagssuche und ausdrückliche Auswahl; schreibt selbst nichts.
- `editor-timing.js`: bestätigte Zeit, bewusste Entbindung und sichere Workspace-Recovery.
- `workspace-client.js`: exakter optionaler Planning-Normalizer; keine Legacy-Defaultwerte oder fremden Serverimports.

## Verifikation

Siehe `TEST-RESULTS.md` und `BROWSER-QA.md`. Die vollständige Suite läuft in der getrennten integrierten QA-Kopie, nicht mit dem absichtlich alten Backend des isolierten UI-Baums. `SOURCE.sha256` bindet die 26 Delta-Dateien. Kein unabhängiger Review wird durch Eigenprüfung ersetzt; Integrator koordiniert die Nachprüfung.

REA v60 wurde gelesen und angewandt: vollständiger Quellbaum bedeutet normale Quellprüfung, nicht REA-Setup/Providerdiagnose oder Decompilation. Die interaktive Laufzeitprüfung betrifft ausschließlich die eigene App; daraus werden keine unbelegten Buffer-Laufzeiteigenschaften abgeleitet.
