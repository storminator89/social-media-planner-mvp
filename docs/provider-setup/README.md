# Anbieter einrichten

Version 0.10 ergänzt die Oberfläche von 0.9, keine Providerfreischaltung. Unter **Verbindungen → Einrichtung ansehen** hat jeder Anbieter drei kurze Schritte. Einzelheiten, Grenzen und der tatsächliche technische Serverstatus bleiben getrennte aufklappbare Bereiche.

Für die erste echte YouTube-Verbindung: [Aktivierung und offene Schritte](youtube-activation.md).

## Was der Nutzer vorbereiten kann

- **YouTube:** eigenen Zielkanal festlegen, geeignetes Google-Projekt mit YouTube Data API v3 und Web-OAuth-Client bereitstellen. Testing/Testnutzer, genau `openid`, `youtube.upload` und `youtube.readonly`, exakte HTTPS-Rückkehradresse und gegebenenfalls Googles Domain-/App-Voraussetzungen prüfen. Danach autorisierte sichere Servereinrichtung und echte Rückkehrabnahme; ein Upload bleibt eine eigene ausdrückliche Aktion.
- **LinkedIn:** persönliches Zielkonto und passende Developer-App mit OpenID-Connect- und Share-Produkt bereitstellen. Exakte Rückkehradresse, `openid profile w_member_social` und tatsächliche App-Voraussetzungen prüfen. Die konkrete echte Nonce-/Issuer-/Scope-Antwort muss erst abgegrenzt abgenommen werden. Details: [LinkedIn-Aktivierung](linkedin-activation.md).
- **Instagram:** Business-/Creator-Konto und geeignete Meta-App prüfen. Die aktive sichere HTTP-/Persistenz-Anbindung fehlt weiterhin. Die Oberfläche zeigt deshalb keinen registrierbaren Callback und keinen Connect-Button.
- **X:** geeigneten API-Zugang, tatsächliche Preise und ausdrückliches Kostenlimit klären. Geschützte Persistenz-/HTTP-Anbindung fehlt weiterhin. Weder Credits noch kostenpflichtige Abfragen werden ausgelöst.

App-/Credentialerstellung, sichere Schlüsselbereitstellung und konkrete Grants sind jeweils eigene autorisierte Handlungen. Keine Passwörter, Client-Secrets oder Tokens in Chat, Browserformularen dieser App oder im öffentlichen Projekt hinterlegen.

## UI-Vertrag

`provider-setup.js` rendert ausschließlich geprüfte statische Daten. Die vier Datensätze haben identische Form und genau drei Schritte. Kein Häkchen oder Klick setzt Freigaben. Die vorhandenen Readiness-Controller entscheiden weiterhin über Kontozustand und bestehende Aktionen.

Die Anzeige einer Rückkehradresse ist keine Behauptung, dass die Site bereits abgenommen ist. Sie leitet lediglich den festen Callback aus der tatsächlichen kanonischen HTTPS-Origin ab. Ports, Credentials, Pfade, Query, Fragment, Loopback und unbrauchbare Origins werden nicht als Live-Origin übernommen. Instagram und X besitzen keinen Callback in diesem Vertrag. Offizielle Hilfelinks sind fest; OAuth-Autorisierungslinks werden hier nicht erzeugt.

Kopieren startet erst durch eine ausdrückliche Nutzeraktion. Nach erfolgreicher Clipboard-Quittung wird Erfolg gemeldet. Fehler oder Ablauf bieten nur die manuelle Kopie, keinen automatischen Retry. Hide/Destroy unterdrücken späte UI-Fortsetzungen. Es gibt keine Mutation der Serverkonfiguration, des Planers, der Workspaces oder einer Providerverbindung.

## Abnahme und Grenzen

Die gemeinsame Ansicht wurde tatsächlich im bestehenden Cloud-Chromium auf Desktop und schmalem Fenster bedient; siehe [Browserprüfung](BROWSER-QA.md). Das ist kein echtes Mobilgerät und kein Beweis für einen beim Nutzer sichtbaren Stream.

Die neuen Hinweise lösen nicht die noch fehlende Provider-App-/Runtime-/Grant-Einrichtung. Reale Sites-Owner-Rückkehr, Callback-/Cookie-Verhalten, Providerantworten, Secretprovisionierung und Kosten bleiben gesonderte Betriebsnachweise. Die separate private Testbereitstellung eines älteren Standes wird durch dieses Quellpaket nicht aktualisiert. Manuelle Browser-Draft-Übergabe ist nicht Teil dieses Inkrements.
