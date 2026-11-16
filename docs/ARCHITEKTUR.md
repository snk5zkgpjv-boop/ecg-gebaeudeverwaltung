# ECG Tool – Architektur und Datenmodell

Stand: 16.11.2026. Technische Bestandsaufnahme anhand des Quellcodes, der SQL-Dateien und des ausschließlich lesend geprüften produktiven Tabellenschemas. Keine personenbezogenen Daten und keine Zugangsdaten.

## Systemüberblick

- Frontend: Browseroberflächen in `index.html`, `portal/`, `personal/`, `members/` und `finanzen/`; statische Ressourcen in `assets/`.
- Backend: Node.js 24, Vercel-Serverless-Routen unter `api/`; serverseitige Fachlogik unter `lib/`.
- Datenbank: PostgreSQL bei Neon. Der Zugang erfolgt über `lib/db.js`, das derzeit die `neon`-Abfragefunktion exportiert.
- Externe Anbindungen: Google Kalender; optionale Resend-E-Mails, OpenAI-Funktionen und Organisationsschnittstelle. Der tatsächliche Konfigurationsstand hängt von den Umgebungsvariablen ab.
- Code und Tests: GitHub, Pull Requests, `npm test` und `npm run test:browser`. Testdaten sind synthetisch.

## Speicherung

| Tabelle | Zweck |
| --- | --- |
| `app_state` | Gemeinsames JSONB-Dokument für große Teile der Gebäude-/Raum-/Kalender-/Aufgaben-Daten; optimistische Revision und Aktualisierungszeit |
| `ecg_app_users` | Login-Konten und verknüpfte Anwendungsprofil-ID |
| `ecg_app_sessions` | Sitzungen, gehashte Tokens |
| `ecg_password_resets` | Einmalige Kennwortrücksetz-Tokens |
| `ecg_auth_rate_limits` | Datenbankgestützte Anmeldung-/Rücksetzbegrenzung |
| `ecg_members` | Separat gespeicherter Mitglieder-Testbereich |
| `ecg_staff` | Mitarbeitende |
| `ecg_absences` | Abwesenheiten |
| `ecg_event_duties` | Veranstaltungsdienste |
| `ecg_demo_expenses` | Abgegrenztes Testjournal für Musterauslagen |
| `ecg_maintenance_documents` | Geschützte Wartungsanleitungen |
| `ecg_data_repairs` | Reparaturprotokolle für Datenkorrekturen |

Das konsolidierte leere Bootstrap-Schema steht in `scripts/schema.sql`. Es ersetzt weder die produktive Datenbank noch ein Backup. Der verwaltete Neon-Authentifizierungsbestand ist nicht Bestandteil der unabhängigen Anwendungstabellen.

## Authentifizierung und Rechte

- Nur ECG-Kennwortanmeldung (`/api/auth/login`), Kennwortwechsel und Rücksetzung bleiben aktiv. Die alte PIN-/E-Mail-Code-Anmeldung und `/api/auth/migrate` existieren nicht mehr. Das verwaltete Neon-Auth-Schema in der Datenbank bleibt technisch unverändert; es ist kein aktiver App-Loginpfad.


- `lib/auth.js` prüft sitzungsgebundene Konten und Anwendungsprofile. Kennwörter sind gesalzen und gehasht; Sitzungen werden beim Kennwortwechsel widerrufen.
- `api/state.js` filtert Fachinformationen und Änderungen serverseitig nach Rolle und Berechtigungen.
- Profilprüfungen ohne Fachdatennutzung können mit `profileOnly` ausschließlich `data->'users'` lesen. Für normale fachliche `requireUser`-Aufrufe wird der vollständige Zustand weiterhin geladen.
- `lib/auth-rate-limit.js` begrenzt Anmelde- und Kennwortrücksetzversuche kontobezogen; zusätzliche Netzwerkschutzmaßnahmen sind sinnvoll.
- Nicht alle Bereiche sind produktiv freigegeben. Mitglieder- und Finanz-Auslagenfunktionen sind fachlich gesondert einzuordnen.

## Datenflüsse und Schnittstellen

1. Browser ruft eine Backendroute auf und sendet gegebenenfalls den geschützten Sitzungscookie.
2. Serverseitige Autorisierung bestimmt Benutzerprofil und zulässige Daten.
3. PostgreSQL wird über den zentralen Treiberadapter angesprochen. Ändernde Aufrufe verwenden, wo implementiert, Revisions-/Konfliktprüfungen.
4. Google-Kalender-Daten werden mit getrennten Lese-/Synchronisierungsrechten behandelt.
5. E-Mails und KI-Anfragen verwenden externe Dienste nur bei vorhandener Betreiberkonfiguration.

## Technische Risiken und Grenzen

- Die produktive `app_state`-Zeile hatte bei der Leseprüfung am 16.11.2026 etwa 5,16 MB. Der größte Teil entfiel auf `issues` (ca. 3,96 MB), danach `kitchenPhotos` (ca. 698 KB). Datenmigration und Vergleichstests müssen beide berücksichtigen.
- Der vollständige Browser-JSON-Export ist kein Datenbank-Backup.
- Der reale Export/Import mit `pg_dump`/`pg_restore` in ein isoliertes Ziel ist nicht als erfolgreich nachgewiesen; siehe `docs/DATENSICHERUNG.md`.
- Der produktive Neon-Projektstand lag bei der Prüfung noch in `aws-us-east-1`; Frankfurt ist Ziel, aber kein bestätigter Live-Stand.
- Ein späterer Betrieb auf einem anderen Server (z. B. Node.js-geeigneter eigener Server) benötigt eine kompatible API-Laufzeit, PostgreSQL-Treiberanpassung, Umgebungsvariablen und eine getestete Datenmigration. Reiner PHP-/Static-Webspace genügt dafür nicht zwangsläufig.
- Große Frontenddateien und einige Quelltext-extrahierende Tests erschweren Wartung und Refactoring; schrittweise Modularisierung mit Regressionstests ist vorgesehen.

## Änderungsregeln

1. `AGENTS.md` und `PROJEKTSTAND.md` vor Änderungen lesen.
2. Eigener PR je isolierbarer Änderung; keine echten Personen-/Gemeindekalenderdaten für Tests.
3. `npm test`, `npm run test:browser`, Abnahmekriterien und Vercel-Vorschau prüfen.
4. Produktive Datenmigrationen erst nach vollständigem Backup, isoliertem Restore, dokumentiertem Rückfallplan und Betreiberfreigabe.
5. Projektstand nach Code und Veröffentlichung aktualisieren. Technische Tests nicht mit Fachabnahme gleichsetzen.
