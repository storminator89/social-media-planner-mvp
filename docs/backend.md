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

## API-Vertrag, Version 0.2

Alle Fehler verwenden `{error:{code,message,details?}}`.

- `GET /api/planner/state`: kompletter Snapshot. Ein neuer Besitzer erhält leere Listen und Revision 0.
- `PUT /api/planner/state`: vollständiger `{schemaVersion:2,revision,settings,channels,posts}`-Snapshot. Alle fünf Felder sowie die `variants`-Liste jedes Beitrags sind erforderlich. Dies ist kein PATCH. Nur ausdrücklich leere Listen bedeuten Löschen. Zuerst laden, gewünschte Felder ändern, vollständigen Snapshot speichern.
- Fehlende oder ältere `schemaVersion` erhält 409 `STATE_SCHEMA_CHANGED`, bevor Daten geändert werden. UI-Schema 1 ist davon getrennt; der aktuelle Adapter übersetzt intern auf API-Schema 2.
- Eine alte Revision erhält 409 `REVISION_CONFLICT`, ohne dass spätere Lösch-/Insert-Statements wirksam werden. Nicht automatisch überschreiben oder wiederholen.
- `POST /api/planner/resolve-time`: `{local:'YYYY-MM-DDTHH:mm',timezone:'Europe/Berlin',disambiguation?:'reject'|'earlier'|'later'}`. Ergebnis: UTC-ISO-Zeitpunkt. Gaps werden abgewiesen; doppelte Ortszeiten brauchen eine bewusste Wahl. Die einfache UI weist doppelte Zeiten derzeit ab.
- `POST /api/planner/media`: Binärinhalt, passender `Content-Type`, URL-kodierte Dateiinformationen in `X-Planner-File-Name` und `X-Planner-Alt-Text`.
- `GET|HEAD /api/planner/media/:id`: besitzerspezifische Datei. Fremde Kennzeichen liefern 404. Es gibt keinen öffentlichen Freigabelink oder Remote-URL-Proxy.

Die Snapshot-Ersetzung bewahrt die Medienbibliothek. Das Entfernen eines Beitrags löscht seine Bilddateien nicht automatisch.

## Datenform

```js
{
  schemaVersion: 2,
  revision: 0,
  settings: {timezone:'Europe/Berlin',locale:'de-DE'},
  channels: [{id:'instagram',platform:'instagram',name:'Instagram',
    handle:'',color:'#aabbcc',enabled:true,connectionStatus:'manual'}],
  posts: [{id:'post-1',title:'Redaktioneller Titel',body:'Beitragstext',
    stage:'draft',tags:[],cover:null,scheduledAt:null,timezone:'Europe/Berlin',
    variants:[{id:'variant-1',channelId:'instagram',body:'Beitragstext',inheritsBody:true,
      format:'post',status:'draft',scheduledAt:null,timezone:'Europe/Berlin',
      statusNote:'',mediaIds:[]}]}],
  media: [],
  capabilities: {automaticPublishing:false,externalAccountsConnected:false}
}
```

Zustände des Beitrags: `idea`, `draft`, `planned`, `archived`; je Zielkanal: `draft`, `ready`, `planned`, `published`, `failed`. Der Status `published` ist nur manuelle Dokumentation und verlangt Datum sowie gegebenenfalls einen HTTPS-Link. Er beweist keinen API-Versand. Die Oberfläche unterstützt eigene Kanaltexte mit `inheritsBody:boolean`. Fehlender UI-Key in `variantTexts` bedeutet Vererbung; vorhandener Key ist unabhängig, auch bei leerem oder identischem Inhalt. Gemeinsame Termine/Medien und Entwurfs-/Planungsstatus bleiben Pflicht; reichere Varianten, Phasen, Tags oder Formate werden geschützt abgewiesen.

Der UI-Adapter hält Titel und Varianten-Statusnotizen verlustfrei, obwohl die Oberfläche diese Felder nicht zeigt. Ein Bild ohne Zielkanal wird vor dem Upload abgewiesen. Nach `save()` muss die UI die normalisierte Rückgabe übernehmen, insbesondere Medien-ID/URL anstelle einer Data-URL.

## Medien und Grenzen

API: PNG/JPEG/GIF/WebP/MP4/WebM mit Signaturprüfung; kein SVG/HTML. Die einfache UI erlaubt nur dekodierbare PNG/JPEG/WebP bis 2 MiB und verlangt Alttext. Eine Signaturprüfung ist kein Malware-Scan und kein vollständiger Mediendecoder.

Produktobergrenzen: 20 Kanäle, 100 Beiträge, 300 Varianten, 10 Medienreferenzen je Variante, 1 MiB JSON, 20 MiB je API-Datei, 100 Medienobjekte/200 MiB pro Besitzer. Das sind Anwendungsgrenzen, keine zugesagten Hostingtarife oder Plattformquoten.

Noch nicht vorhanden: Medien-Löschendpunkt, Metadatenänderung gespeicherter Bilder, Videorange-Antworten, Transcoding, Backups, Social-Tokens, OAuth, Publisher oder Hintergrundjobs. Für spätere Cloudbereitstellung müssen Migrationen, echte Identität und D1/R2 separat nachgewiesen werden.
