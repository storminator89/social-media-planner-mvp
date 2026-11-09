# Zeithinweise ohne Neuladen aktualisieren

Eine lange geöffnete Planung kann über ihren nächsten Termin oder den Tageswechsel hinweg unverändert auf dem Bildschirm stehen. Die neue kleine Anzeige erkennt solche Zeitwechsel anhand der bereits geladenen Planung und der Geräteuhr. Sie bietet „Anzeige aktualisieren“ an. Es wird kein Beitrag automatisch veröffentlicht, verschoben oder gespeichert.

## Bewusste Aktualisierung

- Prüfung alle 30 Sekunden, bei Fensterfokus und nach sichtbarer Wiederaufnahme.
- Überwacht Home, Queue, Kalender und Liste. Ideen, Entwürfe, Verbindungen oder nicht geladene Planung bekommen keinen Zeithinweis.
- Vergleicht sowohl den Planungsstatus als auch den exakten UTC-Fälligkeitswert. Auch ein bereits als „Termin prüfen“ markierter Beitrag kann neu vergangen sein und zusätzliche Hinweise benötigen.
- Der Tageswechsel richtet sich nach der gewählten Planungszeitzone, nicht nach der UTC-Mitternacht. Feste UTC-Zeitpunkte bleiben bei Zeitumstellungen maßgeblich.
- Ein Zeitereignis verändert ausschließlich den Hinweis. Es ersetzt weder Karten noch Filter, fokussierte Elemente, Textauswahl oder den offenen Editor. Der Hinweis bleibt bis zur nächsten tatsächlich gerenderten Ansicht bestehen, auch wenn die Uhr zwischenzeitlich zurückgestellt wird.
- Der Button rendert den vorhandenen geladenen Stand bewusst neu. Filter, gewählter Zeitraum und ausgeklappte Home-Bereiche bleiben im vorhandenen Zustand. Fokus geht mit preventScroll auf den stabilen Hauptbereich; die bisherige Scrollposition einschließlich des horizontalen Wochenrasters wird wiederhergestellt, soweit die neue Inhaltsgröße das erlaubt.
- Offene Dialoge sowie laufende Speicherung, Bilddekodierung oder Arbeitsfassungs-Lesezugriffe sperren diese Aktion. Nach Dialogschluss wird erneut geprüft. Im Hintergrund oder Pagehide pausiert der Timer, ohne den fokussierten Hinweis zu verstecken. Pageshow nimmt die Prüfung wieder auf.

## Abschluss und Fehler

Ein Zeitstempel vom Beginn eines normalen Renderns ist kein Erfolgsnachweis. Der lokale Startstempel wird erst nach erfolgreichem Rendern an `#content` gespeichert. Erst dessen tatsächliche Ersetzung bestätigt die neue Anzeige. Ein späterer fehlgeschlagener Versuch kann den letzten erfolgreichen Inhaltsstempel nicht überschreiben. Scheitert ein Render vorher, bleibt der Hinweis bestehen. Allgemeine Fehlermeldungen geben keine rohen internen Fehlerdetails aus. MutationObserver und Timer beobachten nur die vorgesehenen Elemente bzw. Ereignisse und lassen sich vollständig entfernen.

## Grenzen

- Das ist eine zeitliche Neubewertung des geladenen Stands, kein Server-Reload. Änderungen in anderen Tabs werden dadurch nicht geladen; bestehende Revisionen und Konfliktregeln bleiben unverändert.
- Es gibt keinen neuen Planer-API-, Speicher- oder Provideraufruf. Beim bewussten normalen Rendern können bestehende private Bildvorschauen erneut per GET geladen werden.
- Der Hinweis kann bis zu 30 Sekunden später erscheinen. Eine falsche Geräteuhr kann falsche Einordnungen liefern. Es gibt keine neue Uhrensynchronisierung oder Erinnerung außerhalb der geöffneten App.
- „Termin vergangen“ bleibt ausdrücklich kein Versandnachweis. Die Statusanzeige erteilt keine Veröffentlichungsfreigabe.
- Es werden kein Datenbankschema, Grant, CSP, Hosting oder zusätzlicher Dienst geändert. Diese Änderung integriert keine anderen parallel vorbereiteten Funktionen.
