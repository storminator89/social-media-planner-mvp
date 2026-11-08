# Integrierter Releasekandidat, 8. November 2026

## Entscheidung

GO für eingefrorenen lokalen Reviewkandidaten. NO-GO für Live-Release, bis visuelle integrierte Desktop-/Mobil-Medien-QA mit Dateiauswahl, mehreren Anhängen, Reorder, Save/Reopen und Restore abgeschlossen ist. Keine Live-Mutation, Migration, Veröffentlichung oder Provideraktion wurde vorgenommen. Eine vorher abgebrochene Upload-Freigabe wurde nicht wiederholt oder über einen anderen Uploadweg umgangen.

Worker SHA-256: 3330d74bc2ff0e54b6166e3b59aa72718c95bb1cb6f74ed7113e6cc95cffbae2. Der Kandidat enthält dieselben Laufzeitquellen wie der integrierte Ausgangsstand; nur Dokumentation und Dateimanifest wurden finalisiert. Tests: 1782 bestanden, 0 fehlgeschlagen/ausgelassen/abgebrochen. Vollständige JavaScript-Syntaxprüfung erfolgreich.

## Migration und Kompatibilität

Hosted 0011 fügt ausschließlich zwei Trigger hinzu, ohne Tabellen-/Datenänderung. Die bisherigen Migrationen 0001–0010 bleiben bytegleich. Journalfolge und lokales Äquivalent 0014 sind geprüft. Tests migrieren auch einen mit aktiven, verworfenen oder abgelaufenen Arbeitsfassungen befüllten Altstand: Nutzdaten bleiben unverändert, sekundäre Anhangreferenzen verhindern Löschung und Identitätsänderung; fremde Besitzer und unreferenzierte Medien bleiben unabhängig. Dies ist SQLite-Vertragsprüfung, kein Nachweis einer bereits ausgeführten D1-Migration.

Der neue Workspace-Server verhindert ein Zurückschreiben ohne Anhangfeld innerhalb derselben CAS-Mutation. Alte Workspace-Clients lehnen unbekannte Felder/Videos ab. Der geprüfte Basis-Adapter lehnt Posts mit mehr als einem Medium beim Lesen ab. Veraltete Planner-Schreibstände scheitern am Revisionsschutz. Der aktuelle Adapter weist Legacy-Projektionen ohne vollständige Anhangliste zurück. Das ist kein genereller Schutz gegen jede beliebige historische Clientversion oder absichtlich hergestellte API-Payloads.

Release-Reihenfolge: additive 0011 einmal über das verwaltete Journal anwenden; Frontend und Backend als zusammengehörige Version liefern; alte Tabs schließen/neu laden, ungesicherte lokale Eingaben vorher sichern. Nicht auf einen alten Single-Media-Writer zurückrollen und neue Datensätze überschreiben. Ein produktiver Rollback-Drill sowie Echtbetrieb von D1/R2 wurden in diesem lokalen Gate nicht ausgeführt. Trigger nicht für einen Rollback entfernen.

## Browserprüfung dieses Kandidaten

Offizieller lokaler Sites-Preview und cua_repl. Leerer synthetischer Entwicklungsplan, keine Kundendaten. Desktop-Kalender visuell geprüft, Wochen-/Monatsdarstellung und Statusfilter ausgeführt. Composer zeigt das Limit von zehn Anhängen, Medienraum öffnet. Abbrechen kehrt ohne Dateiübernahme zum Composer zurück und stellt Fokus auf Medien öffnen wieder her. Editor schließen kehrt zum Kalender zurück. Kein Browser-Dateiupload versucht. Die im früheren Studio-Bericht dokumentierten Bilder-/Videoflows gehören zu einem älteren Teilstand und ersetzen das offene Integrationsgate nicht. Echte Mobilhardware, Mobile Safari, Crop/Export, Multi-Anhang-Save/Reopen und Workspace-Restore wurden in diesem finalen Browserlauf nicht nachgewiesen.

REA: Im Checkout keine REA-Skill/CLI gefunden; keine REA-Evidence behauptet. Normale Tests, statischer Review und Browserbeobachtungen sind separat ausgewiesen.
