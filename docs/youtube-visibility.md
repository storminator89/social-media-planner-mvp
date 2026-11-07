# YouTube: bewusste Sichtbarkeit

Arbeitsstand, nicht veröffentlicht oder live aktiviert. Diese Änderung ist keine Bestätigung vollständiger Google-/YouTube-Richtlinienkonformität.

## Ablauf

1. Datei getrennt in der Site speichern.
2. Titel, Beschreibung, Kategorie, Kinder-/KI-Angaben und Sichtbarkeit wählen. Im Browser gibt es keine vorgewählte Sichtbarkeit.
3. Gespeicherten unveränderlichen Plan prüfen, dieselbe Sichtbarkeit ausdrücklich bestätigen und Einhaltung der YouTube Community Guidelines bestätigen.
4. Sichtbarkeitsbezogenen Startbutton betätigen. Öffentlich bedeutet Veröffentlichung für alle; nicht gelistet bedeutet Zugriff und Weitergabe durch jeden mit dem Link.

Der HTTP-Prepare-Endpunkt verlangt eine gültige ausdrückliche Sichtbarkeit. Zustimmung bindet Operation, Fingerprint, Revision, Sichtbarkeit, passenden Intent und Richtlinienbestätigung. Eine Änderung der Sichtbarkeit erfordert einen neuen Plan und eine neue Zustimmung. Alte private Pläne bleiben lesbar; die internen bisherigen Funktions-/Aktionsnamen bleiben aus Kompatibilitätsgründen erhalten. Nur diese internen Kompatibilitätspfade behandeln fehlende Sichtbarkeit weiter als privat, niemals als öffentlich.

## Geschlossene Aktivierung

Die bestehende Freigabe `TAKT_YOUTUBE_PRIVATE_UPLOAD_ENABLED` allein erlaubt weiterhin ausschließlich private Übertragungen. Öffentlich und nicht gelistet verlangen zusätzlich exakt `TAKT_YOUTUBE_PUBLIC_UPLOAD_ENABLED='true'`. Die bestehende OAuth-Konfiguration, geprüfte Voraussetzungen und private Uploadfreigabe bleiben erforderlich. Diese Änderung setzt kein Runtime-Flag, erstellt keine Grants und verändert keine Schlüssel, Hosts oder Sicherheitskonfiguration.

Readiness nennt die tatsächliche Fähigkeit als `capabilities.publishing`; die Uploadpolicy kennzeichnet die Sichtbarkeit als `explicit_choice`. Die UI kann alle drei Pläne vorbereiten, blockiert nicht-private Starts aber ohne zusätzliche Serverfreigabe. Der Server blockiert nicht-private Ausführung unabhängig von der UI.

Kein Scheduler, kein Refresh/Reconnect, kein Live-Upload, keine neuen Scopes oder Abonnentenbenachrichtigungen. Bestehende Größenlimits, Identitätsprüfung, Verschlüsselung, Lease-Fencing und Unsicherheitsregeln bleiben bestehen.

## Antwortprüfung

Google muss bei Annahme und Einzelprüfung genau die genehmigte Sichtbarkeit und Kanalidentität melden. Eine auf privat eingeschränkte Antwort auf einen public/unlisted-Plan zählt nicht als Erfolg. Die vorhandene dauerhafte Warnung verlangt manuelle Klärung ohne Ersatzübertragung. Das gilt insbesondere für mögliche private Einschränkungen nicht auditierter API-Projekte. Keine automatische Korrektur der Sichtbarkeit und kein erneuter Upload.

## Verifikation

`npm test` baut das Worker-Artefakt und führt synthetische Tests aus. Abgedeckt: alle drei Sichtbarkeiten vom HTTP-Plan bis zum Provider-Request, Zustimmung, falsche Sichtbarkeit/Revision/Fingerprint/Intent, fehlende Richtlinienbestätigung, separates Runtime-Gate, keine implizite HTTP-Sichtbarkeit, Antwortabweichung, wiederholte Starts, Verarbeitung/Inspektion und bestehende Abbruch-/Unsicherheitsregeln.

`npm run check` prüft JavaScript-Syntax. Keine echte Google-Integration und keine visuelle Browserprüfung durchgeführt. Vor Veröffentlichung sind gesonderte Prüfung des Gesamtprodukts, UI-Sichtprüfung und die weiterhin offenen OAuth-/Datenschutz-/Aufbewahrungsanforderungen erforderlich.
