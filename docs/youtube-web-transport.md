# Google/YouTube-Web-OAuth: deaktivierter Entwicklungsbaustein

Stand: 7. November 2026. Nur Quellcode, lokale Kryptografie und simulierte Providerantworten. Keine Google-App, Konsole, Anmeldung, Zustimmung, echten Tokens, Uploads oder Änderungen am Hosting. Erfolgreiche Fixture-Tests sind kein Live-Nachweis. Dieser Baustein muss serverseitig bleiben und wird erst durch die getrennt geprüfte, standardmäßig deaktivierte HTTP-Orchestrierung aufgerufen.

## Enger Funktionsumfang

Der erste Weg verbindet einen ausdrücklich bestätigten YouTube-Kanal für spätere private Uploads. Die Scopes sind exakt:

- `openid`
- `https://www.googleapis.com/auth/youtube.upload`
- `https://www.googleapis.com/auth/youtube.readonly`

Kein `profile`, `email`, Vollverwaltungs-Scope, Refresh-Token oder Offlinezugriff. Der Autorisierungslink setzt `access_type=online`, `include_granted_scopes=false`, `prompt=select_account`, PKCE-S256 und eine unabhängige zufällige OIDC-Nonce. Eine bestehende Anmeldung oder Kontoverbindung ist keine Freigabe für Videoübertragungen. Öffentliche Planung und Publikation gehören nicht zu diesem OAuth-Baustein.

## Konfiguration und Exports

`createYouTubeOfflineConfiguration` erhält ausschließlich serverseitig festgelegte Felder:

```js
{ siteId, siteOrigin, clientId, redirectUri,
  accountType: 'channel', expectedChannelId, appConfigVersion: 'v1' }
```

`redirectUri` muss exakt die kanonische HTTPS-Site-Origin plus `/api/providers/youtube/oauth/callback` sein. Die Konfiguration wird vor asynchroner Arbeit aus eigenen Datenfeldern kopiert, eingefroren und intern gebrandet. Eine nachgebaute Kopie genügt nicht. Konfigurations- und Kontextfingerprint binden den vorgesehenen Kanal. Syntaxprüfung beweist weder Site-Eigentum noch App-/Scope-Freigabe.

Weitere Exports aus `youtube-contract.mjs`: `YOUTUBE_REQUIRED_SCOPES`, `YOUTUBE_CALLBACK_PATH`, `GOOGLE_ISSUER`, `GOOGLE_AUTHORIZATION_ENDPOINT`, `GOOGLE_TOKEN_ENDPOINT`, `parseYouTubeCallback`, `youTubeAuthorizationURL`.

Factory aus `youtube-web-transport.mjs`:

```js
createYouTubeConfidentialWebFlow(db, configuration, {
  clientSecret,
  cipher,
  transport,
  operatingContract: {
    issuer: 'https://accounts.google.com',
    codeInjectionDefense: 'pkce_s256_and_oidc_nonce',
    serverConfirmedWebContract: true
  },
  beforeExchange,
  clock: Date.now,
  deadlineMs: 10000
})
```

`cipher` ist ausschließlich der gebrandete YouTube-Cipher aus der geprüften Runtime-Factory. Das Betriebskontrakt-Flag ist eine verpflichtende, privilegierte Betreiberbestätigung, kein technischer Nachweis, keine Nutzerzustimmung und kein Ersatz für eine Freigabe. Optionen, Konfiguration und feste Providerendpunkte dürfen niemals aus Browser-JSON, Queryparametern oder Headers zusammengemischt werden. Es gibt keinen globalen `fetch`-Fallback.

## Geschlossener State-/PKCE-Weg

`begin(trustedOwner, browserBinding)` erzeugt unabhängige zufällige 256-Bit-Werte für Nonce und PKCE-Verifier. Die eigene, zur Konfiguration passende State-Repository-Instanz erzeugt den State, speichert nur seinen Hash und verschlüsselt den Verifier mit getrenntem Zweck/AAD. Das flüchtige Rückgabeobjekt enthält nur `{state, nonce, codeChallenge, expiresAtMs}`. Der Verifier erscheint nicht im Browser oder Autorisierungslink.

Die HTTP-Schicht muss vor Ausgabe des Links ihr exakt passendes Installticket dauerhaft speichern und ein separates Secure/HttpOnly/SameSite-Cookie binden. `trustedOwner` stammt aus der überprüften Sites-Identität, niemals aus dem State oder HTTP-Body. Die tatsächliche Cookie-Rückkehr auf einer gehosteten Site ist noch separat abzunehmen.

`completeCallback({trustedOwner, callbackUrl, browserBinding})` verwendet den eigenen strikten Parser und dieselbe echte Repository-Konfiguration. Es akzeptiert keinen injizierten State-Claim oder verifizierten Token. Callback-Duplikate, Roh-/dekodierte Steuerzeichen, falsche Route, Code/Error-Mischung oder falscher/fehlender Callback-Issuer werden abgewiesen. `scope`, `authuser` und `prompt` in der Rückkehr sind nur begrenzt tolerierte Zusatzfelder, niemals Autorisierungsevidenz. Providerfehlertexte werden verworfen.

Der State wird atomar genau einmal beansprucht. Der Verifier kommt ausschließlich intern und nicht enumerierbar aus diesem Claim zurück. Danach läuft vor jedem Tokenaustausch genau einmal `beforeExchange(attemptBinding)`. Die eingefrorene Bindung hat exakt:

```js
{ ownerId, siteId, configFingerprint, contextFingerprint,
  stateHash, expectedChannelId }
```

Der Hook muss ein zu dieser Bindung passendes, unverändertes Install-/Widerrufs-Ticket beanspruchen und exakt `true` liefern. Das Ergebnis trägt dieselbe Objektbindung. Die spätere Credential-Persistenz muss erneut Eigentümer, Konfiguration, Kanal, Revision, Widerrufsepoche und Ticket vergleichen. Zwei Anmeldeversuche derselben Person sind nicht austauschbar. Falscher, abgelaufener oder bereits verbrauchter State, unklarer Datenbankausgang und ein abgelehnter Hook führen zu keinem Tokenrequest. Unklar beanspruchte Codes werden nicht wiederholt.

## Feste Netzsequenz und Validierung

Nach erfolgreichem Claim/Fence nur diese Sequenz:

1. Form-POST `https://oauth2.googleapis.com/token`, mit Code, `client_id`, serverseitigem `client_secret`, exakt registriertem `redirect_uri`, `grant_type=authorization_code` und ausschließlich dem beanspruchten `code_verifier`.
2. GET `https://www.googleapis.com/oauth2/v3/certs`, ohne Token. Tatsächliche WebCrypto-RS256-Prüfung des ID-Tokens gegen öffentliche RSA-Schlüssel; keine tokenbestimmten Schlüsseladressen und kein bloßes JWT-Decoding.
3. GET `https://openidconnect.googleapis.com/v1/userinfo` mit Bearer-Token, erst nach gültiger Signatur/Identitätsprüfung. `sub` muss exakt zum ID-Token passen.
4. GET `https://www.googleapis.com/youtube/v3/channels?part=id&mine=true` mit demselben Token. Genau ein Ergebnis ohne weitere Seite muss die vorher bestätigte `expectedChannelId` haben. Keine Auswahl des ersten beliebigen Kanals.

ID-Token-Prüfung: nur RS256, sicherer Header/JWKS, passender Client als einziger Audiencewert, passender optionaler `azp`, gültige `exp`/`iat`/`nbf`, bounded ASCII-`sub`, exakt passende Nonce und optionaler `at_hash`. Zugelassen sind nur die beiden von Google dokumentierten ID-Token-Issuer `https://accounts.google.com` und `accounts.google.com`; das Ergebnis normiert auf die HTTPS-Form. Der Callback-Issuer bleibt strikt die Discovery-HTTPS-Form.

Die Tokenantwort muss Bearer, eine positive begrenzte Laufzeit, ID-Token und explizit genau die drei angefragten Scopes bestätigen. Fehlende, zusätzliche oder doppelte Scopes werden nicht erraten. Unerwartete Refresh-Tokens und Profildaten werden verworfen. Google-Konto-Subject und YouTube-Kanal sind unterschiedliche Identitäten und bleiben getrennt.

Erfolg ist serverintern:

```js
{
  status: 'identity_verified',
  identity: { issuer, subject, channelId },
  attemptBinding,
  expiresAtMs,
  grantedScopes,
  connected: false, publishing: false, refreshSupported: false
}
```

Nur `result.accessToken` ist für den direkten vertrauenswürdigen Credential-Store vorhanden, nicht enumerierbar und nicht beschreibbar. JSON/Spread enthalten es nicht. Diese Schutzmaßnahme macht das Objekt nicht zu einer Browser-DTO; eine explizite Tokenkopie würde es natürlich offenlegen. Der Flow speichert keinen Providergrant und schaltet nichts frei.

## Fristen, Fehler und begrenzte Ressourcen

Ein monotones Budget von standardmäßig zehn, maximal dreißig Sekunden gilt jeweils für Begin bzw. den gesamten Callback: Stateclaim, Hook, Tokenrequest, Streaming, Signaturprüfung, Userinfo und Kanalprüfung. Es wird zwischen Stufen nicht erneuert. Späte Ergebnisse können keine nächste Netzstufe oder Erfolgsausgabe auslösen. Ein abgebrochener Tokenrequest kann beim Provider trotzdem angekommen sein; sein Ausgang bleibt unklar. Keinen Code erneut senden.

Begin-Laufzeitfehler sind ausdrücklich keine Konfigurationsfehler. `begin` wirft eine redigierte `YouTubeWebBeginError`: `STATE_BEGIN_OUTCOME_UNKNOWN` mit `status:begin_outcome_unknown`, oder bei bestätigter voller State-Quote `STATE_LIMIT_REACHED` mit `status:begin_limit_reached`. Beide enthalten `retryAllowed:false`, `connected:false` und `publishing:false`, keinen Authlink, State, Nonce oder Rohfehler. `INVALID_WEB_CONFIGURATION` bleibt der Factory-Konfigurationsprüfung vorbehalten. Die HTTP-Schicht muss diese Laufzeitkennungen übernehmen, darf keinen Link ausgeben und keinen automatischen Begin-Retry auslösen.

Die versuchslokale DB-Fassade prüft die Deadline direkt vor Statementvorbereitung und Batchversand. So kann eine erst nach Fristablauf fertig werdende Kryptografie keinen neuen State-Write starten. Ein bereits an die Datenbank übergebener Batch kann jedoch nach der Deadline noch committen; ein Abbruch ist keine bestätigte Rücknahme. Ein solcher unbekannter State kann einen der fünf Plätze pro Eigentümer bis zu seinem fünfminütigen Ablauf belegen. Erst nach Prüfung bzw. Ablauf bewusst neu beginnen; keine automatische Bereinigung unbekannter laufender Commits und kein unbegrenzter Retry. Das Budget kann beliebigen synchron blockierenden Fremdcode nicht unterbrechen und ersetzt keine Datenbank-Abbruchgarantie.

Token-/JWKS-Antworten: maximal 64 KiB; Userinfo/Kanalliste: maximal 32 KiB. Echtes `Response`-Objekt, genaue nichtleere Antwort-URL, JSON-Content-Type, keine Weiterleitung und keine opaque Antwort. Dekomprimierte Streamingbytes werden begrenzt; doppelte JSON-Namen, kaputtes UTF-8, tiefe/zu große Strukturen werden abgelehnt. Requests setzen `redirect:error`, `credentials:omit`, `cache:no-store`, `referrerPolicy:no-referrer` und dasselbe AbortSignal. Der injizierte Transport muss diese Regeln, TLS, fehlende Cookies und fehlende automatische Wiederholungen wirklich einhalten.

Callback-Fehler enthalten nur feste Status-/Fehlercodes sowie `connected:false`, `publishing:false`, `retryAllowed:false`, `restartRequired:true`. Kein Providertext, Token, Code, Verifier, Body oder Rohfehler wird geloggt oder zurückgegeben. Datenbank-/Installunsicherheit benötigt eigene Klärung, keinen zweiten Token-POST.

## Belegte Spezifikation und verbleibende Abnahme

- [Google Discovery](https://accounts.google.com/.well-known/openid-configuration), erneut gelesen: festgelegte Endpunkte, RS256, `client_secret_post`, S256 und `authorization_response_iss_parameter_supported:true`.
- [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect): Nonce im Server-Codeflow, Signatur/Audience/Zeit/Subject-Prüfung, zwei dokumentierte ID-Token-Issuer und Userinfo.
- [Google Webserver-OAuth](https://developers.google.com/identity/protocols/oauth2/web-server): vertraulicher Codeaustausch, registrierter Redirect, online/offline und granular erteilte Scopes. Der dortige Überblick allein belegt PKCE nicht; S256 wird zusätzlich über Discovery und den Standard belegt.
- [RFC 7636](https://datatracker.ietf.org/doc/html/rfc7636): S256-Challenge und Verifier beim Austausch. Kein plain-Fallback.
- [RFC 9207](https://datatracker.ietf.org/doc/html/rfc9207): issuergebundene Rückkehr; hier wegen bestätigter Metadaten verpflichtend.
- [YouTube channels.list](https://developers.google.com/youtube/data/reference/rest/v3/channels/list) und [videos.insert](https://developers.google.com/youtube/data/reference/rest/v3/videos/insert): kanalbezogene OAuth-Abfrage und Uploadberechtigung. Diese APIs sind nicht durch einen allgemeinen Google-Login ersetzt.

Vor Aktivierung fehlen Nutzer-/Projekt-/Berechtigungsfreigaben, registrierte App/Redirect, autorisierte Runtime-Secrets, konkreter Kanalnachweis, vollständige HTTP-/Daten-/Cookie-Integration und ein gesondert freigegebener echter privater Test. Exakte zurückkehrende Scope-/Issuer-/Tokenformate, Konto-/Brand-Channel-Verhalten und Providerentitlements wurden nicht live beobachtet. Eine Abweichung muss geprüft werden; kein stiller Fallback. Tokenablauf beendet diesen Zugriff, solange kein separat genehmigter Refresh-Lebenszyklus existiert. Google-/YouTube-Richtlinien, Datenlöschung und Widerruf bleiben Produktpflichten.
