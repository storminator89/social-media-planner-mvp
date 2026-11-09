# Sicheres Duplizieren im Composer

Duplizieren erstellt weiterhin einen Entwurf aus dem **gespeicherten Beitrag**. Die Kopie übernimmt Inhalt, Kanalvarianten, Titel, Labels und Bildreferenz. Sie übernimmt keinen Termin und keine Queue-Bindung. Es gibt keinen Social-Versand.

- Eine wiederaufgenommene Arbeitsfassung kann einen anderen Inhalt als der gespeicherte Beitrag haben, auch wenn seit der Wiederaufnahme nichts mehr eingegeben wurde. Duplizieren bittet deshalb zuerst um bewusstes Beitragsspeichern. Das gilt auch für Änderungen nur am Titel. Ein gescheiterter oder unklarer Save hebt diesen Schutz nicht auf.
- Treffen während des Duplizierens noch Eingaben ein, bleibt der ursprüngliche Composer nach dem bestätigten Kopienspeichern geöffnet. Die bereits gespeicherte Kopie enthält nur die ursprüngliche gespeicherte Fassung. Neuere Eingaben werden nicht stillschweigend in sie geschrieben oder durch ihr Öffnen ersetzt.
- Die vorhandene Arbeitsfassungswarnung markiert diese neueren Eingaben als nicht gesichert. Es folgen weder ein automatischer Beitragssave noch ein neuer Arbeitsfassungssave oder ein Verwerfen der vorhandenen Arbeitsfassung.
- Ohne neuere Eingaben öffnet sich wie bisher die neue Kopie. Die ursprüngliche gespeicherte Fassung bleibt bestehen.

Der Wiederaufnahme-Marker ist ausschließlich sitzungsbezogen. Er wird beim normalen Öffnen/Schließen oder einem bestätigten Beitragssave zurückgesetzt und verändert kein gespeichertes Schema. Es gibt keine neue API, Migration, Berechtigung oder CSP-Regel.

## Grenzen

Die vorhandenen Revisionen und Fehlerregeln bleiben bestehen. Ein unklarer Speicherabschluss ist kein bestätigtes Duplikat und wird nicht automatisch wiederholt. Dieser Schutz ist kein allgemeines Backup: lokale Bildbytes werden weiterhin nicht durch Arbeitsfassungen gesichert; Schließen oder Neuladen kann ungesicherte Eingaben verlieren. Browserwarnungen ersetzen kein bewusstes Speichern.

Tests üben die tatsächlichen App-Funktionen mit verzögerten Erfolgs-/Fehlerantworten, neueren Texten/Varianten/Labels, Kanal- und Zeitänderungen, Bildern sowie dem echten Arbeitsfassungscontroller aus. Eine reale Browserabnahme ist separat nachzuweisen.
