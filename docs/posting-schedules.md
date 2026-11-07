# Gespeicherte Posting-Zeiten

## Bedeutung

Jeder Kanal kann eigene Wochentage und Uhrzeiten in einer IANA-Zeitzone besitzen. Bis zu 56 Slots pro Kanal, Mindestabstand 0–1440 Minuten, optional pausiert. Ein Beitrag für mehrere Kanäle erhält nur einen gemeinsamen absoluten Zeitpunkt, der allen Regeln entspricht. Unabhängig vorgemerkte Kanalvarianten zählen ebenfalls zur Belegung. Die UI unterstützt weiterhin gemeinsame Posttermine, keine voneinander abweichenden Varianten-Termine.

Feste Termine besitzen keine Queue-Bindung. Ein bewusst gewählter Slot erzeugt eine Bindung an Kanal, Slot-ID, lokale Zeit, Zone, DST-Auswahl und Mindestabstand. Regeländerungen verschieben keine Termine. Entfernte oder pausierte Slots markieren vorhandene Bindungen zur Prüfung; weitere neue Slots machen eine unveränderte Referenz nicht ungültig. Ohne passende gemeinsame Slots gibt es keinen Vorschlag.

## Zeit und Speicherung

UTC plus IANA bleiben maßgeblich. Nicht existierende Ortszeiten werden ausgelassen, nie verschoben. Bei doppelten Ortszeiten gilt die explizite Kanalregel (ablehnen/früher/später). Bestehende feste Fold-Termine behalten ihren exakt bestätigten UTC-Instant einschließlich Sekunden und Millisekunden. Ein frei eingesandter Browser-UTC-Wert ist kein Nachweis; der Adapter akzeptiert ihn nur zur passenden gespeicherten Originalprojektion.

Ein neues Slot-Save muss dieselbe aktuelle Snapshotrevision, aktuelle Regeln und freie Gesamtbelegung nachweisen. Zwei gleichzeitige Tabs können einander nicht still überschreiben. Eine Regeländerung ist Vorschau und ausdrückliches Speichern, kein Scheduler. Manuelle Änderungen entkoppeln bewusst; Entwurf und Duplikat tragen keinen versteckten Instant oder Queueauftrag.

## Arbeitsfassungen und Undo

Arbeitsfassungen bewahren optional den vollständigen Planungskontext, aber erteilen damit kein Planrecht. Wiederaufnahme verändert weder Source-Revision, selectedAt noch Bindung. Eine spätere reguläre Planerspeicherung prüft aktuelle Regeln und Belegung. Eine neue Kopie oder geänderte Herkunft darf einen bestätigten Originalinstant nicht still übernehmen.

Kurzes Undo kann einen exakt gehaltenen queuegebundenen Post mit privatem serverseitigem Hashnachweis wiederherstellen. Begrenzung: 60 Sekunden/100 Nachweise je Besitzer, nur bestätigte oder passend read-only abgeglichene Löschung, frische Kollisionsprüfung. Es ist kein Papierkorb. Kaputte Erfolgsantworten werden nicht automatisch wiederholt.

## Bewusster Unterschied zu Buffer

Buffer dokumentiert kanalweise Zeitzonen und automatisches Neuverteilen von Queue-Terminen nach bestimmten Regeländerungen, während feste Termine bleiben. Takt wählt die konservativere Bedienung: bestehende Zeiten bleiben immer erhalten, Änderungen und Neuplanung sind ausdrücklich. Quelle: https://support.buffer.com/en-us/articles/setting-up-your-timezones-and-posting-schedules-P4iSag90Fl

Kein optimaler Sendezeitpunkt wird behauptet. Kein Provider wird verbunden, kein Beitrag versendet. Der lokale Testserver und simulierte Besitzer sind kein Sites-Authnachweis.
