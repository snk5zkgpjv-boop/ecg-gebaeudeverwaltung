# ECG – migrationsfähige Betriebsumgebung (Vorabprüfung)

Stand: 16.11.2026. Vorbereitung ohne Umschaltung oder reale Datenübertragung.

## Was dieser neue Prüfweg leistet

`scripts/migration-preflight.sh` führt eine reine Metadatenprüfung auf PostgreSQL aus: Serverversion, vorhandene Schemata, Tabellen, ungefähre Zeilenzahlen aus Statistiken, Tabellengrößen, Erweiterungen, Constraints und Größen der JSON-Bereiche in `app_state`. Es gibt keine personenbezogenen Tabellenzeilen aus. Die Verbindung setzt `default_transaction_read_only=on` und die SQL-Datei zusätzlich eine lesende Transaktion. Fehler führen zum Abbruch.

Beispiel auf einem betreiberkontrollierten Rechner mit einer separaten, nur lokal lesbaren PostgreSQL-Service-Konfiguration:

```bash
export PGSERVICE=ecg_inventory_readonly
bash scripts/migration-preflight.sh > ecg-private-inventory.txt
```

Service-Datei, Kennwort, Servernamen, Berichte und Rohdaten nicht ins Repository oder in öffentliche CI-Artefakte schreiben. Ein Produktionsbericht ist intern zu verwahren; dieser PR führt den Prüfweg nicht gegen die produktive Datenbank aus.

## Gesicherte Entscheidungen aus dem Betreiberplan

- Ziel: neues Neon-PostgreSQL-Projekt in `aws-eu-central-1` (Frankfurt); US-Quelle nicht per direkter Regionsänderung verschieben.
- Möglichst kurze Schreibunterbrechung und abschließender Dump/Restore mit Revisions-/Inhaltskontrolle.
- Verschlüsselter externer EU-Speicher, 30 tägliche Sicherungen; Schlüssel getrennt verwahren.
- US-Altbestand nach nachweisbar erfolgreicher Umschaltung maximal 30 Tage isoliert zurückhalten; separate Löschfreigabe.

## Noch fehlende Nachweise vor echtem Cutover

1. **Bereitstellung und Zugriff:** Vercel-Produktions- und Preview-Variablen, Datenbankziele, Dienste, OAuth/Auth und externe Integrationen getrennt inventarisieren. Zugangswerte niemals in den Bericht übernehmen.
2. **Backup:** `age`-verschlüsselten Dump auf genehmigten EU-Objektspeicher laden; zurückladen, Integrität prüfen und entschlüsseln. Nachweis mit Uhrzeit, Checksummen, Backupalter und Benachrichtigungsweg.
3. **Isolierter Restore:** Vollständiges Datenbankarchiv auf getrenntes Frankfurter Testziel übertragen, mit `pg_restore` wiederherstellen und inklusive Dokumenten, Rechteprüfung, Sitzungsinvalidierung, Tabellenwerten und Fremdschlüsseln testen. Keine ausgehenden Mail-/Kalender-/API-Aktionen.
4. **Schreibsperre:** Nachweis, dass alle produktiven Schreibpfade inklusive Deployments, Cronjobs und Integrationen zuverlässig gestoppt werden können. Sonst keine Umschaltung.
5. **Freigabe:** Kurzes Wartungsfenster vereinbaren, Zeitbedarf mit Testrestore messen, verantwortliche Personen und Rückfallverfahren festlegen. Nach ersten Frankfurt-Schreibvorgängen ist ein blindes Zurückschalten nach US unzulässig.
6. **Nachlauf:** Backups täglich, Wiederherstellungsproben und Monitoring prüfen; US-Daten nach gesonderter Freigabe löschen.

## Repository-Sichtbarkeit und öffentliches Portal

`GitHub privat` und `Web-App öffentlich` sind unabhängig. Vor einer Änderung der Repository-Sichtbarkeit Vercel-Git-Verknüpfung, CI-Berechtigungen, Mitwirkende und etwaige Drittanbieter prüfen. Eine Probenutzung der öffentlichen Gästeansicht ist vor und nach der Umstellung erforderlich. Ein privates Repo schützt keine versehentlich ausgelieferten Geheimnisse in Build-Artefakten und ersetzt keine serverseitige Zugriffsprüfung.

## Grenzen

Dieser Preflight stellt keine Daten um und testet keinen vollständigen Wiederanlauf. Das alte PR #59 enthält bereits synthetische Dump-/Restore-Skripte und ein Sicherungskonzept; nicht duplizieren oder unbesehen zusammenführen. Für produktive Daten und neue kostenpflichtige Infrastruktur gesonderte Betreiberfreigaben sowie einen nachgewiesenen verschlüsselten Backup-/Restore-Weg einholen.
