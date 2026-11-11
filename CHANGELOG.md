## Local v76 candidate: optional draft label groups

- Added session-only `Gruppierung: Nach Labels` inside the existing draft Filter controls, with a visible active marker and unchanged flat default.
- Read-only groups preserve exact stored label identities, multiple memberships, unlabelled drafts, current filters and distinct draft totals. No campaign entity or extra quota use.
- Repeated cards retain canonical edit/duplicate/archive/batch targets and restore their exact focus occurrence across ordinary saves.
- No persistence, provider, runtime, security, hosting, schema, migration or service changes. See `docs/draft-groups.md`.

## Local v75 candidate: reuse a saved idea

- Added a secondary “Als neuen Entwurf verwenden” card action. The existing idea conversion remains available.
- One canonical CAS appends a fresh channel-less draft, preserving exact title, body and labels while leaving the original idea and unrelated records unchanged except existing repository update bookkeeping.
- Full receipts, shared unknown-outcome mutation fences, source staleness, cap100, duplicate-click and safe fresh-draft workspace origin checks.
- Kept v73 mobile warnings/layout and v74 batch archive. Current-source write-paused fallback disables idea reuse. No provider, runtime, security, hosting, schema, migration or new service changes.

## v74 local candidate: selected saved-draft archive

- Added explicitly selected batch archive inside the existing draft actions disclosure, full per-channel review, exact-count confirmation and an honest unchanged100-post quota.
- One canonical CAS preserves channel-specific media, empty overrides, hidden history and unrelated data; uncertain receipts fence planner and workspace mutations until validated reload.
- Added cancellation, close-event, success-render, full-receipt, invalid-reload, cap and current-source v4-compatible paused-fallback regression tests. No provider, runtime, hosting or migration changes. See `docs/batch-archive.md`.

## v72 candidate: separate recovery for channel images

- Pre-release browser finding corrected: opening and restoring an editor now preserves explicit selected-channel order, including an intentionally empty primary channel; ordinary save uses that same order.

- Separate editor workspaces retain complete, ordered channel image assignments using payload protocol 4; SQL container and migrations are unchanged.
- Existing v1-v3 workspaces remain readable. Cached v71 clients reject protocol 4 rather than flattening media. Rollback requires the generated archive/channel-readable write-paused fallback, not the normal v71 worker.
- Saved-image metadata is owner-resolved and guarded atomically with a bounded JSON SQL predicate; up to 200 distinct images stay within D1's parameter limit.
- Local files are never uploaded by workspace recovery. Only explicitly omitted metadata is retained; restoration and safe-close remain blocked, and the UI labels partial metadata protection honestly.
- No provider posting, security, host or retention changes. Local candidate only; independent final review and browser/reload/narrow checks remain release gates.

# Änderungsprotokoll

## 0.10.0

- Einheitliche Einrichtungshilfe für LinkedIn, YouTube, Instagram und X: drei kurze Schritte, aufklappbare Details und feste offizielle Quellen.
- HTTPS-Callbackanzeige und bewusste Kopie für vorhandene LinkedIn-/YouTube-Routen; keine fiktiven Callbackadressen für Instagram/X oder lokale Vorschauen.
- Refresh erhält geöffnete Details und Tastaturfokus. Verlassen/Zerstören invalidiert späte Kopierrückmeldungen; Fehler behaupten keinen Erfolg.
- Unveränderte Server-, OAuth-, Provider-, Planer- und Workspace-Verträge. Keine neue App, Secrets, Grants, kostenpflichtige Aktivierung, Veröffentlichung oder Hostingänderung.

## 0.9.0

- Dauerhafte Posting-Zeiten je Kanal, gemeinsame freie Slots und explizite Queue-Bindung. Regeländerungen verschieben weder feste noch gebundene Beiträge.
- API 3/UI-State 2 erhalten bestätigte UTC-Zeitpunkte einschließlich Sekunden/Millisekunden und verwenden eine gemeinsame Snapshotrevision. Alte Clients dürfen neue Felder nicht überschreiben.
- Additive Migration 0008, unveränderte SQL 0001–0007. Kurze ownergebundene Digestnachweise sichern exaktes Queue-Undo und prüfen Belegung erneut.
- Arbeitsfassungen bewahren optional den Planungskontext einschließlich Feldanwesenheit; atomarer Downgradeschutz gegen Altclients. Keine neue Workspace-Migration.
- Keine neue Provideraktivierung, kein Auto-Publishing und keine Cloudbereitstellung.

## 0.8.0

- Separate serverseitige Arbeitsfassungen für unvollständige Composer-Eingaben, einschließlich roher CSV-Labels und eigener Kanaltexte. Kein Ersatzschreiben von Beiträgen und kein localStorage-Fallback.
- Ownergebundene Vollsnapshot-CAS, bekannte Schreib-ID für unklaren Commit-Readback, Mehrtab409, explizite Wiederaufnahme mit unveränderlicher Herkunftsrevision.
- Lokale Dateien werden nicht mitgesichert; vorhandene Bildreferenzen und geänderte Alttexte werden explizit geprüft.
- Additive Migration 0007; 20 aktive/100 Gesamtidentitäten, 30 Tage Wiederaufnahmefrist ohne automatische Datenlöschung. Queue 0008 und API 3 bleiben getrennt.
- Neue Workerroute benötigt serverseitig festen Site-/Origin-Kontext. Kein Hosting, Providerzugriff oder neuer Grant.

## 0.7.1

- Redaktionelle Labels im normalen Beitragseditor, sichtbare Label-Badges und kombinierbare exakte Filter für Kalender, Liste und Entwürfe.
- Unveränderte kanonische Labels bleiben einschließlich Whitespace/CRLF/Unicode erhalten; nur bewusst bearbeitete Eingaben werden geparst. Dirty-/409-/Async-Schutz umfasst das neue Feld.
- Gespeicherte Bild-Alttexte sind ehrlich schreibgeschützt; neue lokale Bilder bleiben editierbar. Keine neue Medien-API.
- Keine Backend-, OAuth-, Provider-, Schema- oder Hostingänderung. Workspace-/Posting-Schedule-Ausbau bleibt separat.

## 0.7.0

- Standardmäßig gesperrter Google-Webflow mit PKCE S256, vollständiger RS256-/Nonce-/Subjectprüfung und fest bestätigtem YouTube-Zielkanal.
- Additive Migration 0006 für verschlüsselte Versuche, Credentials, Installtickets, private Medien und dauerhafte Uploadzustände. Frühere Migrationen unverändert.
- Privater MP4-/WebM-Upload bis 8 MiB: Site-Speicherung getrennt von ausdrücklichem Google-Start, unveränderliche Inhaltsbestätigung, feste private Sichtbarkeit und keine Abonnentenbenachrichtigung.
- Resumable-Sessions sind verschlüsselte serverseitige Capabilities. Ungewisser Start wird nicht wiederholt, ungewisser Chunk benötigt dieselbe Sessionprobe. Dauerhafte Warnungen und Inhalts-Deduplizierung verhindern stille Neustarts.
- Cancel-/Disconnect-/Ablauf-Fences unmittelbar vor externem Senden; positive R2-Bestätigung vor Ready, ausstehende Dateien zählen zur Quote.
- Eigene YouTube-Oberfläche mit zweckgebundener Unsicherheit, Ablaufprüfung und ehrlich getrennten Zuständen für angenommenen Upload und Verarbeitung.
- Kein realer Grant, Schlüssel, Upload oder Hosting angelegt. Kein Refresh, Reconnect, öffentlicher Versand oder Hintergrundbetrieb.

## 0.6.0

- Echte serverseitige LinkedIn-Webpfade für expliziten Start, validierten Callback, Readiness und lokale Zugriffsentfernung, vollständig gesperrt ohne autorisierte Runtime-Konfiguration.
- Fester begrenzter Token-/JWKS-/Userinfo-Transport; vollständige RS256-/Issuer-/Audience-/Zeit-/Nonce-/Subjectprüfung vor Tokenverwendung oder Speicherung. Keine Provider-Aufrufe während Entwicklung oder Auslieferung.
- Additive Migration 0005, AES-256-GCM mit bereitgestelltem nicht exportierbarem Runtime-Key, besitzer-/kontextgebundene AAD und einmalige Installtickets. Erstes gültiges Install gewinnt; Widerruf und Keyrotation sind revisionsgeschützt.
- LinkedIn-UI mit streng geprüfter offizieller Weiterleitung, expliziter lokaler Trennbestätigung und Readback. Keine Tokens im Browser und keine Erfolgsmeldung allein aus Callback-Query.
- Reconnect, Refresh, providerseitiger Widerruf und Publishing bleiben gesperrt. Gehostete Identity-/Cookie-/Nonce-/Tokenantwort-Verträge müssen weiterhin tatsächlich geprüft werden.

## 0.5.0

- X als vierte, ehrlich unverbundene Option mit ausdrücklichem Kostenfreigabe-Hinweis; keine X-Verbindungs-/Jobpersistenz und keine bezahlte Aktivierung.
- Strikter servereigener LinkedIn-Konfigurationsvertrag und ablehnender Callbackparser. Die gekapselte Offline-Flow-Factory bindet Parser und State-Repository an dieselbe unveränderliche Konfiguration.
- Additive Migration 0004 für 256-Bit-State, gehashte Browserbindung und Nonce-Fingerprint, fünf Minuten Ablauf, ownergebundene Begrenzung und atomaren Einmal-Claim. Keine Roh-State-, Code-, Verifier- oder Tokenablage.
- Authentifizierter GET-Readiness-Endpunkt mit ausschließlich gesperrten Fähigkeiten. Kein HTTP-Start, Callback oder Tokenaustausch; keine neue Ausnahme von Origin-/Sites-Identitätsgrenzen.
- Automatisierte Migration-/Protokollregressionen und Browserprüfung der realen Vierer-Statusroute. Siehe Verifikationsbericht; gehostete Laufzeit und echte Provider bleiben ungeprüft.

## 0.4.0

- Eigener Worker-Einstieg für spätere Sites-Bereitstellung, ohne Node-Laufzeitabhängigkeiten, mit eingebettetem UI-Inventar und Dispatch-Identitätspflicht.
- Reine GET-Verbindungsübersicht für Instagram, LinkedIn und YouTube; keine fingierten Konten, OAuth-Links, Secrets oder Publikationsrouten.
- Additive Migration 0003 für Verbindungsplatzhalter und gesperrte Jobvorbereitung. Datenbankbedingungen verhindern „connected“, aktivierten Versand und ausführbare Jobs.
- Weiter identische Planungs-API/Adapter sowie die geprüften Ideen-, Varianten-, Queue- und Undo-Funktionen.
- 272 Tests in drei Host-Zeitzonen, Syntax- und reproduzierbarer Worker-Build. Cloud-D1/R2 und echte Sites-Identität sind noch nicht live nachgewiesen.

## 0.3.0

- Ideen-Inbox mit Titel, Notizen, Labels, Suche und Label-Filter; keine Kanäle oder Termine erforderlich.
- Expliziter Übergang Idee → Entwurf/geplanter Beitrag mit derselben ID, ohne vorzeitige Mutation oder separates Duplikat.
- Titel/Labels bleiben bei Varianten, Queue, Duplizieren und unabhängigen Änderungen erhalten. Unveränderte Metadaten werden nicht beim Öffnen normalisiert.
- Begrenztes Undo bewahrt kanonische Varianten-IDs, Statusnotizen und exakte UTC-Zeitpunkte. Fehlgeschlagene Wiederherstellung zeigt eine kopierbare Fassung statt stillen Verlusts.
- Weiter API-Schema 2 und unveränderte Migrationen; keine Cloud- oder Social-Verbindung.
- 214 automatisierte Tests, Syntaxprüfung und integrierte Browserprüfung. Umfang und Grenzen im Verifikationsbericht.

## 0.2.0

- Eigene Kanaltexte, ausdrückliche Vererbung, Reset-Dialoge und kanalbezogene Zeichenprüfung.
- Queue-Vorschläge im Editor mit editierbaren temporären Wochen-Slots, Mindestabstand und expliziter Terminübernahme.
- Additive Migration 0002; API-Schema 2 weist alte schreibende Clients ab und bewahrt unabhängige Alttexte.
- Reiner Browser-only-Speicher deaktiviert, damit alte Tabs keine neuen Varianten überschreiben können. Keine automatische Datenübernahme aus localStorage.
- 143 Tests in drei Host-Zeitzonen; zusätzliche integrierte Browserprüfung. Details und Grenzen im Verifikationsbericht.
- Lokaler Prototyp ohne echtes Login, externe Konten oder automatische Veröffentlichung. Nicht veröffentlicht.

## 0.1.0

- Eigenständige deutsche Planungsoberfläche mit Kalender, Entwürfen, Vorschau und Bildauswahl.
- Persistenter lokaler SQLite-/Dateispeicher, UTC/IANA-Termine und explizite Revisionskonflikte.
- Schutz vor Metadatenverlust, unvollständigen Snapshot-Schreibvorgängen und verspäteten Editor-/Bildereignissen.
- 89 automatisierte Prüfungen sowie ergänzende Browserprüfungen.

Dieser Stand ist ein lokaler Prototyp ohne Anmeldung, Social-Konten, automatischen Versand oder Sites-Deployment. Kanalvarianten und Queue-Bedienung sind kein Bestandteil dieser Version.

## Local v71 candidate: saved images per channel

- Added a saved-draft-only channel image dialog under Weitere Aktionen, with explicit image selection, order and empty lists.
- Preserved full per-channel media through canonical saves and downstream copy/archive/split paths.
- Added explicit unsupported-workspace safety and a candidate-readable, write-paused fallback. No protocol, migration, provider, security or hosting changes.
