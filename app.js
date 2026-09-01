// ============================================================================
// Veeno - app.js
//
// Alles, was die App tut, steht hier drin. Kein Framework, nur "normales"
// JavaScript. Der Code ist in kleine Funktionen aufgeteilt, die jeweils
// genau eine Sache tun - so kannst du später einzelne Teile austauschen,
// ohne den Rest zu verstehen.
//
// Grober Aufbau dieser Datei:
//   1. Speichern/Laden aus localStorage
//   2. Zahlenfeld-Logik (wird von Haupt-Eingabe UND Bearbeiten-Dialog benutzt)
//   3. Haupt-Eingabe (Speichern eines neuen Eintrags)
//   4. Liste der letzten Einträge
//   5. Tagessumme
//   6. Bearbeiten-Dialog
//   7. Schicht-Abrechnung (Becher-Logik) + Sparrücklage
//   8. Sparziel: Zielbetrag + Fortschritt
//   9. Einstellungen-Screen
//  10. Backup/Export
//  11. Bottom-Nav / Screen-Umschaltung
//  12. Motivations-Text
//  13. Start
// ============================================================================

// localStorage kann nur Text speichern -> wir benutzen feste "Schlüssel"
// (Namen), unter denen unsere Daten abgelegt werden.
const STORAGE_KEY = "trinkgeld-eintraege";
const STORAGE_KEY_SUMMARIES = "veeno-tagesabrechnungen";
const STORAGE_KEY_ZIEL = "veeno-sparziel-betrag";
const STORAGE_KEY_EINSTELLUNGEN = "veeno-einstellungen";
const STORAGE_KEY_EINGEZAHLT = "veeno-eingezahlt-gesamt";
const STORAGE_KEY_BADGES = "veeno-badges";

// Zwei getrennte Versionsangaben, die absichtlich unterschiedlich oft
// wechseln - beide werden im Einstellungen-Screen angezeigt (siehe
// initSettings()), aber nur APP_SEMVER entspricht dem, was nach außen als
// "Version" kommuniziert wird (z.B. in Release Notes).
//
// APP_SEMVER: die "echte" Versionsnummer nach SemVer, von Hand gepflegt.
// Nur ändern, wenn ein neuer Git-Tag gesetzt wird (siehe Abschnitt 11 der
// Technischen Referenz) - z.B. Tag "v0.5.0" -> APP_SEMVER = "0.5.0". NICHT
// bei jedem Push hochzählen.
const APP_SEMVER = "0.9.1";

// APP_VERSION: reiner Cache-Zähler für den Service Worker. Muss beim
// Erhöhen von CACHE_NAME in service-worker.js manuell mitgezogen werden -
// bei JEDEM inhaltlichen Push hochzählen, unabhängig von APP_SEMVER.
const APP_VERSION = "v42";

// Defaults, mit denen die App läuft, solange niemand die Einstellungen
// geöffnet hat. maxBetrag entspricht dem alten fest codierten MAX_BETRAG.
const EINSTELLUNGEN_DEFAULT = {
  maxBetrag: 9.99,      // Eingabe-Obergrenze pro Trinkgeld-Eintrag
  farbmodus: "system",  // "system" | "hell" | "dunkel"
  rundung: 5,           // Rundungsgröße beim Schicht abschließen (5/10/20)
  becherKorrektur: 0,   // Differenz für die manuelle Becherbestand-Korrektur
  motivationAn: true,   // Motivationssprüche an/aus
};

// "buffer" ist das, was der Nutzer gerade auf dem Haupt-Zahlenfeld eintippt,
// z.B. "12" oder "0,10". Er ist immer nur EIN String (Text), den wir bei
// Bedarf in eine Zahl umwandeln.
let buffer = "";

// Alle bisher gespeicherten Einträge, direkt beim Start aus dem
// localStorage geladen.
let entries = loadEntries();

// Tagesabrechnungen (Becher-Logik): ein Objekt, bei dem der Schlüssel das
// Datum ist (z.B. "2026-08-10") und der Wert {total, paidOut, inCup} enthält.
let dailySummaries = loadDailySummaries();

// Zielbetrag fürs Sparziel - "null" bedeutet "noch kein Ziel gesetzt"
// (nicht 0, damit wir "kein Ziel" und "Ziel ist 0€" sauber unterscheiden
// könnten, auch wenn Letzteres in der Praxis nie vorkommen sollte).
let sparzielBetrag = loadSparzielBetrag();

// Alle Einstellungen in einem gemeinsamen Objekt statt vieler einzelner
// localStorage-Keys - einfacher zu laden/speichern, und neue Einstellungen
// lassen sich später ergänzen, ohne bestehende Nutzerdaten zu brechen.
let einstellungen = loadEinstellungen();

// Kumulativer Betrag, der jemals per "Einzahlung erfassen" am Bankautomaten
// eingezahlt wurde - unabhängig davon, aus welcher Schicht das Geld stammt.
// 0 ist hier (anders als bei sparzielBetrag) ein normaler, gültiger
// Startzustand, kein "nichts gesetzt"-Sonderfall.
let eingezahltGesamt = loadEingezahltGesamt();

// Liste der bereits freigeschalteten Abzeichen-IDs (siehe BADGES weiter
// unten), z.B. ["starter", "50", "100"]. Reihenfolge spielt keine Rolle,
// nur Zugehörigkeit zählt (includes()).
let freigeschalteteBadges = loadBadges();


// ============================================================================
// 1. Speichern / Laden aus localStorage
// ============================================================================

function loadEntries() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch (fehler) {
    // Falls die gespeicherten Daten mal kaputt sein sollten, starten wir
    // lieber leer, statt die App abstürzen zu lassen.
    console.error("Konnte Einträge nicht lesen:", fehler);
    return [];
  }
}

function persistEntries() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function loadDailySummaries() {
  const raw = localStorage.getItem(STORAGE_KEY_SUMMARIES);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (fehler) {
    console.error("Konnte Tagesabrechnungen nicht lesen:", fehler);
    return {};
  }
}

function persistDailySummaries() {
  localStorage.setItem(STORAGE_KEY_SUMMARIES, JSON.stringify(dailySummaries));
}

function loadEingezahltGesamt() {
  const raw = localStorage.getItem(STORAGE_KEY_EINGEZAHLT);
  if (!raw) return 0;
  try {
    const zahl = JSON.parse(raw);
    return typeof zahl === "number" && zahl >= 0 ? zahl : 0;
  } catch (fehler) {
    console.error("Konnte eingezahlten Gesamtbetrag nicht lesen:", fehler);
    return 0;
  }
}

function persistEingezahltGesamt() {
  localStorage.setItem(STORAGE_KEY_EINGEZAHLT, JSON.stringify(eingezahltGesamt));
}

// Wandelt rohe Badge-Einträge (aus localStorage oder einem Backup) ins
// aktuelle Format {id, freigeschaltetAm} um - akzeptiert dabei auch das
// alte Format (reine ID-Strings ohne Datum, aus v41 und früher) und
// ergänzt dafür "jetzt" als Ersatzwert, weil das echte Freischalt-Datum
// rückwirkend nicht mehr rekonstruierbar ist. Prüft absichtlich NICHT
// gegen BADGES - dieses const ist an dieser Stelle in der Datei noch nicht
// initialisiert, wenn loadBadges() ganz oben beim Start aufgerufen wird.
// Eine unbekannte ID bleibt dadurch einfach ein ungenutzter Eintrag
// (taucht in keiner BADGES.map()-Ausgabe auf), richtet aber keinen Schaden an.
function normalisiereBadges(roh) {
  if (!Array.isArray(roh)) return [];
  return roh
    .map((eintrag) => {
      if (typeof eintrag === "string" && eintrag) {
        return { id: eintrag, freigeschaltetAm: new Date().toISOString() };
      }
      if (eintrag && typeof eintrag.id === "string" && eintrag.id) {
        return {
          id: eintrag.id,
          freigeschaltetAm: typeof eintrag.freigeschaltetAm === "string" ? eintrag.freigeschaltetAm : new Date().toISOString(),
        };
      }
      return null;
    })
    .filter(Boolean);
}

function loadBadges() {
  const raw = localStorage.getItem(STORAGE_KEY_BADGES);
  if (!raw) return [];
  try {
    return normalisiereBadges(JSON.parse(raw));
  } catch (fehler) {
    console.error("Konnte Abzeichen nicht lesen:", fehler);
    return [];
  }
}

function persistBadges() {
  localStorage.setItem(STORAGE_KEY_BADGES, JSON.stringify(freigeschalteteBadges));
}

function loadSparzielBetrag() {
  const raw = localStorage.getItem(STORAGE_KEY_ZIEL);
  if (!raw) return null;
  try {
    const zahl = JSON.parse(raw);
    // > 0 statt nur "ist eine Zahl", damit ein versehentlich gespeicherter
    // 0€-Wert genauso wie "kein Ziel" behandelt wird.
    return typeof zahl === "number" && zahl > 0 ? zahl : null;
  } catch (fehler) {
    console.error("Konnte Sparziel nicht lesen:", fehler);
    return null;
  }
}

function persistSparzielBetrag() {
  localStorage.setItem(STORAGE_KEY_ZIEL, JSON.stringify(sparzielBetrag));
}

function loadEinstellungen() {
  const raw = localStorage.getItem(STORAGE_KEY_EINSTELLUNGEN);
  if (!raw) return { ...EINSTELLUNGEN_DEFAULT };
  try {
    const gespeichert = JSON.parse(raw);
    // Mit den Defaults zusammenführen statt nur das Gespeicherte zu nehmen -
    // falls später neue Einstellungen dazukommen, haben ältere gespeicherte
    // Objekte die noch nicht und bekommen sonst automatisch den Default.
    return { ...EINSTELLUNGEN_DEFAULT, ...gespeichert };
  } catch (fehler) {
    console.error("Konnte Einstellungen nicht lesen:", fehler);
    return { ...EINSTELLUNGEN_DEFAULT };
  }
}

function persistEinstellungen() {
  localStorage.setItem(STORAGE_KEY_EINSTELLUNGEN, JSON.stringify(einstellungen));
}


// ============================================================================
// 2. Zahlenfeld-Logik (die "Prefix-Logik" aus der Aufgabenstellung)
//
// Grundidee: ein "buffer"-Text wird Zeichen für Zeichen aufgebaut.
// - Normale Ziffern (1-9, 0) hängen sich an den Text an.
// - Solange noch kein Komma im Text ist, bauen wir damit eine ganze
//   Euro-Zahl auf (z.B. "1" -> "12" -> "125").
// - Die ","-Taste setzt (falls noch keins da ist) ein Komma an den Text,
//   egal ob vorher schon Euro-Ziffern getippt wurden oder nicht
//   (z.B. "2" -> "2," oder "" -> "0,").
// - Sobald ein Komma im Text ist, sind die nächsten 1-2 Ziffern die
//   Cent-Nachkommastellen (z.B. "0," -> "0,1" -> "0,10").
//
// Diese Funktionen sind absichtlich "pure" (bekommen den aktuellen Text
// als Parameter rein, geben den neuen Text zurück, verändern nichts
// nebenbei) - dadurch können wir sie sowohl für das Haupt-Zahlenfeld als
// auch für das Zahlenfeld im Bearbeiten-Dialog wiederverwenden.
// ============================================================================

// "maxBetrag" ist optional und fällt standardmäßig auf die Einstellung
// zurück (Punkt 1 im Einstellungen-Screen, Default 9,99€, siehe
// EINSTELLUNGEN_DEFAULT) - das Sparziel und die Eingabe-Obergrenze selbst
// brauchen kein Limit und rufen applyDigit() mit Infinity auf, statt eine
// eigene Kopie der ganzen Funktion zu schreiben.
function applyDigit(text, ziffer, maxBetrag = einstellungen.maxBetrag) {
  let kandidat;

  if (text === "") {
    kandidat = ziffer;
  } else if (text.includes(",")) {
    const nachkommastellen = text.split(",")[1];
    // Mehr als 2 Nachkommastellen ergeben bei Geld keinen Sinn -> ignorieren.
    kandidat = nachkommastellen.length < 2 ? text + ziffer : text;
  } else {
    // Ganze-Euro-Modus: führende "0" wird durch die neue Ziffer ersetzt
    // (aus "0" + "5" wird "5", nicht "05").
    kandidat = text === "0" ? ziffer : text + ziffer;
  }

  const zahl = parseFloat(kandidat.replace(",", "."));
  if (!isNaN(zahl) && zahl > maxBetrag) {
    return text; // Grenze erreicht -> Ziffer wird ignoriert, Text bleibt wie er war
  }
  return kandidat;
}

// Setzt ein Komma an den Text - wie bei einem Taschenrechner. Ist schon
// eins da, passiert nichts (kein zweites Komma möglich). Auch eine reine
// "pure" Funktion, genau wie applyDigit(), aus demselben Grund wiederverwendbar.
function insertComma(text) {
  if (text.includes(",")) return text;
  return (text === "" ? "0" : text) + ",";
}

// Wandelt einen buffer-Text ("12" oder "0,10") in eine echte Zahl (12 oder
// 0.1) um. Gibt null zurück, wenn (noch) nichts Sinnvolles eingegeben wurde.
function bufferToAmount(text) {
  if (text === "" || text === "0," || text === "0,0") return null;
  const zahl = parseFloat(text.replace(",", "."));
  if (isNaN(zahl) || zahl <= 0) return null;
  return zahl;
}

// Der umgekehrte Weg: aus einer Zahl (12.5) wieder einen buffer-Text machen
// ("12,50"). Wird gebraucht, um den Bearbeiten-Dialog mit dem bisherigen
// Betrag vorzubefüllen.
function amountToBuffer(zahl) {
  return zahl.toFixed(2).replace(".", ",");
}


// ============================================================================
// 3. Haupt-Eingabe: Zahlenfeld auf dem Eintrags-Screen
// ============================================================================

function digitPressed(ziffer) {
  buffer = applyDigit(buffer, ziffer);
  updateDisplay();
}

function startSingleCent() {
  // Taste "0,0" - Abkürzung für Einer-Cent, z.B. "0,0" + "1" -> "0,01"
  buffer = "0,0";
  updateDisplay();
}

function commaPressed() {
  // Taste "," - setzt ein Komma, egal was vorher schon getippt wurde,
  // z.B. "2" + "," + "1" + "0" -> "2,10"
  buffer = insertComma(buffer);
  updateDisplay();
}

function deletePressed() {
  buffer = buffer.slice(0, -1);
  updateDisplay();
}

function clearBuffer() {
  buffer = "";
  updateDisplay();
}

function updateDisplay() {
  const anzeige = document.getElementById("display");
  anzeige.textContent = (buffer === "" ? "0" : buffer) + " €";
}

// Kurzes visuelles Feedback (Wackeln + rot), wenn eine Aktion nicht geklappt
// hat - z.B. "Speichern" bei leerem Betrag. Kein Text-Popup, nur ein Hinweis,
// dass gerade etwas ignoriert wurde statt dass die App "eingefroren" wirkt.
function flashInvalid(elementId) {
  const anzeige = document.getElementById(elementId);
  // Falls die Animation gerade schon läuft (schnelles Doppel-Tippen): erst
  // zurücksetzen und einen Reflow erzwingen, sonst startet sie nicht neu.
  anzeige.classList.remove("display--invalid");
  void anzeige.offsetWidth;
  anzeige.classList.add("display--invalid");
  anzeige.addEventListener(
    "animationend",
    () => anzeige.classList.remove("display--invalid"),
    { once: true }
  );
}

function saveEntry() {
  const betrag = bufferToAmount(buffer);
  if (betrag === null) {
    // Nichts (Sinnvolles) eingegeben -> kurz wackeln statt einfach nichts zu tun.
    flashInvalid("display");
    return;
  }

  entries.unshift({
    id: Date.now(),
    amount: betrag,
    timestamp: new Date().toISOString(),
  });

  persistEntries();
  clearBuffer();
  renderEntries();
  renderDayTotal();
}

function deleteEntry(id) {
  entries = entries.filter((eintrag) => eintrag.id !== id);
  persistEntries();
  renderEntries();
  renderDayTotal();
}

function updateEntry(id, betrag, timestamp) {
  const eintrag = entries.find((e) => e.id === id);
  if (!eintrag) return;
  eintrag.amount = betrag;
  eintrag.timestamp = timestamp;
  // Da sich die Uhrzeit geändert haben kann, muss die Liste neu nach
  // "neueste zuerst" sortiert werden - sonst bleibt der Eintrag an seiner
  // alten Position stehen (siehe Kommentar bei renderEntryList).
  entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  persistEntries();
  renderEntries();
  renderDayTotal();
}


// ============================================================================
// 4. Liste der letzten Einträge anzeigen
// ============================================================================

function formatAmount(zahl) {
  return zahl.toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + " €";
}

// Kompakte Variante ohne Nachkommastellen, nur für die schmalen
// Y-Achsen-Labels der Wachstumskurve - Cent-Genauigkeit ist für eine
// Achsenskala nicht nötig und würde den Platz sprengen.
function formatAmountKompakt(zahl) {
  return Math.round(zahl).toLocaleString("de-DE") + " €";
}

function formatTime(isoString) {
  return new Date(isoString).toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Füllt eine <ul class="entries__list"> mit den neuesten unabgerechneten
// Einträgen (entries ist bereits neueste-zuerst sortiert, weil saveEntry()
// mit unshift() vorne einfügt). Gemeinsam genutzt von der vollen Liste auf
// dem Eintrag-Screen und der kompakten Vorschau auf der Übersichtsseite -
// gleiches Markup/Klick-Verhalten (öffnet den Bearbeiten-Dialog), nur mit
// unterschiedlichem Limit.
function renderEntryList(listeId, leerHinweisId, limit) {
  const liste = document.getElementById(listeId);
  const leerHinweis = document.getElementById(leerHinweisId);

  const letzteEintraege = entries.filter((eintrag) => !eintrag.settled).slice(0, limit);

  liste.innerHTML = "";
  leerHinweis.style.display = letzteEintraege.length === 0 ? "block" : "none";

  for (const eintrag of letzteEintraege) {
    const li = document.createElement("li");
    li.className = "entry";
    li.dataset.id = eintrag.id;
    li.innerHTML = `
      <div>
        <div class="entry__amount">${formatAmount(eintrag.amount)}</div>
        <div class="entry__time">${formatTime(eintrag.timestamp)}</div>
      </div>
      <span class="entry__hint">›</span>
    `;
    liste.appendChild(li);
  }

  // Der ganze Eintrag ist antippbar und öffnet den Bearbeiten-Dialog
  // (Löschen passiert dort drin, nicht mehr über einen extra Button in der Liste).
  liste.querySelectorAll(".entry").forEach((li) => {
    li.addEventListener("click", () => openEditDialog(Number(li.dataset.id)));
  });
}

function renderEntries() {
  renderEntryList("entries-list", "entries-empty", 10);
  renderHomeRecent();
}

// Kompakte Vorschau auf der Übersichtsseite (Punkt 5) - bewusst nur 4
// Einträge, keine Kopie der vollen Liste vom Eintrag-Screen.
function renderHomeRecent() {
  renderEntryList("home-recent-list", "home-recent-empty", 4);
}


// ============================================================================
// 5. Tagessumme berechnen
// ============================================================================

function isToday(isoString) {
  const datum = new Date(isoString);
  const heute = new Date();
  return (
    datum.getFullYear() === heute.getFullYear() &&
    datum.getMonth() === heute.getMonth() &&
    datum.getDate() === heute.getDate()
  );
}

function calcDayTotal() {
  // Bereits abgerechnete Einträge (settled: true) zählen nicht mehr mit -
  // die stecken schon in einer früheren Tagesabrechnung (Abschnitt 7).
  return entries
    .filter((eintrag) => isToday(eintrag.timestamp) && !eintrag.settled)
    .reduce((gesamt, eintrag) => gesamt + eintrag.amount, 0);
}

function renderDayTotal() {
  document.getElementById("day-total-value").textContent = formatAmount(calcDayTotal());
}


// ============================================================================
// 6. Bearbeiten-Dialog
//
// Eigener kleiner "buffer" (editBuffer), der genauso funktioniert wie der
// vom Haupt-Zahlenfeld - nur eben für den Dialog. editingEntryId merkt sich,
// welcher Eintrag gerade bearbeitet wird.
// ============================================================================

let editBuffer = "";
let editingEntryId = null;

function updateEditDisplay() {
  const anzeige = document.getElementById("edit-display");
  anzeige.textContent = (editBuffer === "" ? "0" : editBuffer) + " €";
}

// Wandelt einen ISO-Zeitstempel in den Wert um, den <input type="time">
// erwartet, z.B. "14:07".
function toTimeInputValue(isoString) {
  const datum = new Date(isoString);
  const stunden = String(datum.getHours()).padStart(2, "0");
  const minuten = String(datum.getMinutes()).padStart(2, "0");
  return `${stunden}:${minuten}`;
}

function openEditDialog(id) {
  const eintrag = entries.find((e) => e.id === id);
  if (!eintrag) return;

  editingEntryId = id;
  editBuffer = amountToBuffer(eintrag.amount);
  updateEditDisplay();
  document.getElementById("edit-time").value = toTimeInputValue(eintrag.timestamp);
  document.getElementById("edit-overlay").hidden = false;
}

function closeEditDialog() {
  document.getElementById("edit-overlay").hidden = true;
  editingEntryId = null;
}

function saveEditedEntry() {
  if (editingEntryId === null) return;

  const betrag = bufferToAmount(editBuffer);
  if (betrag === null) {
    flashInvalid("edit-display");
    return;
  }

  const eintrag = entries.find((e) => e.id === editingEntryId);
  if (!eintrag) return;

  // Nur die Uhrzeit ändert sich, das Datum bleibt (alles spielt sich am
  // selben Tag ab, ein Datumsfeld gibt es bewusst nicht).
  const [stunden, minuten] = document.getElementById("edit-time").value.split(":").map(Number);
  const neueZeit = new Date(eintrag.timestamp);
  neueZeit.setHours(stunden, minuten, 0, 0);

  updateEntry(editingEntryId, betrag, neueZeit.toISOString());
  closeEditDialog();
}

function deleteEditedEntry() {
  if (editingEntryId === null) return;
  deleteEntry(editingEntryId);
  closeEditDialog();
}

function initEditDialog() {
  const keypad = document.getElementById("edit-keypad");

  keypad.querySelectorAll(".key[data-digit]").forEach((button) => {
    button.addEventListener("click", () => {
      editBuffer = applyDigit(editBuffer, button.dataset.digit);
      updateEditDisplay();
    });
  });

  document.getElementById("edit-key-comma").addEventListener("click", () => {
    editBuffer = insertComma(editBuffer);
    updateEditDisplay();
  });
  document.getElementById("edit-key-single-cent").addEventListener("click", () => {
    editBuffer = "0,0";
    updateEditDisplay();
  });
  document.getElementById("edit-key-delete-digit").addEventListener("click", () => {
    editBuffer = editBuffer.slice(0, -1);
    updateEditDisplay();
  });

  document.getElementById("edit-save-entry").addEventListener("click", saveEditedEntry);
  document.getElementById("edit-delete-entry").addEventListener("click", deleteEditedEntry);
  document.getElementById("edit-cancel").addEventListener("click", closeEditDialog);

  // Auf den dunklen Hintergrund tippen schließt den Dialog auch (nicht auf
  // die Karte selbst - deshalb der Vergleich mit event.target).
  const overlay = document.getElementById("edit-overlay");
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeEditDialog();
  });
}


// ============================================================================
// 7. Schicht-Abrechnung (Becher-Logik) + Sparrücklage
//
// Konzept: Während der Schicht wird ganz normal über das Haupt-Zahlenfeld
// eingetragen. Am Ende der Schicht sagt der Nutzer im Abrechnungs-Dialog,
// wie viel er aus dem Becher entnommen hat (volle Scheine) - der Rest gilt
// automatisch als "im Becher gelassen" (Kleingeld). Das wird pro Tag in
// dailySummaries gespeichert (Feld "paidOut" - historischer Name, siehe
// unten).
//
// Beim Speichern werden alle heutigen, noch nicht abgerechneten Einträge
// als "settled" markiert (Abschnitt 3/4/5) und dailySummaries[heute] wird
// AUFADDIERT statt überschrieben - so kann man mehrmals am selben Tag
// abrechnen (z.B. nach einer zweiten Schicht), ohne dass frühere Beträge
// verloren gehen.
//
// Die Sparrücklage (savings_total) und der aktuelle Becher-Bestand
// speichern wir NICHT als eigene Zahlen, sondern berechnen sie aus der
// Summe aller "paidOut"- bzw. "im Becher"-Werte in dailySummaries. So
// können die Zahlen nie auseinanderlaufen.
//
// WICHTIG (v1.0.0): Das Feld "paidOut" heißt aus historischen Gründen so,
// bedeutet aber NICHT mehr "schon auf der Bank eingezahlt" - das Geld
// wandert beim Schicht-Abschluss nur aus dem Becher in den Geldbeutel und
// gilt ab dann als "Ausstehend" (calcAusstehend()). Erst die explizite
// Aktion "Einzahlung erfassen" (siehe eingezahltGesamt weiter unten) markiert
// einen Teil davon als wirklich am Bankautomaten eingezahlt. Die
// Sparrücklage (calcSavingsTotal()) bleibt dabei rechnerisch unverändert -
// sie ist weiterhin einfach Ausstehend + eingezahltGesamt.
// ============================================================================

function todayDateKey() {
  return dateKey(new Date());
}

function dateKey(datum) {
  const jahr = datum.getFullYear();
  const monat = String(datum.getMonth() + 1).padStart(2, "0");
  const tag = String(datum.getDate()).padStart(2, "0");
  return `${jahr}-${monat}-${tag}`;
}

function round2(zahl) {
  return Math.round(zahl * 100) / 100;
}

function calcSavingsTotal() {
  return Object.values(dailySummaries).reduce((summe, tag) => summe + tag.paidOut, 0);
}

// Der Teil der Sparrücklage, der zwar schon aus dem Becher entnommen, aber
// noch nicht am Bankautomaten eingezahlt wurde - siehe Erklärung oben.
// eingezahltGesamt wächst NUR über saveDeposit() (Abschnitt "Einzahlung
// erfassen" weiter unten), unabhängig davon, aus welcher Schicht das Geld
// stammt.
function calcAusstehend() {
  return round2(calcSavingsTotal() - eingezahltGesamt);
}

// Summe aller inCup-Werte aus den Tagesabrechnungen - OHNE die manuelle
// Korrektur (Punkt 4 im Einstellungen-Screen). Eigene kleine Funktion, weil
// sowohl calcBecherBestand() als auch das Setzen einer neuen Korrektur
// (settings-becher-apply, Abschnitt Einstellungen) genau diese Rohsumme
// brauchen.
function calcBecherBestandOhneKorrektur() {
  return Object.values(dailySummaries).reduce((summe, tag) => summe + tag.inCup, 0);
}

// Wie viel Kleingeld aktuell insgesamt im Becher liegt: Summe aller
// inCup-Werte PLUS die manuelle Korrektur. Die Korrektur existiert, weil
// der Nutzer den echten Becher außerhalb der App leeren/nachzählen kann -
// siehe "Becherbestand korrigieren" im Einstellungen-Screen für das Setzen
// der Korrektur als Differenz statt eines Überschreibens.
function calcBecherBestand() {
  return round2(calcBecherBestandOhneKorrektur() + einstellungen.becherKorrektur);
}

// Automatische Aufteilung beim Öffnen: so viel wie möglich in vollen
// Scheinen (Rundungsgröße aus den Einstellungen, Default 5€) aus dem Becher
// entnehmen (-> wird "Ausstehend"), der Rest (Münzen, krumme Beträge)
// bleibt im Becher.
// Beispiel: 22,35 € Topf, Rundung 5€ -> 20 € entnehmen, 2,35 € im Becher.
// "Topf" ist NICHT nur die aktuelle Schicht, sondern Schicht + bisheriger
// Becherbestand zusammen (siehe openShiftDialog) - so ergeben sich über
// mehrere Schichten hinweg wieder volle Scheine, statt dass sich Kleingeld
// im Becher anhäuft, weil jede Schicht für sich isoliert betrachtet wird.
function calcAutoSplit(topf) {
  const rundung = einstellungen.rundung;
  const ausstehend = Math.floor(topf / rundung) * rundung;
  return { ausstehend, imBecher: round2(topf - ausstehend) };
}

// Aktualisiert die Bestätigungs-Zeile "20,00 € + 2,35 € = 22,35 €"
function updateSplitCheck(ausstehend, imBecher, topf) {
  document.getElementById("split-check").innerHTML =
    `${formatAmount(ausstehend)} + ${formatAmount(imBecher)} = <strong>${formatAmount(topf)}</strong>`;
}

// Der "Im Becher"-Wert IST der neue Becherbestand nach dieser Abrechnung
// (Topf minus Ausstehend) - die Zusammenfassungszeile über dem Speichern-
// Button bekommt diesen Wert live mit.
function updateNeuerBecherbestand(imBecher) {
  document.getElementById("shift-neuer-becher-summary").textContent =
    `Neuer Becherbestand: ${formatAmount(imBecher)}`;
}

function openShiftDialog() {
  const heutigesSchichtTotal = calcDayTotal();
  const vorherigerBecherbestand = calcBecherBestand();
  const gesamtTopf = round2(vorherigerBecherbestand + heutigesSchichtTotal);
  const { ausstehend, imBecher } = calcAutoSplit(gesamtTopf);

  document.getElementById("shift-bisher-becher-value").textContent = formatAmount(vorherigerBecherbestand);
  document.getElementById("shift-schicht-value").textContent = formatAmount(heutigesSchichtTotal);
  document.getElementById("shift-gesamt-value").textContent = formatAmount(gesamtTopf);
  updateNeuerBecherbestand(imBecher);

  document.getElementById("shift-ausstehend").value = ausstehend.toFixed(2);
  document.getElementById("shift-in-cup").value = imBecher.toFixed(2);
  updateSplitCheck(ausstehend, imBecher, gesamtTopf);

  switchScreen("schicht");
}

function saveShiftSummary() {
  const heutigesSchichtTotal = calcDayTotal();
  const vorherigerBecherbestand = calcBecherBestand();
  const gesamtTopf = round2(vorherigerBecherbestand + heutigesSchichtTotal);

  const ausstehendRoh = parseFloat(document.getElementById("shift-ausstehend").value);
  const imBecherRoh = parseFloat(document.getElementById("shift-in-cup").value);

  // Beide Felder müssen gültige, nicht-negative Zahlen sein, die in Summe
  // exakt dem Gesamttopf entsprechen (kleine Rundungstoleranz) - sonst
  // Speichern verhindern statt eine inhaltlich unplausible Aufteilung zu
  // übernehmen (z.B. negativer "Im Becher"-Wert -> negativer Becherbestand).
  // min="0" auf den <input>-Feldern reicht allein nicht, weil mobile
  // Browser das Tippen eines "-" trotzdem erlauben.
  const TOLERANZ = 0.01;
  const eingabeGueltig =
    !isNaN(ausstehendRoh) && !isNaN(imBecherRoh) &&
    ausstehendRoh >= 0 && imBecherRoh >= 0 &&
    Math.abs(ausstehendRoh + imBecherRoh - gesamtTopf) <= TOLERANZ;

  if (!eingabeGueltig) {
    flashInvalid("split-check");
    return;
  }

  const ausstehend = round2(ausstehendRoh);

  // Wie viel von DIESER Schicht im Becher verbleibt. Das kann negativ sein,
  // wenn mehr entnommen wurde, als die Schicht allein hergibt - dann kam
  // der Rest aus dem alten Becherbestand. Genau deshalb wird das zum
  // bestehenden Tageseintrag ADDIERT statt gleichgesetzt: nur so ergibt
  // calcBecherBestand() (Summe aller inCup-Werte) am Ende wieder exakt
  // neuerBecherbestand.
  const inCupDelta = round2(heutigesSchichtTotal - ausstehend);

  // Alle heutigen, noch nicht abgerechneten Einträge gehören jetzt zu dieser
  // Abrechnung -> als "erledigt" markieren. Dadurch verschwinden sie aus der
  // Einträge-Liste und zählen nicht mehr in calcDayTotal() mit, tauchen also
  // nicht bei der nächsten Schicht-Abrechnung desselben Tages erneut auf.
  entries.forEach((eintrag) => {
    if (isToday(eintrag.timestamp) && !eintrag.settled) {
      eintrag.settled = true;
    }
  });

  // Wurde am selben Tag schon einmal abgerechnet, addieren wir die neuen
  // Werte zum bestehenden Tageseintrag, statt ihn zu überschreiben - sonst
  // wären die Sparrücklagen-Beträge der ersten Abrechnung verloren.
  // "paidOut" heißt aus historischen Gründen so, ist aber ab jetzt Teil von
  // "Ausstehend" (siehe calcAusstehend()), nicht automatisch "eingezahlt".
  const heute = todayDateKey();
  const bisherigerEintrag = dailySummaries[heute] || { total: 0, paidOut: 0, inCup: 0 };
  dailySummaries[heute] = {
    total: round2(bisherigerEintrag.total + heutigesSchichtTotal),
    paidOut: round2(bisherigerEintrag.paidOut + ausstehend),
    inCup: round2(bisherigerEintrag.inCup + inCupDelta),
    closedAt: new Date().toISOString(),
  };

  persistEntries();
  persistDailySummaries();
  renderEntries();
  renderDayTotal();
  renderSavingsTotal();
  renderSavingsChart();
  renderGrowthChart();
  renderBecherBestand();
  renderSparziel();
  renderPendingCard();

  // Nach erfolgreicher Abrechnung direkt zeigen, wie sich die Sparrücklage
  // verändert hat - deshalb automatisch zum Sparziel-Tab wechseln.
  switchScreen("sparziel");
  checkBadges(); // NACH dem Screen-Wechsel, damit der Feiermoment über der Übersicht erscheint
}

function renderSavingsTotal() {
  document.getElementById("savings-total-value").textContent = formatAmount(calcSavingsTotal());
}

function renderBecherBestand() {
  document.getElementById("becher-bestand-value").textContent = formatAmount(calcBecherBestand());
}

// ============================================================================
// "Ausstehend" / "Eingezahlt (gesamt)" - siehe Erklärung im Abschnitts-
// Kommentar oben. Eigener kleiner Block, weil er konzeptionell unabhängig
// von einzelnen Schichten ist (kann Wochen nach der Schicht passieren).
// ============================================================================

function renderPendingCard() {
  const ausstehend = calcAusstehend();
  document.getElementById("pending-value").textContent = formatAmount(ausstehend);
  document.getElementById("deposited-value").textContent = formatAmount(eingezahltGesamt);
  document.getElementById("deposit-open-btn").disabled = ausstehend <= 0;
}

// Eigener kleiner "buffer" fürs Einzahlung-Zahlenfeld, wie zielBuffer/
// editBuffer. depositMax merkt sich den Ausstehend-Betrag beim Öffnen, damit
// applyDigit() das Tippen eines zu hohen Betrags von vornherein verhindert
// (Punkt 3 der Aufgabe: darf nicht größer als Ausstehend sein).
let depositBuffer = "";
let depositMax = 0;

function updateDepositDisplay() {
  document.getElementById("deposit-display").textContent = (depositBuffer === "" ? "0" : depositBuffer) + " €";
}

// Blendet die Zahlentastatur wieder aus und den "Betrag anpassen"-Link
// wieder ein - der Ausgangszustand bei jedem Öffnen des Screens (Punkt 2 der
// Aufgabe: Tastatur soll standardmäßig nicht im Weg stehen).
function resetDepositAdjust() {
  document.getElementById("deposit-keypad").hidden = true;
  document.getElementById("deposit-adjust-toggle").hidden = false;
}

function openDepositDialog() {
  depositMax = calcAusstehend();
  if (depositMax <= 0) return; // Button ist ohnehin deaktiviert (renderPendingCard) - doppelte Absicherung
  depositBuffer = amountToBuffer(depositMax);
  updateDepositDisplay();
  resetDepositAdjust();
  switchScreen("einzahlung");
}

function closeDepositDialog() {
  switchScreen("sparziel");
}

function saveDeposit() {
  const betrag = bufferToAmount(depositBuffer);
  // Zusätzlich zur depositMax-Deckelung beim Tippen (siehe initDepositDialog)
  // hier nochmal geprüft - falls sich depositMax seit dem Öffnen geändert
  // haben sollte, wird nie mehr als das aktuelle Ausstehend abgezogen.
  const aktuellesAusstehend = calcAusstehend();
  if (betrag === null || betrag > aktuellesAusstehend + 0.01) {
    flashInvalid("deposit-display");
    return;
  }

  eingezahltGesamt = round2(eingezahltGesamt + Math.min(betrag, aktuellesAusstehend));
  persistEingezahltGesamt();
  renderPendingCard();
  renderSparziel();
  closeDepositDialog();
  checkBadges(); // NACH dem Screen-Wechsel, damit der Feiermoment über der Übersicht erscheint
}

function initDepositDialog() {
  const keypad = document.getElementById("deposit-keypad");

  keypad.querySelectorAll(".key[data-digit]").forEach((button) => {
    button.addEventListener("click", () => {
      const vorher = depositBuffer;
      depositBuffer = applyDigit(depositBuffer, button.dataset.digit, depositMax);
      updateDepositDisplay();
      // applyDigit() gibt bei Überschreiten von depositMax den Text
      // unverändert zurück (siehe dort) - genau dann kurz wackeln, statt
      // die Eingabe wortlos zu ignorieren (gleiches Muster wie beim
      // Haupt-Zahlenfeld bei "Speichern" mit ungültigem Betrag).
      if (depositBuffer === vorher) {
        flashInvalid("deposit-display");
      }
    });
  });

  document.getElementById("deposit-key-comma").addEventListener("click", () => {
    depositBuffer = insertComma(depositBuffer);
    updateDepositDisplay();
  });
  document.getElementById("deposit-key-single-cent").addEventListener("click", () => {
    depositBuffer = "0,0";
    updateDepositDisplay();
  });
  document.getElementById("deposit-key-delete-digit").addEventListener("click", () => {
    depositBuffer = depositBuffer.slice(0, -1);
    updateDepositDisplay();
  });

  // Seltener Fall Teil-Einzahlung: blendet die Tastatur ein, die vorher
  // bewusst im Weg war (siehe Kommentar bei resetDepositAdjust). Einmal
  // eingeblendet bleibt sie es für diesen Öffnungs-Durchgang - der volle
  // Betrag steht ja schon im Feld, weiteres Ein-/Ausblenden bringt nichts.
  document.getElementById("deposit-adjust-toggle").addEventListener("click", () => {
    keypad.hidden = false;
    document.getElementById("deposit-adjust-toggle").hidden = true;
  });

  document.getElementById("deposit-save").addEventListener("click", saveDeposit);
  document.getElementById("deposit-cancel").addEventListener("click", closeDepositDialog);
  document.getElementById("deposit-open-btn").addEventListener("click", openDepositDialog);
}

// ============================================================================
// 8. Sparziel: Zielbetrag + Fortschritt
//
// Der Zielbetrag ist direkt auf dem Sparziel-Screen editierbar (noch kein
// eigener Einstellungen-Screen). Die Karte wird komplett neu gerendert
// (wie renderEntries()) statt einzelne Elemente ein- und
// auszublenden - je nach Zustand sieht sie ohnehin ganz unterschiedlich aus:
// kein Ziel gesetzt / Ziel mit Fortschritt / Ziel erreicht.
// ============================================================================

function renderSparziel() {
  const container = document.getElementById("goal-card");
  const sparruecklage = calcSavingsTotal();

  if (!sparzielBetrag) {
    container.innerHTML = `
      <div class="goal-card__header">
        <span class="goal-card__label">Sparziel</span>
      </div>
      <button class="goal-card__empty" id="goal-empty-cta">
        Noch kein Sparziel gesetzt – antippen, um eins festzulegen
      </button>
    `;
    document.getElementById("goal-empty-cta").addEventListener("click", openGoalDialog);
    return;
  }

  const erreicht = sparruecklage >= sparzielBetrag;
  // Math.min(100, ...) verhindert einen über 100% hinauslaufenden Balken,
  // wenn die Sparrücklage das Ziel überschreitet.
  const prozent = Math.min(100, Math.round((sparruecklage / sparzielBetrag) * 100));

  // Der Balken zeigt zwei Segmente statt einer Farbe: Eingezahlt (Teal, schon
  // wirklich am Automaten eingezahlt) und Ausstehend (Orange, noch im
  // Geldbeutel). Roh-Prozentsätze können in Summe über 100% liegen (Ziel
  // überschritten) - dann anteilig auf beide Segmente herunterskalieren,
  // statt nur eins zu kappen, damit das Verhältnis zwischen ihnen erhalten
  // bleibt (gleiches Prinzip wie das bestehende Math.min(100, ...) oben,
  // nur auf zwei Segmente verteilt).
  const ausstehend = calcAusstehend();
  const rohEingezahltProzent = (eingezahltGesamt / sparzielBetrag) * 100;
  const rohAusstehendProzent = (ausstehend / sparzielBetrag) * 100;
  const rohGesamtProzent = rohEingezahltProzent + rohAusstehendProzent;
  const skalierung = rohGesamtProzent > 100 ? 100 / rohGesamtProzent : 1;
  const eingezahltProzent = Math.round(rohEingezahltProzent * skalierung);
  const ausstehendProzent = Math.round(rohAusstehendProzent * skalierung);

  // Konsistenz-Pass (Punkt 2): der aktuelle Sparrücklage-Betrag steht schon
  // groß in der Verlauf-Karte weiter unten - hier deshalb bewusst NICHT
  // nochmal "X € von Y €" (identischer Betrag, nur wiederholt), sondern die
  // Restdistanz zum Ziel. Bei erreichtem Ziel wäre "Noch 0,00 €" seltsam,
  // deshalb dort stattdessen ein kurzer Bestätigungstext (die ausführliche
  // Feier steht schon in .goal-card__celebrate darunter).
  const rest = round2(Math.max(0, sparzielBetrag - sparruecklage));
  const restText = erreicht ? "Ziel erreicht" : `Noch ${formatAmount(rest)} bis zum Ziel`;

  container.innerHTML = `
    <div class="goal-card__header">
      <span class="goal-card__label">Sparziel</span>
      <button class="goal-card__edit" id="goal-edit-btn">✏️ ${formatAmount(sparzielBetrag)}</button>
    </div>
    <div class="goal-card__bar-track${erreicht ? " goal-card__bar-track--erreicht" : ""}">
      <div class="goal-card__bar-fill goal-card__bar-fill--eingezahlt" style="width: ${eingezahltProzent}%"></div>
      <div class="goal-card__bar-fill goal-card__bar-fill--ausstehend" style="width: ${ausstehendProzent}%"></div>
    </div>
    <div class="goal-card__meta">
      <span>${restText}</span>
      <span>${prozent}%</span>
    </div>
    <div class="goal-card__legend">
      <span class="goal-card__legend-item goal-card__legend-item--eingezahlt">Eingezahlt ${formatAmount(eingezahltGesamt)}</span>
      <span class="goal-card__legend-item goal-card__legend-item--ausstehend">Ausstehend ${formatAmount(ausstehend)}</span>
    </div>
    ${erreicht ? `<p class="goal-card__celebrate">Ziel erreicht! 🎉</p>` : ""}
  `;
  document.getElementById("goal-edit-btn").addEventListener("click", openGoalDialog);
}

// Punkt 1 der Übersichtsseite: Begrüßung passend zur Tageszeit. Der
// Untertext bleibt bewusst statisch (siehe HTML) statt ein zweites,
// eigenes Zufalls-System neben MOTIVATIONSSPRUECHE einzuführen.
function renderHomeGreeting() {
  const stunde = new Date().getHours();
  let gruss;
  if (stunde >= 5 && stunde < 12) {
    gruss = "Guten Morgen!";
  } else if (stunde >= 12 && stunde < 18) {
    gruss = "Guten Tag!";
  } else {
    gruss = "Guten Abend!";
  }
  document.getElementById("home-greeting-title").textContent = gruss;
}

// Eigener kleiner "buffer" fürs Sparziel-Zahlenfeld - genau wie buffer/
// editBuffer, nur ohne MAX_BETRAG-Deckel (siehe applyDigit()-Aufruf unten).
let zielBuffer = "";

function updateGoalDisplay() {
  const anzeige = document.getElementById("goal-display");
  anzeige.textContent = (zielBuffer === "" ? "0" : zielBuffer) + " €";
}

function openGoalDialog() {
  zielBuffer = sparzielBetrag ? amountToBuffer(sparzielBetrag) : "";
  updateGoalDisplay();
  document.getElementById("goal-overlay").hidden = false;
}

function closeGoalDialog() {
  document.getElementById("goal-overlay").hidden = true;
}

function saveGoal() {
  const betrag = bufferToAmount(zielBuffer);
  if (betrag === null) {
    flashInvalid("goal-display");
    return;
  }
  sparzielBetrag = betrag;
  persistSparzielBetrag();
  renderSparziel();
  closeGoalDialog();
}

function removeGoal() {
  sparzielBetrag = null;
  persistSparzielBetrag();
  renderSparziel();
  closeGoalDialog();
}

function initGoalDialog() {
  const keypad = document.getElementById("goal-keypad");

  // Infinity statt MAX_BETRAG: ein Sparziel darf (anders als ein einzelnes
  // Trinkgeld) beliebig hoch sein.
  keypad.querySelectorAll(".key[data-digit]").forEach((button) => {
    button.addEventListener("click", () => {
      zielBuffer = applyDigit(zielBuffer, button.dataset.digit, Infinity);
      updateGoalDisplay();
    });
  });

  document.getElementById("goal-key-comma").addEventListener("click", () => {
    zielBuffer = insertComma(zielBuffer);
    updateGoalDisplay();
  });
  document.getElementById("goal-key-single-cent").addEventListener("click", () => {
    zielBuffer = "0,0";
    updateGoalDisplay();
  });
  document.getElementById("goal-key-delete-digit").addEventListener("click", () => {
    zielBuffer = zielBuffer.slice(0, -1);
    updateGoalDisplay();
  });

  document.getElementById("goal-save").addEventListener("click", saveGoal);
  document.getElementById("goal-remove").addEventListener("click", removeGoal);
  document.getElementById("goal-cancel").addEventListener("click", closeGoalDialog);

  const overlay = document.getElementById("goal-overlay");
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeGoalDialog();
  });
}

// Wochentags-Kürzel/-Namen, indiziert wie Date.getDay() (0 = Sonntag).
const WOCHENTAGS_KUERZEL = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const WOCHENTAGE_VOLL = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

// Kleines Balkendiagramm: ein Balken pro Tag der letzten 7 Tage, Höhe
// zeigt, wie viel an dem Tag zur Sparrücklage dazukam (paidOut, 0 wenn der
// Tag noch nicht abgerechnet wurde), mit Wochentags-Kürzel darunter.
function renderSavingsChart() {
  const container = document.getElementById("savings-chart");
  container.innerHTML = "";

  const tage = [];
  for (let tageZurueck = 6; tageZurueck >= 0; tageZurueck--) {
    const tag = new Date();
    tag.setDate(tag.getDate() - tageZurueck);
    const eintrag = dailySummaries[dateKey(tag)];
    tage.push({ datum: tag, wert: eintrag ? eintrag.paidOut : 0 });
  }

  const maxWert = Math.max(...tage.map((t) => t.wert), 1); // min. 1, sonst Division durch 0
  for (const { datum, wert } of tage) {
    const spalte = document.createElement("div");
    spalte.className = "savings-chart__col";

    const track = document.createElement("div");
    track.className = "savings-chart__bar-track";
    const balken = document.createElement("div");
    balken.className = "savings-chart__bar";
    balken.style.height = `${Math.max(4, (wert / maxWert) * 100)}%`;
    track.appendChild(balken);

    const label = document.createElement("span");
    label.className = "savings-chart__day-label";
    label.textContent = WOCHENTAGS_KUERZEL[datum.getDay()];

    spalte.appendChild(track);
    spalte.appendChild(label);
    container.appendChild(spalte);
  }

  renderWeekStats();
}

// Zwei Stat-Karten unter dem Diagramm (angelehnt an Homescreen-V4-Mockup):
//   "Diese Woche" - Summe der letzten 7 Tage vs. der 7 Tage davor.
//   "Stärkster Tag" - NICHT der beste Einzeltag, sondern der Wochentag
//   (Mo-So), der über alle bisherigen Vorkommen hinweg im Schnitt am
//   meisten einbringt (paidOut). Beispiel: "Freitag, Ø +18,40 €", weil an
//   allen bisherigen Freitagen im Schnitt am meisten abgerechnet wurde.
function renderWeekStats() {
  renderWeekComparison();
  renderStrongestWeekday();
}

function summeLetzteNTage(startTageZurueck, anzahlTage) {
  let summe = 0;
  for (let i = startTageZurueck; i < startTageZurueck + anzahlTage; i++) {
    const tag = new Date();
    tag.setDate(tag.getDate() - i);
    const eintrag = dailySummaries[dateKey(tag)];
    summe += eintrag ? eintrag.paidOut : 0;
  }
  return summe;
}

function renderWeekComparison() {
  const diffEl = document.getElementById("week-stat-diff");

  const dieseWoche = summeLetzteNTage(0, 7);
  const vorwoche = summeLetzteNTage(7, 7);
  const diff = round2(dieseWoche - vorwoche);

  diffEl.textContent = `${diff >= 0 ? "+" : "-"}${formatAmount(Math.abs(diff))}`;
  diffEl.classList.toggle("week-stat-card__value--negative", diff < 0);
}

function renderStrongestWeekday() {
  const dayEl = document.getElementById("week-stat-day");
  const avgEl = document.getElementById("week-stat-day-avg");

  // Pro Wochentag (0=So...6=Sa) Summe + Anzahl aller bisherigen
  // Abrechnungen sammeln, daraus den Durchschnitt bilden.
  const summen = [0, 0, 0, 0, 0, 0, 0];
  const anzahl = [0, 0, 0, 0, 0, 0, 0];
  for (const [datumsSchluessel, eintrag] of Object.entries(dailySummaries)) {
    const [jahr, monat, tag] = datumsSchluessel.split("-").map(Number);
    const wochentag = new Date(jahr, monat - 1, tag).getDay();
    summen[wochentag] += eintrag.paidOut;
    anzahl[wochentag] += 1;
  }

  let bestIndex = -1;
  let bestDurchschnitt = -Infinity;
  for (let i = 0; i < 7; i++) {
    if (anzahl[i] === 0) continue;
    const durchschnitt = summen[i] / anzahl[i];
    if (durchschnitt > bestDurchschnitt) {
      bestDurchschnitt = durchschnitt;
      bestIndex = i;
    }
  }

  if (bestIndex === -1) {
    dayEl.textContent = "–";
    avgEl.textContent = "Noch keine Daten";
    return;
  }

  dayEl.textContent = WOCHENTAGE_VOLL[bestIndex];
  avgEl.textContent = `Ø +${formatAmount(round2(bestDurchschnitt))}`;
}

// Wachstumskurve: kumulierte Sparrücklage über Zeit (30 Tage / 6 Monate /
// 1 Jahr), zusätzlich zum 7-Tage-Balken oben. Anders als der Balken (Zuwachs
// PRO Tag) zeigt diese Kurve den "Kontostand" - also die Summe aller
// bisherigen paidOut-Werte bis zu jedem Zeitpunkt, aufsteigend. Reines
// SVG-Polyline, keine neue Dependency, alles aus dailySummaries berechnet.
let growthChartRange = "30d";

// Summe aller paidOut-Werte bis (inklusive) zu einem Datumsschlüssel - der
// "Kontostand" der Sparrücklage an diesem Tag. String-Vergleich reicht, weil
// dateKey() immer "JJJJ-MM-TT" liefert (zero-padded, also auch chronologisch
// als Text sortierbar).
function calcSavingsCumulativeBis(datumsSchluessel) {
  let summe = 0;
  for (const [schluessel, tag] of Object.entries(dailySummaries)) {
    if (schluessel <= datumsSchluessel) summe += tag.paidOut;
  }
  return round2(summe);
}

// Liefert die Stichtage (älteste zuerst) für einen Zeitraum: ein Punkt pro
// Tag (30 Tage), Woche (6 Monate) oder Monat (1 Jahr) - so wirkt die Kurve
// bei keinem der drei Zeiträume überladen.
function growthChartStichtage(range) {
  const heute = new Date();
  const stichtage = [];

  if (range === "30d") {
    for (let i = 29; i >= 0; i--) {
      const tag = new Date(heute);
      tag.setDate(tag.getDate() - i);
      stichtage.push(tag);
    }
  } else if (range === "6m") {
    for (let i = 25; i >= 0; i--) {
      const tag = new Date(heute);
      tag.setDate(tag.getDate() - i * 7);
      stichtage.push(tag);
    }
  } else {
    // "1y": 12 Monatsenden - der aktuelle Monat endet dabei erst heute
    // (nicht am Monatsletzten, der sonst in der Zukunft läge).
    for (let i = 11; i >= 0; i--) {
      let monat = heute.getMonth() - i;
      let jahr = heute.getFullYear();
      while (monat < 0) {
        monat += 12;
        jahr -= 1;
      }
      let stichtag = new Date(jahr, monat + 1, 0); // Tag 0 des Folgemonats = letzter Tag dieses Monats
      if (stichtag > heute) stichtag = heute;
      stichtage.push(stichtag);
    }
  }

  return stichtage;
}

function formatGrowthChartLabel(datum, range) {
  if (range === "1y") {
    return datum.toLocaleDateString("de-DE", { month: "short", year: "2-digit" });
  }
  return datum.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

function renderGrowthChart() {
  const wrap = document.getElementById("growth-chart-wrap");

  // Leerzustand: noch nie eine Schicht abgerechnet -> keine Grundlage für
  // eine sinnvolle Kurve, statt einer leeren/kaputten Grafik ein Hinweistext.
  const alleSchluessel = Object.keys(dailySummaries).sort();
  if (alleSchluessel.length === 0) {
    wrap.innerHTML = `<p class="growth-chart__empty">Noch keine Daten für eine Wachstumskurve - schließe deine erste Schicht ab.</p>`;
    return;
  }

  const frueheste = alleSchluessel[0];

  // Nie weiter zurückgehen als der tatsächlich vorhandene Verlauf - sonst
  // würde z.B. bei "1 Jahr" kurz nach dem ersten Start ein Großteil der
  // Kurve nur einen flachen Nullstrich vor der eigentlichen ersten Nutzung
  // zeigen (kein Fake-Zeitraum).
  const stichtage = growthChartStichtage(growthChartRange).filter(
    (tag) => dateKey(tag) >= frueheste
  );

  // Nach dem Filtern könnte nur ein einzelner Punkt übrig sein (z.B. ganz
  // frische Nutzung + "1 Jahr" gewählt) - verdoppelt ihn zu einer kurzen
  // flachen Linie, damit trotzdem etwas Sichtbares gezeichnet wird.
  if (stichtage.length === 1) stichtage.unshift(stichtage[0]);

  const werte = stichtage.map((tag) => calcSavingsCumulativeBis(dateKey(tag)));

  // WICHTIG: Die Y-Achse zoomt auf den tatsächlichen Wertebereich DIESES
  // Zeitraums (Min/Max der sichtbaren Punkte), nicht von 0 aus - sonst
  // wirkt jedes Wachstum, das klein ist im Vergleich zur Gesamtsumme
  // (z.B. +300€ Zuwachs bei 3.200€ Bestand), optisch fast wie eine gerade
  // Linie, obwohl es relativ gesehen deutlich ist.
  const minWertRoh = Math.min(...werte);
  const maxWertRoh = Math.max(...werte);
  const spanne = maxWertRoh - minWertRoh;
  // 10% Polster oben/unten, damit die Linie nicht exakt am Rand klebt. Bei
  // einer komplett flachen Kurve (spanne === 0, z.B. noch kein Zuwachs in
  // diesem Zeitraum) gäbe es ohne Sonderfall nichts zum Polstern - dann
  // ein kleiner fester Puffer statt einer Division durch 0.
  const polster = spanne > 0 ? spanne * 0.1 : Math.max(5, maxWertRoh * 0.05);
  const yMin = minWertRoh - polster;
  const yMax = maxWertRoh + polster;
  const yRange = yMax - yMin;

  // Feste Koordinatenbox (0-300 x 0-100), per viewBox unabhängig von der
  // tatsächlichen Breite auf dem Bildschirm - CSS skaliert das SVG über
  // width:100%.
  const breite = 300;
  const hoehe = 100;
  const xSchritt = stichtage.length > 1 ? breite / (stichtage.length - 1) : 0;
  // y ist zugleich eine 0-100-Prozentangabe (hoehe === 100) - dadurch lässt
  // sie sich unten 1:1 als CSS "top: X%" für die Start-/End-Markierungen
  // wiederverwenden, ohne zweite Umrechnung.
  const yPos = (wert) => hoehe - ((wert - yMin) / yRange) * hoehe;

  const punkte = werte.map((wert, i) => ({ x: i * xSchritt, y: yPos(wert) }));
  const punkteAttr = punkte.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  // Fläche unter der Linie: gleiche Punkte, unten am Rand geschlossen - rein
  // optische Ergänzung (dezente Füllung), keine zusätzlichen Daten.
  const flaecheAttr = `0,${hoehe} ${punkteAttr} ${breite},${hoehe}`;

  const startWert = werte[0];
  const endWert = werte[werte.length - 1];
  const zuwachs = round2(endWert - startWert);
  // Gestrichelte Hilfslinie beim Startwert - macht den Zuwachs bis zum
  // Endpunkt der Linie optisch greifbar, ohne dass man die Achsenlabels
  // erst gedanklich subtrahieren muss.
  const startLinieY = yPos(startWert).toFixed(1);

  const ersterLabel = formatGrowthChartLabel(stichtage[0], growthChartRange);
  const letzterLabel = formatGrowthChartLabel(stichtage[stichtage.length - 1], growthChartRange);

  wrap.innerHTML = `
    <div class="growth-chart__plot">
      <div class="growth-chart__y-axis">
        <span class="growth-chart__y-label">${formatAmountKompakt(maxWertRoh)}</span>
        <span class="growth-chart__y-label">${formatAmountKompakt(minWertRoh)}</span>
      </div>
      <div class="growth-chart__svg-wrap">
        <svg class="growth-chart__svg" viewBox="0 0 ${breite} ${hoehe}" preserveAspectRatio="none" aria-hidden="true">
          <polygon class="growth-chart__area" points="${flaecheAttr}"></polygon>
          <line class="growth-chart__start-line" x1="0" y1="${startLinieY}" x2="${breite}" y2="${startLinieY}"></line>
          <polyline class="growth-chart__line" points="${punkteAttr}"></polyline>
        </svg>
        <div class="growth-chart__marker growth-chart__marker--start" style="top: ${yPos(startWert).toFixed(1)}%"></div>
        <div class="growth-chart__marker growth-chart__marker--end" style="top: ${yPos(endWert).toFixed(1)}%"></div>
      </div>
    </div>
    <div class="growth-chart__labels">
      <span>${ersterLabel}</span>
      <span>${letzterLabel}</span>
    </div>
    <p class="growth-chart__summary">
      Start: ${formatAmount(startWert)} · Zuwachs:
      <strong class="growth-chart__summary-delta">+${formatAmount(zuwachs)}</strong>
    </p>
  `;
}

function initGrowthChart() {
  document.querySelectorAll("#growth-range-group .choice-btn").forEach((button) => {
    button.addEventListener("click", () => {
      growthChartRange = button.dataset.range;
      document.querySelectorAll("#growth-range-group .choice-btn").forEach((b) =>
        b.classList.toggle("choice-btn--active", b === button)
      );
      renderGrowthChart();
    });
  });
}

// ============================================================================
// 8b. Meine Meilensteine (Abzeichen-Sammlung, Apple-Watch-Stil)
//
// Zwei Freischalt-Regeln:
//   - "starter": bei der ALLERERSTEN "Einzahlung erfassen"-Aktion, egal wie
//     hoch der Betrag war. eingezahltGesamt > 0 bildet das exakt ab - sowohl
//     live direkt nach saveDeposit() als auch rückwirkend für Bestandsnutzer
//     (siehe checkBadges()).
//   - Beträge (50 € bis 3.000 €): nach der Sparrücklage-GESAMTSUMME
//     (calcSavingsTotal() = Ausstehend + Eingezahlt), nicht nur nach dem
//     eingezahlten Teil - ein großer Schicht-Abschluss kann also allein
//     schon ein Betrags-Abzeichen freischalten, auch ohne Einzahlung.
//
// Da beide Bedingungen jederzeit aus calcSavingsTotal()/eingezahltGesamt neu
// berechnet werden können (beide wachsen nur, nie rückwärts), braucht es
// KEINE separate "erreicht am Datum X"-Logik - checkBadges() vergleicht bei
// jedem Aufruf einfach den aktuellen Stand gegen freigeschalteteBadges und
// schaltet frei, was fehlt. Das liefert die geforderte Rückwirkung für
// Bestandsnutzer kostenlos mit: nach dem Update reicht ein einziger
// checkBadges()-Aufruf beim Start, um alle längst verdienten Abzeichen
// nachzutragen (ohne Feiermoment, siehe init()).
// ============================================================================

const BADGES = [
  { id: "starter", schwelle: null, label: "Erste Einzahlung", beschreibung: "Deine erste Einzahlung am Automaten erfasst" },
  { id: "50", schwelle: 50, label: "50 €", beschreibung: "50 € Sparrücklage erreicht" },
  { id: "100", schwelle: 100, label: "100 €", beschreibung: "100 € Sparrücklage erreicht" },
  { id: "250", schwelle: 250, label: "250 €", beschreibung: "250 € Sparrücklage erreicht" },
  { id: "500", schwelle: 500, label: "500 €", beschreibung: "500 € Sparrücklage erreicht" },
  { id: "750", schwelle: 750, label: "750 €", beschreibung: "750 € Sparrücklage erreicht" },
  { id: "1000", schwelle: 1000, label: "1.000 €", beschreibung: "1.000 € Sparrücklage erreicht" },
  { id: "1500", schwelle: 1500, label: "1.500 €", beschreibung: "1.500 € Sparrücklage erreicht" },
  { id: "2000", schwelle: 2000, label: "2.000 €", beschreibung: "2.000 € Sparrücklage erreicht" },
  { id: "2500", schwelle: 2500, label: "2.500 €", beschreibung: "2.500 € Sparrücklage erreicht" },
  { id: "3000", schwelle: 3000, label: "3.000 €", beschreibung: "3.000 € Sparrücklage erreicht" },
];

function istBadgeErreicht(badge) {
  if (badge.id === "starter") return eingezahltGesamt > 0;
  return calcSavingsTotal() >= badge.schwelle;
}

// Kleine Helfer statt .includes()/.find() überall direkt zu wiederholen -
// freigeschalteteBadges besteht seit dem Abzeichen-Detail-Overlay aus
// {id, freigeschaltetAm}-Objekten (für die "Gravur" auf der Rückseite),
// nicht mehr aus reinen ID-Strings wie ursprünglich.
function istBadgeFreigeschaltet(id) {
  return freigeschalteteBadges.some((eintrag) => eintrag.id === id);
}

function holeBadgeFreischaltDatum(id) {
  const eintrag = freigeschalteteBadges.find((e) => e.id === id);
  return eintrag ? eintrag.freigeschaltetAm : null;
}

// Schaltet alle neu erreichten Abzeichen frei, speichert sie und rendert die
// Galerie neu. feiern=false unterdrückt den Feiermoment (App-Start, Backup-
// Import) - dort wäre ein Konfetti-Overlay für längst vergangene
// Erfolge irritierend statt erfreulich.
function checkBadges(feiern = true) {
  const neuFreigeschaltet = BADGES.filter(
    (badge) => !istBadgeFreigeschaltet(badge.id) && istBadgeErreicht(badge)
  );

  if (neuFreigeschaltet.length === 0) return;

  const jetzt = new Date().toISOString();
  freigeschalteteBadges.push(...neuFreigeschaltet.map((b) => ({ id: b.id, freigeschaltetAm: jetzt })));
  persistBadges();
  renderBadges();

  if (feiern) feierBadges(neuFreigeschaltet.map((b) => b.id));
}

function renderBadges() {
  const grid = document.getElementById("badges-grid");
  if (!grid) return; // Screen evtl. noch nicht im DOM (defensiv, wie sonst im Code üblich)

  // Konsistenz-Pass (Punkt 5): Wert zuerst, Label danach - wie
  // becher-card/pending-card, statt umgekehrt.
  const countEl = document.getElementById("badges-count");
  if (countEl) countEl.textContent = `${freigeschalteteBadges.length} / ${BADGES.length}`;

  grid.innerHTML = BADGES.map((badge) => {
    const frei = istBadgeFreigeschaltet(badge.id);
    // Gesperrt zeigt ein gemeinsames Schloss-Bild statt einer entsättigten
    // Vorschau des eigentlichen Abzeichens - der Inhalt bleibt bis zum
    // Freischalten eine Überraschung (icons/badge-locked.png).
    const bildId = frei ? badge.id : "locked";
    // Antippbar (öffnet das Detail-Overlay, siehe initBadgeDetail()) - ein
    // <div> statt <button>, gleiches Muster wie .entry (anklickbares <li>
    // ohne <button>-Reset-CSS), siehe touch-action-Regel weiter oben.
    return `
      <div class="badge-item${frei ? "" : " badge-item--locked"}" data-badge-id="${badge.id}">
        <img class="badge-item__img" src="icons/badge-${bildId}.png" alt="${frei ? badge.label : "Gesperrt"}" />
        <span class="badge-item__label">${badge.label}</span>
      </div>
    `;
  }).join("");
}

// Kleine Warteschlange statt direktem Anzeigen: schaltet ein großer
// Schicht-Abschluss oder Sparziel-Sprung mehrere Abzeichen auf einmal frei,
// werden sie nacheinander gefeiert statt sich zu überlappen.
let feierWarteschlange = [];
let feierTimeout = null;

function feierBadges(ids) {
  const warSchonAmLaufen = feierWarteschlange.length > 0;
  feierWarteschlange.push(...ids);
  if (!warSchonAmLaufen) naechsteFeier();
}

function naechsteFeier() {
  if (feierWarteschlange.length === 0) return;
  const id = feierWarteschlange.shift();
  const badge = BADGES.find((b) => b.id === id);
  if (!badge) {
    naechsteFeier();
    return;
  }

  const overlay = document.getElementById("badge-celebration");
  // Defensiv statt einfach zuzugreifen: ein fehlendes Overlay (z.B. durch
  // eine veraltete zwischengespeicherte Version der Seite) soll den
  // Feiermoment nur stumm ausfallen lassen, statt den kompletten
  // Freischalt-Ablauf (checkBadges() -> saveShiftSummary()/saveDeposit())
  // mit einem Fehler abzubrechen.
  if (!overlay) return;

  document.getElementById("badge-celebration-img").src = `icons/badge-${badge.id}.png`;
  document.getElementById("badge-celebration-text").textContent = badge.beschreibung;
  overlay.hidden = false;

  // Reflow erzwingen wie bei flashInvalid(), damit die Konfetti-/Pop-
  // Animation bei mehreren Abzeichen hintereinander jedes Mal neu startet.
  const karte = overlay.querySelector(".badge-celebration__card");
  karte.classList.remove("badge-celebration__card--feiern");
  void karte.offsetWidth;
  karte.classList.add("badge-celebration__card--feiern");

  clearTimeout(feierTimeout);
  feierTimeout = setTimeout(schliesseFeier, 2600);
}

function schliesseFeier() {
  clearTimeout(feierTimeout);
  const overlay = document.getElementById("badge-celebration");
  if (overlay) overlay.hidden = true;
  naechsteFeier();
}

// Defensiver Null-Check statt direktem Zugriff: ein fehlendes Overlay-
// Element (z.B. durch eine veraltete zwischengespeicherte Version der
// Seite) soll nur diese eine Funktion stumm überspringen, statt init()
// mitten in der Init-Kette abstürzen zu lassen und die nachfolgenden
// initBottomNav()/initServiceWorker()-Aufrufe zu verhindern.
function initBadgeCelebration() {
  const overlay = document.getElementById("badge-celebration");
  if (!overlay) return;
  overlay.addEventListener("click", schliesseFeier);
}

// Abzeichen-Detail: öffnet sich beim Antippen eines Abzeichens in der
// Galerie (siehe renderBadges()). Freigeschaltete Abzeichen sind per Tap
// auf die Medaille umdrehbar (3D-Flip zur "Gravur"-Rückseite mit
// Freischalt-Datum), gesperrte zeigen nur das gemeinsame Schloss-Bild ohne
// Flip-Möglichkeit - es gibt schließlich noch kein Datum zum Eingravieren.
function openBadgeDetail(id) {
  const badge = BADGES.find((b) => b.id === id);
  const overlay = document.getElementById("badge-detail");
  if (!badge || !overlay) return;

  const frei = istBadgeFreigeschaltet(id);
  const flipper = document.getElementById("badge-detail-flipper");
  // Immer unaufgedeckt/vorderseitig öffnen, nicht im Zustand vom letzten
  // Mal - sonst könnte ein Abzeichen "umgedreht" wirken, obwohl man es
  // gerade erst antippt.
  flipper.classList.remove("badge-detail__flipper--flipped");
  flipper.classList.toggle("badge-detail__flipper--flippable", frei);

  const bildId = frei ? badge.id : "locked";
  document.getElementById("badge-detail-img").src = `icons/badge-${bildId}.png`;
  document.getElementById("badge-detail-img").alt = frei ? badge.label : "Gesperrt";
  document.getElementById("badge-detail-title").textContent = badge.label;

  if (frei) {
    const datum = holeBadgeFreischaltDatum(id);
    document.getElementById("badge-detail-date").textContent = datum
      ? new Date(datum).toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" })
      : "–";
    document.getElementById("badge-detail-hint").textContent = "Zum Umdrehen antippen";
  } else {
    document.getElementById("badge-detail-hint").textContent = "Noch nicht freigeschaltet";
  }

  overlay.hidden = false;
}

function closeBadgeDetail() {
  const overlay = document.getElementById("badge-detail");
  if (overlay) overlay.hidden = true;
}

function initBadgeDetail() {
  const overlay = document.getElementById("badge-detail");
  if (!overlay) return;

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeBadgeDetail();
  });
  document.getElementById("badge-detail-close")?.addEventListener("click", closeBadgeDetail);

  const flipper = document.getElementById("badge-detail-flipper");
  flipper?.addEventListener("click", () => {
    if (flipper.classList.contains("badge-detail__flipper--flippable")) {
      flipper.classList.toggle("badge-detail__flipper--flipped");
    }
  });

  // Delegation statt Listener pro Abzeichen: renderBadges() baut
  // #badges-grid bei jeder Änderung komplett neu (innerHTML) - ein
  // Listener direkt hier am Grid-Container übersteht das, einer an den
  // einzelnen .badge-item-Elementen würde bei jedem Rerender verloren gehen.
  const grid = document.getElementById("badges-grid");
  grid?.addEventListener("click", (event) => {
    const item = event.target.closest(".badge-item");
    if (item) openBadgeDetail(item.dataset.badgeId);
  });
}

// ============================================================================
// 9. Einstellungen-Screen
//
// Alle 9 Einstellungen leben in einem gemeinsamen Objekt (einstellungen,
// siehe ganz oben). renderSettings() spiegelt den aktuellen Stand in die
// UI, initSettings() verkabelt alle Klicks - Aufbau wie bei den anderen
// Screens (renderX()/initX()-Paar).
// ============================================================================

function renderSettings() {
  // 1. Eingabe-Obergrenze
  document.getElementById("settings-max-value").textContent = formatAmount(einstellungen.maxBetrag);

  // 2. Farbmodus
  document.querySelectorAll("#settings-farbmodus-group .choice-btn").forEach((button) => {
    button.classList.toggle("choice-btn--active", button.dataset.farbmodus === einstellungen.farbmodus);
  });

  // 3. Rundung
  document.querySelectorAll("#settings-rundung-group .choice-btn").forEach((button) => {
    button.classList.toggle("choice-btn--active", Number(button.dataset.rundung) === einstellungen.rundung);
  });

  // 4. Becherbestand: aktuellen Stand laut App zur Orientierung anzeigen
  document.getElementById("settings-becher-aktuell").textContent = formatAmount(calcBecherBestand());

  // 8. Motivationssprüche
  document.getElementById("settings-motivation-toggle").checked = einstellungen.motivationAn;
}

// Setzt data-theme auf <html>. Bei "system" wird das Attribut entfernt,
// dann greift wieder ganz normal die prefers-color-scheme-Media-Query in
// style.css (automatisch hell/dunkel je nach iPhone-Einstellung).
function wendeFarbmodusAn() {
  if (einstellungen.farbmodus === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", einstellungen.farbmodus === "dunkel" ? "dark" : "light");
  }
}

// --- 1. Eingabe-Obergrenze: eigener kleiner Zahlenfeld-Dialog -------------
// Gleiches Muster wie beim Sparziel (Abschnitt 8): eigener Buffer, eigenes
// Keypad, applyDigit() mit Infinity aufgerufen (die Obergrenze selbst darf
// nicht durch sich selbst begrenzt werden).

let maxBuffer = "";

function updateMaxDisplay() {
  document.getElementById("max-display").textContent = (maxBuffer === "" ? "0" : maxBuffer) + " €";
}

function openMaxDialog() {
  maxBuffer = amountToBuffer(einstellungen.maxBetrag);
  updateMaxDisplay();
  document.getElementById("max-overlay").hidden = false;
}

function closeMaxDialog() {
  document.getElementById("max-overlay").hidden = true;
}

function saveMaxBetrag() {
  const betrag = bufferToAmount(maxBuffer);
  if (betrag === null) {
    flashInvalid("max-display");
    return;
  }
  einstellungen.maxBetrag = betrag;
  persistEinstellungen();
  renderSettings();
  closeMaxDialog();
}

function initMaxDialog() {
  const keypad = document.getElementById("max-keypad");

  keypad.querySelectorAll(".key[data-digit]").forEach((button) => {
    button.addEventListener("click", () => {
      maxBuffer = applyDigit(maxBuffer, button.dataset.digit, Infinity);
      updateMaxDisplay();
    });
  });

  document.getElementById("max-key-comma").addEventListener("click", () => {
    maxBuffer = insertComma(maxBuffer);
    updateMaxDisplay();
  });
  document.getElementById("max-key-single-cent").addEventListener("click", () => {
    maxBuffer = "0,0";
    updateMaxDisplay();
  });
  document.getElementById("max-key-delete-digit").addEventListener("click", () => {
    maxBuffer = maxBuffer.slice(0, -1);
    updateMaxDisplay();
  });

  document.getElementById("max-save").addEventListener("click", saveMaxBetrag);
  document.getElementById("max-cancel").addEventListener("click", closeMaxDialog);

  const overlay = document.getElementById("max-overlay");
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeMaxDialog();
  });
}

// --- 7. Backup wiederherstellen --------------------------------------------
// Gegenstück zu exportData(): liest eine zuvor exportierte JSON-Datei ein
// und ersetzt die aktuellen Daten damit - nach grober Struktur-Prüfung und
// einer expliziten Bestätigung, weil das nicht rückgängig zu machen ist.

function importBackup(jsonText) {
  const statusEl = document.getElementById("settings-restore-status");

  let daten;
  try {
    daten = JSON.parse(jsonText);
  } catch (fehler) {
    statusEl.textContent = "Datei ist kein gültiges JSON.";
    return;
  }

  // Grobe Struktur-Prüfung: genau die Felder, die exportData() schreibt.
  const gueltig =
    daten &&
    Array.isArray(daten.eintraege) &&
    typeof daten.tagesabrechnungen === "object" &&
    daten.tagesabrechnungen !== null;

  if (!gueltig) {
    statusEl.textContent = "Datei hat nicht die erwartete Veeno-Backup-Struktur.";
    return;
  }

  // Inhaltliche Plausibilitäts-Prüfung zusätzlich zur Struktur-Prüfung
  // oben: pro Tagesabrechnung müssen paidOut/inCup nicht-negativ sein und
  // sich exakt zu total aufsummieren (kleine Rundungstoleranz) - sonst
  // würde z.B. ein Backup mit paidOut > total klaglos einen negativen
  // Becherbestand importieren. Bei Verstoß: Import komplett ablehnen,
  // keine teilweise Übernahme.
  const TOLERANZ = 0.01;
  const tagesabrechnungenPlausibel = Object.values(daten.tagesabrechnungen).every(
    (tag) =>
      tag &&
      typeof tag.total === "number" &&
      typeof tag.paidOut === "number" &&
      typeof tag.inCup === "number" &&
      tag.paidOut >= 0 &&
      tag.inCup >= 0 &&
      Math.abs(tag.paidOut + tag.inCup - tag.total) <= TOLERANZ
  );

  if (!tagesabrechnungenPlausibel) {
    statusEl.textContent = "Datei enthält unplausible Tagesabrechnungen (negative Werte oder paidOut + inCup ≠ total) - Import abgebrochen.";
    return;
  }

  // eingezahltGesamt gab es vor v1.0.0 noch nicht - ein älteres Backup ohne
  // dieses Feld ist trotzdem gültig, fällt dann einfach auf 0 zurück (alles
  // noch "Ausstehend"). Ist das Feld da, muss es eine nicht-negative Zahl
  // sein, die nicht größer als die importierte Sparrücklage ist - sonst
  // würde calcAusstehend() nach dem Import negativ werden.
  const importierteSparruecklage = Object.values(daten.tagesabrechnungen).reduce(
    (summe, tag) => summe + tag.paidOut, 0
  );
  const hatEingezahltFeld = daten.eingezahltGesamt !== undefined;
  const eingezahltGueltig =
    !hatEingezahltFeld ||
    (typeof daten.eingezahltGesamt === "number" &&
      daten.eingezahltGesamt >= 0 &&
      daten.eingezahltGesamt <= importierteSparruecklage + TOLERANZ);

  if (!eingezahltGueltig) {
    statusEl.textContent = "Datei enthält einen unplausiblen eingezahlten Gesamtbetrag - Import abgebrochen.";
    return;
  }

  const zeitpunkt = daten.exportiertAm
    ? new Date(daten.exportiertAm).toLocaleString("de-DE")
    : "unbekanntem Zeitpunkt";

  if (!confirm(`Backup vom ${zeitpunkt} einspielen? Das ersetzt ALLE aktuellen Einträge und Tagesabrechnungen.`)) {
    statusEl.textContent = "";
    return;
  }

  entries = daten.eintraege;
  dailySummaries = daten.tagesabrechnungen;
  eingezahltGesamt = hatEingezahltFeld ? daten.eingezahltGesamt : 0;
  // badges gab es vor v1.0.0 noch nicht - unbekannte/kaputte Einträge
  // werden einfach rausgefiltert statt den ganzen Import abzulehnen (rein
  // additiv, kein Betrag, der etwas kaputt machen könnte). normalisiereBadges()
  // versteht dabei auch das alte Format (v41, reine ID-Strings ohne
  // Freischalt-Datum). Fehlt das Feld komplett, holt checkBadges(false)
  // gleich danach alles nach, was sich aus den importierten Beträgen
  // bereits ergibt - kein manuelles Nachtragen nötig.
  freigeschalteteBadges = normalisiereBadges(daten.badges).filter((eintrag) =>
    BADGES.some((b) => b.id === eintrag.id)
  );
  persistEntries();
  persistDailySummaries();
  persistEingezahltGesamt();
  persistBadges();

  renderEntries();
  renderDayTotal();
  renderSavingsTotal();
  renderSavingsChart();
  renderGrowthChart();
  renderBecherBestand();
  renderSparziel();
  renderPendingCard();
  renderBadges();
  renderSettings();
  checkBadges(false); // rückwirkend nachtragen, ohne Feiermoment für längst vergangene Erfolge

  statusEl.textContent = "Backup erfolgreich eingespielt.";
}

function initSettings() {
  document.getElementById("settings-app-semver").textContent = APP_SEMVER;
  document.getElementById("settings-build-version").textContent = APP_VERSION;

  // 2. Farbmodus
  document.querySelectorAll("#settings-farbmodus-group .choice-btn").forEach((button) => {
    button.addEventListener("click", () => {
      einstellungen.farbmodus = button.dataset.farbmodus;
      persistEinstellungen();
      wendeFarbmodusAn();
      renderSettings();
    });
  });

  // 3. Rundung
  document.querySelectorAll("#settings-rundung-group .choice-btn").forEach((button) => {
    button.addEventListener("click", () => {
      einstellungen.rundung = Number(button.dataset.rundung);
      persistEinstellungen();
      renderSettings();
    });
  });

  // 4. Becherbestand korrigieren: aus dem eingegebenen Zielwert die
  // Korrektur-Differenz berechnen (Zielwert - aktuelle inCup-Summe OHNE
  // Korrektur), damit zukünftige Schicht-Abrechnungen weiter korrekt
  // darauf aufbauen (siehe calcBecherBestand()/calcBecherBestandOhneKorrektur()).
  document.getElementById("settings-becher-apply").addEventListener("click", () => {
    const eingabe = document.getElementById("settings-becher-input");
    const zielWert = parseFloat(eingabe.value);
    if (isNaN(zielWert) || zielWert < 0) return; // ungültige Eingabe -> nichts tun

    einstellungen.becherKorrektur = round2(zielWert - calcBecherBestandOhneKorrektur());
    persistEinstellungen();
    eingabe.value = "";

    renderSettings();
    renderBecherBestand();
  });

  // 5. Sparziel zurücksetzen - nutzt removeGoal() aus dem Sparziel-Screen
  // (Abschnitt 8) direkt, statt die Lösch-Logik zu duplizieren.
  document.getElementById("settings-goal-reset").addEventListener("click", () => {
    if (!sparzielBetrag) return; // es ist eh schon kein Ziel gesetzt
    if (confirm("Sparziel wirklich zurücksetzen?")) {
      removeGoal();
    }
  });

  // 6. Alle Daten löschen - zweistufig: erst normale Bestätigung, dann
  // muss "LÖSCHEN" exakt eingetippt werden. Absichtlich unbequem, weil es
  // nicht rückgängig zu machen ist.
  document.getElementById("settings-delete-all").addEventListener("click", () => {
    if (!confirm("Wirklich ALLE Daten löschen? Einträge, Tagesabrechnungen, Sparziel und Einstellungen sind danach unwiderruflich weg.")) {
      return;
    }
    const bestaetigung = prompt('Zum endgültigen Bestätigen "LÖSCHEN" eintippen:');
    if (bestaetigung !== "LÖSCHEN") return;

    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY_SUMMARIES);
    localStorage.removeItem(STORAGE_KEY_ZIEL);
    localStorage.removeItem(STORAGE_KEY_EINSTELLUNGEN);
    localStorage.removeItem(STORAGE_KEY_EINGEZAHLT);
    localStorage.removeItem(STORAGE_KEY_BADGES);
    location.reload();
  });

  // 7. Backup wiederherstellen - Button öffnet den (unsichtbaren) Datei-Dialog
  document.getElementById("settings-restore-btn").addEventListener("click", () => {
    document.getElementById("settings-restore-input").click();
  });
  document.getElementById("settings-restore-input").addEventListener("change", (event) => {
    const datei = event.target.files[0];
    if (!datei) return;
    const reader = new FileReader();
    reader.onload = () => importBackup(reader.result);
    reader.readAsText(datei);
    event.target.value = ""; // dieselbe Datei später erneut auswählbar machen
  });

  // 8. Motivationssprüche an/aus
  document.getElementById("settings-motivation-toggle").addEventListener("change", (event) => {
    einstellungen.motivationAn = event.target.checked;
    persistEinstellungen();
    renderMotivation();
  });

  document.getElementById("settings-max-edit").addEventListener("click", openMaxDialog);
}


// ============================================================================
// 10. Backup/Export
//
// iOS kann localStorage-Daten nach längerer App-Nichtnutzung automatisch
// löschen (Intelligent Tracking Prevention). Das hier ist die einzige
// Absicherung dagegen: ein manueller Download-Knopf, kein Auto-Backup.
// ============================================================================

function exportData() {
  const daten = {
    exportiertAm: new Date().toISOString(),
    eintraege: entries,
    tagesabrechnungen: dailySummaries,
    eingezahltGesamt: eingezahltGesamt,
    badges: freigeschalteteBadges,
  };

  // Ein Blob ist eine "Datei im Speicher" - wir erzeugen daraus eine
  // temporäre URL, verlinken sie unsichtbar und klicken sie per Code an,
  // das startet im Browser den normalen Download.
  const blob = new Blob([JSON.stringify(daten, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = `veeno-backup-${todayDateKey()}.json`;
  link.click();

  URL.revokeObjectURL(url);
}

function initExport() {
  document.getElementById("export-data").addEventListener("click", exportData);
}

// Liefert den aktuellen Gesamttopf (bisheriger Becherbestand + heutige,
// noch nicht abgerechnete Schicht) - wird an mehreren Stellen im
// Schicht-Screen frisch neu berechnet, deshalb eine eigene kleine Funktion.
function calcGesamtTopf() {
  return round2(calcBecherBestand() + calcDayTotal());
}

function initShiftDialog() {
  document.getElementById("open-shift-dialog").addEventListener("click", openShiftDialog);
  document.getElementById("shift-cancel").addEventListener("click", () => switchScreen("eintrag"));
  document.getElementById("shift-save").addEventListener("click", saveShiftSummary);

  const ausstehendFeld = document.getElementById("shift-ausstehend");
  const becherFeld = document.getElementById("shift-in-cup");

  // Die beiden Felder sind gekoppelt: sobald eins geändert wird, berechnet
  // sich das andere automatisch (Gesamttopf - eins = das andere), und die
  // Check-Zeile plus der "Neuer Becherbestand"-Kasten werden mit aktualisiert.
  ausstehendFeld.addEventListener("input", () => {
    const gesamtTopf = calcGesamtTopf();
    const roh = parseFloat(ausstehendFeld.value);
    const ausstehend = isNaN(roh) ? 0 : Math.max(0, roh);
    const imBecher = Math.max(0, round2(gesamtTopf - ausstehend));
    becherFeld.value = imBecher.toFixed(2);
    updateSplitCheck(ausstehend, imBecher, gesamtTopf);
    updateNeuerBecherbestand(imBecher);
  });

  becherFeld.addEventListener("input", () => {
    const gesamtTopf = calcGesamtTopf();
    const roh = parseFloat(becherFeld.value);
    const imBecher = isNaN(roh) ? 0 : Math.max(0, roh);
    const ausstehend = Math.max(0, round2(gesamtTopf - imBecher));
    ausstehendFeld.value = ausstehend.toFixed(2);
    updateSplitCheck(ausstehend, imBecher, gesamtTopf);
    updateNeuerBecherbestand(imBecher);
  });
}


// ============================================================================
// 11. Bottom-Nav / Screen-Umschaltung
//
// Jeder <main class="screen"> hat eine id nach dem Muster "screen-NAME".
// Die passenden Nav-Buttons tragen das gleiche NAME in data-screen - so
// finden wir per Namen immer den richtigen Screen dazu.
// ============================================================================

function switchScreen(name) {
  document.querySelectorAll(".screen").forEach((screen) => {
    screen.hidden = screen.id !== `screen-${name}`;
  });
  document.querySelectorAll(".nav-btn").forEach((button) => {
    button.classList.toggle("nav-btn--active", button.dataset.screen === name);
  });

  // Übersichtsseite frisch halten, falls seit dem letzten Rendern die
  // Tageszeit gewechselt hat (z.B. App blieb über Nacht im Hintergrund offen).
  if (name === "sparziel") {
    renderHomeGreeting();
  }
}

function initBottomNav() {
  document.querySelectorAll(".nav-btn").forEach((button) => {
    button.addEventListener("click", () => switchScreen(button.dataset.screen));
  });
}


// ============================================================================
// 12. Motivations-Text
// ============================================================================

const MOTIVATIONSSPRUECHE = [
  "Weiter so – jeder Cent zählt! 💪",
  "Kleine Beträge, große Wirkung. 🌱",
  "Dein Becher füllt sich, deine Rücklage auch. 🐷",
  "Gute Schicht, gutes Sparen. ✨",
  "Ein Trinkgeld nach dem anderen. 😊",
];

// Zwei Stellen zeigen den Motivationstext: der Eintrag-Screen (#motivation-text)
// und - neu - die Übersichtsseite (#home-motivation-text) ganz unten, wie in
// den Homescreen-Mockups. Beide teilen sich denselben Spruch/dieselbe
// Einstellung, deshalb querySelectorAll(".motivation-text") statt getElementById.
function renderMotivation() {
  const anzeigen = document.querySelectorAll(".motivation-text");

  // Einstellung 8: aus -> Elemente bleiben einfach leer, statt sie per CSS zu
  // verstecken (dann bräuchte man keine Höhe im Layout einzuplanen, die
  // Elemente sind eh nur einzeilige <p>s).
  if (!einstellungen.motivationAn) {
    anzeigen.forEach((anzeige) => { anzeige.textContent = ""; });
    return;
  }

  const spruch = MOTIVATIONSSPRUECHE[Math.floor(Math.random() * MOTIVATIONSSPRUECHE.length)];
  anzeigen.forEach((anzeige) => { anzeige.textContent = spruch; });
}


// ============================================================================
// Zahlenfeld-Klicks (Haupt-Eingabe) verbinden
// ============================================================================

function initKeypad() {
  document.querySelectorAll(".keypad:not(#edit-keypad) .key[data-digit]").forEach((button) => {
    button.addEventListener("click", () => digitPressed(button.dataset.digit));
  });

  document.getElementById("key-comma").addEventListener("click", commaPressed);
  document.getElementById("key-single-cent").addEventListener("click", startSingleCent);
  document.getElementById("key-delete").addEventListener("click", deletePressed);
  document.getElementById("key-save").addEventListener("click", saveEntry);
}


// ============================================================================
// PWA: Service Worker registrieren (nötig, damit "Zum Home-Bildschirm
// hinzufügen" funktioniert und die App auch offline startet)
// ============================================================================

function initServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch((fehler) => {
      console.error("Service Worker konnte nicht registriert werden:", fehler);
    });
  }
}


// ============================================================================
// 13. Start
// ============================================================================

function init() {
  wendeFarbmodusAn(); // vor allem anderen, damit kein falsches Theme aufblitzt

  updateDisplay();
  renderEntries();
  renderDayTotal();
  renderSavingsTotal();
  renderSavingsChart();
  renderGrowthChart();
  renderBecherBestand();
  renderSparziel();
  renderPendingCard();
  renderBadges();
  renderHomeGreeting();
  renderMotivation();
  renderSettings();

  initKeypad();
  initEditDialog();
  initShiftDialog();
  initGoalDialog();
  initDepositDialog();
  initExport();
  initSettings();
  initMaxDialog();
  initGrowthChart();
  initBadgeCelebration();
  initBadgeDetail();
  initBottomNav();
  initServiceWorker();

  // Rückwirkend nachtragen für Bestandsnutzer (siehe Abschnitt 8b) - ohne
  // Feiermoment, ein App-Start soll nicht wie eine Konfetti-Kaskade wirken.
  checkBadges(false);
}

document.addEventListener("DOMContentLoaded", init);
