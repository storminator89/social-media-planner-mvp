# Oberfläche und Integrationsvertrag

Die buildlose Oberfläche liegt in `public/`. `bootstrap.mjs` initialisiert den serverseitigen Store und lädt `app.js`. `model.js` bewahrt die UI-Datenform; seine IANA-Zeitauflösung nutzt die gemeinsame Workflowbibliothek.

## UI-State

```js
{
  schemaVersion: 2,
  revision: 0,
  channels: [{id:'instagram',platform:'instagram',name:'Instagram',handle:'',
    color:'#aabbcc',enabled:true,connectionStatus:'manual',postingSchedule:null}],
  settings: { timezone: 'Europe/Berlin' },
  posts: [{
    id: 'uuid', title: 'Interner Titel', tags: [], text: 'Beitrag', variantTexts: {}, channels: ['instagram'],
    status: 'draft', // idea | draft | scheduled
    scheduledAt: null, // geplant: YYYY-MM-DDTHH:mm in timeZone
    scheduledInstant: null, // bestätigter kanonischer UTC-Instant, keine freie Browserwahl
    scheduleBinding: null, // bewusst ausgewählter Slot oder unabhängiger Termin
    timeZone: 'Europe/Berlin',
    media: null, // {dataUrl,alt,name,type} oder {id,url,alt,name,type}
    cover: null,
    createdAt: '2026-11-07T00:00:00.000Z',
    updatedAt: '2026-11-07T00:00:00.000Z'
  }]
}
```

`window.TaktStore.load()` lädt State. `save(state)` liefert den bereinigten gespeicherten State zurück; diese Rückgabe ersetzt den UI-State. Der API-Adapter hält eine bestätigte private Snapshotrevision und projiziert sie als `revision`; `plannerRevision` bleibt ein readonly Getter für die Composer-Herkunft. Er schützt versteckte Metadaten. Ein gültiger leerer Serverzustand bleibt leer. `null`, ungültige Antworten oder ein fehlender Adapter sperren den Start und erzeugen keine Beispieldaten. Der frühere localStorage-Fallback ist deaktiviert. Ladefehler sperren Speichern; Schreibkonflikte überschreiben nicht automatisch.

Erlaubte Bildreferenzen sind Data-URLs für PNG/JPEG/WebP oder interne relative Pfade `/api/planner/media/<id>`. Neue Bilder werden dekodiert, auf 2 MiB begrenzt und erst nach Alttext-Eingabe gespeichert. Backend und Adapter prüfen nochmals. Es gibt keinen beliebigen Remote-Import.

## Verfügbare Bedienung

Ideen-Inbox, Titel/Notizen/Labels, Woche/Monat, mobile Agenda, Liste, Entwürfe, Suche und Kanalfilter; Text/Bild-Editor, Vorschau, Termin und IANA-Zone; Speichern, Duplizieren, Löschen mit kurzem Undo und JSON-Export. Der Export enthält die Planung und Medienreferenzen, keine vollständige Dateisicherung.

Während eines Commits sind Eingaben gesperrt. Späte Save- oder Bildladeergebnisse dürfen keinen neueren Editorzustand verwerfen. Schließen bei ungespeicherten Änderungen verlangt eine Entscheidung.

Seit Version 0.2 gibt es eigene Kanaltexte über `variantTexts`. Ein fehlender Key erbt die Basis; vorhandene Keys bleiben unabhängig, auch bei identischem oder leerem Text. Abwahl und Rücksetzung eigener Texte erfordern eine sichtbare Entscheidung. Gemeinsame Bilder/Termine, fehlende Teamprüfung und fehlende differenzierte Veröffentlichungsresultate bleiben Grenzen. Nicht darstellbare komplexere Backend-Daten werden abgewiesen statt zerstörerisch reduziert.

Seit 0.9 ersetzt die gespeicherte kanalweise Slot-Auswahl das temporäre Queue-Panel. UI-State 2 erhält vollständige Kanäle, bestätigte Snapshotrevision sowie scheduledInstant und scheduleBinding. Die Auswahl selbst ist kein Save; Regeln und Beitrag werden jeweils ausdrücklich mit CAS gespeichert. Regeländerungen verschieben keine bestehenden Termine. Siehe posting-schedules.md. Historische Hilfsmodule bleiben unverdrahtet.

Die angezeigten Profile sind Beispiele. Es gibt keine Verbindung zu Buffer und keinen automatischen Versand. Tatsächliche LinkedIn-Verknüpfungen werden separat unter Konten geprüft; Planungsprofile bleiben Beispiele.

## Ideen und Wiederherstellung (0.3)

`status:'idea'` besitzt keine Kanäle, Medien, Varianten oder Termine. `ideas.js` validiert die UI-Metadaten, `workflows/ideas.mjs` liefert reine Ideenfunktionen. Vorbereiten verändert nur den Editor. Erst erfolgreiches Speichern ersetzt dieselbe ID, behält Titel/Labels/Erstelldatum und entfernt sie aus der Ideenansicht. Es entsteht kein unabhängiges Quellenobjekt. Titel sind nicht automatisch Veröffentlichungstext.

Unveränderte Titel, Labels und Notizen bleiben exakt erhalten, auch bei CR/LF, Rand-Leerzeichen oder vorhandenen doppelten Labels. Erst eine ausdrückliche Labelbearbeitung normalisiert diese Eingabe. Label-Optionswerte werden HTML-escaped als JSON transportiert; der leere All-Labels-Sentinel ist davon getrennt.

Undo verwendet den aktuellen Snapshot mit seiner Revision. Bestätigte Löschungen erhalten kurzzeitig eine storegebundene kanonische Ergänzung für dieselbe ID; maximal 100 Einträge/60 Sekunden. Normale Sitzungsdaten werden bei erfolgreichem Neuladen verworfen. Bei queuegebundenen Löschungen kann ein passender privater Serverdigest innerhalb der Frist einen bereits gehaltenen möglichen Ursprung nach unklarer Antwort bestätigen, ohne automatische Schreibwiederholung oder Rekonstruktion verlorener Inhalte. Ein 409 verbraucht diese Ergänzung nicht und löst kein Retry aus. Scheitert die UI-Wiederherstellung, wird die gelöschte UI-Fassung in einem readonly Textfeld angezeigt. Sie ersetzt weder ein Backup noch den vollständigen kanonischen Datensatz oder Mediendateien.

## Verbindungen (0.6)

Instagram, YouTube und X verwenden weiter den authentifizierten Vierer-Status. Die LinkedIn-Karte nutzt ausschließlich den eigenen Readiness-Endpunkt und ersetzt die veraltete LinkedIn-Platzhalterzeile vollständig. Keine automatische Änderung der Planungskanäle oder Beiträge.

Nur bestätigte `ready`-Readiness aktiviert den persönlichen LinkedIn-Start. Die UI prüft die offizielle Autorisierungsadresse, genaues eigenes Callbackziel und einmalige erlaubte Parameter vor Navigation. Eine Verknüpfung wird erst nach tatsächlichem Readback angezeigt. Trennung benötigt eine ausdrückliche zweite Bestätigung, danach wieder Readback. Ein Konflikt führt nicht zum Retry. Ablauf, Sichtbarkeitswechsel und verspätete Antworten dürfen keine dauerhaft aktive Anzeige oder unerwünschte Navigation erzeugen.

Keine Passwort-/Tokenfelder, keine Veröffentlichung, kein Reconnect oder Refresh. Ohne Konfiguration sind Aktionen sichtbar gesperrt. X weist unverändert auf Zugang und ausdrücklich freizugebende mögliche Kosten hin; es gibt keine Preisbehauptung oder Kaufaktion. Details und Grenzen stehen in `linkedin-connection-ui.md` und im Verifikationsbericht.
