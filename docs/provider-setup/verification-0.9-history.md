# Verifikation: Version 0.9.0

Stand: 7. November 2026. Gespeicherte Posting-Zeiten auf geprüftem 0.8.0, additive Migration 0008, Planer-API 3 und UI-State 2. Arbeitsfassungs-API bleibt Schema 1 mit optionalem exaktem Planungskontext. Keine aktive Providerkonfiguration oder gehostete 0.9-Laufzeit wurde durch dieses Inkrement eingerichtet.

## Eigene vollständige Prüfung

**1408/1408 Tests** bestanden am finalen integrierten Produktstand jeweils unter UTC, America/Los_Angeles und Asia/Tokyo, ohne Skips. Vollständige JavaScript-Syntax einschließlich erzeugtem Worker ist grün. Wiederholte Builds erzeugen identische Bytes. Der dependency-freie Worker umfasst **37 Assets, 766054 Bytes**, SHA-256 `0a5574323f5188a663d1fed919cd54d00e966650e9697b956be84f51916cfd84`.

Der Testsatz enthält 427 UI-Tests und 110 neue gezielte Settings-/Slot-/Timing-/Workspace-Consumer-Prüfungen. Reale Client-, Adapter-, Handler- und SQLite-Kompositionen prüfen vollständige API3-Snapshots, alte Clients, CAS/Mehrtab, gemeinsame freie Slots, unabhängige Variantenbelegung und unveränderte bestehende Termine nach Regeländerung. Fold-/Gap-Regeln, feste UTC-Sekunden/Millisekunden sowie manuelles Entkoppeln, Entwurf, Idee und Duplikat sind ausdrücklich abgedeckt.

Arbeitsfassungen erhalten die Anwesenheit ihres optionalen `planning`-Feldes exakt. Der atomare SQL-Guard blockt Altclient-Downgrades; Lost-Commit-Receipts binden auch den vollständigen Planungskontext. Legacy-Abwesenheit wird beim Lesen nicht automatisch aufgewertet. Ein konkurrierender rich/legacy Save darf jeweils der legitime CAS-Gewinner sein; der Race-Test setzt keine Hash-Reihenfolge voraus.

Der tatsächliche lokale Migrationsconstructor wurde von 7 auf 8 mit befüllten alten Tabellen einschließlich Workspace- und Credential-Zeilen geprüft. Wiederstart, Indexkollision, veränderter und zukünftiger Ledger sind abgedeckt. Erfolgreicher Upgrade erhält alle alten Bytes und ergänzt nullable Spalten/kurze Digestnachweise; Fehler rollen beide Spalten, neue Tabelle und Ledger zurück. Alte Clientmodule sind als unveränderte Regression-Fixtures enthalten. Der Server und die UI müssen zusammen aktualisiert werden.

## Unabhängige Prüfung und behobene Befunde

Die unabhängige abschließende **Vollsuite bestand ebenfalls 1408/1408 in allen drei Zeitzonen**, plus Syntax. Die enthaltene Buildprüfung erzeugte je Lauf zwei getrennte temporäre Outputs und bestätigte Bytegleichheit zum genannten Worker. Auf genau diesem Artefakt bestand zusätzlich eine eigenständige WebAPI-only-VM ohne Node-process, globales Fetch oder dynamische Codegenerierung: Schedule-Save, Regeländerung ohne Terminbewegung, Ownertrennung, rich Workspace und Legacy-Downgrade mit 409, exaktes Undo trotz pausierter Regel, anonymer Zugriff mit 401 sowie deaktiviertes OAuth mit 503.

Die unabhängigen Settings-Controller→UI-Normalizer→Adapter→Worker→SQLite-Proben prüften bestätigten Save, nach Commit kaputte 200-Antwort und fremden Tab-CAS. In allen Fällen blieben vorhandener UTC-Termin und Variantenmetadaten erhalten; Unklarheit oder 409 sperrten Wiederholung und hielten die Eingaben kopierbar. Der Workspace-Consumer bestand 147 fokussierte Tests und fünf zusätzliche echte Client→API-Roundtrips einschließlich beider Fold-Vorkommen; ein unklarer Commit wurde mit genau einem PUT abgeglichen.

Zwei konkrete Fehler wurden vor Abschluss behoben und unabhängig mit den ursprünglichen Repros nachgeprüft:

- Nach einer tatsächlich committeten Queue-Löschung konnte eine kaputte 200-Erfolgsantwort oder ein mehrdeutiger Fehlerstatus den gehaltenen kanonischen Ursprung verlieren. Der Adapter validiert Saveantworten vor Snapshotwechsel und hält bei unbekanntem Ausgang nur einen begrenzten Kandidaten. Erst ein passender privater Digest bestätigt ihn.408/425/429 und unerwartete Antworten gelten nicht pauschal als sichere Ablehnung. Es gibt keinen automatischen Retry.
- Localeabhängige ID-Sortierung erzeugte verschiedene Restore-Digests für identische Bestands-IDs. Hashrelevante Sortierung verwendet jetzt deterministischen Code-unit-Vergleich. Separate Prozesse unter en_US, de_DE und tr_TR ergeben denselben Digest; UI-Texte wurden nicht unnötig umsortiert.

Alle 26 Dateien des finalen UI-Komponentenmanifests sind identisch übernommen, öffentliche und serverseitige Adapter-/Workflowkopien bytegleich. Keine offenen konkreten Produktquellbefunde im geprüften Umfang. Das ist keine native Sites-, D1-, Auth- oder Provider-Livefreigabe.

## Grenzen und unveränderte Bereiche

Die 22 OAuth-/Provider-/YouTube-Module und SQL 0001–0007 bleiben bytegleich 0.8.0. Keine neuen Grants, Secrets, externen Konten, Uploads, Providerposts oder Hostingänderungen. LinkedIn-Versand, Refresh/Reconnect und Hintergrund-Scheduler bleiben gesperrt bzw. nicht implementiert. Eine Posting-Zeit ist redaktionelle Planung, keine Versanderlaubnis.

Der lokale Server hat einen gemeinsamen Testbesitzer, keine reale Mandantenanmeldung. Echte Sites-Dispatch-Rückkehr, physisch private D1/R2-Bindings, Cloudmigration, Kosten/Quoten, Backup und Zwei-Besitzer-Browserprüfung sind gesonderte Betriebsnachweise. Eine parallel separat autorisierte private Testbereitstellung eines älteren geprüften Standes ersetzt diese 0.9-Abnahme nicht.

Queue-Undo ist auf 60 Sekunden und 100 Nachweise begrenzt und benötigt ein bereits gehaltenes Original; der Serverhash ist kein Papierkorb. Die Workspace-Frist von 30 Tagen ist eine Wiederaufnahmefrist, keine Löschzusage. Bereits gestartete DB-/R2-/Provideroperationen können unklar oder spät abschließen; kein automatischer Retry wird daraus abgeleitet.
