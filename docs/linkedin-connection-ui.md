# LinkedIn-Bedienung

Die LinkedIn-Karte verwendet ausschließlich den eigenen authentifizierten Readiness-Endpunkt. Der allgemeine Viererstatus bleibt für Instagram, YouTube und X zuständig. So erscheinen keine widersprüchlichen LinkedIn-Zustände.

- Unbekannte oder ungültige Antworten sperren alle Aktionen. Kein Konto wird optimistisch als verbunden markiert.
- Start nur bei `ready`, bestätigtem Ziel und vollständigen Serverfähigkeiten, nach ausdrücklichem Klick. Offizielle Provideradresse, eigenes Callbackziel und einmalige erlaubte Parameter werden vor Weiterleitung geprüft.
- Lokale Trennung erfordert einen zweiten bestätigenden Klick. Die Erklärung unterscheidet das Entfernen des Zugriffs aus diesem Planer vom nicht bestätigten Widerruf bei LinkedIn. Erfolg verlangt HTTP 204 und danach echten Readback.
- Ein einmaliger Ablauf-Timer und erneute Zeitprüfung bei Wiederaufnahme/Bedienung entfernen einen veralteten Verbunden-Zustand ohne Polling. Abgelaufene und entfernte Verbindungen bieten keinen Reconnect. Ein Callback-Queryparameter beweist keinen Erfolg.
- Laufende Operationen sperren wiederholte Klicks. Veraltete Antworten, Hide/Destroy und Pagehide können keine verspätete Navigation auslösen. Back/Forward bzw. BFCache-Rückkehr lädt frische Readiness, ohne erneut OAuth zu starten.
- Keine Tokens, Secrets oder Account-PII im Browser. Kein Polling, localStorage oder automatischer Verbindungsstart.

Automatisierte Prüfungen bedienen die echten exportierten Validator-, Client-, Controller- und Renderfunktionen. Navigation und HTTP-Antworten sind dabei ausdrücklich injizierte Testgegenstücke; ein solcher Erfolg ist kein tatsächlicher Providerlogin. Umfang und Browsernachweise stehen im aktuellen Verifikationsbericht.
