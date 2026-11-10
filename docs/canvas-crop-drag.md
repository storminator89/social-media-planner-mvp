# Bildausschnitt direkt verschieben

Die folgenden Funktionen sind Teil des v30-Quellstands.

- Bild im Canvas ziehen; bestehende X/Y-Regler bleiben die Tastaturalternative, jetzt mit 0,1-Prozent-Schritten. Keine neue Moduswahl. Format und Zoom bleiben unverändert.
- Die Verschiebung setzt ausschließlich vorhandene Ausschnittwerte. Draw, JPG-Ausgabe und bewusstes Übernehmen verwenden weiter denselben Canvas. Original ohne Überstand bleibt unangetastet, auch bei Fließkomma-Rundungsresten.
- Textziehen hat Vorrang auf der gezeichneten Kontrastfläche bzw. den gemessenen Textzeilen ohne Hintergrund. Die alte unsichtbare, über die gesamte Bildbreite reichende Trefferzone wurde präzisiert. Textgestaltung und vertikale Textsteuerung bleiben gleich.
- Ein primärer/linker Pointer je Geste. Ende, Abbruch und verlorene Capture behalten die letzte Position als höchstens einen Undo-Schritt. Format-/Reglerwechsel, anderer Modalfokus, Beschäftigtzustand, Ersatzbild und Schließen beenden die alte Geste. Kein Zurückschreiben alter Snapshots. Close verwirft die Szene.
- Touch-Gesten sind nur auf einer ziehbaren Canvasfläche reserviert. Der restliche Dialog bleibt scrollbar; keine zusätzliche Zoom-/Scrollbedienung.

## Kleiner zusätzlicher Fehlerfix

Wenn sowohl ein Ersatzbild als auch das anschließende Rückrendern des bisherigen Bildes fehlschlagen, darf der alte Gültigkeitswert die fehlgeschlagene Vorschau nicht wieder freigeben. Die tatsächliche Rückrender-Prüfung entscheidet jetzt über Apply. Ursprungsbild, Alttext und Bearbeitungshistorie bleiben erhalten; Undo oder Reset ermöglichen Erholung. Eine kausale Negativkontrolle, die nur diesen Fix zurücknimmt, aktiviert Apply fälschlich.

## Methode und Grenzen

Die Source-/Testprüfung umfasst Pointer, Crop-/Textgeometrie, Historie, Load/Rollback, Apply, Composerübergabe, Paste und den eingebetteten Videoablauf. Backend, Hosting, CSP, Migrationen, Provider, Composer und Workspace bleiben bytegleich.

Automatisierte Tests führen die echte Studiofunktion mit kontrolliertem DOM/Canvas aus. Geprüft werden Koordinaten, responsive Rechtecke, Formate, Zoom, Rotation/Spiegelung, Ränder, Textpriorität, Capture-/Modal-/Busy-/Close-Unterbrechungen, Undo/Redo, Renderfehler und explizite JPG-Übernahme. Das ist kein nativer Browser-, Touchhardware-, Codec- oder Pixelnachweis. Kein Save, Upload, Versand oder Dienst wurde automatisch ausgelöst.
