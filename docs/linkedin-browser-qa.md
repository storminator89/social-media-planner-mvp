# LinkedIn-Web-QA: echte gesperrte Route

Geprüft wurde eine getrennte Kopie des integrierten 0.6-Quellstandes. Der Integrationsbaum wurde nicht verändert. Start über den vorgesehenen Sites-Preview-Daemon; verwendete URL `http://127.0.0.1:4173/`. Keine OAuth-Konfiguration, keine Secrets oder Providertransporte hinzugefügt.

## Beobachtete Ergebnisse

- Desktop: vier Anbieter in zwei Spalten. LinkedIn trägt nur „Einrichtung erforderlich“, während die übrigen Karten ihren eigenen Status behalten. Keine widersprüchliche zweite LinkedIn-Statusanzeige.
- Der Button „Persönliches LinkedIn-Konto verknüpfen“ ist tatsächlich disabled. Kein Disconnect-Button und keine OAuth-Ankerlinks im Verbindungsbereich vorhanden.
- Aufgeklappte Voraussetzungen benennen fehlende technische Einrichtung, sichere Rückkehr, registrierte App, Antwortschutz, sicheren Zugriffsspeicher, bestätigtes persönliches Zielkonto und weiterhin gesperrten Versand in verständlicher Sprache.
- Refresh lädt den wirklichen Zustand neu. Tastaturfokus bleibt auf „Status aktualisieren“; geöffnete Voraussetzungstexte bleiben geöffnet.
- „Zur Planung“, die Verbindungsnavigation und die mobile Navigation funktionieren. Browser Zurück/Vorwärts stellt die letzte Verbindungsansicht wieder her und bleibt gesperrt. Hinweis: Die bestehende App verwendet `history.replaceState`; interne View-Wechsel erzeugen keine einzelnen History-Einträge. Es wurde keine tatsächliche BFCache-Wiederherstellung nachgewiesen; die entsprechende Lebenszyklusprüfung erfolgt durch Unit-Tests.
- Die mobile CSS-Ansicht wurde bei 386 CSS-Pixel Breite mittels normaler 300-%-Browservergrößerung geprüft, nicht mit Geräte- oder Touch-Emulation. Dokumentbreite ebenfalls 386 Pixel, kein horizontaler Überlauf, einspaltiges Kartenlayout. LinkedIn-Button 44 Pixel hoch, fünf mobile Navigationsbuttons jeweils etwa 52,3 Pixel hoch. Voraussetzungen und X-Kostenhinweis sind lesbar und aufklappbar.
- Ein direkter lokaler Aufruf mit `?linkedin=linked#connections` behauptet keinen Erfolg: LinkedIn bleibt „Einrichtung erforderlich“, Start bleibt disabled, Disconnect fehlt.
- Der X-Hinweis verlangt weiterhin ausdrückliche API-/Kostenfreigabe und behauptet keine Aktivierung.

Kein neuer sichtbarer UI-Fehler festgestellt. Browserzoom wurde auf 100 % zurückgestellt, der eigene QA-Tab geschlossen und die Preview gestoppt. `sites-preview status` bestätigte „Sites preview stopped“.

## Grenzen

Dies ist ausschließlich Browser-QA der echten gesperrten Route. Es gab keine OAuth-Weiterleitung, Provideranmeldung, Konto-/Grant-Erzeugung, Tokenübermittlung, Veröffentlichung oder Uploads. Erfolgreiche Verknüpfung, kryptografische Callback-Prüfung und Disconnect wurden damit nicht live getestet. Die spätere URL-/Ablauf-Härtung wurde getrennt per Unit-/Async-Tests geprüft; deren positive OAuth-Pfade wurden ebenfalls nicht im Browser aktiviert.
