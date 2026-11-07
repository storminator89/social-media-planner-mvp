# Queue-Vorschläge im lokalen Editor

Version 0.2 bietet eine gemeinsame Wochen-Slot-Auswahl für alle aktuell gewählten Kanäle. Startwerte sind sichtbar: Montag, Mittwoch und Freitag um 09:00, 30 Minuten Mindestabstand. Sie sind frei bearbeitbare redaktionelle Vorgaben, keine behauptete optimale Sendezeit.

1. Beitrag und Kanäle wählen; bei Bedarf eigene Kanaltexte verfassen.
2. Im Composer „Freie Queue-Termine“ öffnen und Tage/Uhrzeit/Abstand wählen. Die Zone ist die sichtbare Beitragszeitzone.
3. „Vorschläge suchen“ durchsucht 60 Tage und zeigt bis zu drei freie gemeinsame Termine. Keine Speicherung.
4. Einen Termin ausdrücklich übernehmen. Dadurch ändern sich nur Datum/Zone im Formular.
5. „Im Prototyp einplanen“ validiert Inhalt und speichert mit Revisionsprüfung. „Als Entwurf speichern“ bewahrt den Inhalt ohne Termin.

Regeln und Vorschläge werden beim Schließen verworfen. Inhalts-, Kanal-, Medien-, Zeit- oder Regeländerungen verwerfen alte Vorschläge. Bei Übernahme werden Fingerabdruck, Kanalmenge, Regeln, Zeit und belegte Termine nochmals geprüft. Der serverseitige 409-Schutz bleibt für andere Browser und konkurrierende Speicherungen notwendig.

Nur geplante Beiträge auf mindestens einem gleichen Kanal blockieren. Der bearbeitete Beitrag blockiert sich nicht selbst; andere Kanäle und Entwürfe blockieren nicht. Exakt gleiche Zeit blockiert immer. Ein Abstand unter dem gewählten Minimum blockiert, genau das Minimum ist erlaubt.

DST-Lücken werden nicht verschoben. Mehrdeutige Ortszeiten werden ausgelassen, da die UI keinen gesonderten Disambiguierungswert speichert. Kein Versand, Hintergrundjob oder automatischer Statuswechsel wird ausgelöst.

Die wiederverwendbare Bibliothek unterstützt unterschiedliche Regeln je Kanal und bildet deren gemeinsame absolute Schnittmenge. Die Oberfläche bietet zunächst nur gemeinsame temporäre Regeln. Dauerhafte Queue-Einstellungen, Vorlagen, Bulk-Planung und Freigaben sind separate Ausbauschritte.
