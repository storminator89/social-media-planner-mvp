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

## X in Version 0.5

Die Statusübersicht enthält vier Karten: Instagram, LinkedIn, YouTube und X. X wird mit `not_connected`, `accountLabel:null`, `canPublish:false` und den Blockern `OAUTH_NOT_CONFIGURED`, `COST_APPROVAL_REQUIRED`, `PUBLISHING_DISABLED` ausgegeben. Dies ist eine gesperrte Produktoption, kein aus einem Providerkonto gelesener Live-Zustand.

Für X sind API-Zugang, verfügbarer Funktionsumfang und mögliche Nutzungskosten vor einer Aktivierung zu prüfen und ausdrücklich freizugeben. Die UI nennt keine dauerhaften Preise und besitzt keine Zahlungs-, Verbindungs- oder Veröffentlichungsaktion. Die aktuelle Preisquelle ist [X API Pricing](https://docs.x.com/x-api/getting-started/pricing); dieses Projekt hat weder einen Tarif bestellt noch ein Kostenlimit autorisiert.

Die ursprünglichen drei Provider besitzen weiterhin nur vorbereitende Platzhaltertabellen. X ist darin nicht persistierbar: Verbindungs- und Jobmethoden lehnen X ausdrücklich ab. Der Status-GET bleibt nicht mutierend, fehlende Tabellen bleiben Fehler und liefern keinen erfundenen Ersatzstatus. Bestehende SQL-Dateien werden für die Anzeige nicht geändert.

Die LinkedIn-Vorbereitung wird in `oauth-preparation.md` beschrieben. Sie verändert keinen dieser Verbindungszustände und schaltet keine Publishing-Fähigkeit frei. Extern entwickelte Provider-Adapter sind nicht Teil des Runtime-Bundles.
