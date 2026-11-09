# YouTube-Oberfläche in 0.7

Die integrierte Oberfläche nutzt echte lokale Serverantworten, keine vorgetäuschte Kontoverbindung. Ohne freigegebene Runtime-Konfiguration sind Verknüpfung und Upload gesperrt. UI-Prüfung ist keine Google-/Sites-Livefreigabe.

## Verhalten

- Die YouTube-Karte liest einen eigenen strikten Readiness-Vertrag. Sie akzeptiert nur die offizielle Google-Autorisierungsadresse mit exakt eigenem Callback, drei festgelegten Scopes, State/Nonce und PKCE S256. Kein Link wird aus Browserdaten erzeugt oder zwischengespeichert.
- Einmaliger Ablauf-Timer und Wiederaufnahmeprüfung entfernen veraltete Fähigkeiten. Verknüpfung allein bedeutet keine Uploadfreigabe. Trennen verlangt eine zweite Bestätigung und erklärt, dass gesendete Requests, Videos und Google-seitige Zustimmung nicht rückgängig werden.
- Der native Uploaddialog liegt außerhalb des regelmäßig erneuerten Kartenbereichs. Die gewählte Datei bleibt nur im Arbeitsspeicher; erst bewusste Site-Speicherung überträgt sie. Vor der Übernahme des unveränderlichen Plans werden die serverseitigen Werte mit Datei und Eingabe verglichen.
- Kinder-/KI-Angaben sind bewusste Ja-/Nein-Entscheidungen ohne Vorwahl. Die endgültige Zusammenfassung zeigt Kanal, Datei, Größe/Hash, Titel, Beschreibung, Tags, Kategorie, Offenlegungen, feste private Sichtbarkeit, ausbleibende Benachrichtigung, Fingerprint und Revision.
- Nur ausdrückliche Bestätigung startet den gespeicherten Plan. Bekannte bereitstehende Chunks dürfen für denselben sichtbaren, freigegebenen Vorgang fortgesetzt werden. Kein automatischer Start nach Reload, kein Hintergrundbetrieb und keine Ersatzsession nach Unklarheit.
- Medien-, Plan- und Uploadunsicherheit sind getrennte Sperren. Titeländerungen, Auswahl gecachter Vorgänge und sachfremde Readbacks lösen sie nicht. Jede neue Dialogöffnung benötigt eine bestätigte Medienliste. Ein unklar gespeicherter Blob wird nicht wiederverwendet; eine normale Aktualisierung verwirft eine noch ungesendete Auswahl nicht.
- Die Medienliste zeigt nur bestätigte Dateien. Eine dort fehlende Datei beweist keinen fehlgeschlagenen früheren Put. Serverweit schützt zusätzlich die permanente Inhalts-Eindeutigkeit auch ausstehende Reservierungen über Browserreload hinaus. Es gibt keinen automatischen Retry oder Recoveryweg.
- Upload-Readback muss genau denselben Plan mit neuerer Revision belegen, bevor eine unklare Aktion neu bewertet wird. Ein unveränderter prepared-Eintrag ist keine Entwarnung. Manuell zu klärende Vorgänge werden niemals durch erneute Vorbereitung oder Herabstufung des Warnstatus entsperrt.
- Verlauf und ausdrücklicher Stopp zukünftiger Takt-Schritte bleiben nach Ablauf/Trennung lesbar bzw. möglich. Ein angenommener Upload ist noch keine fertige Verarbeitung. Positive Beobachtungen sind revisionsgebunden und verschwinden bei neuer Revision oder Sicherheitswarnung. Sessionverlust und unerwartete Sichtbarkeit bleiben konkrete Warnungen.

## Prüfbelege

49 fokussierte YouTube-Tests und insgesamt 195 UI-Tests bestanden unter UTC, America/Los_Angeles und Asia/Tokyo, einschließlich 14 Regressionen zu zweckgebundener Unsicherheit und Beobachtungsinvalidierung. Unabhängig wurden ursprüngliche Retry-Umwege sowie sechs zusätzliche positive-Beobachtungsfälle nachgeprüft. Die zwölf gelieferten UI-/Testdateien sind in `YOUTUBE-UI-v0.7.sha256` (historischer Komponentenstand; aktuelles Inventar siehe Root-Manifest) gebunden. Die vollständige integrierte Suite wird in `verification.md` ausgewiesen.

LinkedIn-Implementierung, Planermodell, Editor, Ideen, Queue und Datenadapter blieben unverändert. Es gibt keine Browser-Credentials, Session-URLs, öffentliche Sichtbarkeit oder Zeitplanung im YouTube-Dialog.
