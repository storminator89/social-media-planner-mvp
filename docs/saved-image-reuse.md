# Gespeicherte Bilder wiederverwenden

Im Beitragseditor öffnet „Aus Planung wählen“ eine kleine Bildauswahl. Sie zeigt Bilder, die bereits in der geladenen Planung verwendet werden. Ein Bild markieren und danach „Bild übernehmen“ wählen. Erst das normale Speichern des Beitrags übernimmt die Auswahl in die Planung.

## Umfang

- Keine neue Mediathek oder Uploadstrecke: Die Auswahl verwendet die vorhandene private Bildreferenz. Derselbe Bilddatensatz kann in mehreren Beiträgen stehen, ohne Bildbytes erneut hochzuladen, umzuwandeln oder zu kopieren.
- Jedes Bild erscheint einmal. Dateiname, vorhandener Alt-Text, bis zu zwei Quellbeiträge und die Anzahl der Verwendungen helfen bei der Auswahl. Der vollständige bestehende Alt-Text bleibt erhalten, auch bei älteren Bildern mit bis zu 2000 Zeichen.
- Das Auswählen ändert ausschließlich das Bild des offenen Beitrags. Text, Kanalvarianten, Labels und Termin bleiben erhalten. Ein bestehendes Cover wird bei erfolgreicher Übernahme durch das Bild ersetzt. Quellbeiträge werden nicht in den Editor kopiert.
- Für die Auswahl werden alle geladenen Beiträge berücksichtigt, unabhängig von der aktuell sichtbaren Ansicht oder Filterung. Nicht mehr in Beiträgen verwendete Bilder und reine Arbeitsfassungs-Bilder werden nicht durchsucht.
- Bestehende Bildbearbeitung, Video-Standbilder und lokale Dateiauswahl bleiben unverändert verfügbar.

## Erhalt und Fehlerbehandlung

Vor der Übernahme wird die Referenz erneut gegen die aktuelle Planung geprüft. Die private Bild-URL muss erfolgreich geladen und als Bild mit positiven Maßen, höchstens 16384 Pixeln pro Seite und höchstens 40 Millionen Pixeln erkannt werden. Nach spätestens 15 Sekunden endet der Versuch mit einem verständlichen Hinweis. Bei Fehlern, Abbruch, geschlossenem Editor, neuem Editor oder zwischenzeitlich geändertem Ausgangsbild bleibt die vorhandene Auswahl erhalten. Eine verspätete Antwort darf keine neue Bearbeitung überschreiben.

Die Übernahme erfolgt erst nach dieser Prüfung. Scheitert die Aktualisierung der Oberfläche oder die Erfassung der Arbeitsfassung, wird die vorherige Bildauswahl wiederhergestellt. Ein erneuter Klick startet während einer laufenden Übernahme keinen zweiten Vorgang. Escape oder Abbrechen schließt nur die Bildauswahl und stellt den Fokus wieder her.

Unvollständige, widersprüchliche oder nicht verwendbare Bildverweise werden ausgelassen. Bilder ohne Alt-Text werden nicht angeboten, weil sie sich über den vorhandenen Speicherweg nicht unverändert verwenden lassen. Ein Hinweis verweist auf den ursprünglichen Beitrag. Ist die Planung nicht verfügbar, zeigt der Dialog diesen Zustand und bietet keine scheinbar nutzbare Auswahl.

## Grenzen

- Dies ist eine Auswahl aus bereits geladenen Beiträgen, keine vollständige Speicherinventur und kein Backup. Entfernte oder neue Bilder aus einem anderen Tab erscheinen erst mit dem nächsten regulären Laden. Bestehende Versionskonflikte bleiben unverändert abgesichert.
- Private Bildvorschauen erzeugen GET-Anfragen. Die bestehende Arbeitsfassungssicherung kann eine übernommene Referenz automatisch sichern. Der neue Ablauf ruft weder Bild-Upload noch Beitragsspeicherung selbst auf. Das anschließende normale Speichern verwendet die vorhandenen API- und Versionsregeln und kann wie bisher Zeitstempel des gesamten Planungsstands aktualisieren.
- Bilddateien können nach erfolgreicher Vorschau weiterhin serverseitig fehlen. Die Dekodierprüfung ist keine dauerhafte Verfügbarkeitsgarantie und prüft keine Decoder-Speichergrenze vor dem Dekodieren.
- Ein bereits gespeicherter Alt-Text wird unverändert übernommen. Änderungen am Bild oder seiner Beschreibung erfolgen weiterhin über den bestehenden Bildeditor als neues Bild.
- Keine Migration, keine zusätzliche Berechtigung, kein neuer Dienst, keine CSP-Änderung und kein automatischer Social-Media-Versand.
