# ECG: Sicherungsbetrieb und geplante EU-Migration

Stand: 13.11.2026. **Plan und unaktivierte Werkzeuge**, keine produktive Sicherung oder Datenübertragung.

## Festgestellte Neon-Konfiguration
- Projekt: ECG-Gebäudeverwaltung, AWS us-east-1; PostgreSQL 18.
- Point-in-time history: 21600 Sekunden (6 h).
- Am Prüftag 13.11.2026 meldete Neon keine Snapshots und keinen automatischen Snapshot-Zeitplan für `main`.
- Produktionsbranch ist nicht geschützt. Ein archivierter historischer Testbranch ist kein Backup.
- Externe Sicherungen und tatsächliche Vercel-Konfiguration sind dadurch nicht bestätigt.

## Zielbild
1. PITR-Fenster nach Tarif- und Budgetfreigabe ausweiten; automatische Snapshots gesondert aktivieren.
2. Täglicher PostgreSQL-Custom-Dump über dedizierte least-privilege-Zugangsdaten.
3. `age`-Verschlüsselung **vor Upload**, getrennte Offline-Verwahrung des privaten Schlüssels, privater EU-Objektspeicher mit Versionsschutz/Unveränderbarkeit.
4. Remote-Monitoring spätestens nach 26 h; Alert-Auslieferung extern konfigurieren und testen.
5. Vierteljährliche Restore-Probe; zuerst ausschließlich synthetische Daten, später nur mit ausdrücklicher Betreiberfreigabe und isoliertem Ziel.
6. Aufbewahrung als Vorschlag: 30 tägliche, 12 wöchentliche, 6 monatliche Stände. DSGVO-Löschkonzept und tatsächliche Speicherpreise vor Aktivierung abstimmen.

## Unaktivierte Skripte
- `scripts/backup-postgres-encrypted.sh`: setzt `PGSERVICE`, `BACKUP_AGE_RECIPIENT` und `BACKUP_RCLONE_DEST` voraus. Benötigt `pg_dump`, `pg_restore`, `age`, `rclone` und private PostgreSQL-Service-/Passwortdateien. Ohne diese Eingaben bricht das Skript ab. Es legt keine Cronjobs und keine Secrets an.
- `scripts/check-backup-freshness.sh`: prüft schreibgeschützt den jüngsten verschlüsselten Archivnamen. Dies prüft **nicht** den Backup-Inhalt, die Prüfsummen oder die Wiederherstellbarkeit. Alarmkanal muss separat angebunden werden.
- `tests/postgres-dump-restore.sh`: nur zwei getrennte synthetische Testdatenbanken. Der Tabellenvergleich allein ist noch kein vollständiger Restaurierungstest. Ergänzende Prüfungen müssen Zeilenwerte, PDF-Hashes, Fremdschlüssel, Session-Invalidierung und Berechtigungen abdecken.

## Sicherheitsfreigaben vor Betrieb
- Region, Kosten und Datenverarbeitungsvertrag des Objektspeichers prüfen.
- Bei produktiven Daten Ende-zu-Ende Schlüsselverwaltung/Recovery und Löschkonzept festlegen.
- Verwenden: eigene Dienstkonten mit minimalen Rechten, nie Datenbankpasswort im Skript, Argument oder Repository; keine realen Dumps in CI-Artefakte.
- Nach dem Export die Remote-Datei zurücklesen, SHA-256 prüfen, entschlüsseln und regelmäßig in eine isolierte Instanz mit gesperrten ausgehenden Verbindungen restaurieren.
- Betriebsmetriken: erfolgreiche Sicherung, letzter erfolgreicher kompletter Wiederherstellungstest, Datenalter, Hash, Dauer, Datensatzumfang, Fehlerbenachrichtigung.

## Frankfurt-Migration, **nicht ausgeführt**
Neon-Projektdaten können nicht durch Regionsänderung von us-east-1 nach aws-eu-central-1 umziehen. Neues Projekt in `aws-eu-central-1` mit PostgreSQL 18 anlegen; Auftragsverarbeitung, Kosten, Datenfluss und Vercel-Region prüfen. Zunächst eine synthetische Migration und danach ein isolierter Migrationstest nach ausdrücklicher Betreiberfreigabe. Für den Produktivwechsel Schreibzugriffe sperren, letzten konsistenten Dump erstellen, verschlüsselt übertragen, in Frankfurt wiederherstellen, Inhalt/Hash/Fremdschlüssel und App-Endpunkte kontrollieren, alle DB-Verbindungs- und Secret-Verweise sorgfältig umstellen, Sitzungen invalidieren, Rollback definieren. Alte US-Instanz erst nach gesonderter Löschfreigabe entfernen. Externe Datenanbieter und Backups sind gesondert auf EU-Datenresidenz zu prüfen.

Quellen:
- https://neon.com/docs/introduction/regions
- https://neon.com/docs/import/migrate-neon-to-another-region
- https://www.postgresql.org/docs/current/app-pgdump.html
- https://www.postgresql.org/docs/current/app-pgrestore.html
