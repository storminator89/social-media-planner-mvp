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

## Tatsächliche Browserbedienung

Die gemeinsame Oberfläche wurde selbst durch CUA im sichtbaren Cloud-Chromium bedient: alle vier Anleitungen, Schritt-Details mit Enter, echte lokale Readiness, Statusrefresh mit erhaltenen Details/Fokus, Verlassen und Wiederöffnen. Bei 400 × 606 CSS-Pixeln hatte das Dokument 388/388, jede Karte 348/348 und jeder Einrichtungsbereich 308/308 Client-/Scrollbreite. Kein horizontaler Überlauf; klare nummerierte Schritte und sichtbare Tastaturfokusse. Die schmale Ansicht entstand durch natives Fensterresize und 125-%-Zoom, nicht auf einem echten Mobilgerät.

Der vollständige eigene Bericht mit subjektiver UX-Einschätzung und Grenzen steht in `provider-setup/BROWSER-QA.md`. Screenshots wurden visuell geprüft. Prüftab geschlossen, Fenster/Zoom zurückgestellt und Preview gestoppt. Keine Provideranmeldung, Secret-, Grant-, Upload-, Post- oder Zahlungsaktion; offizielle Hilfelinks wurden in diesem Durchgang nicht geöffnet. Keine behauptete HTTPS-Kopie in der lokalen HTTP-Gesamtansicht.

## Offene Betriebsnachweise

Die Anleitung ersetzt nicht die tatsächliche App-Einrichtung, autorisierte sichere Secretbereitstellung und konkrete Nutzerfreigabe. Sites-Dispatch-Besitzer, Browsercookie/Session-Rückkehr, physisch private D1/R2-Bindings, echte Providerantworten, Domain-/App-Prüfungen, Quoten und Kosten bleiben getrennte Nachweise. Keine allgemeine Erlaubnis wird in erfolgreiche Prüf-Flags umgedeutet. Der zusätzliche eng begrenzte LinkedIn-Nonce-Abnahmeweg ist beschrieben, aber noch nicht implementiert.

LinkedIn besitzt keinen aktiven Publisher; Instagram/X benötigen noch sichere HTTP-/Persistenzintegration. YouTube bleibt standardmäßig deaktiviert und würde nur nach separater Freigabe private Uploadschritte erlauben. Es gibt keinen Refresh, Reconnect oder Hintergrundbetrieb. Eine separate private Testbereitstellung eines älteren Standes wird durch dieses Paket nicht verändert.

Die bisherigen 0.9-Nachweise stehen historisch unter `provider-setup/verification-0.9-history.md`; sie sind kein neu ausgeführter Browserdurchgang dieses Inkrements. Ältere Komponenten-/Versionsmanifeste sind ebenfalls historische Belege, das Rootmanifest bindet den jeweiligen Endkandidaten. REA v60 wurde erneut einbezogen: vollständige eigene Quellen werden mit normalen Source-/Test-/Browserwerkzeugen geprüft, ohne behauptete Decompilation oder fremden Live-Capture.
