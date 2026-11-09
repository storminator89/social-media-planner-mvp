# Verifikation: Version 0.10.0

Stand: 7. November 2026. Einheitliche Einrichtungshilfe für vier Anbieter auf geprüftem 0.9.0. Planer-API 3, UI-State 2 und Arbeitsfassungs-API 1 bleiben unverändert. Keine Migration, Provideraktivierung oder gehostete Laufzeit wurde durch dieses Inkrement eingerichtet.

## Vollständige eigene Prüfung

**1439/1439 Tests** bestanden am finalen Produktstand jeweils unter UTC, America/Los_Angeles und Asia/Tokyo, ohne Skips. Der vollständige JavaScript-Syntaxlauf ist grün. Die enthaltene Buildprüfung erzeugt getrennte temporäre Outputs und vergleicht sie bytegenau mit dem ausgelieferten Worker.

Der dependency-freie Worker enthält **43 Assets, 799050 Bytes**, SHA-256 `28c511d492a34511e63ba5e87e0b8396c61730551f7c7d412d02d2778213d29b`.

31 zusätzliche Fälle prüfen die gemeinsame Darstellung, genau drei Schritte je Anbieter, strikte Datensatz-/Linkverträge, HTML-Escaping, feste HTTPS-Callbacks, abgelehnte Origins, bewusste Clipboardaktion, Fehler/Deadline, Hide/Destroy, ausstehende Fortsetzungen und alte abgetrennte Detailereignisse. Bestehende pauschale Linkverbote wurden nicht einfach entfernt: eine exakte Allowlist offizieller Hilfelinks mit Referrer-/Opener-Schutz ersetzt sie; OAuth-, Formular-, Secret- und Publishingverbote bleiben erhalten.

Ein zunächst nicht neu gebautes Artefakt nach dem letzten Detailereignis-Guard wurde vor Abschluss erkannt und neu erzeugt. Die vorherige fehlgeschlagene Bytegleichheitsprüfung wird nicht als Erfolg gewertet; die genannten vollständigen Läufe prüfen den synchronisierten Endstand.

## Unveränderte Vertrauensgrenzen

Alle 50 Dateien unter modules, server, worker und scripts sind bytegleich zum geprüften 0.9.0. Ebenso unverändert sind der Planer-/Workspace-/Schedulingkern und sämtliche acht Migrationen. Die bestehenden LinkedIn-/YouTube-Validatoren, Clients, Status- und Ablaufcontroller vor der Renderfunktion sind bytegleich, abgesehen von zwei neuen statischen Anzeigeimports.

Die neuen Setupdaten und der gemeinsame Renderer starten keine Anfrage an Provider, erzeugen keinen Autorisierungslink und schreiben keine Runtimekonfiguration. Status, aktivierte Knöpfe und erlaubte Aktionen stammen weiterhin aus den bisherigen Server-DTOs. Instagram und X besitzen keine angeblich registrierbare Rückkehradresse. Der Anzeige-/Kopierpfad für LinkedIn und YouTube ist fest und ausschließlich aus einer kanonischen HTTPS-Origin abgeleitet. Seine Anzeige ist kein Nachweis einer abgenommenen Site oder Provider-App.

## Unabhängige Prüfung

Der unabhängige Prüfer bestätigte die isolierten Instagram-/X-/YouTube-Komponenten mit 60 gezielten Tests ohne konkreten Befund. Der gemeinsame Source-/Lifecycle-Nachlauf umfasste 113 Setup-/Connections-/LinkedIn-/YouTube-Fälle, serverseitige Bytevergleiche, Statusgrenzen, Copy-Pinning und späte UI-Fortsetzungen. Die abschließende unabhängige Vollsuite bestand ebenfalls **1439/1439 in allen drei Zeitzonen**, ohne Skips, plus Syntax. Der Build-/Bytevergleich war in allen drei Läufen grün. Zusätzlich bestand eine eigenständige Prüfung des tatsächlichen generierten Workers in einer WebAPI-only-VM ohne Fetch, Node-process oder dynamische Codegenerierung: sieben neue/geänderte Assets exakt ownergeschützt, anonymer Zugriff 401, deaktivierte LinkedIn-/YouTube-Starts 503 und nicht implementierte Instagram-/X-Starts 404. Alle 15 Source-/Testmanifesteinträge und 50 Backend-/Builddateien wurden bytegeprüft. Kein offener konkreter Quell-/Artefaktbefund im geprüften Umfang; das ist keine gehostete oder Provider-Livefreigabe.

## Offene Betriebsnachweise

Die Anleitung ersetzt nicht die tatsächliche App-Einrichtung, autorisierte sichere Secretbereitstellung und konkrete Nutzerfreigabe. Sites-Dispatch-Besitzer, Browsercookie/Session-Rückkehr, physisch private D1/R2-Bindings, echte Providerantworten, Domain-/App-Prüfungen, Quoten und Kosten bleiben getrennte Nachweise. Keine allgemeine Erlaubnis wird in erfolgreiche Prüf-Flags umgedeutet. Der zusätzliche eng begrenzte LinkedIn-Nonce-Abnahmeweg ist beschrieben, aber noch nicht implementiert.

LinkedIn besitzt keinen aktiven Publisher; Instagram/X benötigen noch sichere HTTP-/Persistenzintegration. YouTube bleibt standardmäßig deaktiviert und würde nur nach separater Freigabe private Uploadschritte erlauben. Es gibt keinen Refresh, Reconnect oder Hintergrundbetrieb. Eine separate private Testbereitstellung eines älteren Standes wird durch dieses Paket nicht verändert.

## YouTube-Rückkehrhinweise, 7. November 2026

Im bestehenden 0.10-Quellstand ergänzte Rückkehrbehandlung: `linked`, `cancelled`, `failed`, `unconfirmed` sind ausschließlich Hinweise. Frische Serverdaten bleiben die einzige Verbindungsbestätigung. Doppelte/unbekannte URL-Werte werden verworfen; die URL wird ohne Navigation bereinigt. Andere Parameter und `history.state` bleiben erhalten. Kein automatischer OAuth-Retry.

- `npm test`: **1442 bestanden, 0 fehlgeschlagen**; inklusive 3 neuer Rückkehrtests und vollständiger Worker-Neuerzeugung.
- `npm run check`: alle JavaScript-Syntaxprüfungen bestanden.
- Geprüft: manipulierte Erfolgsmeldung bei unkonfiguriertem Server, Abbruch/Fehler/Unklarheit, unterbrochene Statusabfrage, keine zweite Freigabe, Historienerhalt und blockiertes `replaceState`.
- Kein neuer visueller Browserdurchgang und keine Live-Google-/Sites-Abnahme in diesem Inkrement. Vorherige Browserbelege gelten nicht als neue Prüfung.
