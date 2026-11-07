# Verifikation: Version 0.1

Stand: 7. November 2026. Lokaler Prototyp, keine Sites-Veröffentlichung.

## Automatisierte Prüfungen

**89 Tests bestanden**, jeweils unter den Host-Zeitzonen der Standardumgebung, America/Los_Angeles und Asia/Tokyo. Alle JavaScript-Dateien bestanden die Syntaxprüfung.

Abgedeckt sind unter anderem:

- Datenmodell, simulierte Besitzerisolation, atomare Revisionen, fehlende Identität, Cross-Origin- und CSRF-Schutz.
- UTC/IANA-Verträge, ungültige Kalenderdaten, DST-Lücken und doppelte Ortszeiten.
- Bildtypen, Größen/Quoten, fremde Medienreferenzen und Kompensation eines fehlgeschlagenen Metadateneintrags.
- Echte Wiederöffnung der lokalen SQLite-Datei und des dateibasierten Medienspeichers.
- Vollständige statische Modulpfade, keine Freigabe von Datenbank, Serverquellen oder fremden Symlink-Zielen.
- Die mobile Wochenagenda schließt Termine außerhalb der ausgewählten Woche aus.
- Kein Verlust von versteckten Titeln oder Statusnotizen; Bilder ohne Zielkanal werden vor Upload/Mutation abgewiesen.
- Fehlende Einstellungen/Beitrags-/Kanallisten werden nicht als leere Löschliste interpretiert.
- Tests der tatsächlichen Editorfunktionen mit verzögerten Promises: Commit-Feldsperre, neuer Text während laufendem Save, Doppelklick, Fehler, veraltete Bild-Callbacks, Auswahlreihenfolge und Duplizieren eines ungespeicherten Entwurfs.
- Weiterführende unabhängige Workflowlogik wie Freigaberevisionen und Teilergebnisse. Diese ist nicht vollständig in der Oberfläche verfügbar.

Aufruf: `npm test` und `npm run check`.

## Beobachtete Browserabläufe

Der integrierte Prototyp wurde im Chromium-Browser geprüft:

- Neuer Serverzustand startet leer; lokale Speichergrenze und fehlende Anmeldung werden in den Einstellungen erklärt.
- Beitragstext und ein selbst erzeugtes Testbild gewählt; fehlender Alttext blockiert Speichern.
- Bild gespeichert, über relative API-Adresse angezeigt und nach Reload sowie vollständigem Neustart des Entwicklungsservers wieder geladen.
- Ein HTML-Teststring blieb sichtbarer Text und erzeugte kein ausführbares Element.
- Zwei gleichzeitig geöffnete Tabs: erste Bearbeitung gespeichert; zweite erhielt Konflikthinweis und behielt den eigenen Text im geöffneten Editor.
- DST-Lücke Europe/Berlin abgewiesen; gültiger Termin korrekt im Kalender angezeigt.
- Löschen und Rückgängig; Testbeiträge danach entfernt.
- Nach den Async-Korrekturen Save/Delete erneut erfolgreich; während des Commits waren sämtliche Formularfelder sichtbar deaktiviert.
- Die unveränderte responsive Basisoberfläche wurde bei 441 und 389 CSS-Pixeln ohne horizontalen Dokumentüberlauf geprüft. Keine Prüfung auf echten Mobilgeräten oder in Safari.

## Aussagegrenzen

Echte Sites-Dispatch-Identität, Cloud-D1/R2, gehostete Migrationen, Produktionssicherheit, Backup/Wiederherstellung, Social-OAuth, Provider-API, autonome Veröffentlichung und Hintergrundscheduler wurden nicht verifiziert. Lokale kompatible Adapter und simulierte Besitzer sind kein Cloud- oder Mehrbenutzernachweis.

Der Entwicklungsserver bindet ausschließlich an Loopback und verwendet einen gemeinsamen Testarbeitsbereich ohne Anmeldung. Keine vertraulichen Daten eingeben. Er ist nicht zur öffentlichen Bereitstellung vorgesehen.
