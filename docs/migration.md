# Lokales Upgrade auf 0.9

## Vorher

Jede Version ist ein getrennter lokaler Quellstand. Ein Upgrade sollte erst nach Sicherung des gesamten `.local/`-Ordners bei beendetem Server erfolgen. Die Datenbank und die zugehörigen Medien gehören zusammen; JSON-Export allein ist keine vollständige Sicherung. Die bereitgestellten Quellsnapshots enthalten keine Nutzerdaten.

Keine automatische Übernahme fremder Arbeitsverzeichnisse, Browserprofile oder veröffentlichter Cloud-Daten. Den alten Server nicht parallel gegen dieselbe Datenbank weiterbetreiben. Eine Downgrade-Migration ist nicht implementiert; für eine Rückkehr die zuvor gesicherte Datenkopie in einer separaten Umgebung verwenden.

## Ablauf

`LocalDatabase` prüft die gespeicherte Migrationsliste unter `BEGIN IMMEDIATE`. Bekannte Versionen müssen lückenlos und mit unveränderter SHA256-Prüfsumme vorliegen. Unbekannte, geänderte oder unvollständige Historie wird abgewiesen. Alle noch fehlenden SQL-Schritte sowie ihre Ledger-Einträge werden in einer Transaktion ausgeführt; Fehler rollen beides zurück.

- `0001_planner.sql` bleibt bytegleich.
- `0002_variant_inheritance.sql` fügt `inherits_body` hinzu. Default ist 0: bestehende Kanaltexte bleiben ausdrücklich unabhängig, selbst wenn sie der Basis gleichen. Gleichheit beweist keine beabsichtigte Vererbung.
- IDs, Titel, Notizen, Medienverweise, Revisionen und Besitzer werden nicht umgeschrieben.
- Ein neuer aktueller Adapter stellt vererbte Texte durch fehlende Keys in `variantTexts` dar. Ein vorhandener Key ist eine unabhängige Fassung. Die bewusste Rücksetzung erfolgt in der UI.

Seit 0.9 verwenden GET/PUT API-Schema 3 (zuvor Schema 2). Ein alter oder fehlender Schemastand wird vor Schreiboperationen mit 409 `STATE_SCHEMA_CHANGED` abgewiesen, auch bei passender Revision. Ein Konflikt ist kein Anlass zum automatischen Überschreiben.

## Browser-only-Altbestände

Der integrierte Stand unterstützt nur den expliziten Serveradapter. Er liest oder schreibt keine alten localStorage-Schlüssel und führt keine stille Migration durch. Fehlende Adapter und `null`-Antworten sperren das Laden/Speichern, statt Demos anzulegen. Browser-only-Altbestände müssen separat gesichert und mit einem ausdrücklich entworfenen Import übernommen werden. Solch ein Import gehört nicht zu dieser Version.

## Nachweisgrenze

Tests prüfen echte lokale SQLite-Dateien, wiederholte Starts, alte Mehrbesitzerdaten und absichtliche Fehler im Ledger/DDL. Die unabhängige Nachprüfung übt den echten Constructor zusätzlich mit isoliertem Memory-SQLite aus. Gehostete D1-Migrationen und authentifizierte Sites-Dispatch-Aufrufe sind damit nicht nachgewiesen.

## Von 0.2 auf 0.3

0.3 ergänzt nur UI, Adapter und reine Workflowfunktionen. Beide SQL-Migrationen, API-Schema 2, Repository und lokaler Server bleiben unverändert. Ideen nutzen den vorhandenen `stage:'idea'` mit Titel und Tags. Es gibt keine separate Ideen-Tabelle oder neue Datenmigration.

Auch hier vor dem Upgrade Server stoppen und den gesamten lokalen Datenordner sichern. Alten Server nicht parallel gegen dieselbe Datei laufen lassen. Ein alter 0.2-UI-Adapter mit veralteter Revision erhält 409. Nach erneutem Laden weist dieser Adapter Ideen/Tags bewusst ab, anstatt sie zu reduzieren. Das gilt für den geprüften vollständigen 0.2-Adapter, nicht als pauschales Kompatibilitätsversprechen beliebiger Drittclients.

Unveränderte Metadaten werden exakt übernommen; neue bzw. bewusst bearbeitete Labels werden auf die UI-Regeln normalisiert. Ein Undo-Zwischenspeicher wird nicht migriert oder persistent gemacht. Für eine Rückkehr auf einen älteren Stand eine getrennte Sicherung verwenden, nicht durch alte UI-Normalisierung schreiben.

## Von 0.3 auf 0.4

`0003_provider_jobs.sql` ergänzt nur `planner_provider_connections`, `planner_publication_jobs` und einen Index. Bestehende Tabellen, IDs, Revisionen und beide alten SQL-Dateien bleiben unverändert. Es gibt keine Seed-Konten oder automatisch vorbereiteten Jobs. Status-GETs verändern keine Tabellen. Die lokale Migrationsliste umfasst danach 1, 2 und 3; Fehler rollen die gesamte noch ausstehende Migration samt Ledger zurück.

Verbindungen sind ausschließlich unverbundene Einrichtungszustände. Jobs können nur `blocked` oder `cancelled` sein; `publishing_enabled=0` wird in beiden Tabellen erzwungen. Weder Credential-Felder noch eine ausführbare Lease oder Versandfreigabe sind vorhanden. Die Vorbereitung besitzt keinen öffentlichen Schreibendpunkt.

Geprüft: tatsächlicher lokaler Constructor mit Daten mehrerer Besitzer, unveränderte Alt-Revisionsdaten, wiederholte Öffnung, leere neue Tabellen sowie Rollback, wenn Migration 0003 auf widersprüchliches vorhandenes Schema trifft. Diese Tests ersetzen nicht die spätere gehostete Migrationsabnahme. Der Worker führt keine DDL während HTTP-Anfragen aus.

## Von 0.4 auf 0.5

`0004_oauth_state.sql` fügt ausschließlich `planner_oauth_states` und einen owner-/ablaufgebundenen Index hinzu. Migrationen 0001–0003 bleiben bytegleich. Kein Tabellenneuaufbau, keine Rückfüllung, keine Änderung vorhandener Planer-, Medien-, Verbindungs- oder Jobdaten. Der lokale Ledger umfasst danach 1, 2, 3 und 4.

Die neue Tabelle speichert nur Hashes von State und Browserbindung, einen Nonce-Fingerprint sowie nichtgeheime, exakt gebundene Konfiguration. Sie enthält keine Autorisierungscodes, PKCE-Verifier, Tokens oder Schlüssel. HTTP-Leseaufrufe erzeugen oder konsumieren keine Versuche. Es gibt keine Start-/Callback-Schreibroute. Die State-Tabelle ist kein Token-Vault und beweist keinen durchgeführten OAuth-Flow.

X wird als vierter gesperrter Status angezeigt, aber nicht in den bestehenden Provider-/Jobtabellen gespeichert. Deren unveränderte CHECKs erlauben weiterhin nur drei Provider. X-Mutatoren werden vor Persistenz abgewiesen. Eine spätere X-Persistenzerweiterung braucht einen getrennt geprüften Tabellen-/Datenmigrationsplan; Version 0.5 legt dafür absichtlich keine weitere Migration an. Die spätere 0005 in Version 0.6 betrifft ausschließlich LinkedIn-Credentials, nicht die X-Persistenz.

Regressionen prüfen den echten lokalen Constructor mit nichtleeren Planer- und gesperrten Jobbeständen mehrerer Besitzer, unveränderte Revisionen/Digests, Wiederstart und Rollback bei kollidierendem Migrationsindex. Gehostete Anwendung, reale D1-Transaktionen und Aufbewahrung/Bereinigung in der Cloud sind nicht nachgewiesen. Abgelaufene State-Zeilen werden nur begrenzt beim nächsten Begin desselben Besitzers entfernt; ein eigenständiger Bereinigungslauf ist nicht implementiert.

## Von 0.5 auf 0.6

`0005_provider_credentials.sql` ergänzt nur die neue Credential-Tabelle, einmalige Installtickets und deren Index. Die vier vorigen SQL-Dateien bleiben bytegleich. Es gibt keine Rückfüllung und keine Seed-Credentials. Pro Site/Besitzer/Provider ist höchstens eine Credential-Zeile möglich. Die bestehenden Provider-/Jobtabellen bleiben unverändert und können weiterhin keinen aktiven Versand markieren.

Neue Credentials starten leer. Erst der kontrollierte Callback nach vollständiger Identitätsprüfung darf Ciphertext und minimale gebundene Kontometadaten atomar installieren. Ein erfolgreiches Install verbraucht sein Ticket und erhöht Revision/Auth-Epoch. Lokale Trennung löscht den Ciphertext, schreibt einen Tombstone und sperrt verspätete Ergebnisse. Ein neues Connect-new darf diesen Tombstone nicht überschreiben. Schlüssel werden niemals in SQL gespeichert.

Der lokale Constructor prüft weiter sämtliche Digests vor allen Änderungen und rollt ausstehende DDL plus Ledger gemeinsam zurück. Tests mit tatsächlicher SQLite-Datei prüfen 4→5, Wiederöffnung, Besitzer-/State-Erhalt, geänderte Historie und absichtlich kollidierenden Index. Cloud-D1-Migrationen sind damit noch nicht bewiesen. Runtime-Secretbereitstellung erfolgt separat, niemals durch SQL oder einen HTTP-Aufruf.

Die lokale Preview erhält keine Secrets und aktiviert keinen OAuth-Transport. Ein Upgrade des Quellcodes allein erzeugt weder einen Providerzugriff noch ein Konto. Datenordner und gegebenenfalls vorhandene autorisierte Credential-/Key-Backups müssen bei einer späteren Betriebsumgebung gemeinsam geplant werden; diese Quelle liefert keine Backupgarantie.

## Von 0.6 auf 0.7

`0006_youtube_lifecycle.sql` ergänzt fünf eigene Tabellen für YouTube-OAuth-State, Credentials, Installtickets, Medien und Uploadverläufe. Migrationen 0001–0005 bleiben bytegleich; es gibt keine Rückfüllung, keine vorhandenen Konten und keinen automatischen Grant. Der lokale Ledger umfasst anschließend 1–6.

PKCE-Verifier, Access-Tokens und Resumable-Sessionadressen sind mit unterschiedlichen AEAD-Zwecken und Kontextbindungen verschlüsselt. State-/Browser-/Noncewerte werden nur gehasht gespeichert. Runtime-Schlüssel werden weder erzeugt noch in SQL gehalten. Medienreservierungen zählen bereits ausstehend zur 20er-Quote; ein bestätigtes R2-Objekt und passende aktuelle Credential-Epoch sind vor Ready erforderlich. Inhalts-Eindeutigkeit umfasst auch ausstehende Dateien und ungewisse/abgebrochene Uploadaufträge.

Der tatsächliche lokale Constructor wird auf 5→6, Wiederstart, bytegleichen Altbestand, geänderten v5-Digest und vollständigen DDL-/Ledger-Rollback bei einem kollidierenden neuen Index geprüft. Dies ist keine gehostete D1-Abnahme. Alte Instanzen dürfen nicht parallel gegen die aktualisierte Datenbank laufen; vorher vollständige Sicherung anlegen. Ein Downgrade erfolgt nur aus getrennter Sicherung, nicht durch Entfernen von Ledgerzeilen.

Pending-Medien und manuell zu klärende Übertragungen werden nicht automatisch gelöscht oder zurückgesetzt. Ein späterer autorisierter Recovery-/Retentionplan ist erforderlich, bevor diese Grenzen im echten Betrieb genutzt werden.


## 0007: separate Arbeitsfassungen

Version 0.8 ergänzt `0007_editor_workspaces.sql` mit eigener Tabelle/Index. SQL 0001–0006 sind unverändert. Der lokale Constructor prüft die komplette Ledgergeschichte, wendet ausstehende Schritte atomar an und rollt Schema/Ledger bei Fehler zurück. Der 6→7-Pfad, Wiederstart, Altdigestfehler und absichtliche Indexkollision werden geprüft. Keine Post-/Medien-/Credentialdaten werden umgeschrieben. Die Quellen enthalten kein 0008 und keine API 3.

Vor einem Upgrade eine konsistente Sicherung der lokalen Datenbank einschließlich vorhandener WAL-Daten erstellen. Der Quellstand führt keine automatische Datensicherung oder Rückwärtsmigration aus. Gehostetes D1-Packaging und tatsächliche Migration bleiben eine eigene Betriebsabnahme.


## Von 0.8 auf 0.9: gespeicherte Posting-Zeiten

`0008_posting_schedules.sql` ergänzt nullable JSON-Spalten `posting_schedule_json` auf Kanälen und `schedule_binding_json` auf Beiträgen. Bestehende Zeilen erhalten ausdrücklich NULL, keine inferred Queue-Bindung und keine Terminverschiebung. Zusätzlich entsteht `planner_schedule_undo` mit Owner, Post-ID, SHA-256 und Ablauf, ohne zweite Inhaltskopie. SQL 0001–0007 bleiben bytegleich. Der lokale Constructor wendet Spalten, Tabelle, Index und Ledger gemeinsam transaktional an.

API 3 verlangt die neuen Felder explizit null/Objekt. API 2 oder fehlendes Schema wird auch bei passender Revision mit 409 abgewiesen. UI-State 2 enthält vollständige Kanäle, bestätigte Revision sowie `scheduledInstant` und `scheduleBinding`. Ein alter 0.8-Adapter darf weder nachladen noch eine gecachte Fassung überschreiben. Server und UI müssen gemeinsam aktualisiert werden.

Arbeitsfassungen bleiben Schema 1 und benötigen keine neue SQL-Spalte. `payload.planning` bleibt bei alten Einträgen exakt abwesend; aktuelle Eingaben tragen es ausdrücklich. Sobald es vorhanden ist, kann ein Altclient es nicht durch Weglassen löschen: dieselbe CAS-Mutation prüft die JSON-Memberanwesenheit. Beide Werte null sind eine bewusste Entkopplung, kein stiller Default.

Ein Undo-Nachweis gilt höchstens 60 Sekunden, höchstens 100 je Besitzer. Wiederherstellung braucht einen exakten gehaltenen Originalpost und freie Belegung; ein Digest allein rekonstruiert keinen Inhalt. Unklare HTTP-Erfolgsantworten lösen keinen Schreibretry aus. Erst ein neuer passender privater Proof darf den begrenzten Kandidaten bestätigen. Ein Indexfehler in 0008 rollt auch bereits hinzugefügte Spalten zurück. Gehostete D1-Anwendung bleibt separat zu prüfen.
