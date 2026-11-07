# Verifikation: Version 0.5

Stand: 7. November 2026. Lokaler Quell-/Worker-Kandidat, keine Site angelegt oder veröffentlicht.

## Automatisierte Prüfung

333 Tests jeweils unter UTC, America/Los_Angeles und Asia/Tokyo bestanden; Syntaxprüfung und Worker-Build erfolgreich. Der tatsächliche generierte Worker wird direkt aufgerufen, nicht nur ein Stummel des Handlers. Wiederholte Builds sind byteidentisch. Tests verwenden SQLite-/Memory-/Dateiadapter, keine reale Cloud-Datenbank oder Social-Konten.

Neue Abdeckung gegenüber 0.4:

- Servereigene, unveränderliche LinkedIn-Konfiguration mit exakter Origin, Redirect, Site-/Client-/Scope-/Aktionsbindung. Mutation des Eingabeobjekts während asynchroner Hashberechnung kann keine nachträglich erlaubte fremde Konfiguration erzeugen.
- Ablehnender Callbackparser: doppelte/fehlende/unbekannte Felder, code+error, URL-Alternativen, Kontrollen/UTF-8/Überlänge und falsche Config. Codes und Providerfehler erscheinen nicht in öffentlichen Fehlerantworten.
- Gekapselte Flow-Factory verbindet Parser und Repository fest. Ein anderer Site-/Client-/Redirectkontext kann den legitimen State nicht konsumieren. Falscher Besitzer/Browser und Replay bleiben ohne Wirkung.
- 256-Bit-State, unabhängige Nonce und Browserbindung, Hash-only-Ablage, TTL, Quota inklusive verbrauchter noch gültiger Versuche, CAS-Einmalclaim mit gebundenem Nonce-Receipt und klare Ungewissheit bei verlorener Commitantwort.
- Echter lokaler Constructor 3→4 mit nichtleerem Planer-/Jobbestand mehrerer Besitzer, unveränderten alten Zeilen/Digests, Wiederstart, persistierendem State und vollständigem Schema-/Ledger-Rollback bei absichtlich kollidierendem Index.
- Reine Readiness- und Statusaufrufe erzeugen/beanspruchen keine States. Start-, Callback-, Exchange- und X-Initiationsrouten fehlen im echten erzeugten Worker. Servermodule/SQL sind keine öffentlichen Assets.
- Vierer-Status vom echten Repository bis zum UI-Normalizer. X bleibt nicht verbunden und nicht persistierbar, verlangt ausdrückliche Kostenfreigabe, hat keinen Tarif oder Kontolink. Alte Dreierantworten und behauptete Verbindungen werden abgewiesen.
- Bestehende Planungs-/Ideen-/Varianten-/Queue-/Medien-/409-/Undo-Tests unverändert im Gesamtlauf enthalten. Die übrigen Bibliothekstests bedeuten nicht, dass jede Bibliotheksfunktion über die UI erreichbar ist.

## Unabhängige Nachprüfung

298 rein speicherbasierte Tests wurden unabhängig in UTC/Los_Angeles/Tokio ausgeführt, ebenso Syntax. Der tatsächliche Buildcode wurde zweimal mit abgefangenen Dateischreibvorgängen ausgeführt; beide Ergebnisse entsprechen dem erzeugten Worker und allen 17 öffentlichen Assets. Der echte lokale Migrationsconstructor wurde zusätzlich mit Memory-SQLite in Upgrade-, Wiederstart- und Fehlerfällen geprüft.

Zwei konkret reproduzierte Vertragsprobleme wurden vor Übergabe behoben: mutierbare Config während await und getrennt injizierbare Parser-/Repositorykontexte. Beide Originalreproduktionen wurden unabhängig erneut geprüft; der legitime State bleibt nach fremdem Kontextversuch nutzbar. Keine verbleibenden konkreten Blocker für diesen lokalen, nicht aktivierten Vorbereitungsstand.

## Browserprüfung

Die echte integrierte lokale SQLite-Statusroute zeigte Instagram, LinkedIn, YouTube und X als „Nicht verbunden“. Keine Statussimulation. X zeigte `COST_APPROVAL_REQUIRED` als verständlichen Hinweis auf zu prüfenden Zugang und ausdrücklich freizugebende mögliche Kosten; keine Preise oder Aktivierungsaktion.

Desktop mit 1174 CSS-Pixeln: zwei Spalten/zwei Reihen, kein horizontaler Überlauf. Natives schmales Browserfenster mit 400 CSS-Pixeln: eine Spalte, Client-/Scrollbreite jeweils 388 Pixel, Navigation etwa 78×52 Pixel je Ziel. Enter öffnete Details; Refresh behielt Fokus und offene X-Hinweise. Es gab ausschließlich „Status aktualisieren“ und „Zur Planung“, keine Connect-, Zahlungs-, OAuth- oder Versandaktion.

Direkter read-only Browseraufruf des LinkedIn-Readiness-Endpunkts bestätigte `offline_preparation`, fünf false-Fähigkeiten, unbestätigtes Ziel und `authorizationUrl:null`. Start-/Callback-Ablehnung ist automatisiert/sourcegeprüft, nicht als Live-OAuth-Browserdurchlauf behauptet. Preview danach gestoppt. Details: `x-browser-qa.md`. Historische 0.4- und 0.3-Browsernachweise stehen getrennt in den jeweiligen Berichten.

## Grenzen

Keine echte Sites-Dispatch-Rückkehr, Cloud-D1/R2-Migration oder Authentifizierung zweier Personen getestet. Keine neue Runtime, Sicherheitslockerung oder fremde Software dafür eingerichtet. Keine Hosting-ID, App, Credentials, OAuth-Grants, Tokens, Provider-/Zahlungsaktivierung oder Posts erstellt. Das Worker-Artefakt enthält keine Provider-Publisher und keinen State-/Flow-Mutator.

LinkedIn-Web-PKCE, tatsächliche Nonce-Rückgabe, signierte Tokenclaims, App-Produkte, sichere Tokenablage und Konto-/Postingberechtigung bleiben offene Live-Prüfungen. X-Kosten/Zugang sind keine freigegebenen Ausgaben. Readiness ist kein Verbindungsnachweis. Siehe `oauth-preparation.md`, `sites-runtime.md` und `provider-preparation.md`.
