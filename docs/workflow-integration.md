# Social-Media-Planer: Funktions- und Integrationskonzept

Stand: 7. November 2026. Eigenständige Gestaltung und Logik, keine portierte Fremdanwendung.

## Einsatzbereiter Umfang

`workflows.mjs` ist ein dependency-freies ES-Modul für Browser, Node und Worker. Es verarbeitet Entwürfe, Varianten, Prüfzustände, redaktionelle Termine, Datumsraster, Speicherzustände und kanalweise Ergebnisse. Es enthält absichtlich keinen API-Client, kein OAuth, keine Hintergrundveröffentlichung und keine Zugangsdaten. Die 25 Tests in `workflows.test.mjs` werden mit `node --test workflows.test.mjs` ausgeführt.

Die echte Produktfunktion der ersten Version ist eine **lokale Redaktionsplanung**. Texte erstellen, Varianten pflegen, prüfen, terminiert vormerken und wiederfinden funktionieren unabhängig von Social-Konten. „Vorgemerkt“ bedeutet nicht „an den Provider übermittelt“. Auf der Oberfläche steht dauerhaft: **„Lokaler Redaktionsplan · Keine automatische Veröffentlichung“**. Speichererfolg heißt **„In diesem Browser gespeichert“**, nicht „In deinem Konto gesichert“.

## 1. Oberfläche und täglicher Ablauf

### Start / Heute

- Der nächste sinnvolle Schritt steht oben: ein unfertiger Beitrag, eine offene Prüfung oder der nächste vorgemerkte Termin.
- Karten zeigen tatsächliche Inhalte und Zustände. Keine erfundenen Reichweiten, verbundenen Konten oder veröffentlichten Beiträge.
- Beispieldaten sind ausdrücklich als Beispiele gekennzeichnet und lassen sich getrennt vom eigenen Inhalt entfernen.
- Ein leerer Plan bietet „Ersten Beitrag erstellen“ statt eines leeren Kennzahlendashboards.

### Composer

Desktop: Kanalauswahl und Texteditor links, eine umschaltbare Kanalvorschau rechts. Mobil: beschrifteter Wechsel zwischen **Schreiben**, **Medien** und **Vorschau**, mit dauerhaft erreichbarer Speichern-/Vormerken-Aktion. Kein enger Universal-Dialog als gesamte Arbeitsfläche.

1. Kanäle wählen. Jeder Chip hat Netzwerkname, Kontoname bzw. „Planungskanal“, Auswahlzustand und eine sichtbare Aussage zur Verbindung.
2. Basistexte und Medien bearbeiten. Eine neue Variante übernimmt die aktuelle Basis.
3. Pro Kanal wahlweise „Nutzt Basis“ oder „Eigene Fassung“. Ein absichtlich leerer Variantentext bleibt leer. Eine Basisänderung überschreibt keine eigene Fassung.
4. „Zur Basis zurücksetzen“ zeigt vorher an, welche eigene Fassung verworfen wird; Abbrechen erhält sie.
5. Vorschau zeigt den ungefähren Inhalt. Der Hinweis „Darstellung kann je Plattform abweichen“ verhindert eine unbelegte pixelgenaue Zusage.
6. Validierungsprobleme stehen am betroffenen Kanal/Feld und in einer zusammenfassenden Liste mit Sprunglinks. Warnungen und blockierende Fehler sind unterscheidbar.
7. Bei echtem Text-/Medienwechsel wird eine alte Freigabe ungültig. Das Modul entfernt vorsichtshalber auch die alte Planungszusage. Die UI muss davor erklären: „Die Änderung hebt Freigabe und Vormerkung auf.“
8. Lokale Hauptaktionen: „Entwurf speichern“, „Zur Prüfung vormerken“, „Termin vormerken“, „Text kopieren“. Kein grüner „Veröffentlicht“-Toast nach einer lokalen Aktion.

Medien in der ersten Version dürfen nur als verfügbar gelten, wenn ihre Bytes nach Reload wieder lesbar sind. Ein Blob-URL allein ist keine dauerhafte Speicherung. Für echte lokale Medien ist IndexedDB geeigneter als große Base64-Daten in localStorage; für kontoübergreifende Medien braucht es autorisierte persistente Dateiablage. Ladefehler, abgelaufene Medien und fehlende Alttexte bleiben sichtbar.

### Planungskalender

- Desktop: Monat plus Agenda, optional Woche; Mobil: lesbare Agenda mit Datumsnavigation statt sieben winziger Spalten.
- Alle Datumszellen und Karten sind echte Buttons. „Termin ändern“ ist die vollständige Tastaturalternative zu optionalem Drag-and-drop.
- Ungespeicherte bzw. undatierte Entwürfe stehen in einer eigenen Ablage, statt aus dem Kalender zu verschwinden.
- Karte zeigt Uhrzeit, benannte Zeitzone, Inhalt, Kanäle und Textstatus, nicht allein eine Statusfarbe.
- Monat ist immer ein vollständiges 42-Tage-Raster. Kalenderdatum und absoluter UTC-Zeitpunkt sind unterschiedliche Datentypen.
- Terminänderung kann rückgängig gemacht werden. Bei späterer Serveranbindung darf eine verspätete Antwort keine neuere Verschiebung überschreiben.

### Prüfung und Fehler

- Entwurf → In Prüfung → Freigegeben → Vorgemerkt. Änderungswunsch führt mit Pflichtbegründung zum Entwurf zurück.
- Eine Freigabe bindet sich an die genaue Inhaltsrevision. Bearbeitung invalidiert sie.
- Ohne echte Nutzerverwaltung bedeutet der Status nur eine lokale redaktionelle Markierung, keine authentifizierte Teamfreigabe. Keine fiktiven Kollegennamen oder Nachrichten.
- Spätere Versandresultate bleiben separat pro Zielkanal: nicht gesendet, in Warteschlange, sendet, veröffentlicht, fehlgeschlagen oder Ausgang unbekannt.
- Teilweise Veröffentlichung ist ein eigener Gesamtzustand. Eine Wiederholung darf ausschließlich bekannte, wiederholbare Fehler erneut versenden. Bei einem unklaren Ausgang erst beim Provider abgleichen, niemals blind wiederholen.

## 2. Klare Schnittstellen

### Beitragsmodell

- `id`, `schemaVersion`.
- `revision` und `savedRevision`: Inhaltsrevision und zuletzt bestätigte Inhaltsfassung. Editorial-Metadaten werden zusätzlich über den allgemeinen Speicheradapter persistiert.
- `base: { text, media }`.
- `targets: [{ id, channel, overrides }]`: Unterschiede mit vorhandenen Schlüsseln, nicht mit Truthiness prüfen.
- `review: { status, revision, reviewerId? / reason? }`.
- `stage`: ausschließlich redaktioneller Status.
- `plan: { instant, date, time, timeZone, revision, mode: 'editorial_only' }`.
- `deliveries`: erst von einem tatsächlich verifizierten Provider-Adapter gefüllt.
- `deletedAt`: Papierkorb statt sofortiger endgültiger Löschung.

### Exportierte Funktionen

| Funktion | Vertrag |
| --- | --- |
| `createPost(input)` | Neuer ungesicherter Entwurf. |
| `resolveVariant(post, targetId)` | Effektiver Inhalt plus Kennzeichen für abweichende Fassung. |
| `editPost(post, patch)` | Unveränderlicher Update; erhöht Inhaltsrevision und invalidiert Freigabe/Plan. |
| `markSaved(post, revision)` | Bestätigt nur eine tatsächlich gespeicherte Fassung; alte Antworten können die neue nicht bestätigen. |
| `validatePost(post, capabilities)` | Kanalweise Fehler/Warnungen. Fehlende Provider-Regeln werden als ungeprüft ausgewiesen. |
| `transitionPost(post, action, context)` | Lokaler redaktioneller Zustand, mit Speicher-, Prüf- und Zeitprüfungen. Keine serverseitige Berechtigungsprüfung. |
| `resolveLocalTime(date, time, timeZone, choice?)` | Liefert UTC-Zeitpunkt. Sommerzeitlücke lehnt ab, doppelte Zeit verlangt `earlier` oder `later`. |
| `dateKeyAt(instant, timeZone)` | Ordnet einen absoluten Zeitpunkt dem korrekten Kalendertag zu. |
| `monthGrid(year, month, weekStartsOn)` | 42 zivile Datumsschlüssel, unabhängig von Host-Zeitzone. |
| `publishingEligibility(post, services)` | Hält Providerstatus, Kontoverbindung und Versanddienst getrennt von lokaler Planung. Nur UX-Vorprüfung. |
| `summarizeDelivery(results)` | Ehrlicher Gesamtzustand einschließlich Teilresultat und unbekanntem Ausgang. |
| `retryableTargets(results)` | Nur bekannte, ausdrücklich wiederholbare Fehler. |
| `createAutosaver(writer, onState)` | Serialisierte Schreibvorgänge; `flush()` wartet auf die neueste Fassung, Fehler bleiben sichtbar und wiederholbar. |
| `createLocalStore(storage, key)` | Lokaler JSON-Speicher mit explizitem Geltungsbereich und sichtbaren Quota-/Formatfehlern. |

Der lokale Speicher prüft den Envelope, ist aber **kein vollständiger Schema-Validator für beliebige importierte Dateien**. Ein späterer Import braucht eine eigene vollständige Feldprüfung, Größenlimits und Vorschau. Nicht blind externe JSON-Strukturen mit bestehenden Objekten zusammenführen. Providertexte und Fehlermeldungen immer als Text ausgeben, nicht als HTML.

### Anbindung an die UI

1. Jede Text-/Medienänderung erzeugt mit `editPost` eine neue Revision.
2. Den Gesamtsnapshot an `autosaver.update` übergeben; nach kurzem Debounce `flush()` starten und Fehler abfangen.
3. Vor Planen/Prüfen erneut `await flush()`. Erst nach erfolgreichem Schreiben die zugehörige Inhaltsrevision mit `markSaved` bestätigen.
4. `transitionPost` auf der bestätigten Fassung ausführen. Den resultierenden redaktionellen Status erneut speichern und den Speichererfolg abwarten, bevor die UI Erfolg meldet.
5. Bei Fehler wird der Editor nicht gelöscht oder geschlossen. Text kopieren, JSON-Export und Wiederholen bleiben verfügbar.
6. Bei Navigation mit unbestätigter Fassung warnen, einschließlich neuer Beiträge. `beforeunload` nur solange wirklich ungesicherte Arbeit existiert.

Für mehrere Browser-Tabs muss ein `storage`-Ereignis eine Konfliktmeldung auslösen. localStorage bietet keine sichere atomare Mehrbenutzertransaktion. Ein lokaler Prototyp darf deshalb weder synchronisierte Teamarbeit noch konfliktfreie Mehrgerätebearbeitung versprechen.

## 3. Zeitzonen

Die UI speichert die ausgewählte IANA-Zone zusätzlich zum UTC-Zeitpunkt. „09:00 Europe/Berlin“ kann in verschiedenen Jahreszeiten einen anderen UTC-Offset haben.

- Bei der Frühlingslücke wird keine Uhrzeit still vorgezogen. Beispiel Berlin 28.03.2027 02:30: verständlicher Fehler mit neuer Zeitwahl.
- Bei der Herbstwiederholung werden beide Möglichkeiten mit Offset bzw. „erste/zweite 02:30“ angeboten.
- Wechsel der Ansichtszeitzone verändert nur die Darstellung, nicht den gespeicherten Zeitpunkt.
- Beim bewussten Ändern der Planungszone muss klar sein, ob die lokale Uhrzeit oder der absolute Zeitpunkt erhalten werden soll.
- „Heute“ stammt aus der Ansichtszeitzone, nicht aus dem UTC-Datum des Servers.
- Lokale Kalenderdaten werden niemals mit `new Date('YYYY-MM-DD')` als lokaler Zeitpunkt interpretiert.

Der Resolver ist für minutengenaue aktuelle/zukünftige Planung ausgelegt; er ist keine allgemeine historische Zeitzonenbibliothek. Kalenderwiederholungen und wiederkehrende Kanalqueues sind noch kein Bestandteil des Moduls.

## 4. Provider-Grenzen und Sites

Keine festen „aktuellen“ Zeichen- oder Mediengrenzen erfinden. Jeder Provider braucht ein separat gepflegtes Capability-Objekt mit Quelle, Prüfdatum und passender Zählregel. Komplexe Regeln wie gewichtete Zeichen, Linklängen, Videodauer, Verhältnis, Kontoarten, Threads oder Pflichtmetadaten gehören in den Provider-Adapter. Die mitgelieferten Tests benutzen absichtlich einen fiktiven `example`-Provider.

Eine statische Sites-Anwendung kann die lokale Oberfläche ausliefern. Sie kann selbst keine Sites-Connector-Aufrufe ausführen. Für kontogebundene Entwürfe oder freigegebene Integrationen benötigt die Anwendung einen serverseitigen Pfad und echte Identitäts-/Datenprüfungen.

Für eine spätere produktive Erweiterung sind mindestens notwendig:

- Eigentümer-/Workspace-Zuordnung und Rechteprüfung auf jedem Serverzugriff.
- Versionsprüfung (`expectedRevision`) und atomare Aktualisierung; serverseitig erzwungene Freigaben.
- Persistente Inhalte und Medien sowie Wiederherstellung/Export.
- Pro Besucher autorisierte, tatsächlich für das Site freigegebene Connector-Funktionen; keine angenommenen Anbieter-IDs oder OAuth-Simulationen.
- Ein ausdrücklich ausgelöster Live-Schreibzugriff mit angemeldetem Besucher, Zustimmung und Schutz gegen Doppelklicks.
- Für unbeaufsichtigte Veröffentlichung ein eigens unterstützter und verifizierter Autorisierungs-/Ausführungspfad. Ein Site-Servicezugang ersetzt keinen angemeldeten Besucher und keine App-Zustimmung. Ein offener Tab-Timer ist kein Scheduler.
- Stabile Idempotenzschlüssel pro Beitrag, Revision und Ziel; bestätigte Provider-IDs; Abgleich nach Timeout; keine Token in Clientcode oder localStorage.

Die gelieferten Dateien ändern keine Hosts, Sicherheitsregeln, App-Verbindungen oder kostenpflichtigen Dienste und veröffentlichen nichts.

## 5. Verifikation und Grenzen

Ausgeführt: 25 isolierte Tests mit Node 24.22.1. Sie decken den Modulkern ab, nicht eine vollständige Oberfläche oder Live-Integrationen.

Vor UI-Abnahme zusätzlich prüfen: Schließen/Abbrechen/Zurück/Vorwärts, Reload mit Entwurf, fehlgeschlagene Speicherung, Mehrfachklick, Kanalwechsel ohne Datenverlust, 390px-Mobilansicht, 200-%-Zoom, Dialogfokus, Escape, Fokuswiederherstellung, sichtbare Labels und Tastaturzugang zu Terminänderungen.

Nicht nachgewiesen: Live-Publishing, Provider-OAuth, gehosteter Connectorzugriff, Teamidentität, Hintergrundausführung, vollständige WCAG-Konformität oder browserübergreifende Datenhaltung.

## Hintergrund der Designentscheidungen

Das Konzept synthetisiert die bereits vorliegenden Untersuchungen von Mixpost, Postiz und TryPost. Es behauptet keine eigene angemeldete Laufzeitprüfung dieser Produkte. Insbesondere wurden Basis-/Accountvarianten, Speicherrennen, lokale Speicherfehler, Prüfversionen, Teilerfolge, mobile Kalender und Zeitzonen als Anforderungen übernommen, nicht als fremder Quellcode.

Öffentliche Referenzen: [Mixpost Lite](https://github.com/inovector/mixpost), [Mixpost Editionen](https://mixpost.app/pricing), [Postiz](https://github.com/gitroomhq/postiz-app), [TryPost](https://github.com/trypostit/trypost).
