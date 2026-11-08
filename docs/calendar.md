# Kalender im integrierten Kandidaten

Der Kalender ist eine reine redaktionelle Planung, keine Veröffentlichungsbestätigung und kein automatischer Versand. Wochen-, Monats- und Listenansicht zeigen Termine in der gewählten Kalenderzeitzone. Datumssprung, Heute, Zeitraumwechsel, Suche, Kanal-, Label- und Statusfilter sind kombinierbar. Die Zusammenfassung zählt Beiträge, belegte Tage und eindeutige Kanäle im sichtbaren Zeitraum.

Die Anzeige projiziert den gespeicherten UTC-Zeitpunkt in die Anzeigezone und verändert weder Originaltermin noch Quellzeitzone oder Queue-Bindung. Bei abweichender Quellzone wird die Originalzeit zusätzlich angezeigt. Ein gespeicherter Zeitpunkt bleibt während der wiederholten DST-Stunde maßgeblich; ungebundene mehrdeutige oder nicht existierende Ortszeiten werden abgewiesen. Status: Entwurf, Eingeplant, Termin prüfen, Termin vergangen. Überfälligkeit ist kein Nachweis eines Providerfehlers oder einer Veröffentlichung.

Sieben Modelltests prüfen Tagesgrenzen, DST, Reihenfolge nach Zeitpunkt, Zusammenfassung, Status und ungültige Zonen. Bestehende UI-/Queue-Tests laufen in der Gesamtsuite. Finale Browserabdeckung und Grenzen: release-readiness-2026-11-08.md.
