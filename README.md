# ECG Gebäudeverwaltung

Webanwendung mit serverseitiger Anmeldung, abgestuften Berechtigungen und getrennten Fachmodulen. Vor Änderungen [AGENTS.md](AGENTS.md) und [PROJEKTSTAND.md](PROJEKTSTAND.md) lesen. Geplante Funktionen stehen in der [Gemeinde-Roadmap](docs/GEMEINDE-ROADMAP.md); Nachweise und Grenzen der Qualitätsprüfung in [QUALITAETSPRUEFUNG.md](docs/QUALITAETSPRUEFUNG.md).

## Entwicklung und Prüfung

Node.js 24 verwenden. Abhängigkeiten und Logiktests:

```sh
npm ci --include=dev
npm test
```

Browserprüfungen mit lokalen, synthetischen API-Antworten:

```sh
npx --no-install playwright install chromium
npm run test:browser
```

Auf einer frischen Linux-CI-Umgebung installiert `playwright install --with-deps chromium` zusätzlich die benötigten Systembibliotheken. Die Tests benötigen keine produktive Datenbank oder echten Konten. Der gemeinsame Teststarter gibt Datenbank- und API-Geheimnisse nicht an Testprozesse weiter und bricht bei Fehler oder Zeitüberschreitung ab.

Ein statischer Dateiserver allein ersetzt die serverseitigen API-Funktionen nicht. Die Browserprüfungen verwenden deshalb ihre eigenen isolierten Server und simulierten API-Antworten. Sie belegen keine fachliche Abnahme oder Geräteprüfung auf einem tatsächlichen iPhone.

## Orientierung im Code

| Bereich | Aufgabe |
| --- | --- |
| `api/` | HTTP-Endpunkte einschließlich Anmeldung und serverseitiger Zugriffskontrolle |
| `lib/` | Fachlogik, Datenzugriff, Konfliktprüfung und Dokumentausgabe |
| `index.html`, `assets/` | Gebäudefachansichten und gemeinsame UI-Bausteine |
| `portal/`, `members/`, `personal/`, `finanzen/` | Getrennte Einstiege und Fachoberflächen |
| `scripts/` | Datenbankschemata und Teststarter |
| `tests/`, `tests/browser/` | Synthetische Regressionstests und Browserabläufe |

## Änderungen veröffentlichen

Kleine Feature-Branches und Pull Requests verwenden. Normalen Bedienweg, Berechtigungsverweigerung, Speichern/Neuladen, parallele Änderungen und schmale Ansicht prüfen. Eine unabhängige Prüfung dokumentieren. Keine echten Personen- oder Termineinträge für Tests verändern.

Die Vercel-Konfiguration führt `npm test` vor dem Build aus. GitHub Actions prüft zusätzlich die Browserabläufe bei Pull Requests und Änderungen auf `main`. Eine verpflichtende GitHub-Branchregel ist davon getrennt und muss durch die Repository-Administration geprüft werden. Neue Veröffentlichungen erst nach den passenden Prüfungen übernehmen; ein erfolgreicher Build ersetzt keine Nutzerabnahme.

Code, Konfiguration, Betriebsdaten und externe Kalender sind getrennte Bestände. Der Browserexport ist keine vollständige Sicherung. Siehe [Datensicherung und Wiederherstellung](docs/DATENSICHERUNG.md).
