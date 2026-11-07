# Daten-API und Speichergrenzen

## Module

- `modules/data/api.mjs`: `handlePlannerRequest(request, {DB, BUCKET})` für `/api/planner/*`; andere Pfade liefern `null`.
- `modules/data/repository.mjs`: vollständig besitzerspezifische Abfragen und atomare Snapshot-Ersetzung mit Revisionsprüfung.
- `modules/data/domain.mjs`: Datenschema, Grenzen und UTC/IANA-Auflösung.
- `modules/data/client.mjs`: Browserclient für `load`, `save`, `resolveTime`, `uploadMedia`.
- `modules/data/takt-adapter.mjs`: Brücke zur einfachen UI. Die unter `public/data-client/` ausgelieferten Kopien müssen synchron bleiben.
- `server/storage.mjs`: lokale SQLite-/Dateiadapter. Migrationen werden einmalig mit Versions-/Prüfsummenprüfung ausgeführt.

`npm test` prüft Module, Schnittstellen und lokalen Speicher. `npm run check` prüft die JavaScript-Syntax. Es gibt keine gehostete Datenbank und kein ausgeführtes Sites-Deployment.

## Identität

Die wiederverwendbare API erwartet die von einem vertrauenswürdigen Sites-Dispatch-Gateway eingefügte Besucher-ID im Header `oai-authenticated-user-id`. Eine Browserangabe, E-Mail oder `owner_id` im JSON darf niemals diesen Nachweis ersetzen. Ohne Identität antwortet die API mit 401. Daten und Medien werden ausschließlich anhand dieser serverseitigen Identität gelesen.

Der lokale Entwicklungsserver ist ausdrücklich eine andere Betriebsart: Loopback, ein gemeinsamer Testarbeitsbereich, keine Anmeldung. Eingehende Identitätsheader werden abgewiesen, nicht als echte Authentifizierung anerkannt. Der lokale Server darf nicht öffentlich betrieben werden. Simulierte Besitzer-Tests sind kein Nachweis der gehosteten Gateway-Konfiguration.

Schreibanfragen verlangen gleiche Origin, keine Cross-Site-Kennung und `X-Planner-Request: 1`. Die API liefert keine CORS-Freigabe. Antwortdaten sind nicht öffentlich cachebar. SQL und interne Dateischlüssel werden nicht an den Browser ausgegeben.

## API-Vertrag, Version 0.9 (Schema 3)

Alle Fehler verwenden `{error:{code,message,details?}}`.

- `GET /api/planner/state`: kompletter Snapshot. Ein neuer Besitzer erhält leere Listen und Revision 0.
- `PUT /api/planner/state`: vollständiger `{schemaVersion:3,revision,settings,channels,posts}`-Snapshot. Alle fünf Felder sowie die `variants`-Liste jedes Beitrags sind erforderlich. Dies ist kein PATCH. Nur ausdrücklich leere Listen bedeuten Löschen. Zuerst laden, gewünschte Felder ändern, vollständigen Snapshot speichern.
- Fehlende oder ältere `schemaVersion` erhält 409 `STATE_SCHEMA_CHANGED`, bevor Daten geändert werden. UI-State 2 ist davon getrennt; der aktuelle Adapter übersetzt auf API-Schema 3.
- Eine alte Revision erhält 409 `REVISION_CONFLICT`, ohne dass spätere Lösch-/Insert-Statements wirksam werden. Nicht automatisch überschreiben oder wiederholen.
- `POST /api/planner/resolve-time`: `{local:'YYYY-MM-DDTHH:mm',timezone:'Europe/Berlin',disambiguation?:'reject'|'earlier'|'later'}`. Ergebnis: UTC-ISO-Zeitpunkt. Gaps werden abgewiesen; doppelte Ortszeiten brauchen eine bewusste Wahl. Manuelle neue mehrdeutige Zeiten bleiben abgewiesen; die gespeicherte Slot-Auswahl kann eine ausdrücklich konfigurierte frühere oder spätere Herbststunde verwenden.
- `POST /api/planner/media`: Binärinhalt, passender `Content-Type`, URL-kodierte Dateiinformationen in `X-Planner-File-Name` und `X-Planner-Alt-Text`.
- `GET|HEAD /api/planner/media/:id`: besitzerspezifische Datei. Fremde Kennzeichen liefern 404. Es gibt keinen öffentlichen Freigabelink oder Remote-URL-Proxy.

API-Reads können zusätzlich private `restoreProofs:[{postId,payloadDigest,expiresAt}]` liefern. Sie enthalten keine gelöschten Inhalte. Der Adapter nutzt sie nur zur zeitlich begrenzten Bestätigung eines bereits gehaltenen Originals nach unklarer Löschantwort. Der Server vertraut keiner vom Browser eingesandten Proofliste.

Die Snapshot-Ersetzung bewahrt die Medienbibliothek. Das Entfernen eines Beitrags löscht seine Bilddateien nicht automatisch.

## Datenform

```js
{
  schemaVersion: 3,
  revision: 0,
  settings: {timezone:'Europe/Berlin',locale:'de-DE'},
  channels: [{id:'instagram',platform:'instagram',name:'Instagram',
    handle:'',color:'#aabbcc',enabled:true,connectionStatus:'manual',postingSchedule:null}],
  posts: [{id:'post-1',title:'Redaktioneller Titel',body:'Beitragstext',
    stage:'draft',tags:[],cover:null,scheduleBinding:null,scheduledAt:null,timezone:'Europe/Berlin',
    variants:[{id:'variant-1',channelId:'instagram',body:'Beitragstext',inheritsBody:true,
      format:'post',status:'draft',scheduledAt:null,timezone:'Europe/Berlin',
      statusNote:'',mediaIds:[]}]}],
  media: [],
  capabilities: {automaticPublishing:false,externalAccountsConnected:false}
}
```

Zustände des Beitrags: `idea`, `draft`, `planned`, `archived`; je Zielkanal: `draft`, `ready`, `planned`, `published`, `failed`. Der Status `published` ist nur manuelle Dokumentation und verlangt Datum sowie gegebenenfalls einen HTTPS-Link. Er beweist keinen API-Versand. Die Oberfläche unterstützt eigene Kanaltexte mit `inheritsBody:boolean`. Fehlender UI-Key in `variantTexts` bedeutet Vererbung; vorhandener Key ist unabhängig, auch bei leerem oder identischem Inhalt. Gemeinsame Termine/Medien und Entwurfs-/Planungsstatus bleiben Pflicht; reichere Varianten, Archiv-/Publikationsphasen oder Formate werden geschützt abgewiesen.

Der UI-Adapter bildet Ideen sowie Titel und Tags ab. Varianten-Statusnotizen bleiben bei normalen Änderungen erhalten, obwohl die Oberfläche sie nicht bearbeitet. Für kurzzeitiges Löschen/Rückgängig gelten die Sitzungsgrenzen aus `interface.md`; dies ist keine dauerhafte Löschhistorie. Ein Bild ohne Zielkanal wird vor dem Upload abgewiesen. Nach `save()` muss die UI die normalisierte Rückgabe übernehmen, insbesondere Medien-ID/URL anstelle einer Data-URL.

## Medien und Grenzen

API: PNG/JPEG/GIF/WebP/MP4/WebM mit Signaturprüfung; kein SVG/HTML. Die einfache UI erlaubt nur dekodierbare PNG/JPEG/WebP bis 2 MiB und verlangt Alttext. Eine Signaturprüfung ist kein Malware-Scan und kein vollständiger Mediendecoder.

Produktobergrenzen: 20 Kanäle, 100 Beiträge, 300 Varianten, 10 Medienreferenzen je Variante, 1 MiB JSON, 20 MiB je API-Datei, 100 Medienobjekte/200 MiB pro Besitzer. Das sind Anwendungsgrenzen, keine zugesagten Hostingtarife oder Plattformquoten.

Noch nicht vorhanden: Medien-Löschendpunkt, Metadatenänderung gespeicherter Bilder, Videorange-Antworten, Transcoding, Backups, Publisher oder Hintergrundjobs. LinkedIn-Verknüpfung und verschlüsselte Tokenverwaltung sind getrennt implementiert, aber standardmäßig nicht aktiviert. Für spätere Cloudbereitstellung müssen Migrationen, echte Identität und D1/R2 separat nachgewiesen werden.

## Verbindungsstatus (0.6)

`GET /api/providers/status` bleibt ein rein lesender öffentlicher Endpunkt. Er verlangt eine vertrauenswürdige Besucheridentität, prüft Origin und liefert Schema 1 mit vier strikt begrenzten Provider-Statusobjekten und `capabilities:{oauth:false,publishing:false}`. Der lokale Entwicklungsserver setzt seinen separaten Testbesitzer erst nach den bestehenden Loopback-/Headerprüfungen ein.

Der Status enthält ausschließlich Provider, Einrichtungszustand, `accountLabel:null`, `canPublish:false` und vorgegebene Blockercodes. Keine Account-ID, Credential-Referenz, Rohfehler oder Jobpayload. Fehlende Migration/DB-Fehler liefern 503, keinen erfundenen „nicht verbunden“-Erfolg. Für die drei persistierbaren Provider bedeuten fehlende Zeilen nach erfolgreicher DB-Abfrage, dass kein Platzhalter dieses Besitzers registriert ist. X ist ausdrücklich noch nicht persistierbar und wird nur als gesperrte Option mit Kostenfreigabe-Blocker angezeigt. POST/PUT/DELETE werden abgewiesen.

Die neue interne `ProviderRepository` besitzt ausschließlich vorbereitende Platzhalter-/Joboperationen. Sie ist kein Publisher und keine Berechtigungsquelle. Kein HTTP-Endpunkt ruft diese Mutatoren auf. Näheres in `provider-preparation.md`.

## LinkedIn-Webflow (0.6)

Die maßgebliche LinkedIn-Readiness ist `GET /api/providers/linkedin/oauth/readiness`. Das allgemeine Vierer-DTO beschreibt weiterhin nur vorbereitende Platzhalter; seine LinkedIn-Zeile wird von der 0.6-UI bewusst nicht als aktueller Kontostatus verwendet. Auch `externalAccountsConnected:false` im bestehenden Planer-Snapshot ist ein historisches, nicht maßgebliches Planerfeld: Planungskanäle sind nicht an Providerkonten gebunden. Berechtigung und Verbindung niemals daraus ableiten.

Readiness-Schema1 hat `provider:'linkedin'`, `stage:'not_configured'|'ready'|'linked'|'expired'|'disconnected'|'error'`, fünf Fähigkeiten mit stets `publishing:false`, `targetConfirmed`, das Scope-Bündel, feste Blockercodes, `authorizationUrl:null`, `canDisconnect` und entweder `connection:null` oder `{id,revision,status,expiresAtMs}`. Keine Subject-/Token-/Ciphertext-/Key-/Receipt-Felder. `linked` erfordert tatsächlichen sicheren Metadaten-Readback mit authentifiziertem Envelope. Fehler liefern keine Ersatzverbindung.

Start ist ein gleich-originiger markierter POST mit ausschließlich `{accountType:'personal'}`. Die Antwort enthält nach State-/Ticketanlage den offiziellen Autorisierungslink und Ablaufzeit sowie einen geschützten Versuchscookie. Callback verarbeitet nur genau gebundene Parameter und Identität, validiert die komplette Token-/OIDC-/Userinfo-Kette und speichert erst danach. Trennung ist ein markierter POST mit `{connectionId,expectedRevision}` und liefert nach lokalem CAS-Erfolg204. Ein fehlender oder veralteter Stand wird nicht automatisch überschrieben.

Es gibt keinen öffentlichen Token-Intake/Export, keine freie Exchange-API, keinen Reconnect/Refresh/Postingendpunkt. Ohne Serverkonfiguration werden aktive Pfade abgewiesen; Readiness erklärt die Sperre. Exakter Ablauf und Livegrenzen: `oauth-preparation.md`.


## Gespeicherte Zeitpläne (0.9)

Planer-API 3 verwendet den vollständigen Snapshot und eine gemeinsame Revision für Regeln und Beiträge. `channel.postingSchedule` und `post.scheduleBinding` sind Pflichtfelder (null oder strikt geprüftes Objekt). Lese-/Saveantworten enthalten zudem ownerprivate `restoreProofs`, niemals fremde Payloads. Regeln, Bindungen, Mehrkanalbelegung und vorher bestätigte UTC-Instants: siehe `posting-schedules.md`.

UI-State 2 bewahrt alle Kanäle sowie `revision`, `scheduledInstant` und `scheduleBinding`. Eine alte UI-Fassung wird nicht still hochgestuft. Eine lokale stale UI-Revision liefert ebenso 409 wie der Server-CAS. Fehlende oder kaputte Erfolgsantworten sind keine bestätigten Receipts; die vorherige Snapshotrevision bleibt erhalten.
