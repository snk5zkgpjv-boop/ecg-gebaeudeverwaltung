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
2. `scripts/split-state-schema.sql` erstellt die zusätzlichen Tabellen.
3. `scripts/split-state-snapshot.sql` kopiert die vier Fachbereiche aus `app_state` innerhalb einer Transaktion, ohne das Original zu ändern. Eine wiederholte Kopie in nichtleere Tabellen wird verweigert.
4. Die SQL-Prüfung rekonstruiert alle kopierten JSON-Daten samt Fotos und vergleicht sie mit der Quelle. Bei Abweichung wird die Transaktion abgebrochen.
5. `tests/split-state-snapshot.mjs` führt den Ablauf mit ausschließlich fiktiven Daten in einer isolierten PGlite-Datenbank durch.

**Wichtig:** Die Kopie bleibt ein historischer Schnappschuss. Solange die bisherige WebApp weiterschreibt, werden Änderungen nur im bisherigen JSONB-Dokument vorgenommen. Die neuen Tabellen dürfen ohne nachfolgende Synchronisierung noch nicht als Quelle der Wahrheit genutzt werden.

## Phase B: Kompatibilitätsbetrieb (separater PR)

- Lesepfade für Mängel/Räume/Zeiten auf die separaten Tabellen umstellen, aber weiterhin dieselben Antworten und Rollenfilter liefern.
- Fotos über geschützte Einzelendpunkte laden statt in der allgemeinen Mängelliste; neue Zugriffe unbedingt serverseitig an vorhandene Rechte binden.
- Schreibpfade für `PATCH`, `PUT`, Mängel-Löschen/-Anlegen und Zeitänderungen vollständig inventarisieren und **atomar** auf die neuen Tabellen umstellen. Stale-Browser-Schutz, Aufgabenerledigungen, QR-Räume, Synchronisierung und private Zeitbuchungen müssen erhalten bleiben.
- Bis zum vollständigen Nachweis beide Quellen konsistent halten; hierzu dedizierte Übergangsstrategie und Idempotenztests.

## Phase C: Cutover (eigene Freigabe)

- Letzte Änderungen gegen die alte JSONB-Quelle stoppen, Delta-Synchronisierung durchführen, Zeilen-/Inhaltsprüfsummen und Benutzerrechte kontrollieren.
- Erst danach die großen JSONB-Felder aus `app_state` entfernen und den Lese-/Schreibbetrieb auf die Fachdatentabellen umstellen.
- Eine Wiederherstellung der alten Daten bleibt ausdrücklich möglich; der Wechsel darf nicht automatisch alte Datensätze löschen.
- Abschluss: realer Browser-/iPhone-Fachtest, Last-/Latenzmessung, Backup/Restore einschließlich Fachdatentabellen und aktualisierte Betreiber-Dokumentation.

## Grenzen

Die Phase A allein beseitigt den Leistungsengpass noch **nicht**. Der grundlegende Konflikt zwischen zwei verschiedenen Fachbereichsänderungen endet erst mit getrennten atomaren Speicheroperationen. Keine der hier vorbereiteten SQL-Dateien wird automatisch beim Vercel-Deployment auf der Produktionsdatenbank ausgeführt. Keine echten Gemeindedaten im Repository speichern.
