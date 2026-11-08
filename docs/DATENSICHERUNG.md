# Datensicherung und Wiederherstellung

Stand: 08.11.2026. Technische Anleitung; keine Zugangsdaten oder Betriebsinhalte.

## Drei getrennte Sicherungsarten

- Git sichert Code und technische Dokumentation, nicht die Betriebsdaten.
- Der JSON-Export in der App enthält nur den im Browser sichtbaren Teilbestand. Er ist keine vollständige Sicherung und stellt weder separate Tabellen noch sämtliche geschützten Dokumente wieder her.
- Die Datenbank muss mit Schema, Daten, Beziehungen und Dokumentinhalten separat gesichert werden. Eine Wiederherstellung ist zuerst in einem isolierten Ziel zu prüfen.

## Erforderlicher Umfang

Zur Anwendung gehören `app_state` einschließlich geschützter Ablaufpläne und Vereinbarungen sowie die Tabellen für Mitglieder, Personal, Abwesenheiten, Dienste, Muster-Auslagen und Geräteanleitungen. Eigene Zugangskonten gehören ebenfalls zum Wiederherstellungsumfang. Sitzungen und Rücksetzlinks dürfen nach einer produktiven Wiederherstellung nicht wieder gültig werden; sie müssen im isolierten Ziel vor dessen Freigabe verworfen werden. Verwaltete Authentifizierung, Dienstkonten, Vercel-Konfiguration und externe Google-Kalender haben eigene Wiederherstellungswege. Sie sind nicht vollständig durch einen Datenbankexport abgedeckt.

## Vorbereitung eines vollständigen Datenbankexports

Voraussetzung sind PostgreSQL-Clientprogramme in einer zur Quelle passenden Version, ein privater Speicherort und eine gesonderte leere Testdatenbank. Die Verbindungsdaten gehören in eine lokale, nur für den Betreiber lesbare PostgreSQL-Service-/Passwortdatei. Keine Verbindungs-URL mit Kennwort als Befehlsargument, kein Dump in Git oder in einem öffentlichen Downloadverzeichnis.

Beispiel mit selbst einzurichtenden Service-Namen, keine produktiven Kennungen:

```sh
umask 077
PGSERVICE=ecg_backup pg_dump --format=custom --no-owner --no-acl --file=ecg-private.dump
pg_restore --list ecg-private.dump
```

Der Export enthält Geheimnisse und personenbezogene Inhalte. Vor der Übertragung in einen Speicher sind Verschlüsselung, Zugriffsrechte, Aufbewahrungsfrist und verantwortliche Person festzulegen. `pg_dump` sichert eine Datenbank konsistent; globale Rollen, externe Systeme und kontinuierliche Wiederherstellung erfordern zusätzliche Maßnahmen. Maßgeblich sind die [PostgreSQL-Dokumentation zu pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html) und der vorhandene Datenbankdienst.

## Wiederherstellungsprobe

1. Quelle, Sicherungszeitpunkt und Prüfsumme festhalten, ohne Inhalte oder Kennwörter ins öffentliche Protokoll zu übernehmen.
2. Ein neues, leeres und isoliertes Ziel verwenden. Keine Produktionsadresse als Wiederherstellungsziel einsetzen. Externe E-Mails, Kalenderexporte und weitere Anbindungen bleiben dort deaktiviert.
3. Archivinhalt und Herkunft prüfen. Ein Restore führt die im Archiv enthaltenen Datenbankanweisungen aus.
4. Mit dem ausdrücklich für das Testziel eingerichteten Service wiederherstellen:

   ```sh
   pg_restore --dbname=service=ecg_restore_sandbox --no-owner --no-acl --single-transaction --exit-on-error ecg-private.dump
   ```

5. Tabellenbestand, Zeilenanzahlen, Beziehungen, Revisionen und Dokument-Prüfsummen vergleichen. Eigene und fremde Kontensichten, Speichern/Neuladen sowie Konfliktantworten mit freigegebenen Testkonten prüfen.
6. Sitzungen und Rücksetzlinks im isolierten Ziel verwerfen. Produktive Umschaltung erst nach dokumentiertem Ergebnis und ausdrücklicher Freigabe; nicht Bestandteil einer routinemäßigen Probe.
7. Wiederherstellungsdauer und verbleibende Grenzen dokumentieren. Eine angelegte Sicherungsdatei allein ist kein Wiederherstellungsnachweis.

## Nachweis und offene Betriebsentscheidung

Der lokale Test `tests/database-restore.mjs` prüft mit ausschließlich synthetischen Daten einen PGlite-Snapshot aller zehn Anwendungstabellen einschließlich Dokumentinhalt und Fremdschlüssel. Dies ist ein Labornachweis für den Datenumfang und die Wiederverwendbarkeit der wiederhergestellten Daten. Er testet weder `pg_dump`/`pg_restore` noch eine Wiederherstellung im produktiven Datenbankdienst.

Noch festzulegen beziehungsweise zu bestätigen: privater zusätzlicher Sicherungsspeicher, Verschlüsselung und Schlüsselverantwortung, Aufbewahrungsfrist, Sicherungsintervall und regelmäßige Probe im isolierten Betreiberziel. In dieser Nachbesserung werden keine echten Daten exportiert, keine produktive Datenbank wiederhergestellt und keine kostenpflichtigen Sicherungsdienste eingerichtet.
