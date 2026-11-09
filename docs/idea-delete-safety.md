# Neuere Ideeneingaben nach dem Löschen erhalten

Der Ideen-Löschpfad vergleicht nach einem bestätigten Save den aktuellen Titel-/Notiz-/Labels-Snapshot mit dem beim Löschklick aufgenommenen Snapshot. Später eintreffende Eingaben, etwa ein verzögerter Eingabeabschluss während der Speicherantwort, dürfen nicht durch automatisches Schließen verschwinden.

Wenn sich die Eingabe während des Löschens geändert hat:

- Die gespeicherte Originalidee bleibt wie ausdrücklich angefordert gelöscht.
- Der Dialog und sämtliche neueren Felder bleiben als **ungespeicherte neue Idee** geöffnet. Es erfolgt kein zweiter automatischer Save und keine automatische Umwandlung in einen Beitrag.
- Die alte Ideen-ID wird abgelegt und der Löschen-Button verborgen. Ein späteres ausdrückliches Speichern erzeugt eine neue ID.
- Die Editorbaseline wird absichtlich nicht als gespeichert dargestellt. Schließen und Neuladen warnen weiterhin, auch wenn die Felder wieder dem inzwischen gelöschten Original entsprechen.

Ohne spätere Eingaben bleiben Schließen und Rückgängig unverändert. Ein abgelehnter oder unklarer Löschabschluss bleibt ebenfalls unverändert: keine Erfolgsmeldung, kein automatischer Retry, Editor offen. Nach einem verlorenen Response kann die Originalidee serverseitig bereits gelöscht sein; dies ist kein neuer Reconcile-Mechanismus.

Der Fix betrifft ausschließlich die Browserfunktion deleteIdea. Kein Schema, Backend, Provider, CSP, Upload oder Dienst wird geändert. Die Regressionen verwenden reale App-Funktionen mit Plannerclient, Adapter, Request-Handler und lokalem SQLite-Testadapter. Native UI-/IME-Abnahme ist davon getrennt. Lokale ungesicherte Eingaben sind kein dauerhaftes Backup.
