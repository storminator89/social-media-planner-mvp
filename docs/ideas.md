# Ideen-Inbox

## Bedienung

Eine Idee braucht einen Titel oder eine Notiz. Labels sind optional. Titel und Labels erlauben mehrzeilige Inhalte; Labels mit Kommas, Anführungszeichen oder Zeilenumbrüchen können in Anführungszeichen eingegeben werden. Suche und Labelauswahl filtern die Inbox. Eine Idee besitzt noch keine Kanäle, Medien oder Termine.

„Als Beitrag vorbereiten“ öffnet einen nicht gespeicherten Vorschlag. Die ursprüngliche Idee bleibt bestehen, bis der reguläre Entwurfs- oder Planungssave erfolgreich ist. Kanäle werden bewusst ausgewählt; ein Titel wird nicht automatisch zum Beitragstext. Der Übergang behält dieselbe ID und das Erstelldatum. Titel und Labels bleiben am Beitrag erhalten. Abbruch verwirft nur den Vorschlag. Ein Konflikt hält die Eingabe offen und verlangt manuelles Zusammenführen.

## Vertrag

UI: `status:'idea'`, `title`, `text`, `tags`, `channels:[]`, `variantTexts:{}`, `scheduledAt:null`, `media:null`, `cover:null`. Backend: vorhandener `stage:'idea'`, keine neue Sammlung. API-Schema weiterhin 2.

Grenzen: Titel 200 Zeichen, Notiz 20.000 Zeichen, 20 Labels mit je 60 Zeichen. Neue oder gezielt bearbeitete Labels werden getrimmt und dedupliziert. Bereits vorhandene, nicht bearbeitete Metadaten werden nicht still normalisiert. Vorbereiten ist rein lokal; erst ein erfolgreicher vollständiger Snapshot-Save bestätigt die Umwandlung.

## Keine simulierte Veröffentlichung

Planen bedeutet hier redaktionelle Terminierung. Weder Ideen noch geplante Beiträge werden an einen Provider geschickt. Die sichtbaren Kanalprofile sind ausdrücklich unverbundene Beispiele. Keine OAuth-Verbindung, Zugangsdaten, echte Teamfreigabe oder automatischer Versand.
