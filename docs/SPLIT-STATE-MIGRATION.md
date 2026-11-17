# ECG – schrittweise Aufteilung des zentralen JSONB-Dokuments

Stand: 16.11.2026. Produktiver Schattenschnappschuss verifiziert, aber **kein** produktiver Datenmodellwechsel.

## Nachgewiesener Stand vom 16.11.2026

- Ein manueller Neon-Snapshot wurde vor den ausschließlich additiven Änderungen erstellt. Er hat eine begrenzte Aufbewahrung und ersetzt keinen externen, vollständig getesteten Backup-/Restore-Prozess.
- Die zusätzlichen Tabellen und der SQL-Schnappschuss wurden transaktional in der produktiven Datenbank angelegt; sämtliche vier JSONB-Fachbereiche wurden nach dem Kopieren im SQL-Inhaltsvergleich unverändert wiederhergestellt.
- Die Quelle und der Schattenbestand entsprachen zum Prüfzeitpunkt derselben Revision. Die ursprünglichen JSONB-Felder wurden weder gelöscht noch geändert.
- **Jede nachfolgende Änderung in der laufenden WebApp kann den Schattenbestand veralten lassen.** Vor einer Umschaltung ist die Kopie daher erneut synchron und mit Schreibstopp zu erstellen; das vorhandene Snapshotskript verweigert absichtlich das Überschreiben nichtleerer Tabellen.
- API-Reads/Writes und Berechtigungen verwenden vorläufig unverändert die zentrale JSONB-Quelle. Das separate Nachladen von Mängelfotos ist ein eigenständiger HTTP-Performance-Schritt; kein abgeschlossener Datenbank-Cutover.

## Ausgangszustand

Die produktive `app_state`-Zeile enthält ein umfangreiches JSONB-Dokument. Eine rein lesende Bestandsaufnahme zeigte zuletzt 11 Mängelmeldungen, 36 Räume, 56 Zeiteinträge und 8 Küchenfotos. Die große Datenmenge stammt überwiegend von den in Mängelmeldungen eingebetteten Fotos; reine Datensatzanzahl ist nicht das Hauptproblem. Es wurden keine Inhalte veröffentlicht.

## Neue Zieltabellen

| Tabelle | Zweck |
| --- | --- |
| `ecg_issue_records` | Mängelmetadaten und übrige JSON-Felder ohne große Foto-Strings |
| `ecg_issue_photos` | Foto-Payload je Mangel, separat geschützt |
| `ecg_room_records` | Raum-/Aufgabenobjekte in stabiler Reihenfolge |
| `ecg_time_records` | Zeiteinträge mit Eigentümer und Zeitindizes |
| `ecg_kitchen_photos` | Küchenbilder als eigene Datensätze |
| `ecg_split_migration_checks` | Schnappschussrevision und Prüfzähler |

Die Tabellen verwenden bewusst zunächst einzelne JSONB-Payloads je Fachdatensatz, um vorhandene Objekte ohne den Verlust unmodellierter Felder zu sichern. Die relationale Aufteilung und Indizierung schafft eine spätere Grundlage für unabhängige Abfragen und Sperren.

## Phase A: Nicht-destruktive Kopie

1. **Voraussetzung:** Backup und isolierter Restore vollständig erfolgreich, Datenbankziel bestätigt, Schreibzugriffe während der Aufnahme kontrolliert.
2. `scripts/schema.sql` erstellt die zusätzlichen Tabellen.
3. `scripts/split-state-snapshot.sql` kopiert die vier Fachbereiche aus `app_state` innerhalb einer Transaktion, ohne das Original zu ändern. Eine wiederholte Kopie in nichtleere Tabellen wird verweigert.
4. Die SQL-Prüfung rekonstruiert alle kopierten JSON-Daten samt Fotos und vergleicht sie mit der Quelle. Bei Abweichung wird die Transaktion abgebrochen.
5. `tests/split-state-snapshot.mjs` führt den Ablauf mit ausschließlich fiktiven Daten in einer isolierten PGlite-Datenbank durch.

**Wichtig:** Die Kopie bleibt ein historischer Schnappschuss. Solange die bisherige WebApp weiterschreibt, werden Änderungen nur im bisherigen JSONB-Dokument vorgenommen. Die neuen Tabellen dürfen ohne nachfolgende Synchronisierung noch nicht als Quelle der Wahrheit genutzt werden.

## Phase B: Kompatibilitätsbetrieb (separater PR)

- Lesepfade für Mängel/Räume/Zeiten auf die separaten Tabellen umstellen, aber weiterhin dieselben Antworten und Rollenfilter liefern.
- Fotos über geschützte Einzelendpunkte laden statt in der allgemeinen Mängelliste; neue Zugriffe unbedingt serverseitig an vorhandene Rechte binden.
- Schreibpfade für `PATCH`, `PUT`, Mängel-Löschen/-Anlegen und Zeitänderungen vollständig inventarisieren und **atomar** auf die neuen Tabellen umstellen. Stale-Browser-Schutz, Aufgabenerledigungen, QR-Räume, Synchronisierung und private Zeitbuchungen müssen erhalten bleiben.
- Bis zum vollständigen Nachweis beide Quellen konsistent halten; hierzu dedizierte Übergangsstrategie und Idempotenztests.

## Phase B – Mängel als eigener, zunächst abgeschalteter Tabellenpfad (17.11.2026)

**Voraussetzung geprüft:** Der echte Produktions-`pg_dump` im Custom-Format ohne `neon_auth` wurde mit `pg_restore --single-transaction --exit-on-error` in eine zuvor leere getrennte Datenbank wiederhergestellt. Alle 18 Tabellen, einschließlich `ecg_issue_records` und `ecg_issue_photos`, hatten übereinstimmende Zeilenzahlen und vollständige Inhaltshashes. Login, Sitzungsprüfung und Speichern gegen das Restore-Ziel wurden mit synthetischen Daten erfolgreich ausgeführt; Änderungen wurden zurückgerollt. Die Restore-Kopie bleibt bis zum Abschluss von Phase B bestehen.

Die neue schreibende Betriebsart ist ausschließlich bei **`ISSUES_SOURCE=tables`** aktiv. Bei fehlender oder anders gesetzter Variable gilt unverändert `jsonb`. Die neue Mängelliste und der gesicherte Einzel-Fotoabruf stammen dann aus `ecg_issue_records` bzw. `ecg_issue_photos`; Berechtigungs- und Sichtbarkeitsprüfungen bleiben vorgeschaltet. Die Mängel-PATCH-Operation `{updateIssue:{id,changes}}` akzeptiert nur `text`, `priority`, `roomId`, `outdoorId`, `assetId` und `status`; kein Foto. Ein gesonderter authentifizierter `updateIssuePhoto`-Aufruf speichert Ersatzfotos. Andere Mängel-Operationen (Anlegen, Löschen) verwenden im Tabellenbetrieb einzelne Transaktionen. Beim Löschen werden die bisherigen privaten Planungen bereinigt und die bewährte `deletedIssues`-Tombstone in `app_state` erhalten, sodass veraltete Clients einen gelöschten Mangel nicht erneut anlegen können; `app_state.data->'issues'` selbst wird dabei nicht geändert. Alter vollständiger `PUT` mit `changes.issues` wird dort ausdrücklich abgelehnt; andere Fachbereiche behalten ihren Speicherweg.

### Betreiberablauf – Umschaltung ausdrücklich separat

1. **Schreibstopp** für alle Web-App-Clients und sonstige externe Schreiber herstellen und durchsetzen. Neue Browser-Tabs erst nach Freigabe zulassen.
2. Einen **frischen `pg_dump --format=custom --no-owner --no-acl --exclude-schema=neon_auth`** als überprüfte private Rückfallkopie anlegen. Die bestehende Restore-Probe nicht löschen.
3. Die veraltete Schattenkopie der Mängel im selben Schreibstopp mit `scripts/issues-forward-copy.sql` aus `app_state.data->'issues'` neu erzeugen. Das Skript ersetzt nur `ecg_issue_records` und `ecg_issue_photos` in einer Transaktion und verweigert die Übernahme bei inhaltlicher Abweichung, einschließlich Bildinhalten.
4. Erst nach dokumentiertem Gleichheitsnachweis **`ISSUES_SOURCE=tables`** in den Vercel-*Production*-Variablen setzen und den überprüften Commit **neu deployen**. Nicht lediglich eine bestehende Vorschau auf Produktion umstellen.
5. Fachtest auf einem **echten iPhone**: Mangel mit Testdaten anlegen, Foto ansehen, erledigen, Seite neu laden und den gespeicherten Status erneut überprüfen. Berechtigungen ebenfalls kontrollieren.
6. Erst nach dokumentiert erfolgreichem Fachtest den Schreibstopp aufheben. Tabellen sind ab diesem Zeitpunkt die maßgebliche Quelle für Mängel. `app_state.data->'issues'` bleibt unverändert als historischer Stand bestehen.

### Rückweg nach Freigabe von Tabellenänderungen

**Kein blindes Zurückschalten:** Sobald `ISSUES_SOURCE=tables` aktiv bearbeitet wurde, enthält das ältere `app_state.data->'issues'` nicht die neu erfassten und geänderten Mängel. Vor einer Rückkehr zu `jsonb` zunächst die App erneut in einen vollständigen Schreibstopp versetzen, die aktuelle Tabellenlage sichern und `scripts/issues-backcopy.sql` unter Aufsicht ausführen. Das Skript schreibt ausschließlich die rekonstruierte Mängelliste einschließlich Fotos zurück in `app_state.data->'issues'`, prüft innerhalb derselben Transaktion die JSONB-Gleichheit und bricht bei Fehler ab. Anschließend `ISSUES_SOURCE=jsonb` in Vercel setzen, neu deployen und die Mängelverwaltung erneut auf dem Mobilgerät prüfen. Erst danach den Schreibstopp beenden.

**Grenzen:** Eine Umstellung findet nicht innerhalb dieses PRs statt. Parallel einreichende Google-/API-/Browser-Schreibvorgänge lassen sich allein durch den Vercel-Schalter nicht anhalten. Der Betreiber muss den vollständigen Schreibstopp sicherstellen. Die Tabellenmigration betrifft ausschließlich Mängel; Räume, Zeiten und Küchenfotos bleiben für eigenständige PRs vorgesehen. Ein Wiederherstellungsarchiv darf niemals als öffentliches CI-Artefakt oder Repo-Datei abgelegt werden.

## Phase C: Cutover (eigene Freigabe)

- Letzte Änderungen gegen die alte JSONB-Quelle stoppen, Delta-Synchronisierung durchführen, Zeilen-/Inhaltsprüfsummen und Benutzerrechte kontrollieren.
- Erst danach die großen JSONB-Felder aus `app_state` entfernen und den Lese-/Schreibbetrieb auf die Fachdatentabellen umstellen.
- Eine Wiederherstellung der alten Daten bleibt ausdrücklich möglich; der Wechsel darf nicht automatisch alte Datensätze löschen.
- Abschluss: realer Browser-/iPhone-Fachtest, Last-/Latenzmessung, Backup/Restore einschließlich Fachdatentabellen und aktualisierte Betreiber-Dokumentation.

## Grenzen

Die Phase A allein beseitigt den Leistungsengpass noch **nicht**. Der grundlegende Konflikt zwischen zwei verschiedenen Fachbereichsänderungen endet erst mit getrennten atomaren Speicheroperationen. Keine der hier vorbereiteten SQL-Dateien wird automatisch beim Vercel-Deployment auf der Produktionsdatenbank ausgeführt. Keine echten Gemeindedaten im Repository speichern.
