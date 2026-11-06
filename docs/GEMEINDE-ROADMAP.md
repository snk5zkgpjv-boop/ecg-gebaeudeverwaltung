# Gemeinde-Funktionen

Ein Paket endet mit einem nachvollziehbaren Testweg. Statusfolge: geplant → in Entwicklung → technisch geprüft → Vorschau für Fachtest → fachlich abgenommen → live. Ein grüner technischer Test ersetzt keine fachliche Abnahme. Der Koordinator gleicht den Stand mit Code, Tests, offenen Änderungen und Veröffentlichung ab. Feedback und Korrekturen haben Vorrang vor dem nächsten Paket.

| Paket | Ziel | Bestehende Funktion weiterverwenden | Fachlicher Abnahmetest |
|---|---|---|---|
| 1 · Ablaufplan | Reihenfolge und Dauer der Programmpunkte je Veranstaltung bearbeiten. | Kalendertermine und Kalenderrechte | Drei Punkte anlegen, umsortieren und neu öffnen. Zweiter Termin bleibt unabhängig. |
| 2 · Dienste und Mitarbeitende | Dienste pro Termin oder Zeitabschnitt anfragen, zusagen, absagen, tauschen; Konflikte mit Urlaub anzeigen. | Personal, Teamrechte, Vertretung, Kalender | Zwei Personen übernehmen verschiedene Einsätze desselben Zeitraums. Keine Zusage durch Dritte. |
| 3 · Persönlicher Start | Eigene Termine, offene Dienstanfragen und relevante Neuigkeiten auf der Startseite. | Portal, Dienste, Gruppenrechte | Zwei Konten sehen unterschiedliche Inhalte. Kaltstart auf einem Handy messen. |
| 4 · Räume und Ressourcen | Räume, Technik und Fahrzeuge zum Termin reservieren; Anfragen genehmigen. | Räume, Inventar, Ausleihe, Kalender | Zwei zeitgleiche Buchungen melden einen Konflikt; parallele Zusagen erzeugen keine Doppelbuchung. |
| 5 · Personen und Gruppen | Familienbeziehungen, Dienstgruppen, Leitung und abgestufte Sichtbarkeit. | Mitgliederstamm und Kontoverknüpfung | Gruppe ändern, Zugriffsrechte prüfen, doppelte Personendatensätze vermeiden. |
| 6 · Anmeldung und Check-in | Anmeldung, Teilnehmerliste, QR-Check-in, optional Namensetikett. | Veranstaltungen und Personen | Derselbe Code zählt einmal; falsches Event wird zurückgewiesen. Druck ist optional. Für Kinder vor Freigabe Sichtbarkeit und Abholung klären. |
| 7 · Beiträge und Kommunikation | Zielgruppengerechte Beiträge, persönliche Benachrichtigungen, optional Chat, Push und Newsletter-Anbindung. | Rechte, Gruppen und persönliche Startseite | Anfrage erreicht die vorgesehene Gruppe; Abmeldung, Benachrichtigungseinstellungen und Leserechte testen. |
| 8 · Wissen und Dokumente | Durchsuchbare Anleitungen, Verantwortliche und aktualisierbare Wissensseiten. | Geräteanleitungen und Dokumentenrechte | Eine Anleitung aktualisieren und über Gerät sowie Suche dieselbe Fassung finden. |
| 9 · Finanzen | Auslagen und Belege mit Prüfung und Freigabe; später Spenden, Budgets und Buchhaltung nach fachlicher Klärung. | Finanzbereich und Finanzrolle | Auslage einreichen und genehmigen; unberechtigten Zugriff ausschließen. |
| 10 · Anbindungen und Öffentlichkeit | Kalenderfeeds, gezielte Im-/Exporte und API-Anbindungen; freigegebene Inhalte auf der Gemeindewebsite. | Gästeprogramm, Wochenplan-PDF, bestehende Synchronisierung | Freigegebener Termin erscheint öffentlich, private Daten bleiben intern. |

Querschnitt: Berichtswesen und Statistik jeweils beim zugehörigen Modul ergänzen. Änderungen an Zugriffsrechten, Empfängern, externen Anbindungen und Ausgaben werden gesondert geprüft. Keine produktiven Personen- oder Veranstaltungseinträge für Testzwecke verwenden.

### Paket 9: RH-Buchungslabor als möglicher Baustein

Vor einer Neuentwicklung Belegeingang, Originalablage, Dublettenprüfung, Journal und Export aus dem Buchungslabor v0.10 mit synthetischen Vereinsfällen überprüfen. Das Labor ist ein Prototyp. ECG bekommt einen isolierten Mandanten mit eigenen Rollen, Daten und Buchungsregeln. Vereinsstatus, steuerliche Anerkennung, Kontenrahmen und Auswertungen anhand der Vereinsunterlagen und mit der Finanzverantwortung klären.

Erster Pilot: Auslage erfassen → mit Beleg freigeben → einmalig als Buchungsvorschlag im ECG-Testjournal bereitstellen. Wiederholung erzeugt keinen zweiten Vorschlag. Zugriff aus einem anderen Mandanten wird auch beim Originalbeleg verweigert. Keine Übertragung echter Belege, keine automatische Steuerzuordnung, keine Spendenbescheinigung und keine Lohnabrechnung im Pilot.
