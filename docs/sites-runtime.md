# Sites-Worker-Vorbereitung

## Was tatsächlich vorhanden ist

`worker/handler.mjs` ist ein Sites-spezifischer HTTP-Einstieg, getrennt vom lokalen Entwicklungsserver. `npm run build:worker` erzeugt ein einzelnes dependency-freies ES-Modul in `dist/server/index.js`, mit Default-Export `{fetch(request, env)}` und eingebetteten öffentlichen UI-Dateien. Keine Node-Dateisystem-/SQLite-Abhängigkeit wird in den Worker gebündelt. Die vorhandene Daten-API verwendet native `env.DB.prepare/batch` und `env.BUCKET.put/get/delete`-Schnittstellen.

Der Build hat keine Hosting-ID, erstellt keine Ressourcen und führt kein Deployment aus. Quell-Snapshot und lokale Laufzeitdaten sind getrennt. Die öffentlichen Assets werden aus einem festen Build-Inventar ausgeliefert; Serverquellen, Datenbank, Tokens und Dateipfade können nicht als Assets abgerufen werden. Ein eigener kleiner Bundler akzeptiert nur die im Projekt verwendeten relativen Named-ESM-Importe und verweigert nicht unterstützte Modulsyntax. Reproduzierbarkeit und die tatsächlich erzeugte HTTP-Implementierung werden getestet.

## Identitätsgrenze

Der Worker darf ausschließlich hinter Sites Dispatch bereitgestellt werden. Nur Dispatch darf `oai-authenticated-user-id` liefern; ein direkt erreichbarer Worker mit selbst behauptetem Header wäre unsicher. Fehlende Identität führt bei normalen Routen zu 401. Ein vollständig konfigurierter eigener Providercallback kann stattdessen sauber auf eine feste Fehleransicht zurückleiten, ohne Code/State in einen Anmeldelink zu übernehmen. Ein anonymer Aufruf von `/` zeigt einen normalen Top-Level-Link auf `/signin-with-chatgpt?return_to=%2F`. Der Worker implementiert weder diese Route noch `/signout-with-chatgpt` oder `/callback`.

Die Sites-ID ist sitegebunden und wird als Eigentümer sämtlicher Planungs-/Mediendaten verwendet. E-Mail und Anzeigename werden nicht als Schlüssel oder Berechtigungsbeweis genutzt. Ein Service-Access-Bearer ersetzt keine Besucheridentität. Sites-Zugang bedeutet keine Social-Provider-Berechtigung.

Der bisherige lokale Entwicklungsserver bleibt davon getrennt: nur Loopback, eigener Testbesitzer, keine echte Anmeldung. Dort ankommende Identitätsheader werden abgewiesen. Die lokale Browserprüfung belegt daher keine echte Dispatch-Authentifizierung.

## D1 und R2

Die aktuelle Sites-Anleitung sieht D1 für strukturierte Produktdaten und R2 für Dateien vor; logische Bindings werden im Hostingmanifest deklariert und von Sites bereitgestellt. Dieser vorbereitete Worker verwendet die Namen `DB` und `BUCKET`. Fehlendes D1-Binding führt zu 503 statt zu einem flüchtigen Ersatzspeicher. Fehlendes R2 verhindert Uploads; weder externe Medien-URLs noch öffentliche Bucketpfade werden als Ersatz verwendet.

Anfragen führen keine DDL oder Migrationen aus. Bestehende SQL-Migrationen sind unveränderlich; jede neue Migration wird additiv geprüft. Der lokale Migrations-Ledger und seine Prüfsummen sind nur lokale Entwicklungsinfrastruktur, kein Ersatz für den gehosteten Sites-Migrationsprozess.

Vor einem echten Deployment müssen ein ausdrücklich gewähltes Site-Projekt, die native Hosting-Konfiguration, der vom aktuellen Sites-Build erwartete Migrationspackaging-Vertrag und die tatsächliche Anwendung der SQL-Schritte überprüft werden. Diese Version erfindet keine Site-ID, keine Drizzle-Historie und keine erfolgreich angewandten Cloud-Migrationen. Der vorhandene Worker-Output allein ist noch keine gehostete Freigabe.

## Verifizierbare Eigenschaften und noch offene Live-Abnahme

Automatisierte Tests rufen den tatsächlichen erzeugten Worker auf, verwenden dabei aber SQLite-/Memory-kompatible D1/R2-Adapter. Sie prüfen Identitätspflicht, Eigentümertrennung, Revisionen/409, Medienzugriff, fehlende Bindings, Origin-Grenzen, statische Pfade und reine Statusabfragen. Das belegt die Schnittstellenlogik, nicht die echte Cloud-Runtime, D1-Limits oder Sites-Gateway-Konfiguration.

Vor produktiver Nutzung fehlen mindestens: private Site-Bereitstellung, Dispatch-Readback mit zwei echten Personen, gehostete Migrationen, D1-/R2-Quoten und Persistenz, Backup-/Wiederherstellung, reale Provider-App-/OAuth-Freigaben und eine ausdrücklich genehmigte private Testübertragung. Keine Credential-Rohwerte werden im Quellcode, Manifest oder Browser gespeichert. Die neue private Credential-Tabelle enthält nur verschlüsselte Tokens sowie notwendige nichtöffentliche Metadaten; der Runtime-Key liegt außerhalb von D1.

Ein Browser-Queue-Termin ist kein Scheduler. Ein Worker-`setTimeout` wird nicht als Hintergrundausführung verwendet. Es existiert keine autonome Veröffentlichungsroute. Die getrennten Publishing-Adapter bleiben außerhalb der HTTP-Routen. Der LinkedIn-Verknüpfungstransport ist implementiert, benötigt aber explizite vollständig geprüfte Serverkonfiguration. Testfixtures sind nicht Teil des Runtime-Bundles.

## Native App-Connectoren

Sites-eigene App-Connectoren sind grundsätzlich eine mögliche Alternative zu eigener Tokenverwaltung. Ihre Nutzung setzt eine aktuelle native Eligibility-Prüfung für den konkreten Provider und die benötigten Aktionen voraus. Ein sichtbares Plugin oder eine ähnliche App-Bezeichnung beweist weder Sites-Eignung noch Publishing-Unterstützung. Diese Version deklariert keine Connectoren, installiert keine Grants und richtet keinen Vorschau-Relay ein. Ohne bestätigte Eligibility und Aktionen wird kein Provider-Proxy gebaut.

## Gesteuerter OAuth-Webflow in 0.6

Der Worker enthält jetzt Start, eng begrenzten Callback, Readiness und lokale Zugriffsentfernung für persönliches LinkedIn. Standardmäßig sind sie vollständig gesperrt. Es gibt keine automatisch geladene Shell-.env, keine vorgegebene Site-ID, kein OAuth-Link bei fehlender Konfiguration und keine automatische Schlüssel-/App-Erzeugung. Der lokale Entwicklungsserver injiziert keinen Providertransport und keine Aktivierungskonfiguration.

Der Composition Root des erzeugten Workers setzt ausdrücklich nativen Fetch für den festen Providertransport ein. Die Bibliothek hat keinen globalen Fallback. Geheimnisse kommen ausschließlich aus autorisierten nativen Runtime-Secrets. Ihr Vorhandensein beweist keine reale Callback-/Nonce-Kompatibilität; zusätzliche explizite Betreiberbestätigungen sind notwendig. Siehe `oauth-preparation.md`.

Nur GET an `/api/providers/linkedin/oauth/callback` wird gesondert geprüft. Alle anderen API-Routen behalten die allgemeine Origin-Grenze. Der Callback verlangt selbst dieselbe Dispatch-Identität wie der Start, die eigene geschützte Browserbindung und den geclaimten State/Installkontext. Kein Besucher wird anhand eines State-Lookups bestimmt. Die reservierten Sites-Authrouten werden nicht überschrieben.

Migration 0005 ist schema-only und additiv vorbereitet, aber nicht gehostet angewandt. Echte D1-Transaktionen, Secretbereitstellung, Runtime-Response-URLs, Cookie-/Sessionrückkehr und Plattformlogs müssen vor Aktivierung nachgewiesen werden. Kein Worker-Test mit simuliertem Dispatch-Header ersetzt diese Prüfung. Der fertige Quellcode ist keine erteilte Hosting-/OAuth-Freigabe.
