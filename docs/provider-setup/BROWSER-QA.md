# Gemeinsame Einrichtung: interaktive Browserprüfung

Geprüft am 7. November 2026 auf einer getrennten QA-Kopie des integrierten Quellstands, über den regulären Sites-Preview und die echte lokale Serverroute. Kein simulierter UI-Store, kein Headless-Ersatz. Die CUA-Bedienung nutzte sichtbares Cloud-Chromium, eigenes Browser-Tab 55 und das bestehende native Fenster. Die Ansicht desselben Streams beim Nutzer wurde nicht unterstellt.

## Tatsächlich bedient

1. Verbindungen geöffnet und alle vier Anbieter mit ihrem tatsächlichen gesperrten Serverzustand gesehen.
2. LinkedIn-Anleitung geöffnet, Schritt 2 per Enter aufgeklappt, Status aktualisiert. Offene Haupt-/Unterdetails und Fokus auf „Status aktualisieren“ blieben erhalten. Rückkehradresse in der lokalen HTTP-Vorschau blieb ausdrücklich nicht verfügbar, ohne Kopierknopf.
3. Instagram-Anleitung geöffnet und Schritt 2 per Tastatur gelesen: professionelles Konto, App-Voraussetzungen und noch fehlende Rücksprungroute. Kein fingierter Callback oder Connect-Knopf.
4. YouTube-Anleitung geöffnet, Google-App-Details gelesen und wieder geschlossen. Die sichtbare Kurzfolge blieb „Kanal wählen / Google-App einrichten / Sicher verbinden“. Kein Upload oder Grant wurde begonnen.
5. X-Anleitung und Kostenhinweis geöffnet: auch Abfragen können kostenpflichtig sein, keine Credits oder automatische Aufladung. Kein Connect-/Zahlungsweg.
6. Natives Fenster verkleinert und Browserzoom auf 125 % gestellt: 400 × 606 CSS-Pixel, Dokument 388/388 Client-/Scrollbreite. Alle Karten 348/348, alle vier Einrichtungsbereiche 308/308 ohne horizontale Überbreite. Details und Rückkehrhinweis bedient; Refresh hielt Fokus und offene Bereiche.
7. Über die mobile Navigation zur Planung und zurück gewechselt. Keine unbeabsichtigte Provideraktion; die Ansicht blieb nutzbar. Alle vier Kurzfolgen hatten weiterhin exakt drei Schritte.

Screenshots wurden tatsächlich visuell beurteilt. Der Desktop war ungefähr 1180 CSS-Pixel breit; die schmale Ansicht war ein durch native Fenstergröße und Zoom erzeugtes Desktoplayout, kein Mobilgerät/Touchtest. Eigener Prüftab wurde geschlossen, Zoom auf 100 % und Fenstergröße auf den vorher beobachteten Wert zurückgestellt. Preview danach gestoppt. Keine weiteren vorhandenen Tabs verändert.

## Eigene UX-Einschätzung

Die nummerierten Kurzfolgen sind gut scannbar. Technische Begriffe, Scopes und App-Anforderungen sind erst nach bewusstem Aufklappen sichtbar; gut erkennbare Fokusrahmen und ausreichend große Summary-Zeilen funktionieren per Tastatur. Die vier Karten bleiben auf schmaler Ansicht einspaltig, ohne abgeschnittene Texte.

Die bestehende Verbindungsseite hat weiterhin relativ ausführliche Sicherheits-/Zugriffsgrenzen vor den Anleitungen, besonders bei YouTube. Das ist verständlich, benötigt mobil aber Scrollen. Die neu ergänzten Hauptschritte vermeiden zusätzliche Textwände; App-Einrichtung selbst ist dennoch kein nahtloser Login. Diese Prüfung behauptet ausdrücklich keinen erfolgreich verbundenen Anbieter.

## Nicht als Browsernachweis behauptet

Keine Provideranmeldung, Credentialeingabe, Consent-, Upload-, Post- oder Zahlungsaktion; keine fremden Hilfelinks geöffnet. Die echte HTTPS-Callback-Kopie konnte in der absichtlich nicht gehosteten lokalen Gesamtansicht nicht ausgeführt werden. URL-Pinning, Clipboard-Erfolg/Fehler/Deadline und Hide/Destroy sind zusätzlich automatisiert geprüft; ein separater Komponentenversuch des YouTube-Bausteins ersetzt keine gehostete Gesamtprüfung. Keine Berechtigungs-, Hosting- oder Sicherheitskonfiguration verändert.
