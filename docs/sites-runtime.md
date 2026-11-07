# Sites-Worker-Vorbereitung

## Was tatsächlich vorhanden ist

`worker/handler.mjs` ist ein Sites-spezifischer HTTP-Einstieg, getrennt vom lokalen Entwicklungsserver. `npm run build:worker` erzeugt ein einzelnes dependency-freies ES-Modul in `dist/server/index.js`, mit Default-Export `{fetch(request, env)}` und eingebetteten öffentlichen UI-Dateien. Keine Node-Dateisystem-/SQLite-Abhängigkeit wird in den Worker gebündelt. Die vorhandene Daten-API verwendet native `env.DB.prepare/batch` und `env.BUCKET.put/get/delete`-Schnittstellen.

Der Build hat keine Hosting-ID, erstellt keine Ressourcen und führt kein Deployment aus. Quell-Snapshot und lokale Laufzeitdaten sind getrennt. Die öffentlichen Assets werden aus einem festen Build-Inventar ausgeliefert; Serverquellen, Datenbank, Tokens und Dateipfade können nicht als Assets abgerufen werden. Ein eigener kleiner Bundler akzeptiert nur die im Projekt verwendeten relativen Named-ESM-Importe und verweigert nicht unterstützte Modulsyntax. Reproduzierbarkeit und die tatsächlich erzeugte HTTP-Implementierung werden getestet.

## Identitätsgrenze

Der Worker darf ausschließlich hinter Sites Dispatch bereitgestellt werden. Nur Dispatch darf `oai-authenticated-user-id` liefern; ein direkt erreichbarer Worker mit selbst behauptetem Header wäre unsicher. Fehlende Identität führt zu 401. Ein anonymer Aufruf von `/` zeigt einen normalen Top-Level-Link auf `/signin-with-chatgpt?return_to=%2F`. Der Worker implementiert weder diese Route noch `/signout-with-chatgpt` oder `/callback`.

Die Sites-ID ist sitegebunden und wird als Eigentümer sämtlicher Planungs-/Mediendaten verwendet. E-Mail und Anzeigename werden nicht als Schlüssel oder Berechtigungsbeweis genutzt. Ein Service-Access-Bearer ersetzt keine Besucheridentität. Sites-Zugang bedeutet keine Social-Provider-Berechtigung.

Der bisherige lokale Entwicklungsserver bleibt davon getrennt: nur Loopback, eigener Testbesitzer, keine echte Anmeldung. Dort ankommende Identitätsheader werden abgewiesen. Die lokale Browserprüfung belegt daher keine echte Dispatch-Authentifizierung.

## D1 und R2

Die aktuelle Sites-Anleitung sieht D1 für strukturierte Produktdaten und R2 für Dateien vor; logische Bindings werden im Hostingmanifest deklariert und von Sites bereitgestellt. Dieser vorbereitete Worker verwendet die Namen `DB` und `BUCKET`. Fehlendes D1-Binding führt zu 503 statt zu einem flüchtigen Ersatzspeicher. Fehlendes R2 verhindert Uploads; weder externe Medien-URLs noch öffentliche Bucketpfade werden als Ersatz verwendet.

Anfragen führen keine DDL oder Migrationen aus. Bestehende SQL-Migrationen sind unveränderlich; jede neue Migration wird additiv geprüft. Der lokale Migrations-Ledger und seine Prüfsummen sind nur lokale Entwicklungsinfrastruktur, kein Ersatz für den gehosteten Sites-Migrationsprozess.

Vor einem echten Deployment müssen ein ausdrücklich gewähltes Site-Projekt, die native Hosting-Konfiguration, der vom aktuellen Sites-Build erwartete Migrationspackaging-Vertrag und die tatsächliche Anwendung der SQL-Schritte überprüft werden. Diese Version erfindet keine Site-ID, keine Drizzle-Historie und keine erfolgreich angewandten Cloud-Migrationen. Der vorhandene Worker-Output allein ist noch keine gehostete Freigabe.

## Verifizierbare Eigenschaften und noch offene Live-Abnahme

Automatisierte Tests rufen den tatsächlichen erzeugten Worker auf, verwenden dabei aber SQLite-/Memory-kompatible D1/R2-Adapter. Sie prüfen Identitätspflicht, Eigentümertrennung, Revisionen/409, Medienzugriff, fehlende Bindings, Origin-Grenzen, statische Pfade und reine Statusabfragen. Das belegt die Schnittstellenlogik, nicht die echte Cloud-Runtime, D1-Limits oder Sites-Gateway-Konfiguration.

Vor produktiver Nutzung fehlen mindestens: private Site-Bereitstellung, Dispatch-Readback mit zwei echten Personen, gehostete Migrationen, D1-/R2-Quoten und Persistenz, Backup-/Wiederherstellung, reale Provider-App-/OAuth-Freigaben und eine ausdrücklich genehmigte private Testübertragung. Keine Credential-Werte werden im Quellcode, Manifest, Browser oder der vorbereitenden Datenbank gespeichert.

Ein Browser-Queue-Termin ist kein Scheduler. Ein Worker-`setTimeout` wird nicht als Hintergrundausführung verwendet. Es existiert keine autonome Veröffentlichungsroute. Provider-Code mit Fixture-Transport ist keine echte Verbindung und wird nicht an HTTP-Routen angeschlossen.

## Native App-Connectoren

Sites-eigene App-Connectoren sind grundsätzlich eine mögliche Alternative zu eigener Tokenverwaltung. Ihre Nutzung setzt eine aktuelle native Eligibility-Prüfung für den konkreten Provider und die benötigten Aktionen voraus. Ein sichtbares Plugin oder eine ähnliche App-Bezeichnung beweist weder Sites-Eignung noch Publishing-Unterstützung. Diese Version deklariert keine Connectoren, installiert keine Grants und richtet keinen Vorschau-Relay ein. Ohne bestätigte Eligibility und Aktionen wird kein Provider-Proxy gebaut.

## Offline-OAuth-Vorbereitung in 0.5

Nur `/api/providers/linkedin/oauth/readiness` wurde als authentifizierter GET ergänzt. Er beschreibt den gesperrten Entwicklungsstand, nicht eine vorhandene App-Konfiguration oder verifizierte Kontoanmeldung. Er verarbeitet keine Codes, erstellt keine Cookies/States und liefert keinen OAuth-Link. Sites-reservierte Routen und der allgemeine Cross-Site-Schutz bleiben unverändert.

Die tatsächliche State-/Flow-Bibliothek liegt außerhalb des HTTP-Importgraphen. Migration 0004 ist schema-only vorbereitet, aber nie gehostet ausgeführt. Eine echte Provider-Rückleitung benötigt zuvor Nachweis der unveränderten initiierenden Sites-Identität und Browserbindung. Dafür wäre später eine eng auf Methode und eigenen Callbackpfad begrenzte Protokollausnahme nötig; eine solche Ausnahme wurde hier bewusst nicht eingerichtet.
