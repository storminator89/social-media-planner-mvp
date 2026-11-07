# Redaktionelle Labels und Bild-Alttext: Version 0.7.1

Dieses Inkrement erweitert den lokalen Planer. Es aktiviert keinen Provider, veröffentlicht keine Site und ändert weder API noch Datenbankschema. Die acht übernommenen Implementierungs-/Testdateien sind in `SOURCE-v 0.7.1.sha256` gebunden; das Root-Manifest beschreibt den vollständigen Release.

## Bedienung

Normale Beiträge besitzen im Editor ein optionales Labels-Feld mit dem bestehenden CSV-Parser der Ideenansicht. Labels sind redaktionelle Metadaten, keine automatisch angehängten Hashtags. Kalender, Liste und Entwürfe können nach einem exakten Label gefiltert werden, gemeinsam mit Kanal und Suche. Zusammenfassung und Reset machen auch null Treffer sichtbar. Die Ideenansicht behält ihren getrennten Filter.

Unveränderte Labels bleiben exakt erhalten, einschließlich Reihenfolge, Whitespace, CRLF, Duplikaten und ungewöhnlichem Unicode. Erst eine bewusste Eingabeänderung verwendet die bestehenden Trim-/NFC-/Deduplizierungsregeln. Kommas, Anführungszeichen und der echte Labelname `all` kollidieren nicht mit dem Kein-Filter-Sentinel. Labels werden escaped angezeigt und sind in den zugänglichen Namen der Beitragsbuttons enthalten.

Das neue Feld ist Bestandteil von Dirty-Prüfung und Speichersperre. Fehler und 409-Konflikte lassen den Editorinhalt stehen. Späte Antworten schließen keine neuere Eingabe; Duplizieren und Ideenübernahme bewahren Metadaten.

Der Alttext eines bereits gespeicherten Bildes ist sichtbar schreibgeschützt. Die Erklärung benennt die bestehende API-Grenze, statt eine nicht unterstützte Änderung scheinbar anzubieten. Bei neu gewählten lokalen Bildern bleibt Alttext bearbeitbar. Es gibt keine neue Medien-Schreibroute.

## Nachweise

16 neue fokussierte UI-Regressionen und zwei echte SQLite-/API-Roundtrips ergänzen die vorhandene Suite. Der vollständige integrierte Teststand und unabhängige Review stehen in `../verification.md`.

Die tatsächliche lokale Browserprüfung umfasste Speichern und Reload eines gelabelten Entwurfs, Editieren/Abbrechen, Duplizieren, Labels ändern und lokal planen, Wochen-/Monats-/Listenfilter, null Treffer und Reset. Auch Kombination mit Suche sowie Tastaturfokus wurden geprüft. Es wurden ausschließlich synthetische QA-Texte eingegeben.

Mobil: natives Browserfenster mit 388 CSS-Pixeln, jeweils 378 Client-/Scroll-Pixel in Seite und Composer, kein horizontaler Überlauf. Filter, Reset, Labels-Feld und Fußleiste waren bedienbar. Die abschließende Ergänzung des zugänglichen Buttonnamens folgte nach diesem Browserlauf und wurde separat als semantischer Diff getestet.

Alttextverhalten wurde in Source-/Controller-Tests geprüft, nicht durch einen tatsächlichen Browser-Dateiupload. Kein Bild-/Videoupload, Provideraufruf, Grant, Secret oder Deployment. Preview gestoppt; keine QA-Datenbank im Artefakt.

## Grenzen

Kein automatisches Social-Publishing, Analytics, Teamzugriff oder vollständige Buffer-Gleichwertigkeit. Dauerhafte kanalbezogene Posting-Zeitpläne, serverseitige Editor-Arbeitsfassungen und deren neue Schemas sind ausdrücklich nicht enthalten. Alle bisherigen Live-Grenzen aus 0.7 gelten unverändert.

Als Produktreferenzen dienten öffentliche Buffer-Anleitungen zu Kalender, Planung und Tags. Die Implementierung ist eigenständig; kein Buffer-Code oder Kontozustand wurde übernommen:

- https://support.buffer.com/en-us/articles/how-to-use-buffers-calendar-feature-FSSKbH32DN
- https://support.buffer.com/en-us/articles/scheduling-posts-4Qdld7giAZ
- https://support.buffer.com/articles/creating-and-managing-tags-2XU5Rft4ri

REA v60 wurde erneut berücksichtigt. Vollständiger Quellbaum bedeutet normale Source-/Testprüfung, keine REA-Engine oder Live-Capture-Behauptung.


Dieses Komponentenmanifest ist historisch für 0.7.1. App/HTML und einzelne Tests wurden in 0.8 durch Arbeitsfassungen erweitert; für die aktuelle Integrität gilt ausschließlich das Root-Manifest.
