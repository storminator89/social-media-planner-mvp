# Verifizierte Tests

## Vollständige integrierte QA

| Lauf | Ergebnis |
| --- | --- |
| UTC | 1408 bestanden, 0 fehlgeschlagen |
| America/Los_Angeles | 1408 bestanden, 0 fehlgeschlagen |
| Asia/Tokyo | 1408 bestanden, 0 fehlgeschlagen |
| JavaScript-Syntaxprüfung | bestanden |
| Worker-Build als npm-pretest | in allen drei Läufen bestanden |

Diese Zahlen gelten für die getrennte QA-Kopie mit dem aktuellen Integrator-Backend/API3/Workspace-Planning plus den 26 UI-Deltas. Sie gelten nicht für den alten Backend-Sockel im isolierten UI-Quellbaum. Der vorletzte Snapshot hatte 1402 Tests; sechs neu übernommene Backendregressionen ergeben die finalen 1408. Keine Assertions wurden für dieses Ergebnis entfernt.

Gesamter UI-Testsatz: **427/427 bestanden**. Der generierte Worker enthält 37 Assets (766054 Bytes); er wurde nicht registriert oder veröffentlicht. Laufzeit: Node.js v24.22.1.

## Enger eigener Testsatz

110 neue Prüfungen in vier Dateien:

- `posting-times.test.mjs`: 27, Settings-Validierung, CAS, Bestätigung, kein Retry, Receipt und Lifecycle.
- `saved-queue.test.mjs`: 29, echte gespeicherte Regeln, fehlende/leere/pausierte Kanäle, gemeinsame Zeit, Revision und bewusster Ersatz.
- `editor-timing.test.mjs`: 32, fester UTC-Instant, beide Herbst-Folds, explizite Neuplanung, Ideen-/Draft-Übergang und Workspace-Kontext.
- `workspace-planning.test.mjs`: 22, Legacy-Abwesenheit, exakte Receipts, Canonical UTC, Bounds, Descriptor-Snapshots und verletzte Bindungen.

Zusätzlich `schedule-model.test.mjs` sowie aktualisierte bestehende UI2-Fixtures und App-Funktions-/Lifecycle-Tests. Die vorhandenen YouTube-, LinkedIn-, Unsicherheits- und Undo-Regressionen liefen in der Vollsuite mit.

## Befehle

- `TZ=UTC npm test`
- `TZ=America/Los_Angeles npm test`
- `TZ=Asia/Tokyo npm test`
- `npm run check`
- `node --test tests/ui/posting-times.test.mjs tests/ui/saved-queue.test.mjs tests/ui/editor-timing.test.mjs tests/ui/workspace-planning.test.mjs`

Die vollständigen Laufprotokolle liegen im getrennten internen QA-Arbeitsstand; sie sind nicht Bestandteil dieses Quellpakets. Tests und Eigenprüfung sind keine Behauptung einer bereits abgeschlossenen unabhängigen Freigabe. Diese wird vom Integrator gesondert koordiniert.
