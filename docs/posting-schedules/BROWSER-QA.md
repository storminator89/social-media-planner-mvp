# Eigene interaktive Browserprüfung

## Tatsächliche Umgebung

Geprüft am 7. November 2026 über CUA Browser Use in sichtbarem Cloud-Chromium, Browser-ID 1, eigenes natives Fenster 29360131, eigene Tabs 47 und 48. Die App lief als echte lokale Sites-Preview mit API3, SQLite und Workspace-Endpunkten unter `http://127.0.0.1:4173/`. Keine simulierten APIs und kein künstlicher Statusstore.

Das native Fenster war 1206 × 874 Pixel. Desktop-Inhaltsbreite 1174 CSS px (1159 px Clientbreite). Schmale Ansicht durch sieben native Browser-Zoom-Schritte auf 300 %, tatsächlich 391 CSS px. Dies ist ein Responsive-/Zoom-Test, **kein echtes Smartphone, keine Touch- oder Geräteemulation**. Ob der Nutzer denselben Desktopstream sieht, wurde nicht unterstellt.

Bedient wurde mit nativen CUA-AX-Klicks und Tastaturaktionen, echten Tab-/Reload-Aktionen und sichtbaren Screenshots. Read-only DOM-Auswertung wurde nur zur Geometriemessung benutzt, nicht zum Verändern der App oder als Ersatz für Bedienung. Die Screenshots wurden im CUA-Verlauf ausgegeben; kein separater Bildexport ist Teil dieses Quellpakets.

## Selbst bediente Abläufe und sichtbares Ergebnis

1. **Zeiten speichern:** Instagram, Montag 09:00, Europe/Berlin angelegt, explizit gespeichert, Seite neu geladen. Gespeicherte Regeln blieben erhalten.
2. **Beitrag aus gemeinsamem Slot:** Text eingegeben, freie Zeiten gesucht. Drei Montage mit 09:00, GMT+1 und Europe/Berlin gesehen. 9. November gewählt und ausdrücklich eingeplant. Der Kalender zeigte 09:00.
3. **Regeländerung:** Montag auf 10:00 geändert. Erster Save zeigte den betroffenen vorhandenen Termin und verlangte „Trotzdem Zeiten speichern“. Nach Bestätigung blieb der Beitrag unverändert auf 09:00, mit „Termin prüfen“ statt stiller Verschiebung.
4. **Fehlende Zeiten:** Instagram und LinkedIn gewählt. Ohne LinkedIn-Regeln kam eine verständliche Fehlanzeige statt erfundener Vorschläge. Im Settingsdialog für LinkedIn Montag 10:00 angelegt. Nach Rückkehr blieben die Kanäle erhalten; die erneute Suche fand gemeinsame 10:00-Slots.
5. **Schmale Ansicht:** Den Kanal-/Slotdialog tatsächlich bei 391 CSS px bedient und gespeichert. Wochentag, Uhrzeit und Entfernen passten in die Zeile. Dialog-Client-/Scrollbreite waren beide 345 px; Dokument-Client-/Scrollbreite beide 386 px, keine horizontale Überbreite. Sticky-Aktionsleiste und vertikales Scrollen funktionierten. Sichtbarer Fokus war erkennbar. Die durch Zoom kurze Höhe benötigt Scrollen und ist nicht mit einem langen Smartphone-Viewport gleichzusetzen.
6. **Echter Mehrtab-Konflikt:** Im ersten Tab ungespeichert eine zusätzliche Zeit ergänzt. Im zweiten Tab LinkedIn pausiert und gespeichert. Der erste Tab erhielt beim ausdrücklichen Save nach der Terminwarnung einen realen 409. Beide lokalen Slots blieben erhalten; weitere Saves waren gesperrt; Warnung und readonly Kopierfeld waren bedienbar. Nur die synthetischen ungespeicherten Zeitänderungen wurden danach bewusst verworfen.
7. **Rich Arbeitsfassung:** Bestehenden gebundenen 09:00-Beitrag geöffnet, Text geändert, bestätigte Arbeitsfassung abgewartet. Editor geschlossen, Seite neu geladen, Arbeitsfassung gewählt und bewusst im ursprünglichen Beitrag wiederhergestellt. Text und 09:00 blieben erhalten; Bindung blieb gesperrt und die geänderten Regeln wurden erklärt. Der ausdrückliche Postsave gelang, Workspace schloss, Kalender blieb auf 09:00 mit „Termin prüfen“.
8. **Pause:** Neuen Editor mit Instagram + pausiertem LinkedIn geöffnet und „Freie Zeiten suchen“ bedient. Sichtbares Ergebnis „Mindestens ein Kanal ist pausiert.“ Ohne Vorschläge. Danach Editor geschlossen.

## Eigene UX-Befunde und Korrekturen

- Der Settingsdialog öffnet nun den zuletzt bearbeiteten bzw. einen bereits eingerichteten Kanal statt unnötig am ersten unkonfigurierten Kanal zu beginnen.
- Aus einer Suche mit fehlenden Kanalzeiten öffnet der Settingsbutton gezielt einen fehlenden ausgewählten Kanal.
- Nach Settings-Save wird eine veraltete Ergebnis-/Fehlmeldung invalidiert; neu suchen bleibt bewusst erforderlich.
- „Termin prüfen“ erscheint auch im zugänglichen Beitragsnamen sowie im Monatskalender. Der Wochenkartenname wurde im realen AX-Baum überprüft.
- Normale Bedienung bleibt knapp. DST-/Abstandsregeln liegen in einer aufklappbaren Gruppe; umfangreiche Kopierdaten erscheinen nur bei einem Konflikt.

Die erste und vierte Korrektur wurden erneut im echten Browser bestätigt. Die gezielte Fehlkanal-Auswahl und erzwungene Invalidierung sind quellen-/testgeprüft; der komplette Fehlkanalablauf wurde nach diesen letzten beiden kleinen Änderungen nicht nochmals wiederholt. Der Integrator führt zusätzlich seinen eigenen Durchgang aus.

## Grenzen und Aufräumen

DST-Fold/Gap, vergangene oder unvollständige Zeiten, Legacy-/stale Workspace, teardown und unklare Erfolgsantworten wurden deterministisch an den echten Funktionen getestet, nicht sämtlich als reale Kalenderdaten im Browser durchgeklickt. Kein echter Anbieter, kein OAuth, kein Medienupload, keine Veröffentlichung und kein externes Konto wurden benutzt. Alle Testtexte waren synthetisch und blieben im isolierten lokalen QA-Speicher.

Nach Abschluss: Browser-Zoom wieder 100 %, nur eigene Tabs 47/48 geschlossen, Preview gestoppt und Integrator informiert. Andere Fenster/Tabs wurden nicht verändert. Die spätere kanonische Sortier-/Adapterhärtung änderte die UI-Bedienung nicht; sie ist in der finalen automatisierten QA enthalten, wurde aber nicht als zusätzlicher interaktiver Browserlauf ausgegeben.
