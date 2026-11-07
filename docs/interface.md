# Oberfläche und Integrationsvertrag

Die buildlose Oberfläche liegt in `public/`. `bootstrap.mjs` initialisiert den serverseitigen Store und lädt `app.js`. `model.js` bewahrt die UI-Datenform; seine IANA-Zeitauflösung nutzt die gemeinsame Workflowbibliothek.

## UI-State

```js
{
  schemaVersion: 1,
  settings: { timezone: 'Europe/Berlin' },
  posts: [{
    id: 'uuid', title: 'Interner Titel', tags: [], text: 'Beitrag', variantTexts: {}, channels: ['instagram'],
    status: 'draft', // idea | draft | scheduled
    scheduledAt: null, // geplant: YYYY-MM-DDTHH:mm in timeZone
    timeZone: 'Europe/Berlin',
    media: null, // {dataUrl,alt,name,type} oder {id,url,alt,name,type}
    cover: null,
    createdAt: '2026-11-07T00:00:00.000Z',
    updatedAt: '2026-11-07T00:00:00.000Z'
  }]
}
```

`window.TaktStore.load()` lädt State. `save(state)` liefert den bereinigten gespeicherten State zurück; diese Rückgabe ersetzt den UI-State. Der API-Adapter behält die serverseitige Revision intern und schützt versteckte Metadaten. Ein gültiger leerer Serverzustand bleibt leer. `null`, ungültige Antworten oder ein fehlender Adapter sperren den Start und erzeugen keine Beispieldaten. Der frühere localStorage-Fallback ist deaktiviert. Ladefehler sperren Speichern; Schreibkonflikte überschreiben nicht automatisch.

Erlaubte Bildreferenzen sind Data-URLs für PNG/JPEG/WebP oder interne relative Pfade `/api/planner/media/<id>`. Neue Bilder werden dekodiert, auf 2 MiB begrenzt und erst nach Alttext-Eingabe gespeichert. Backend und Adapter prüfen nochmals. Es gibt keinen beliebigen Remote-Import.

## Verfügbare Bedienung

Ideen-Inbox, Titel/Notizen/Labels, Woche/Monat, mobile Agenda, Liste, Entwürfe, Suche und Kanalfilter; Text/Bild-Editor, Vorschau, Termin und IANA-Zone; Speichern, Duplizieren, Löschen mit kurzem Undo und JSON-Export. Der Export enthält die Planung und Medienreferenzen, keine vollständige Dateisicherung.

Während eines Commits sind Eingaben gesperrt. Späte Save- oder Bildladeergebnisse dürfen keinen neueren Editorzustand verwerfen. Schließen bei ungespeicherten Änderungen verlangt eine Entscheidung.

Seit Version 0.2 gibt es eigene Kanaltexte über `variantTexts`. Ein fehlender Key erbt die Basis; vorhandene Keys bleiben unabhängig, auch bei identischem oder leerem Text. Abwahl und Rücksetzung eigener Texte erfordern eine sichtbare Entscheidung. Gemeinsame Bilder/Termine, fehlende Teamprüfung und fehlende differenzierte Veröffentlichungsresultate bleiben Grenzen. Nicht darstellbare komplexere Backend-Daten werden abgewiesen statt zerstörerisch reduziert.

Die Queue-Anbindung in `queue-panel.js` nutzt `workflows/queue.mjs`: Vorschläge sind read-only, ein Klick übernimmt nur Datum/Zone in den Editor. Jede Inhalts-/Regeländerung verwirft die Liste; die Übernahme prüft Fingerabdruck, Belegung und Zeit erneut. Speicherung erfolgt ausschließlich über den regulären Commit mit Revision. Regeln sind temporär, nicht Teil des State.

Die angezeigten Profile sind Beispiele. Es gibt keine Verbindung zu Buffer oder anderen Social-Konten und keinen automatischen Versand.

## Ideen und Wiederherstellung (0.3)

`status:'idea'` besitzt keine Kanäle, Medien, Varianten oder Termine. `ideas.js` validiert die UI-Metadaten, `workflows/ideas.mjs` liefert reine Ideenfunktionen. Vorbereiten verändert nur den Editor. Erst erfolgreiches Speichern ersetzt dieselbe ID, behält Titel/Labels/Erstelldatum und entfernt sie aus der Ideenansicht. Es entsteht kein unabhängiges Quellenobjekt. Titel sind nicht automatisch Veröffentlichungstext.

Unveränderte Titel, Labels und Notizen bleiben exakt erhalten, auch bei CR/LF, Rand-Leerzeichen oder vorhandenen doppelten Labels. Erst eine ausdrückliche Labelbearbeitung normalisiert diese Eingabe. Label-Optionswerte werden HTML-escaped als JSON transportiert; der leere All-Labels-Sentinel ist davon getrennt.

Undo verwendet den aktuellen Snapshot mit seiner Revision. Nur bestätigte Löschungen erhalten kurzzeitig eine storegebundene kanonische Ergänzung für dieselbe ID; maximal 100 Einträge/60 Sekunden, Leeren bei erfolgreichem Neuladen. Ein 409 verbraucht diese Ergänzung nicht und löst kein Retry aus. Scheitert die UI-Wiederherstellung, wird die gelöschte UI-Fassung in einem readonly Textfeld angezeigt. Sie ersetzt weder ein Backup noch den vollständigen kanonischen Datensatz oder Mediendateien.

## Verbindungen (0.4)

Die separate Ansicht `connections.js` liest ausschließlich `/api/providers/status`. Instagram, LinkedIn und YouTube sind von den vorhandenen Demo-Planungskanälen getrennt. Die Ansicht verändert keine Beiträge und erweitert deren Kanalmodell nicht automatisch.

Unbekannte, unvollständige oder aktivierten Versand behauptende DTOs werden abgewiesen. Ladefehler zeigen „Status unbekannt“; ein alter Erfolgsstatus wird bei neuer Prüfung nicht als aktuell ausgegeben. Einrichtungshinweise sind nur ausklappbarer Text. Es gibt keinen Connect-, OAuth- oder Publish-Button und kein Browserfeld für Passwörter oder Tokens. Plattform-App-Freigabe und persönliche Kontoberechtigung werden getrennt dargestellt.
