# Gesperrte Provider-Vorbereitung

## Ehrliche Zustände

Die Anwendung registriert derzeit keine Social-Konten. Ein erfolgreich aus der Datenbank gelesener leerer Verbindungsbestand wird als „Nicht verbunden“ dargestellt. Technische Einrichtung, Anbieter-App-Freigabe und persönliche Kontoberechtigung sind verschiedene Voraussetzungen. Kein Zustand impliziert einen erfolgreichen Post.

`/api/providers/status` liefert ausschließlich lesende, besitzerspezifische Statusdaten. Fehler oder fehlende Tabellen führen zu 503. Die Oberfläche zeigt dann „Status unbekannt“, anstatt eine Verbindung zu erfinden. Es gibt keine OAuth-, Provider-Upload-, Job- oder Publishing-Schreibroute. Eigene Planerbilder lassen sich weiterhin über den vorhandenen geschützten Medienendpunkt speichern.

## Datenmodell

`planner_provider_connections` speichert ausschließlich ownergebundene Einrichtungsplatzhalter für Instagram/LinkedIn/YouTube. Keine Token, Secrets oder Credential-Referenzen. Die Datenbank verweigert „connected“ und `publishing_enabled=1`.

`planner_publication_jobs` kann eine unveränderliche Kopie einer eigenen geplanten Variante mit Inhalt, Medienmetadaten, Zeitpunkt, Quellrevision und SHA256 aufnehmen. Das ist eine interne, nicht an die Oberfläche angeschlossene Vorbereitung. Nur `blocked` und `cancelled` sind zulässig. Ein Job enthält keine ausführbare Lease, kein Token und keine Versandberechtigung. Die Datenbank verweigert sendefähige oder erfolgreiche Zustände.

Die Vorbereitung liest ausschließlich eigene Quellen, schützt den Insert mit der aktuellen Planungsrevision und verweigert denselben Idempotenzschlüssel für einen anderen Payload. Eine spätere Planungsänderung überschreibt diesen Snapshot nicht. Entfernen des Planungsbeitrags löscht vorbereitete Historie nicht kaskadierend. Eine Cancellation ist revisionsgeschützt. Diese Eigenschaften sind keine Exactly-once-Publishing-Garantie: Es gibt überhaupt keinen Versandpfad.

## Grenzen vor echter Integration

Serverseitige OAuth-Konfiguration, konkrete Konto-/Kanalverifikation, benutzerspezifische sichere Credentialablage, Provider-Freigaben, geschützte Freigabedatensätze, Mediensicherung und produktiver Transport fehlen. Anbieter-Adapter mit lokalen Antwortfixtures sind nicht in diesen Runtime-Build übernommen. Eine Bibliotheksprüfung ersetzt keinen echten Account-/Cloud-Test.

Eine private Testübertragung benötigt eine konkrete Nutzerfreigabe für Zielkonto, Inhalt und Medium. Dauerhafte Zugriffsberechtigungen benötigen die gesonderte sichere Freigabe. Es werden keine Secrets im Chat oder Browser gesammelt. Vor geplanter öffentlicher Veröffentlichung müssen zusätzlich Provider-Zustände, unklare Ergebnisse, sichere Wiederaufnahme und das tatsächliche Hintergrundsystem nachgewiesen werden.
