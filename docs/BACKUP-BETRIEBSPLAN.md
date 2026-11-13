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

## Betreiberentscheidung vom 13.11.2026 (Planung, keine Produktivfreigabe)
- Ziel ist ein dauerhaftes Neon-Projekt in `aws-eu-central-1` (Frankfurt), PostgreSQL 18.
- Möglichst kurze Unterbrechung; zunächst Dump/Restore mit vorab bereitgestelltem Ziel und gemessener Schreibsperre. Logische Replikation nur nach gesonderter Eignungs-/Tarifprüfung.
- Separater EU-Objektspeicher, `age`-Verschlüsselung vor Upload, Schlüssel außerhalb von Neon/Vercel verwahren.
- 30 tägliche Sicherungen als Mindestkonzept; längere Aufbewahrung und DSGVO-Löschfristen vor Aktivierung festlegen.
- US-Projekt nach erfolgreichem Wechsel höchstens 30 Tage isoliert und ohne Schreibzugriffe als Rückfallstand behalten; Löschen nur nach eigener Freigabe.
- Wegen derzeit zwei Nutzern kann ein abgestimmtes kurzes Wartungsfenster statt komplexer kontinuierlicher Replikation bevorzugt werden. Das ist keine Messung der Ausfallzeit.
- Jede Änderung an Neon-Projekten, Produktivdaten, Vercel-Variablen oder Zugangsdaten benötigt eine gesonderte ausdrückliche Betreiberfreigabe.

## Verbindliche Abnahmematrix vor Produktivwechsel
1. **Inventar:** Sämtliche Datenbank-Schemata und Tabellen, Views, Funktionen, Trigger, Erweiterungen, Sequenzen, FKs, Rollen und Berechtigungen inventarisieren. Externe Dateiablagen (PDF/Blob), Authentifizierungs-/Sitzungsspeicher, Hintergrundjobs, Webhooks und alle Preview-/Production-DB-Verbindungen gesondert erfassen.
2. **Synthetische Testfixture:** Mindestens zwei Benutzer mit unterschiedlichen Rollen, zugeordnete Räume, Kalendertermine, Arbeitszeiten, Dateiinhalte und relationale Abhängigkeiten erzeugen; niemals echte Kunden- oder Gemeindedaten in CI-Artefakte übernehmen.
3. **Restore:** PostgreSQL 18 zu PostgreSQL 18 mit `pg_dump -Fc` / `pg_restore --single-transaction --exit-on-error` in leere isolierte Zieldatenbank. Nach Restore Tabellen-/Schema-Inventar, Zeilenwerte, Primär- und Fremdschlüssel, Sequenzfortschritt, PDF-Bytes/Hashes, Rollen-/Rechtemodell und die App-Endpunkte prüfen. Extern gespeicherte Dokumente benötigen einen separaten gesicherten Kopier- und Vergleichsweg.
4. **Backup-Nachweis:** Remote-Archiv erneut herunterladen, SHA-256 mit separatem, vertrauenswürdigem Manifest vergleichen, mit getrennt verwahrtem Schlüssel entschlüsseln und testweise restaurieren. Nur Objektname/Archivliste genügt nicht. Monitoring und Alarmzustellung simulieren.
5. **Sicherheitsgrenzen:** Niemals produktive Verbindungszeichenfolgen protokollieren. Getrennte Dienstkonten und DNS/Host-Whitelist für Quelle und Ziel; die bloße Zeichenfolge `synthetic` im Servicenamen ist kein Sicherheitsnachweis. Keine externen Netzwerk-/E-Mail-/Push-Aktionen aus der isolierten Testinstanz.
6. **Cutover:** Vorab Restore-Dauer messen, Verantwortliche und Wartungsfenster festlegen. Schreibzugriffe inklusive Cronjobs/parallel aktiver Deployments anhalten; letzte Transaktion abwarten; konsistenten Endstand exportieren; verschlüsselt übertragen und restaurieren; Integritätsbericht prüfen; alle Vercel-Umgebungen/Connection-Pools und ggf. Drittanbieter umstellen; Neudeployment und Anwendungs-Smoke-Test; erst danach Schreibbetrieb freigeben.
7. **Abbruch:** Bei fehlendem Backup-Restore, Abweichungen in Datenintegrität, unklarem Speicherort von Nutzerdokumenten, nicht kontrollierbaren Schreibern oder nicht bestandenen Auth-/Rechtetests keine Umschaltung.
8. **Rollback:** Vor Freigabe von Frankfurt-Schreibzugriffen US-Projekt unter kontrollierten Bedingungen reaktivierbar halten. Danach *nicht blind zurückschalten*: erst Frankfurt-Schreibzugriffe stoppen und seit Cutover entstandene Änderungen konsistent sichern/abgleichen, sonst droht Datenverlust.
9. **Nachlauf:** 30 Tage schriftlicher Nachweis zu Monitoring, erfolgreichen Sicherungen, Restore-Probe und zu verbliebenen US-Verbindungen/Backups. Getrennte Löschfreigabe am Ende.

## Nächste Schritte ohne produktive Änderungen
- Technische Fixture und vollständigere automatisierte Prüfungen im bestehenden PR implementieren; Ergebnisse der *tatsächlich ausgeführten* Tests festhalten.
- Eindeutig produktives Vercel-Projekt und Datenquellen identifizieren; nur Variablennamen/Scopes dokumentieren, niemals Werte.
- EU-Objektspeicher, AVV, Speicherung/Verarbeitung außerhalb EU, Monatsbudget und Aufbewahrung/Löschkonzept auswählen.
- Frankfurt-Testumgebung **erst nach gesonderter Freigabe** anlegen; Testlauf messen und Abnahmeprotokoll ausfüllen.

## Synthetischer Restore-Test: Bedienfolge (nicht ausgeführt)
Fixture: `tests/fixtures/ecg-migration-synthetic.sql`. Sie enthält ausschließlich künstliche Benutzer, Räume, Buchungen und bytea-Dokumente. Voraussetzung: **zwei eigenständig eingerichtete isolierte PostgreSQL-18-Datenbanken**, deren echte Datenbanknamen `synthetic` enthalten. Ziel muss leer sein. Beide Service-Einträge dürfen ausdrücklich keine Produktivinstanzen erreichen.

```bash
# Vorher: zwei unterschiedliche lokale/isolierte PostgreSQL-Service-Einträge
# und zugehörige nur lokal lesbare Passwortdatei einrichten.
PGSERVICE=ecg_source_synthetic psql -X -v ON_ERROR_STOP=1 -f tests/fixtures/ecg-migration-synthetic.sql
ECG_SYNTHETIC_SOURCE_SERVICE=ecg_source_synthetic \
ECG_SYNTHETIC_TARGET_SERVICE=ecg_target_synthetic \
bash tests/postgres-dump-restore.sh
```

Der Test prüft den Dump/Restore, vergleicht die Inhalte sämtlicher Benutzertabellen (einschließlich `bytea`), Sequenzzustände und validierte CHECK-/Fremdschlüssel-Constraints. **Er prüft nicht** globale Rollen, extern gespeicherte Dokumente, tatsächliche Sitzungsinvalidierung, Authentifizierungs-APIs, Drittanbieter oder den EU-Objektspeicher. Der Vergleich über MD5 ist als lokale synthetische Gleichheitsprüfung gedacht, nicht als kryptografischer Echtheitsnachweis für Backups. Vor Echtbetrieb SHA-256 und einen vollständigen isolierten Wiederherstellungsnachweis verlangen.

CI prüft lediglich mit `bash -n` die Shell-Syntax. Mangels verfügbarer PostgreSQL-Testinstanzen gilt der echte PostgreSQL-18-Restore weiterhin ausdrücklich als **nicht ausgeführt**.

## Tatsächlich geprüfte Vorarbeiten – 13.11.2026
- GitHub Actions: isolierter Job `synthetic-postgres-restore` mit zwei wegwerfbaren PostgreSQL-18-Datenbanken, synthetischer Fixture, `pg_dump -Fc` und `pg_restore`. Erfolgreich im [CI-Lauf 43439560066](https://github.com/snk5zkgpjv-boop/ecg-gebaeudeverwaltung/actions/runs/43439560066). Die übrigen automatisierten Qualitätstests bestanden ebenfalls. Das ist **kein** Produktionstest.
- Lesende Neon-Abfrage: elf `public`-Tabellen und neun `neon_auth`-Tabellen. Das tatsächlich konfigurierte Neon-Auth-Produkt ist ein eigenständiger verwalteter Better-Auth-Dienst. Die ECG-Anmelderoute `api/auth/login.js` verwendet derzeit direkt `public.ecg_app_users` und eigene Sitzungen in `public.ecg_app_sessions`. Ob weitere Funktionen Neon Auth nutzen, bleibt vollständig zu inventarisieren. Die verwaltete `neon_auth`-Struktur darf nicht blind per Dump in eine andere, neu provisionierte Neon-Auth-Integration importiert werden; Zielkonfiguration, Verantwortlichkeit und unterstützter Importweg vorab klären.
- Vercel: Das GitHub-verknüpfte Projekt `ecg-gebaeudeverwaltung-jn5h` hat den Variablennamen `DATABASE_URL` in **Production und Preview**. Die Werte wurden nicht gelesen. Ein expliziter Nachweis, ob beide Zielumgebungen auf dieselbe physische Datenbank zeigen, ist noch offen. Auch bestehende Vorschau-Deployments und Synchronisierungsdienste beim Cutover berücksichtigen.
- Sicherungsanbieter als unverbindlicher Kandidat: Hetzner Object Storage bietet laut offizieller Anbieter-Webseite deutsche Standorte und einen Grundpreis von 7,72 EUR brutto pro Monat mit 1 TB inklusive (Stand 13.11.2026). Vor Auswahl Object-Lock-Verhalten, Löschkonzept, AVV und Backup-Restore per `rclone` prüfen. Anbieter ist **nicht freigegeben oder eingerichtet**.
- Der Produktivwechsel benötigt trotz zwei Nutzern ein überprüftes Schreibstopp-Verfahren, eine Freigabe für echte Sicherungsdaten und neue Verbindungswerte. Ein noch fehlender Beleg ist der Export und die Wiederherstellung **aller** tatsächlich benötigten Anwendungsschemata, inklusive möglicher extern gespeicherter Dokumente.

## Restliche Freigabegates
1. Betreiber legt EU-Speicheranbieter, monatliches Budget, Aufbewahrungs- und Wiederherstellungsvorgaben fest.
2. Eindeutige Zuordnung der tatsächlich verwendeten Produktionsdomain, Production- und Preview-Datenbankziele, externen Integrationen und der verwalteten Neon-Auth-Nutzung; Geheimnisse niemals ins Git schreiben.
3. Separate Zustimmung zum Anlegen eines Frankfurter Neon-Projekts und des privaten EU-Speicherbereichs, einschließlich möglicher Gebühren.
4. Danach isolierter Frankfurt-Probelauf mit freigegebenem Verfahren, gemessener Übertragungszeit und vollständiger Integritätsmatrix. Keine echten Daten ohne gesonderte Erlaubnis.
5. Separate endgültige Freigabe des Produktions-Cutovers, Wartungsfensters und der Vercel-Umstellung; danach 30-tägiger kontrollierter Nachlauf, alte US-Daten nur nach eigener Löschfreigabe entfernen.
- Zusätzlich ist in `lib/auth.js` eine ältere JWT-Validierung gegen einen bisher fest eingebauten US-Neon-Auth-Endpunkt vorhanden. Im Entwurfs-PR kann die Herkunft jetzt optional über `NEON_AUTH_ORIGIN` konfiguriert werden; ohne Umgebungsvariable bleibt das alte Verhalten erhalten. Vor Cutover muss der neue Auth-Endpunkt explizit bestätigt und in der richtigen Vercel-Umgebung gesetzt werden. **Die Änderung allein migriert weder Neon-Auth-Konten noch JWTs**. Bisherige JWTs können bei geändertem Issuer/Schlüssel ihre Gültigkeit verlieren; erneute Anmeldung und Legacy-Verhalten testen.
