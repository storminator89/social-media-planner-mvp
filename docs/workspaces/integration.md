# Separate Arbeitsfassungen in Takt 0.8

## Tatsächlicher Stand

Der lokale Server und der native Worker-Einstieg enthalten denselben Workspace-Datenvertrag. Lokale SQLite-Persistenz ist implementiert und getestet. Es wurde keine Site angelegt, kein D1 bereitgestellt und keine Cloudidentität verifiziert. Kein OAuth-/Provider-/Publishingcode wird durch dieses Inkrement geändert oder aktiviert.

Quellmodule: `modules/workspaces/`. Migration: `server/0007_editor_workspaces.sql`. Oberfläche: `public/workspace-*.js` und `workspace.css`. API ist `/api/planner/workspaces` mit eigenem Schema 1; die normale Planung bleibt API 2/UI-State 1.

## Konfiguration und Herkunft

Hosted verlangt feste serverseitige `TAKT_SITE_ID` und `TAKT_SITE_ORIGIN`, eine physisch Site-private `DB` sowie den unveränderten vertrauenswürdigen Sites-Dispatch-Owner. Kein Service-Access-Bearer ersetzt diese Besucheridentität. Kein requestbezogener Host-/Originheader dient als Site-Konfiguration. Falscher Origin und fehlender Schreibmarker werden vor Mutation abgewiesen; keine CORS-Freigabe.

Der lokale Devserver bindet nur 127.0.0.1 und konfiguriert exakt `http://127.0.0.1:<Port>`. Das Bibliotheks-Handlerdefault ist ausdrücklich `http://localhost:3000`; Einbettungen können einen anderen festen Loopback-Origin angeben. Ein alternativ geschriebener Host ist für die neue Route kein impliziter Alias. Eingehende behauptete Besucherheader werden lokal abgewiesen. Der nach dieser Grenze erzeugte interne Request wird an die Workspace-API weitergereicht, sodass ein transferierter Body nicht nochmals am alten Request gelesen wird.

Der readonly Getter `store.plannerRevision` kommt aus genau dem zuletzt bestätigten privaten Planer-Snapshot. Die UI bindet ihn an den geöffneten Quellpost und ersetzt ihn nicht durch spätere Workspace-Reads. Jeder Wiederaufnahmeversuch liest die Planung neu. Bei anderer globaler Revision, fehlender Herkunft oder gelöschtem Original ist nur eine ausdrückliche neue Kopie möglich. Auch eine Änderung an einem anderen Post führt konservativ zu dieser Einschränkung.

## Integrität und Grenzen

Unvollständige Zeit-/CSV-Eingaben bleiben als Arbeitsfassung erhalten. Eine Arbeitsfassung ist kein gültiger Planerpost: ungültige oder in nativen Feldern nicht verlustfrei darstellbare Werte können kopiert werden, statt still bereinigt zu werden. Lokale Dateien werden nicht hochgeladen und bleiben als fehlend markiert. Gespeicherte Bilder werden über ownergeprüfte IDs aufgelöst. Ein Alttextkonflikt verlangt bewusste Auswahl, keine Metadatenmutation.

Unklarer Save behält ID, writeId, erwartete Revision und vollständigen Inhalt. Nur passender Readback bestätigt denselben Commit.404 oder anderer Inhalt autorisieren keinen Retry/neue Ersatz-ID. Ein bestätigter Postsave wird nicht wiederholt, wenn das anschließende exakte Workspace-Schließen scheitert. Konfliktfassungen bleiben bestehen. Browsercrash vor bestätigtem Save kann noch lokale Eingaben verlieren.

Die 30-Tage-Frist betrifft normale Wiederaufnahme, keine Löschzusage. Maximal 20 aktive und 100 lebenszeitliche Identitäten pro Site/Owner; geschlossene Payloads bleiben gespeichert, sind aber über normale Load-/Discard-Endpunkte nicht lesbar. Kein automatisches Purge, kein unbeschränktes Backup. Details und exakte DTOs stehen in `backend-contract.md`.

Keine Queue 0008/API 3 in diesem Stand. Individuelle gespeicherte Posttermine funktionieren unverändert; dauerhafte kanalweise Posting-Zeitpläne bleiben separat. Für native Sites/D1 sind Dispatch, private Bindings, Migration, Transaktions-/Antwortverträge und Zwei-Besitzer-Browserabläufe weiterhin nachzuweisen.
