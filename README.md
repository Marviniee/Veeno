# Veeno 🐷

Eine schlanke Progressive Web App (PWA), um Trinkgeld direkt während der Schicht in
Sekunden festzuhalten – inklusive **Becher-Logik** (Scheine einzahlen, Kleingeld im
Becher lassen für die nächste Schicht) und **Sparrücklage-Tracking** für den
Studienstart.

**[→ Live-Demo](https://marviniee.github.io/Veeno/)**

|                                                    |                                                          |
| -------------------------------------------------- | -------------------------------------------------------- |
| ![Eintrag-Screen](screenshots/eintrag.png)         | ![Übersicht-Screen](screenshots/uebersicht.png)           |
| ![Meilensteine](screenshots/uebersicht_badges_alt.png) | ![Einstellungen-Screen](screenshots/einstellungen.png) |

## Funktionen

- **Schneller Eintrag** über ein eigenes Zahlenfeld (Prefix-Logik) – ein Betrag ist in
  Sekunden getippt
- **Becher-Logik:** beim Schicht-Abschluss automatische Aufteilung in "Ausstehend"
  (volle Scheine, wandern zur Bank) und "Im Becher" (Kleingeld, bleibt für die nächste
  Schicht)
- **Ausstehend/Eingezahlt-Tracking:** behält im Blick, wie viel schon aus dem Becher
  entnommen, aber noch nicht am Bankautomaten eingezahlt wurde
- **Sparziel** mit Fortschrittsbalken bis zum gewünschten Zielbetrag
- **Zielprognose:** eigene Karte mit Kalender-Grid (Contribution-Graph-Stil), zeigt anhand
  des Durchschnitts der letzten 10 Schichten, in wie vielen weiteren Schichten das
  Sparziel voraussichtlich erreicht wird
- **Undo fürs Löschen:** kurzes Zeitfenster nach dem Löschen eines Eintrags, um die
  Aktion per Toast rückgängig zu machen
- **Wachstumskurve** der Sparrücklage über die letzten 30 Tage, mit einem Punkt-Marker
  pro Datenpunkt
- **Meilenstein-Belohnungssystem** mit freischaltbaren Abzeichen ab der ersten
  Einzahlung bis zu 3.000 €
- **Stempeluhr:** eigener Tab zum Ein-/Ausstempeln mit großem Knopf, klar erkennbarem
  Status und Live-Timer; App startet je nach Status automatisch auf dem passenden Tab
- **Arbeitszeit-Kalender:** echter Monatskalender mit allen Schichten als
  Intensitäts-Heatmap (Farbstärke je nach Schichtdauer, wie ein Contribution-Graph),
  editierbaren Start-/Endzeiten, Löschen einzelner Schichten und verdientem Lohn pro Tag
  (auf Basis eines einstellbaren Stundenlohns, der pro Schicht eingefroren wird)
- **Live-Verdienst-Anzeige** auf dem Eintrag-Screen: laufender Lohn, Arbeitszeit und
  Ø €/Std. der aktuellen Schicht in Echtzeit, symmetrisch neben der Trinkgeld-Kachel
- **Wisch-Navigation:** zwischen den Haupt-Tabs wischen, plus Wisch-Geste "Zurück" auf
  allen Vollbild-Screens
- **Automatische Verlaufsverdichtung:** Schichten älter als 2 Monate werden zu
  Monatssummen zusammengefasst, um den Speicher schlank zu halten
- **Backup & Restore:** granular wählbar (nur Trinkgeld, nur Stempeluhr oder beides),
  beides als JSON vollständig wiederherstellbar, Stempeluhr zusätzlich als CSV für
  externe Auswertung (Excel/Lohnkontrolle)
- **Einstellungen** in thematischen Untermenüs: Trinkgeld & Schicht, Stempeluhr,
  Darstellung, Backup & Export, sowie Gefahrenzone für destruktive Aktionen
- **Profil:** Name und Foto (bleiben ausschließlich lokal gespeichert), personalisierte
  Begrüßung auf dem Übersicht-Screen, automatisch berechnetes "Dabei seit"-Datum und
  eine kleine Statistik-Zeile

## Technik

- Reines **HTML / CSS / JavaScript**, kein Framework, keine Abhängigkeiten
- **Lokale Speicherung** (localStorage) – alle Daten bleiben ausschließlich auf dem
  Gerät, kein Server, keine Cloud-Synchronisation, keine Datenweitergabe
- **Service Worker** für Offline-Nutzung
- Installierbar als **PWA** über „Zum Home-Bildschirm hinzufügen"

## Lokale Entwicklung

```bash
# im Projektordner einen einfachen Server starten
python3 -m http.server 8000
# dann im Browser öffnen:
# http://localhost:8000
```

## Lizenz

Persönliches Projekt, kein Open-Source-Lizenz – alle Rechte vorbehalten.

## Version

v2.2.0
