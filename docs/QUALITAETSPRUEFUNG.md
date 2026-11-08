# Qualitätsprüfung und Nachbesserung

Stand: 08.11.2026. Arbeitsnachweis zur Prüfung von Nutzbarkeit, Sicherheit, Zuverlässigkeit, Kompatibilität und Wartbarkeit. Keine ISO- oder WCAG-Konformitätsbescheinigung.

## Reihenfolge und Nachweise

| Schritt | Befund und Ziel | Stand |
| --- | --- | --- |
| 1. Zugriff und Sitzungen | Pflichtkennwortwechsel serverseitig durchsetzen; Rücksetzlink genau einmal verwenden; alte Sitzungen nach Kennwortänderung sperren. | Live mit [PR #53](https://github.com/snk5zkgpjv-boop/ecg-gebaeudeverwaltung/pull/53). 32 Testdateien, unabhängige SQL-/Kryptografieprüfung und Chromium bei 390/1280 px bestanden. |
| 2. Laden und Bedienung | Bereichswechsel ohne wiederholtes Laden des gesamten Dokuments; aktuelle Rechte prüfen; Fehler und Wiederholung anzeigen. | Live mit [PR #54](https://github.com/snk5zkgpjv-boop/ecg-gebaeudeverwaltung/pull/54). 33 Testdateien bestanden; synthetischer Chromium-Vergleich bei 390/1280 px: zwei Dokumentwechsel entfallen, ein aktueller Datenabruf bleibt. Echte iPhone-Messung offen. |
| 3. Kalender | Enddatum, mehrtägige Zeiträume, Ausfälle und Aktualität in der Leseansicht darstellen. | Live mit [PR #55](https://github.com/snk5zkgpjv-boop/ecg-gebaeudeverwaltung/pull/55). 34 Testdateien sowie unabhängige API-, Datums- und Chromium-Prüfung bestanden. Lesender Direktabruf ohne Änderung des gemeinsamen Caches. |
| 4. Dialoge und Wiederherstellung | Tastaturfokus und Dialogsemantik prüfen; Teil-Export klar von vollständiger Sicherung unterscheiden; Wiederherstellungsweg belegen. | Live mit PR #56. 36 Tests bestanden. Dialogprüfung 390/1280 px und synthetische Zehn-Tabellen-Wiederherstellung. Echte Zusatzsicherung und Betreiber-Restore offen; siehe [Betriebsablauf](DATENSICHERUNG.md). |
| 5. Automatische Prüfungen | Gemeinsamer Testbefehl und Prüfung vor Veröffentlichung. | Live mit [PR #57](https://github.com/snk5zkgpjv-boop/ecg-gebaeudeverwaltung/pull/57). 37 Logik-/Datenbanktests und vier Browserabläufe bestanden, auch im tatsächlichen [GitHub-Prüflauf](https://github.com/snk5zkgpjv-boop/ecg-gebaeudeverwaltung/actions/runs/42491069252). Vercel-Vorschau und Produktion mit erfolgreicher Testschranke. Verpflichtende GitHub-Branchregel nicht verifiziert. |

## Prüfmaßstab

- Normale Bedienwege und Fehlerwege anhand synthetischer Konten prüfen, einschließlich schmaler Ansicht.
- Berechtigungen serverseitig durchsetzen; fremde oder veraltete Kontoantworten nicht anzeigen.
- Speichern, Neuladen, Konflikte und verspätete Antworten überprüfen. Fehler dürfen keine Erfolgsmeldung erzeugen.
- Entwicklung und unabhängige Prüfung trennen. Tatsächlich ausgeführte Tests, geprüften Commit und Veröffentlichungsstand nennen.
- Keine echten Personen- oder Termineinträge für Tests ändern. Keine Freigaben erweitern.
- Bestehende automatische Tests ergänzen, wenn ein neuer Fehler sonst unbemerkt wiederkehren könnte.

## Grenzen der bisherigen Nachweise

PGlite führt tatsächliche PostgreSQL-Anweisungen aus, serialisiert aber die Verbindungen. Der Rücksetztest belegt deshalb SQL-Verhalten und Rollback, keinen Lasttest mit mehreren PostgreSQL-Verbindungen. Browserprüfungen mit Chromium und kleiner Bildschirmbreite ersetzen weder einen physischen iPhone-Test noch einen Screenreader-Test. Die erfolgreiche Veröffentlichung allein belegt keine fachliche Nutzerabnahme.

Quellcodesicherungen enthalten keine Betriebsdaten. Ein Export der im Browser sichtbaren Daten umfasst weder sämtliche separaten Tabellen noch sämtliche geschützten Dokumente. Ein vollständiger Wiederherstellungsnachweis muss diese Bestände und ihre Beziehungen gesondert berücksichtigen.

## Noch offene Betriebs- und Nutzerprüfungen

- Privaten zusätzlichen Sicherungsspeicher, Verschlüsselung, Verantwortliche, Intervall und Aufbewahrung festlegen; danach eine Betreiber-Wiederherstellung in einem isolierten Ziel prüfen. Der Labortest ist keine produktive Zusatzsicherung.
- Kaltstart und Bereichswechsel auf einem tatsächlichen iPhone prüfen. Die kontrollierte Chromium-Messung umfasst den Wechsel Räume → Inventar und keine repräsentative Mobilfunkmessung.
- Screenreader und weitere Browser separat prüfen; die hier geprüften Tastaturabläufe sind keine vollständige Barrierefreiheitszertifizierung.
- Repository-Administration: erforderlichen GitHub-Check `test` im Workflow „Quality checks“ für `main` prüfen beziehungsweise verbindlich machen. Die Integration durfte den Branchschutz nicht lesen. Bis zur Bestätigung ist nur die Logiktest-Sperre im Vercel-Build nachgewiesen; der Browserworkflow läuft zusätzlich.
