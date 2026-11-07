# Interaktive Integrationsprüfung

Zusätzlicher eigener Durchgang am 7. November 2026 auf dem vollständig integrierten 0.9-Quellstand, nach Übernahme aller 26 UI-Dateien sowie der finalen Adapter- und Digest-Härtung. Die frühere Komponentenprüfung steht in `BROWSER-QA.md`.

## Tatsächlich verwendete Ansicht

Sichtbares natives Cloud-Chromium-Fenster 29360131, Browser-ID 1, eigener Tab 49. Die reguläre lokale Sites-Preview unter `http://127.0.0.1:4173/` lief aus einer getrennten Kopie mit frischer SQLite-Datenbank. Die App wurde tatsächlich über CUA angeklickt und ausgefüllt, gespeichert und neu geladen. Screenshots wurden visuell geprüft. DOM-Auswertung war ausschließlich lesend zur Messung der sichtbaren Breiten.

Dies war kein Headless-Test und keine statische Screenshot-Abnahme. Ob der Nutzer denselben Desktopstream sehen konnte, wurde nicht verifiziert. Keine Provideranmeldung, kein Dateiupload und kein Social-Media-Versand fanden statt. Sämtliche Texte und Regeln waren synthetische lokale Prüfdaten.

## Eigene Bedienung und Ergebnisse

1. Instagram-Zeit Montag 09:00 in Europe/Berlin hinzugefügt, ausdrücklich gespeichert, Dialog geschlossen und Seite neu geladen. Die Zeit blieb erhalten.
2. Einen Beitrag eingegeben, freie Zeiten gesucht, den angezeigten 9. November um 09:00 GMT+1 bewusst gewählt und danach ausdrücklich eingeplant. Der Kalender zeigte den Beitrag um 09:00.
3. Die Wochenzeit auf 10:00 geändert. Der erste Save erklärte knapp, dass ein bestehender Termin nicht mehr passt und unverändert bleibt. Erst der zweite Button „Trotzdem Zeiten speichern“ bestätigte die Änderung. Der Beitrag blieb um 09:00 sichtbar und erhielt „Termin prüfen“.
4. Einen weiteren Beitrag für Instagram und LinkedIn eingegeben. Die Suche meldete die fehlenden LinkedIn-Zeiten. Der Settingsbutton öffnete direkt den fehlenden ausgewählten Kanal, nicht einen beliebigen Kanal. Montag 10:00 gespeichert und zum unveränderten Composer zurückgekehrt. Der alte Fehlhinweis war invalidiert; die bewusste erneute Suche bot gemeinsame 10:00-Termine an. Der Beitrag wurde anschließend als Entwurf gespeichert.
5. Den zuletzt bearbeiteten LinkedIn-Kanal erneut geöffnet, Vorschläge pausiert und gespeichert. Der Kanalstatus wechselte auf „Pausiert“. In der schmalen Ansicht wurde die Pause wieder aufgehoben und bestätigt gespeichert. Schließen setzte den Fokus auf den auslösenden Posting-Zeiten-Button zurück.

Damit wurden auch die letzten beiden UX-Korrekturen, gezielte Fehlkanalwahl und Invalidierung nach Settings-Save, erneut im tatsächlichen Browserablauf bestätigt.

## Schmale Ansicht und eigene UX-Beurteilung

Zunächst wurde per nativem Browserzoom eine Breite von 391 CSS px geprüft. Die daraus entstehende sehr kurze Höhe erforderte erwartbar viel Scrollen. Für eine sinnvollere mobile Proportion wurde das echte Fenster anschließend nativ schmal gezogen und mit 125 % Zoom geprüft: **400 × 596 CSS px**, Dokument-Client-/Scrollbreite **388/388 px**, Dialog **340/340 px**. Keine horizontale Überbreite. Die sichtbaren Felder, Pause und Save wurden tatsächlich bedient. Das war weiterhin ein Desktopbrowser, kein echtes Smartphone oder Touchtest.

Der Wochenzeitdialog ist im Normalfall verständlich: Kanal, Zone, Wochenzeit und Pause sind direkt sichtbar. Abstand und Zeitumstellung bleiben eingeklappt. Die zweite Bestätigung erklärt die Auswirkung einer Regeländerung, ohne den Nutzer durch technische Daten zu führen. Der Hinweis auf fehlende Kanalzeiten führt direkt zum passenden Ort; nach Rückkehr bleibt die eigentliche Arbeit erhalten.

Ein verbleibender kleiner UX-Punkt: Der große schwebende „Beitrag erstellen“-Button kann in schmaler Ansicht einen Teil des scrollbaren Inhalts vorübergehend überdecken. Durch Scrollen bleiben die Inhalte erreichbar; in diesem Durchgang entstand kein Funktionsblocker. Eine kompaktere mobile Aktion wäre eine sinnvolle spätere Verbesserung. Der lange Composer enthält außerdem mehrere Sicherheits-/Speicherhinweise; die wichtigsten Zustände sind klar, eine weitere sprachliche Verdichtung wäre möglich.

## Abgrenzung und Aufräumen

Die Mehrtab-409- und Rich-Workspace-Browserabläufe sind in der Komponentenprüfung dokumentiert, nicht als zusätzliche eigene Wiederholung ausgegeben. DST-Fold/Gap, Millisekunden, beschädigte Erfolgsantworten, Legacy-Clients und Restore-Races sind durch die automatisierten und unabhängigen Prüfungen abgedeckt, nicht sämtlich manuell durchgeklickt. Reale Sites-Identität, D1/R2 und Provider bleiben gesonderte Betriebsabnahmen.

Nach diesem Durchgang wurde der eigene Tab geschlossen, Zoom auf 100 % zurückgestellt und das native Fenster auf seine vorherige Größe zurückgezogen (bis auf einen Pixel Rundung). Andere Tabs wurden nicht bedient. Die lokale Preview wurde gestoppt. Der synthetische Laufzeitspeicher ist nicht Teil des Releasepakets.
