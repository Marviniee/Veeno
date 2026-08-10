# Veeno 🪙

> ⚠️ Work in Progress – v1 im Aufbau.

Eine schlanke Progressive Web App (PWA), um Trinkgeld direkt während der Schicht
in Sekunden festzuhalten und den Fortschritt der Sparrücklage im Blick zu behalten.

## Warum

Trinkgeld sammelt sich in kleinen Beträgen im Becher, wird bisher per Hand notiert.
Diese App macht das Eintragen blitzschnell, rechnet die Summen automatisch und hilft
beim Schritt vom Becher bis aufs Sparkonto.

## Funktionen (v1, geplant)

- **Schneller Eintrag** über ein eigenes Zahlenfeld (Prefix-Logik), Betrag in Sekunden getippt
- **Automatischer Zeitstempel** für jeden Eintrag
- **Liste der letzten Einträge**, bearbeit- und löschbar
- **Tages- und Gesamtsumme** live berechnet
- **Becher-Logik:** Aufteilung in eingezahlt (Scheine) vs. im Becher gelassen (Kleingeld)
- **Sparziel-Tracking:** laufende Gesamtsumme der Rücklage

Geplant für später (v2+): Wochen-/Monatsauswertung, Erinnerungen ab Schwellwert,
Belohnungssystem mit Meilensteinen.

## Technik

- Reines **HTML / CSS / JavaScript**, kein Framework
- **Lokale Speicherung** (localStorage), offline nutzbar
- Kein Backend, kein Server
- Als **PWA** über „Zum Home-Bildschirm hinzufügen" auf dem iPhone installierbar

## Status

Erste Bau-Session (Grundgerüst v1). Noch nicht funktionsfertig.

## Nutzung (lokal)

```bash
# im Projektordner einen einfachen Server starten, z.B.
python3 -m http.server 8000
# dann im Browser öffnen:
# http://localhost:8000
```
