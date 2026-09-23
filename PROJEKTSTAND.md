# Projektstand – ECG Gebäudeverwaltungs-App

Stand: 14.09.2026. Technische, öffentlich geeignete Übergabe; keine Kunden-, Kontakt- oder Zugangsdaten.

## Zuständigkeit

Dieses Repository verwaltet Gemeindegebäude, Räume, Reinigungsaufgaben, Wartung, Inventar, Mängel, Benutzerrechte, persönliche Arbeitszeiten, Kalender und Veranstaltungs-Küchenabläufe. Organisationstool und Schadensmanagement sind separate fachliche Bereiche im [anderen Repository](https://github.com/snk5zkgpjv-boop/erhard-dryland-schadenmanagement/blob/main/PROJEKTSTAND.md).

Technik: HTML/JavaScript-Frontend, Vercel-API-Funktionen unter `api/`, Neon-Datenhaltung und serverseitige Benutzerprüfung. Produktivadresse: https://ecg-gebaeudeverwaltung-jn5h.vercel.app

## Release-Stand

| Bereich | Nachweis / Zustand vor diesem Release |
|---|---|
| Küche: Kontakte, Bestand, Regeln, Vereinbarungen | PR #5 und #6 in main; Vercel-Produktionsbuilds READY |
| Wiederkehrende Küchen-Raumaufgaben getrennt von Veranstaltungsaufgaben | PR #7, main `5f88199`; Produktion READY |
| Kalenderbeschreibungen und Küchenvorschläge | PR #8, `fc70bf7`; bisher Vorschau READY, für dieses Release vorgesehen |
| Raumfoto, KI-Aufgabenvorschau und Bildkompression | PR #4, `aa84016`; bisher Vorschau READY, für dieses Release vorgesehen |

Die beiden Vorschauänderungen wurden lokal konfliktfrei mit dem Hauptstand vereinigt. Veröffentlicht ist ein Release erst, wenn der entsprechende Produktionsbuild und Alias geprüft wurden; dieses Dokument behauptet vorab keine Live-Abnahme.

## Küchenleitung: drei unterschiedliche Bedeutungen

- Kontaktmerkmal `canLead`: Person ist als Küchenchef/-chefin für Veranstaltungen auswählbar; keine globale Adminberechtigung.
- `managerId`: Hauptverantwortlicher für den Küchenbereich.
- `eventChecklists[].kitchen.leadId`: verantwortliche Küchenleitung genau dieser Veranstaltung; daneben `team` für Helfer.
- Änderungen erfolgen über das vorhandene Recht `manageCalendar`.

## Kalenderverhalten

`api/calendar.js` importiert Termine per iCal oder Google Calendar API; die Vorschauänderung ergänzt Beschreibungen bei beiden Wegen. `assets/kitchen-ui.js` erkennt explizit beschriftete Küchenzeilen und bietet aktive, als Leitung auswählbare Kontakte mit passendem Namen an.

Die Zuordnung ist ausdrücklich ein Vorschlag: keine stille Kontaktneuanlage, kein automatisches Überschreiben. Team oder Leitung werden per Auswahl übernommen und erst mit Speichern gesichert. Bereits belegte Felder verlangen eine Überschreibbestätigung. Ohne eindeutige Angaben bleibt die manuelle Auswahl möglich. Bestehende Kalenderdaten brauchen einen erneuten Import, bevor bislang fehlende Beschreibungen verfügbar sind.

## Raum-/Veranstaltungsaufgaben

Regelmäßige Raumaufgaben und ereignisbezogene Küchenchecklisten sind getrennt. Küchenkontakte und Bestandspositionen können hinzugefügt/dupliziert werden; inaktive Kontakte bleiben historisch zuordenbar. Vereinbarungen enthalten Küchenleitung, Anwesenheitszeiten, Küchenordnung, Bestandskontrolle und Nachreinigung.

Raumfoto-Vorschau: Foto, erkannte Raumdaten und Aufgabenvorschläge werden gemeinsam nach Kontrolle gespeichert. Vorhandene Aufgabentitel werden beim Ergänzen berücksichtigt. Fotos werden verkleinert. Keine neuen KI-Zugriffsrechte durch dieses Release.

## Schnittstellen

| Richtung | Daten und Auslöser | Maßgebliche Quelle / Stand |
|---|---|---|
| Google Kalender → ECG | Termin, Zeit, Ort, Beschreibung beim Kalenderimport | Kalender; Importcode vorhanden, Live-Import mit angemeldetem Benutzer noch prüfen |
| ECG → Organisationstool | ausgewählte persönliche Zeitbuchungen nach erfolgreichem `PUT /api/state` | ECG; Filter über konfigurierte Benutzer-E-Mail |
| Organisationstool → ECG | kein Rückschreiben in geprüfter Sync-Strecke | nicht implementiert in dieser Strecke |
| ECG → Schadensmanagement | keine direkte geprüfte Übergabe | nicht als vorhanden annehmen |

Zeit-Sync sendet `{entries}` per Bearer-geschütztem POST an `/api/organization/ecg-sync`. Konfigurationsnamen: `ORGANIZATION_API_URL`, `ORGANIZATION_SYNC_TOKEN`, `ORGANIZATION_SYNC_USER_EMAIL`. Keine Werte dokumentieren. Empfänger legt `source=ecg` an und aktualisiert über externe ID; entfernt auf Quellseite fehlende Buchungen nicht automatisch. Bekannte Grenze: Sender prüft HTTP-Fehlerantworten derzeit nicht ausdrücklich. End-to-End-Sync und Produktionskonfiguration nicht geprüft.

## Prüfungen und offene Punkte

- 14.09.2026: drei Inline-Skripte einschließlich Modulskript sowie alle JS-Dateien unter api/lib/assets syntaktisch geprüft: bestanden.
- Fünf isolierte Kalender-Vorschlagstests: HTML-Beschreibung, folgende Namenszeile, fremde Beschriftung, inaktive/nicht berechtigte Kontakte und fehlende Beschreibung: bestanden.
- Kein angemeldeter Ende-zu-Ende-Test mit echten Kalender- oder Küchendaten durchgeführt. Keine privaten Produktivdaten für Tests geändert.
- Nach Bereitstellung: Produktionscommit/Alias prüfen; im angemeldeten Betrieb Kalender neu synchronisieren und echte Veranstaltung kontrollieren.
- Hygiene-/Wartungsintervalle fachlich prüfen; Bildableitungen sind keine Herstellerfreigabe.

## Pflegepflicht

Bei jeder bestätigten Änderung diese Datei im selben Arbeitsvorgang fortschreiben: Anforderung, Implementierung, Tests, Vorschau und Live-Stand getrennt. Schnittstellenänderungen auch im Empfängerprojekt dokumentieren. Keine privaten Daten in Git. Siehe `AGENTS.md`.

## Nachtrag – Live-Veröffentlichung bestätigt

Am 14.09.2026 wurde PR #9 nach bestandener Vorschau übernommen. Funktionsrelease-Commit: `7d0aa4017ae333ae084da34f7dab3165e4c9945e`. Vercel-Deployment `dpl_kk9bs4PAhaqxyGWoH4d9B6jj88ez`: production, READY, Produktivalias `ecg-gebaeudeverwaltung-jn5h.vercel.app` zugeordnet. Buildzeit etwa 15 Sekunden.

Die oben noch als Vorschau bezeichneten Kalender- und Raumfotoänderungen sind damit jetzt im veröffentlichten Funktionsstand enthalten. PR #4 wurde inhaltlich über das integrierte index.html übernommen, nicht als eigener Merge; PR #8 ist über den Kalenderbranch enthalten. Historische PR-Status nicht mit fehlenden Live-Funktionen verwechseln.

Produktions-Smoke-Test: `/` HTTP 200 mit Raumfoto-Code; `/assets/kitchen-ui.js` HTTP 200 mit Kalender-Vorschlagsfunktion; `/api/calendar` ohne Anmeldung HTTP 401 wie erwartet. Fehler-/Fatal-Logs für dieses Deployment im Abfragezeitraum ohne Treffer. Kein angemeldeter echter Kalenderimport, keine Datenänderung und keine vollständige fachliche Abnahme. Monitoring/Drains wurden nicht geprüft. Nachtrag ist eine reine Dokumentationsänderung, kein neues Funktionsrelease.

## Wartung nach Geschoss und Bereich – 14.09.2026

Implementiert: Die Wartungsübersicht zeigt Geschossüberschriften und darunter eigene Bereiche/Räume. Bestehende Raumzuordnungen (auch Küche) haben Vorrang; alternativ werden eindeutige Raumnamen und Geschossangaben im Standort verwendet. Nicht zuordenbare Einträge bleiben sichtbar unter „Ohne Geschoss“ beziehungsweise ihrem Standortbereich. Innerhalb jedes Bereichs stehen überfällige/bald fällige Wartungen zuerst, danach alphabetisch. Keine Änderung gespeicherter Wartungsdaten oder Schnittstellen.

Prüfung: Inline-JavaScript syntaktisch geprüft; isolierte Tests für Geschossfolge UG/EG/2. OG/ohne Geschoss, gemeinsame Küchengeräte, Fälligkeitsreihenfolge, unveränderte Quelldaten, vollständige Kartenanzahl und leere Liste bestanden. Kein angemeldeter Test mit echten Wartungsdaten. Veröffentlichung dieses Nachtrags zunächst ausstehend; Produktionsprüfung folgt nach Merge.

Live bestätigt: PR #10 übernommen, Funktionscommit `edfc4072057e37117913564b47b0ebde710b4780`. Produktionsdeployment `dpl_69JLZejnew6Rx9FC99DmcShc1ZZW` READY und Produktivalias zugeordnet. Live-Startseite HTTP 200; neuer Gruppierungscode ausgeliefert. Die oben ausstehende Veröffentlichung ist damit erfolgt. Dieser zusätzliche Nachweis ändert nur die Dokumentation.

## Persönliche Zeitfreigabe – 14.09.2026

Implementiert: Unter Mehr → Zeiterfassung entscheidet jeder Benutzer per Haken, ob alle angemeldeten Benutzer seine abgeschlossenen Zeiten samt Tätigkeit/Bemerkung sehen. Ohne ausdrückliche Freigabe bleiben Zeiten privat, auch gegenüber Administratoren und dem bisherigen Recht viewAllTimes. Eigene Zeiten bleiben bearbeitbar; fremde freigegebene Zeiten sind nur lesbar. Laufende Timer werden nur ihrem Eigentümer ausgeliefert. Bisherige Einträge sind eingeschlossen. Keine Änderung am separat konfigurierten ECG → Organisationstool-Zeitexport.

Server: GET /api/state filtert nach Eigentümer/Freigabe, gibt für freigegebene Benutzer nur ID/Name zusätzlich aus und setzt private/no-store. PATCH /api/state akzeptiert ausschließlich {shareTimes:boolean}, bindet die Änderung an den angemeldeten Benutzer und aktualisiert timeSharing atomar. Allgemeine PUTs erhalten die aktuelle Freigabemap auch bei veralteten Tabs und erhalten fremde Zeiteinträge. Der Dialog lädt fremde Zeiten beim Öffnen frisch; eine Rücknahme wirkt bei der nächsten Serverabfrage, bereits gesehene Daten werden nicht rückwirkend zurückgerufen.

Prüfung: 18 isolierte Rollen-/Zugriffsprüfungen (Admin, Objektleitung/coordinator, Putzkraft, Vertretung, Ehrenamt, Technik) bestanden: Freigabe, Privatstandard, Rücknahme, Schreibschutz und Erhalt fremder Einträge. PATCH-Prüfungen für eigene Benutzer-ID, echte boolesche Werte und Ablehnung zusätzlicher Felder bestanden. Checkbox-Erfolg und Rücksetzen bei Speicherfehler geprüft. API und alle Inline-Skripte auf Syntax geprüft. Ausführung im JavaScript-Prüfkontext, da die lokale Werkumgebung nicht erreichbar war; kein angemeldeter Browser-/Datenbank-Ende-zu-Ende-Test. Vorschau und Live-Veröffentlichung noch ausstehend.

Live bestätigt: PR #11 übernommen, Funktionscommit `6d840c410b60a5e11addb289a5cec9bae9a258e4`. Produktionsdeployment `dpl_AZrUQTdzQdJ1fkP9ksnxfarAoMSN` READY, Produktivalias zugeordnet. Startseite HTTP 200 mit persönlichem Freigabeschalter. Damit sind Vorschau und Live-Veröffentlichung erfolgt. Kein angemeldeter Ende-zu-Ende-Test. Dieser Nachtrag ändert nur die Dokumentation.

## Raumaufgaben als Papierchecklisten – 14.09.2026

Implementiert: Jeder Raum bietet „Aufgaben als PDF / Drucken“. Unter Mehr steht rollenunabhängig „Alle Raumaufgaben als PDF / Drucken“. Eigene Druckansicht mit Druckdialog zum PDF-Sichern oder Ausdrucken; kein automatischer PDF-Dateidownload. Gesamtexport enthält alle state.rooms, nach Geschoss/Raum sortiert. Jeder Raum beginnt neu, lange Listen laufen mit wiederholtem Raumkopf weiter. Alle tasks inklusive erledigter Aufgaben werden mit leeren gezeichneten Kästchen ausgegeben, ohne Status oder Fälligkeit. ECG-Logo, Datum/Team und Bemerkungszeilen; leere Räume werden kenntlich gemacht. Raumaufgaben bleiben getrennt von Veranstaltungslisten und technischen Wartungen. Export verändert keine gespeicherten Daten, keine Schnittstellenänderung.

Geprüft: Inline-Syntax; 68 Aufgaben mit gemischten Statuswerten, HTML-Escaping, Reihenfolge und unveränderte Quelldaten. HTML-Druckvorlage mit WeasyPrint auf sechs A4-Seiten gerendert und alle Seiten visuell geprüft; Textprüfung bestätigt sämtliche Aufgaben. Chromium-Download nicht erreichbar, deshalb kein Browser-/iPhone-Druckdialogtest. Vorschau/Live-Veröffentlichung noch ausstehend.

Live bestätigt: PR #12 übernommen, Funktionscommit `7a99fc06712e04a3785cfc7d713a00e2ecd83db2`. Produktionsdeployment `dpl_AXt9afZQVG14KNipdd2puidvqvJR` READY am Produktivalias. Startseite HTTP 200 mit Raumchecklisten-Exportcode. Vorschau ebenfalls READY; Veröffentlichung damit erfolgt. Dieser Nachtrag ändert nur die Dokumentation.

## Startbildschirm-Icon – 14.09.2026

Originale separate Weltkugel-mit-Kreuz-Datei assets/embedded-4-8ef55a643706.png als apple-touch-icon und Favicon verknüpft; vorher fehlten diese Verknüpfungen. Webmanifest mit Namen ECG Gebäudeverwaltung, Kurzname ECG Gebäude, Start-URL/Scope / und standalone ergänzt. Originalbild unverändert (150 x 167 Pixel), keine Neuzeichnung. Manifest nennt die tatsächliche Bildgröße; kein Anspruch auf vollständige Android-PWA-Installierbarkeit. Titel von „Stabiler Speicherfix“ bereinigt.

Geprüft: Originalbild visuell, PNG-Abmessungen und JSON-Manifest geprüft. Keine Daten-/Berechtigungsänderung. Noch kein physischer iPhone-Installationstest; bestehende Startbildschirm-Verknüpfungen müssen gegebenenfalls entfernt und in Safari erneut hinzugefügt werden. Vorschau/Live noch ausstehend.

Live bestätigt: PR #13 übernommen, Commit `7b7022aa131ed39c54e1154a4fd332c12356e802`, Produktionsdeployment `dpl_8WC8DyPdkPDyRSHCMeULVoHJKH1J` READY am Produktivalias. Startseite HTTP 200 mit apple-touch-icon; Manifest HTTP 200. Kein physischer iPhone-Test. Dieser Nachtrag ändert nur die Dokumentation.

## Wartungsarten und eingeschränkte Technikrolle – 14.09.2026

Implementiert: Wartungen nach intern, extern und kombiniert gruppiert/filterbar; darunter weiterhin Geschoss/Bereich. Hersteller- und Modellfelder ergänzt. Quellenbasierte, ausdrücklich ungeprüft zu übernehmende Intervallvorschläge für MEIKO M-iClean H und Eloma Genius T; andere Modelle bleiben offen. Details und Quellen in docs/WARTUNGSINTERVALLE.md. Keine bestehenden Wartungsintervalle oder Termine automatisch verändert; technische Bestandsdaten ausschließlich lesend geprüft.

Technik darf Wartungen und Inventar verwalten sowie ausdrücklich markierte Technikaufgaben abhaken. Räume, Putzaufgaben und Veranstaltungsputzfortschritt bleiben schreibgeschützt; keine Raum-/Aufgabenerstellung und keine Zeiterfassung. Serverseitige Rechte gelten unabhängig von eventuell älteren individuellen Berechtigungshaken. Zeitdaten werden weder ausgeliefert noch durch Technik-PUTs verändert. Benutzerverwaltung, Kalenderverwaltung und KI bleiben für Technik gesperrt. Aufgabenverwalter können Aufgaben als Technikaufgabe kennzeichnen; unmarkierte Altaufgaben bleiben für Technik schreibgeschützt. Keine automatische Umklassifizierung anhand des Raumnamens.

Prüfung: tests/technician-maintenance.mjs ausgeführt: drei Inline-Skripte syntaktisch korrekt; isolierte API-/UI-Prüfungen für manipulierte Rechte, gefälschte Aufgabenart, Putz-/Technik-/Eventaufgaben, Raumänderungen, Zeitdatenschutz, Inventar/Wartung und unveränderte andere Rollen bestanden. Kein angemeldeter Browser-Ende-zu-Ende-Test. Vorschau und Live-Veröffentlichung noch ausstehend. Keine Änderungen an Schnittstellen zum Organisationstool oder Schadensmanagement.

Live bestätigt: PR #14 übernommen, Commit `f4b3a970bca7c159a1e39cb4329dd0a25739e45e`. Vorschau READY; Produktionsdeployment `dpl_AYX7QJHdH4XF69QyCjKcaXEx7DZw` READY am Produktivalias. Startseite und assets/maintenance-tools.js HTTP 200 mit neuer Version; /api/state ohne Anmeldung erwartungsgemäß HTTP 401. Build ca. 14 Sekunden. Gruppierungsprüfungen intern/extern/kombiniert ebenfalls bestanden. Kein angemeldeter E2E-Test oder Runtime-Logscan. Die zuvor ausstehende Veröffentlichung ist erfolgt. Dieser Nachtrag ändert nur die Dokumentation.

## Persönliche Wochenstunden – 21.09.2026

Implementiert: Heute zeigt höchstens drei eigene abgeschlossene Zeiteinträge, neueste zuerst. Mehr → Zeiterfassung enthält eine eigene Wochenübersicht mit ISO-KW/Jahr, Montag–Sonntag-Datumsbereich und Stunden/Minuten sowie Gesamtsumme. Aktuelle und letzte Woche erscheinen auch ohne Buchungen; ältere belegte Wochen absteigend. Nur eigene abgeschlossene Buchungen zählen, einschließlich freiwilliger Dienste; fremde freigegebene Zeiten, laufende Timer, ungültige und künftig endende Buchungen werden nicht summiert. Wochenzuordnung immer Europe/Berlin. Buchungen über einen Wochenwechsel werden anteilig verteilt, Zeitumstellungen anhand tatsächlicher Dauer berücksichtigt. Keine Änderung gespeicherter Daten, Freigaberechte oder Organisationstool-Schnittstelle.

Prüfung: tests/time-summary.mjs mit synthetischen Daten bestanden (Summen, drei letzte eigene Einträge, leere Wochen, ungültige/laufende/fremde Zeiten, Jahres-/Wochenwechsel, Sommer-/Winterzeit, HTML-Einbindung). Bestehende Rollen-/Wartungsregressionen und Inline-JavaScript-Syntax bestanden. Kein angemeldeter Browser-/iPhone-Test. Vorschau und Live-Veröffentlichung noch ausstehend.

Live bestätigt: PR #15 übernommen, Commit `6f23edb294157fb7d8ca690d8ee0b072c273698e`. Vorschau READY; Produktionsdeployment `dpl_7v1oMQPCQ46Z2KRV6mA3DHNjFtXB` READY am Produktivalias https://ecg-gebaeudeverwaltung-jn5h.vercel.app. Startseite und assets/time-summary.js HTTP 200, neue Skripteinbindung und Wochenberechnung ausgeliefert. Build ca. 20 Sekunden; statisches HTML/JavaScript mit API-Funktionen, kein Framework gesetzt. Kein angemeldeter Browser-/iPhone-Test. Die zuvor ausstehende Veröffentlichung ist erfolgt. Dieser Nachtrag ändert nur die Dokumentation.

## Kalenderwochen öffnen und exportieren – 21.09.2026

Implementiert: Kalenderwochen in der persönlichen Übersicht sind als Schaltflächen anklickbar. Die Detailansicht zeigt eigene abgeschlossene Buchungen chronologisch mit Datum, Beginn/Ende, Tätigkeit, Bemerkung, freiwilligem Dienst, Dauer und Wochensumme. Wochenübergreifende Einträge werden wie in der Übersicht anteilig abgegrenzt und gekennzeichnet. Zurück führt zur Übersicht.

PDF-/Druckexport für eine Woche aus deren Detailansicht oder alle Wochen aus der Übersicht. Druckansicht mit Benutzername, KW/Jahr, Datumsbereich, Einzelbuchungen, Wochensummen und Gesamtsumme. Jede weitere Woche beginnt auf einer neuen Seite; Tabellenköpfe wiederholen sich bei Seitenumbrüchen. PDF-Speicherung über den Druckdialog, kein automatischer Dateidownload. Eigene Daten werden lokal aus dem geladenen App-Zustand verarbeitet; keine neue Schnittstelle, keine Datenänderung. Fremde freigegebene Buchungen sind nicht im persönlichen Export. Technik bleibt ausgeschlossen.

Prüfung: Erweiterte tests/time-summary.mjs bestanden (Detail-/Summengleichheit, Wochenanteile, eigene/fremde/ungültige Zeiten, Einzelexport/Gesamtexport, HTML-Escaping, Navigation, Druckfenster und Technik-Sperre). Bestehende Wartungs-/Rollentests und Inline-Syntax bestanden. Exportvorlage mit 32 synthetischen Buchungen einschließlich langer Bemerkung über vier A4-Seiten mit WeasyPrint gerendert; alle Seiten visuell geprüft und alle 32 Tätigkeiten in PDF-Textextraktion enthalten. Vorschau/Live-Veröffentlichung noch ausstehend. Kein angemeldeter Browser-/iPhone-Druckdialogtest.

Live bestätigt: PR #16 übernommen, Commit `e3b4436c47a30571aa3a29ea52a14a352e24a8ee`. Vorschau READY; Produktionsdeployment `dpl_AEN4L5abE2d2CViYbYWpz3iJyC8k` READY am Produktivalias https://ecg-gebaeudeverwaltung-jn5h.vercel.app. Startseite HTTP 200 mit neuer Skriptversion v2. Build ca. 17 Sekunden; statisches HTML/JavaScript mit API-Funktionen, kein Framework gesetzt. Kein angemeldeter Browser-/iPhone-Druckdialogtest; Monitoring/Drains nicht geprüft. Dieser Nachtrag dokumentiert die erfolgte Veröffentlichung.

## Korrekturen nach vertieftem Zeiterfassungs-Review – 21.09.2026

Implementiert: Dialoge schließen in umgekehrter Öffnungsreihenfolge. Nur der oberste Dialog trägt die aktive ID modalBack; bestehende Zugriffe auf den aktiven Dialog bleiben möglich. Die Wochenübersicht wird nach einer Serverantwort an ihrer bestehenden Position aktualisiert, ohne geöffnete Wochendetails zu verdecken. Antworten für geschlossene Dialoge oder inzwischen gewechselte Benutzer werden verworfen; bei Ladefehlern wird der Freigabeschalter wieder bedienbar.

Heute, Einzelbuchungen, Wochenübersicht und Druckexport verwenden dieselbe Dauerformatierung mit Sekunden, sofern diese nicht null sind. Es gibt keine Rundung auf ganze Minuten mehr. Einzelzeiten und Summen werden aus unveränderten Millisekundenwerten berechnet und erst zur Anzeige auf Sekunden gerundet; mögliche kleine Rundungsabweichungen werden in Übersicht, Details und Export erklärt. Der Export zeigt auch Beginn und Ende mit Sekunden. Der Bearbeitungsdialog erhält Sekunden statt sie auf Minuten abzuschneiden.

Eine gemeinsame Prüfung für gültige abgeschlossene Zeiträume wird für letzte eigene Einträge, Wochensummen und Wochendetails verwendet. Fehlende, ungültige, rückwärts laufende und zukünftig endende Buchungen werden ausgeschlossen. Bearbeiten/Speichern lehnt solche Zeiträume vor jeder Datenänderung ab. Keine automatische Bereinigung gespeicherter Altbuchungen; keine Änderung an Berechtigungen, API-Verträgen oder ECG → Organisationstool-Schnittstelle.

Geprüft: tests/time-summary.mjs, tests/time-integration.mjs und tests/technician-maintenance.mjs bestanden. Neue Regressionen führen die tatsächlichen UI-Funktionen in einem isolierten JavaScript-Kontext mit minimalem DOM-Modell aus: Zurück-Navigation, eindeutige aktive Dialog-ID, verspätete Serverantworten, Schließen während des Ladens, Benutzerwechsel, Ladefehler, Sekundenformat und Exportsumme, Filter und Speichervalidierung, Sekundenbearbeitung sowie Wochen-/Jahres-/Sommer-/Winterzeitgrenzen. Integrationstests zusätzlich unter America/Los_Angeles und Asia/Tokyo bestanden. Drei Inline-Skripte syntaktisch korrekt. Nur synthetische Testdaten.

Browsergrenze: Die Cloud-Browserrichtlinie erlaubt das Öffnen der lokalen data:-Testseite nicht. Kein tatsächlicher Browser-/iPhone-Druckdialogtest und keine angemeldete Produktivprüfung. Vorschau und Live-Veröffentlichung dieses Korrekturstands noch ausstehend.

Live bestätigt: PR #17 übernommen, Funktionscommit `b4d363f3644d8b640ab4971449159d03642d71b1`. Vorschau `dpl_4LcddgWNPJcsVpXSgxKFpDayEMHh` READY. Produktionsdeployment `dpl_HE7BgF7SR1hf94XRwWonX7ySywjQ` READY mit Produktivalias https://ecg-gebaeudeverwaltung-jn5h.vercel.app, Build ca. 18 Sekunden. Startseite und assets/time-summary.js?v=3 HTTP 200 und inhaltlich exakt mit den geprüften Dateien identisch. /api/state ohne Anmeldung HTTP 401. Auf dieses Deployment begrenzter Error-/Fatal-Logscan im 30-Minuten-Abfragefenster ohne Treffer. Kein Browser-/iPhone-Druckdialogtest, kein angemeldeter Ende-zu-Ende-Test; Monitoring/Drains nicht geprüft. Die oben ausstehende Veröffentlichung ist damit erfolgt; dieser Nachtrag ändert nur die Dokumentation.


## Persönliche Mängelplanung – 23.09.2026

Implementiert auf Feature-Branch: Hinweise/Mängel erhalten pro angemeldetem Benutzer eine private Planung mit geschätzten Minuten, persönlicher Planungspriorität, Notiz und Kennzeichen „noch nicht ausführbar“. Die Planung wird serverseitig unter der Benutzer-ID getrennt vom gemeinsamen Hinweis gespeichert; GET liefert nur `myIssuePlanning` des angemeldeten Benutzers. Der normale Cloud-Payload enthält diese privaten Angaben ausdrücklich nicht. Die Hinweise-Ansicht summiert offene geplante Zeit und markiert noch nicht geschätzte Aufgaben.

Schnittstelle: Beim Speichern einer persönlichen Planung wird der Eintrag über den bestehenden Bearer-geschützten Organisationskanal an `/api/organization/ecg-planning-sync` übertragen. Das Organisationstool ordnet anhand der konfigurierten `ORGANIZATION_SYNC_USER_EMAIL` einem konkreten Konto zu; kein Fallback auf den ersten Administrator. Auch der bestehende ECG-Zeit-Sync sendet nun diese Eigentümer-E-Mail zur eindeutigen Zuordnung. Die Organisation speichert geplante Hinweise getrennt von geleisteten Zeiten; geplante Minuten werden nicht als Arbeitszeit gebucht.

Prüfung/Veröffentlichung: Regressionstest für Privatsphäre-/Integrationsmarker ergänzt. Feature-Branch noch nicht als Produktion behaupten; Build/PR/Vorschau und Live-Abnahme folgen separat.

## Direkte Sprach-Zeiterfassung – 23.09.2026

Implementiert: Auf Heute und unter Mehr → Zeiterfassung öffnet „Arbeitszeit einsprechen / nachtragen“ einen Aufnahme-/Textdialog. MediaRecorder nimmt nach Mikrofonfreigabe maximal 90 Sekunden auf; API akzeptiert höchstens etwa 2,5 MB Audio. Alternative: Tastaturdiktat oder manuelle Eingabe. Gesprochener Text kann vor Auswertung korrigiert werden. KI erzeugt maximal zehn getrennte Buchungsentwürfe und Rückfragen bei fehlenden/unsicheren Angaben. Alle Felder sind vor Bestätigung bearbeitbar; Datum/Zeiten in Europe/Berlin, Tageswechsel explizit. Keine automatische Speicherung allein durch Aufnahme oder KI-Auswertung. Zeitumstellungslücken und mehrdeutige Uhrzeiten werden abgelehnt. Pausen als getrennte Intervalle, keine automatische Pauschale.

API `/api/time-voice`: bestehende ECG-Sitzung, Technik ausgeschlossen, KI nur mit bestehendem useAI-Recht; manuelles Speichern für sonstige Zeitnutzer. OPENAI_API_KEY und bestehendes OPENAI_MODEL für strukturierte Auswertung; optional OPENAI_TRANSCRIPTION_MODEL (Standard gpt-4o-mini-transcribe). Aufnahme/Text gehen nur zur gewählten Auswertung an OpenAI; kein Audio in App-Datenbank, Responses mit store:false, keine Inhalte in Logs. Bestehende Anbieter-Aufbewahrungsbedingungen bleiben unberührt. Datum, Ende, Dauer (max. 24 Stunden je Buchung), Textlängen, Eigentümer und Überschneidungen werden serverseitig geprüft. Speicherung ergänzt nur timeEntries atomar mit Revisionsprüfung; feste Anfrage-ID verhindert doppelte Anlage nach unklarer Netzwerkantwort. Keine Produktiv-Testbuchungen.

Synchronisation: Nach erfolgreichem Speichern derselbe Bearer-geschützte ECG → Organisation-Kanal, Payload `{ownerEmail,entries}`. ECG bleibt maßgebliche Quelle; nur das konfigurierte Eigentümerkonto wird exportiert. Gemeinsamer Sender prüft HTTP-Status und bestätigte Anzahl, teilt große Listen in 500er-Blöcke. Speichern und Übertragung sind getrennte Ergebnisse: synced, pending, not_configured, not_applicable. Bei Fehlern bleibt ECG gespeichert; Wiederholen im Dialog und nächstes normales Cloud-Speichern versuchen die Übertragung erneut. Kein dauerhafter Hintergrundjob und kein Rückkanal/Löschabgleich. Vollständiger End-to-End-Nachweis sowie Produktionskonfiguration weiterhin nicht bestätigt.

Schutz beim normalen Cloud-Speichern: timeEntryIdsSeen enthält die vom Client bereits gesehenen eigenen IDs, damit neu auf anderen Geräten entstandene Buchungen nicht durch eine alte vollständige Liste gelöscht werden. Fehlender Marker bei alten Clients erlaubt keine Löschung fehlender eigener Buchungen. Gleichzeitige Änderung der Zeitliste zwischen Lesen und Schreiben ergibt 409 statt Überschreiben. Vor Spracheintrag werden lokale Cloud-Anfragen serialisiert; übrige Rollen-/Freigaberechte unverändert.

Prüfung: tests/time-voice.mjs prüft Berlin-/DST-Zeiten, Pflichtfelder, Eigentümerbindung, abgeschlossene Zeiträume, Überschneidungen, idempotentes API-Speichern, Rollen/Anmeldung, fehlende KI, Sync-Fehler/Teilbestätigung/Chunking und Erhalt neuer Buchungen bei alten Tabs. Bestehende Tests time-summary, time-integration, technician-maintenance und issue-planning bestanden. Synthetische Browser-Testseite unter tests/time-voice-browser.html nutzt das echte Frontend mit simulierten Antworten und schreibt keine Produktivdaten. Browser aktuell nicht an ECG angemeldet; echter Audio-/KI-/Datenbank-/Organisation-Endtest offen. Vorschau und Live-Veröffentlichung ausstehend.

API-Referenzen: https://developers.openai.com/api/docs/guides/structured-outputs und https://developers.openai.com/api/docs/guides/speech-to-text (23.09.2026 geprüft).
