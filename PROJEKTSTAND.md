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
