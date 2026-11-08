# Medienraum: lokaler Reviewkandidat

Nicht veröffentlicht. Keine Provideraktionen oder echten Nutzerdateien verwendet.

## Verhalten

- Eigenständiger Medienraum im Composer direkt nach dem Text, vor optionalen Labels.
- Eine Datei je Studio-Vorgang, Auswahl oder Drop. Der integrierte Composer verwaltet bis zu 10 geordnete Anhänge je Beitrag. JPG/PNG/WebP bis 20 MiB, höchstens 40 Megapixel; MP4/WebM bis 20 MiB.
- Bilder: Original/1:1/4:5/9:16/16:9, Zoom und Ausschnittposition, 90°-Rotation, Spiegeln, Helligkeit, Sättigung, Reset und Alttext. Ausgabe ist ein neues JPG mit maximal 2048 px und 2 MiB. Weiß ersetzt Transparenz, Originaldatei bleibt unverändert.
- Videos: Originalvorschau mit nativen Controls und begrenztem Abspielbereich. Nur das unveränderte Original wird in den Beitrag übernommen. Kein behaupteter Video-Schnitt oder -Export, keine Untertitel. Mehrere Originalvideos/Bilder sind als getrennte Composer-Anhänge möglich.
- Bereits gespeicherte Bilder lassen sich aus dem privaten Medienpfad erneut bearbeiten. Die Übernahme erstellt eine neue Datei, bestehende Bytes und Alttexte werden nicht in-place geändert.
- Kein Upload im Studio. Erst Beitragsspeicherung verwendet den vorhandenen serverseitigen, validierten und besitzergebundenen Speicherpfad.
- Arbeitsfassungen referenzieren gespeicherte Videos als planner_video; lokale ungespeicherte Medien bleiben ausdrücklich ausgelassen.
- Generationstoken verwerfen alte Reads; Objekt-URLs werden freigegeben; keine parallele Übernahme. Die Übernahme sperrt den Dialog kurz gegen Cancel und Wiederholung, damit kein verspätetes Ergebnis nach Abbrechen im Composer landet.

## Referenz, keine Kopie

Offizielle Buffer-Bildeditor-Screens wurden visuell geprüft: große Bildfläche, schmale rechte Werkzeugleiste, Format/Rotation/Alttext und ausdrückliches Apply/Cancel. Quelle: https://support.buffer.com/articles/editing-your-images-in-buffer-NaWdI4YCpC . Eigene Implementierung, keine übernommenen Assets oder Code. Die REA-v60-Anleitung wurde gelesen. Kein verfügbarer REA-MCP/CLI; normales Repository-Engineering und tatsächliche Browserbeobachtung werden nicht als REA-Evidence ausgegeben.

## Prüfungen

Sieben neue Unit-/Controllerprüfungen decken Format/Dateigrenzen, Crop-Geometrie, Rotationen, Ausgabegrenzen, Videobereich, tatsächliche Image-Apply/Alt/Reset-Flows, ungültige Ersatzdateien, Cancel, Singleflight und unveränderte Videoübernahme ab. Bestehende VM-Harnesses kennen die neue reine isVideo-Abhängigkeit.

Interaktiver Browser über cua_repl, offizieller sites-preview:
- Desktop: Auswahl JPG, 4:5-Crop, Drehung, Alttext, Übernahme, echter lokaler Entwurfssave, Reopen des gespeicherten Bilds, Cancel und Focus-Rückkehr bestanden.
- Desktop: PNG in 1200×900 wurde als 720×900 Vorschau geprüft. Header/Footer bleiben sichtbar; Dialog horizontal und vertikal ohne eigenen Overflow (1118×715). Werkzeuge scrollen separat.
- Mobil: 390 px breite srcdoc-Testansicht, keine echte Mobilhardware. Medien öffnen, PNG wählen, 9:16-Crop, Alttext, Übernahme, erneutes Öffnen und Abbrechen bestanden; Studio scrollWidth=clientWidth=357, Composer=375. Persistenz in diesem iframe nicht als nachgewiesen behauptet.
- Video: tiny.mp4 real ausgewählt, Metadaten gelesen, Abspielbereich gestartet und Original in Composer übernommen. Der erste Save deckte eine zusätzliche Alttext-Validierungsregression auf. Nach dem Fix: echter lokaler Video-Entwurfssave und Reopen aus dem privaten Medienpfad bestanden. Ungültige Ersatzdatei erhält das vorhandene Video; Escape schließt nur den Medienraum und stellt Fokus auf Ansehen wieder her.

Historischer Studio-Teilstand: 1747/1747 Tests. Aktueller integrierter Releasekandidat: siehe release-readiness-2026-11-08.md; die historischen Screenshots beweisen nicht den zusammengeführten Stand.

Belege: docs/qa/media-studio/desktop.png, mobile-390.png und video.png. landscape-test.png ist eine selbst erzeugte synthetische Prüfgrafik, kein Kundenasset. QA-Wrapper wird nicht ausgeliefert.

## Grenzen

Kein drag-to-pan Crop-Rahmen; die präzise Position wird über beschriftete Slider bedient. Kein verlustfreier Export, PNG-Transparenzexport, Undo-Stack, Video-Transcoding, Untertitel, frei wählbares Videocover, Medienbibliothek. Geordnete Mehrfachanhänge sind im integrierten Composer vorhanden. Provider-Kompatibilität ist durch eine lokale Vorschau nicht bewiesen. Automatisierte Tests ersetzen weder echte Mobile-Safari-Prüfung noch einen visuellen Integrationstest des später zusammengeführten App-Stands.
