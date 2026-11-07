# YouTube 0.7: Betriebsvoraussetzungen und Grenzen

Dieser Stand enthält ausführbaren Servercode, aber keine eingerichtete Site, Google-App, Credentials, Grants oder Videos. Sämtliche erfolgreichen Providerantworten in den Prüfungen sind lokale Fixtures mit echten lokal erzeugten RSA-Signaturen. Kein Live-Erfolg wird daraus abgeleitet.

## Tatsächlicher Ablauf

1. Ein authentifizierter Sites-Besucher startet ausdrücklich den Google-Webflow. Servereigene Konfiguration pinnt Site, Client, Callback und den vorher bestätigten Zielkanal. Der Versuch besitzt 256-Bit-State, Nonce, getrennten geschützten Cookie und PKCE S256. Der PKCE-Verifier wird verschlüsselt und atomar nur einmal beansprucht.
2. Der Callback verlangt dieselbe Sites-Identität und Browserbindung. Codeaustausch geht ausschließlich an den festen Google-Endpunkt. Vollständige RS256-/Issuer-/Audience-/Zeit-/Nonce-/Subjectprüfung, Userinfo-Subject und `channels.list(mine=true)` müssen genau den bestätigten Kanal belegen. Erst danach darf ein einmaliges Installticket den verschlüsselten Access-Token speichern.
3. Eine bewusst gewählte MP4-/WebM-Datei wird separat privat in der Site gespeichert, noch nicht bei Google. 8 MiB pro Datei und 20 Dateien pro Besitzer einschließlich ungewisser Reservierungen. Server berechnet Hash und Größe; R2-Key und Credentials bleiben privat.
4. Metadaten einschließlich Kinder-/KI-Angaben erzeugen einen unveränderlichen Plan. Erst dessen ausdrücklich bestätigter Start darf eine private Resumable-Sitzung erstellen. `privacyStatus=private` und `notifySubscribers=false` sind in allen Schichten fest, nicht bloß UI-Voreinstellungen.
5. Bekannte Chunks können nur zur gespeicherten Sitzung weiterlaufen. Unklarer Chunk benötigt dieselbe Statusprobe. Unklarer Start, abgelaufene Sitzung oder unerwartete Sichtbarkeit führen zur manuellen Klärung, niemals automatisch zu einem neuen Upload. Angenommene Übertragung ist nicht gleich fertige Verarbeitung; ein gesondertes Lesen der eigenen gespeicherten Video-ID unterscheidet das.

Die Benutzeroberfläche bietet keine öffentliche Sichtbarkeit, Veröffentlichungstermine oder automatische Fortsetzung nach Reload. Ein Cancel stoppt weitere Takt-Schritte, kann aber einen bereits gesendeten Google-Request nicht rückgängig machen. Trennen löscht lokalen Zugriff und sperrt neue Schritte; es widerruft nicht den Google-Grant und löscht keine Videos.

## Gesperrte Runtime-Konfiguration

Nur ausdrücklich autorisierte native Runtime-Konfiguration darf diese Werte bereitstellen:

- `TAKT_YOUTUBE_ENABLED` exakt `true`.
- `TAKT_YOUTUBE_CONFIGURATION`: JSON mit exakt `siteId`, `siteOrigin`, `clientId`, `redirectUri`, `accountType`, `expectedChannelId`, `appConfigVersion`, `reviewedSiteIdentity`, `reviewedGoogleWebContract`, `approvedTargetChannel`, `reviewedCloudUploadContract`.
- `accountType=channel`, `appConfigVersion=v1`, eigene kanonische HTTPS-Origin, exakter Callback `/api/providers/youtube/oauth/callback` und vorab bestätigte Kanal-ID. Die ersten drei Prüfbestätigungen müssen ausdrücklich true sein. Sie sind Betreiberassertionen, keine automatisch erbrachten Nachweise oder Nutzerzustimmung.
- `TAKT_YOUTUBE_CLIENT_SECRET` und `TAKT_TOKEN_KEYRING_JSON` als autorisierte native Secrets. Der Keyring entspricht dem dokumentierten A256GCM-Format des Token-Lifecycle; es gibt keine Schlüsselgenerierung, Browseraufnahme oder Klartextablage in D1.
- Private Uploads benötigen zusätzlich `TAKT_YOUTUBE_PRIVATE_UPLOAD_ENABLED=true` und `reviewedCloudUploadContract=true`. OAuth allein schaltet keine Übertragung frei.

Der lokale Entwicklungsserver ignoriert diese Aktivierungswerte und injiziert keinen Providertransport. Er dient dem lokalen Planer und der echten gesperrten UI. Wer nur den Quellcode startet, erhält keine verbundene Google-Sitzung.

## Noch notwendige Freigaben und Betriebsnachweise

- Autorisierte private Sites-Bereitstellung mit tatsächlicher Dispatch-Identität, D1/R2-Bindings und Migration 0006. Derselbe Benutzer muss nach externer Google-Anmeldung mit seinem geschützten Cookie zurückkehren. Keine Weiterleitung von Code/State in Sites-Anmeldelinks.
- Tatsächliche Google-Web-App, exakt registrierter HTTPS-Callback, zugelassene Produkte/Scopes, konkreter Zielkanal, Google-Projektquota und gegebenenfalls App-/Compliance-Prüfung. Google-Erfolg darf nicht aus einer lokalen Fixture oder einem Konfigurationsflag behauptet werden.
- Sichere Schlüssel-/Secretbereitstellung und Rotation, Wiederherstellung sowie Query-/Plattformlog-Prüfung. Code, State, Tokens und Sessionadressen dürfen nicht in Logs oder öffentliche DTOs gelangen.
- Reale Native-Response-URL-/Headerverträge, D1-CAS/Rollback, R2-Objektbestätigungen, Worker-Speicher-/Zeitbudget und mindestens zwei echte Besitzer prüfen. Die 8-MiB-Grenze ersetzt keine Cloud-Abnahme.
- Eigene Zustimmung zum dauerhaften Google-Zugriff und separate Bestätigung jeder konkreten privaten Datei mit finalen Metadaten. Diese Quellprüfung erteilt beides nicht.

## Bewusste Grenzen

Nur Online-Access: exakt `openid`, `youtube.upload`, `youtube.readonly`; kein `email`, `profile`, Offline-Access oder Refresh. Ohne Refresh und Reconnect endet die Nutzbarkeit beim Tokenablauf. Das ist kein unbeaufsichtigter Buffer-Dauerbetrieb. Laufende Uploads werden nach Ablauf nicht über eine heimliche Neuanmeldung fortgesetzt.

Ein gespeicherter Kanal muss eindeutig dem authentifizierten Konto zugeordnet sein. Mehrdeutige oder abweichende Kanalantworten werden abgewiesen. Browserkanal-ID, E-Mail oder Anzeigename sind kein Nachweis.

Resumable-URLs werden als verschlüsselte serverseitige Capabilities behandelt. Nur die feste Google-Origin und der dokumentierte Uploadpfad mit begrenzten Parametern sind erlaubt. Sessionverlust erzeugt keine automatische neue Session. Chunkgröße bleibt über die Sitzung fest; nicht finale Chunks sind Vielfache von 256 KiB.

Dauerhafte Inhalts-Eindeutigkeit schützt vor wiederholten Medienreservierungen und identischen Uploadintents, auch nach Unklarheit/Cancel. Noch keine Funktion für absichtlich doppelte Uploads, Löschung, Retention, Quotenfreigabe oder manuelle Versöhnung unklarer Resultate. Ein Pending-Eintrag ist keine verwendbare Datei. Speicher-/Aufbewahrungsanforderungen und Google-Richtlinien müssen vor echtem Betrieb festgelegt werden.

Trennen setzt aktuell intakte Konfiguration und lesbare verschlüsselte Metadaten voraus. Verlorene Schlüssel, beschädigter Ciphertext und Konfigurationswechsel benötigen einen getrennten autorisierten Recoveryplan. Keine allgemeine Wiederherstellungs- oder Backupgarantie.

## Offizielle Vertragsquellen

Geprüfte Grundlagen, keine Behauptung einer erfolgten Live-Integration:

- Google Discovery: https://accounts.google.com/.well-known/openid-configuration
- Webserver OAuth: https://developers.google.com/identity/protocols/oauth2/web-server
- OpenID Connect: https://developers.google.com/identity/openid-connect/openid-connect
- Authentifizierter Kanal: https://developers.google.com/youtube/data/docs/channels/list
- Video-Insert und Defaultwerte: https://developers.google.com/youtube/v3/docs/videos/insert
- Resumable Upload: https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol
- Videos/Verarbeitung: https://developers.google.com/youtube/v3/docs/videos
- Entwickler-/Datenschutzregeln: https://developers.google.com/youtube/terms/developer-policies

REA-Anleitung wurde berücksichtigt: Da der vollständige Quellbaum vorliegt, verlangt sie normale Source-/Runtime-Prüfung statt REA-Engine/Decompilation. Es wurde keine REA-Engine-Ausführung behauptet. Tests, Browserbelege und offene Livegrenzen stehen getrennt in `verification.md`.
