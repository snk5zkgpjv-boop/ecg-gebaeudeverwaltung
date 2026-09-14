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
