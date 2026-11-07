# YouTube zuerst verbinden: nächster echter Schritt

## Aktueller Stand

Der Quellcode hat den kompletten Google-Webablauf: Start, PKCE, geschützte Rückkehr, Identitäts- und Kanalprüfung, verschlüsselte Ablage und Statusanzeige. Das ist kein Nachweis einer live verbundenen Google-Sitzung. Der lokale Vorschau-Server kann OAuth absichtlich nicht aktivieren.

Die Rückkehr zeigt jetzt einen verständlichen Hinweis für Abbruch, Fehler oder ungewisses Ergebnis. Auch `youtube=linked` in der Adresse bestätigt keine Verbindung: Ausschließlich die neu gelesene Serverantwort entscheidet. Der Hinweis wird aus der Adresse entfernt, ohne andere Parameter oder den Verlaufzustand zu löschen. Es erfolgt kein automatischer zweiter Anmeldeversuch.

## Was für die erste echte Verbindung noch fehlt

1. **Ziel festlegen:** die konkrete YouTube-Kanal-ID (`UC…`) und die bereits autorisierte private HTTPS-Site bestätigen. Keine neue Veröffentlichung oder Hoständerung aus diesem Dokument ableiten.
2. **Google-App und sichere Einrichtung:** vorhandenen Web-OAuth-Client mit exakt registrierter Rückkehradresse prüfen. Nur nach gesonderter Freigabe Credentials, Verschlüsselungsschlüssel oder dauerhafte Grants erstellen beziehungsweise konfigurieren. Secrets nicht in Chat, Quelltext oder UI eintragen. Details und exakte Runtime-Felder stehen in `../youtube-operation.md`.
3. **Live-Rückkehr abnehmen:** dieselbe authentifizierte Sites-Identität und der Versuchscookie müssen nach Google zurückkehren. Erst danach bewusst „YouTube-Kanal verknüpfen“ und bei Google freigeben. Den tatsächlichen Kanal anschließend über den Serverstatus bestätigen. Bei ungewissem Ergebnis nur Status lesen.

Private Uploads bleiben separat deaktiviert. Die erste echte Anmeldung ist noch kein Auftrag, ein Video zu übertragen. Kosten, zusätzliche Berechtigungen, Änderungen an Hosting/Sicherheit und Veröffentlichungen benötigen jeweils passende Freigaben.

## Ehrliche Grenze dieses Inkrements

Kein Konto verbunden, kein Token erzeugt, kein Google-Grant erstellt, keine Site aktualisiert. Online-Access ohne Refresh bleibt zeitlich begrenzt. Erneutes Verbinden nach Ablauf oder Trennen ist weiterhin nicht implementiert und wird nicht durch einen Rückkehrhinweis freigeschaltet.
