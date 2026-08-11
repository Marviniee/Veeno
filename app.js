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
//  11. Verlauf-Screen (alle Einträge, nach Tag gruppiert)
//  12. Bottom-Nav / Screen-Umschaltung
//  13. Motivations-Text
//  14. Start
// ============================================================================

// localStorage kann nur Text speichern -> wir benutzen feste "Schlüssel"
// (Namen), unter denen unsere Daten abgelegt werden.
const STORAGE_KEY = "trinkgeld-eintraege";
const STORAGE_KEY_SUMMARIES = "veeno-tagesabrechnungen";
const STORAGE_KEY_ZIEL = "veeno-sparziel-betrag";
const STORAGE_KEY_EINSTELLUNGEN = "veeno-einstellungen";

// Muss beim Erhöhen von CACHE_NAME in service-worker.js manuell mitgezogen
// werden - zeigt nur die Versionsnummer im Einstellungen-Screen an.
const APP_VERSION = "v17";

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
  renderVerlauf();
}

function deleteEntry(id) {
  entries = entries.filter((eintrag) => eintrag.id !== id);
  persistEntries();
  renderEntries();
  renderDayTotal();
  renderVerlauf();
}

function updateEntry(id, betrag, timestamp) {
  const eintrag = entries.find((e) => e.id === id);
  if (!eintrag) return;
  eintrag.amount = betrag;
  eintrag.timestamp = timestamp;
  persistEntries();
  renderEntries();
  renderDayTotal();
  renderVerlauf();
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

function formatTime(isoString) {
  return new Date(isoString).toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderEntries() {
  const liste = document.getElementById("entries-list");
  const leerHinweis = document.getElementById("entries-empty");

  // Wir zeigen die letzten 10 Einträge, neueste zuerst (entries ist bereits
  // so sortiert, weil wir beim Speichern mit unshift() vorne einfügen).
  // Abgerechnete Einträge (settled: true) sind schon Teil einer
  // Tagesabrechnung und tauchen hier nicht mehr auf.
  const letzteEintraege = entries.filter((eintrag) => !eintrag.settled).slice(0, 10);

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
// wie viel er "eingezahlt" hat (volle Scheine) - der Rest gilt automatisch
// als "im Becher gelassen" (Kleingeld). Das wird pro Tag in
// dailySummaries gespeichert.
//
// Beim Speichern werden alle heutigen, noch nicht abgerechneten Einträge
// als "settled" markiert (Abschnitt 3/4/5) und dailySummaries[heute] wird
// AUFADDIERT statt überschrieben - so kann man mehrmals am selben Tag
// abrechnen (z.B. nach einer zweiten Schicht), ohne dass frühere Beträge
// verloren gehen.
//
// Die Sparrücklage (savings_total) und der aktuelle Becher-Bestand
// speichern wir NICHT als eigene Zahlen, sondern berechnen sie aus der
// Summe aller "eingezahlt"- bzw. "im Becher"-Werte in dailySummaries. So
// können die Zahlen nie auseinanderlaufen.
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
// Scheinen (Rundungsgröße aus den Einstellungen, Default 5€) einzahlen,
// der Rest (Münzen, krumme Beträge) bleibt im Becher.
// Beispiel: 22,35 € Topf, Rundung 5€ -> 20 € einzahlen, 2,35 € im Becher.
// "Topf" ist NICHT nur die aktuelle Schicht, sondern Schicht + bisheriger
// Becherbestand zusammen (siehe openShiftDialog) - so ergeben sich über
// mehrere Schichten hinweg wieder volle Scheine, statt dass sich Kleingeld
// im Becher anhäuft, weil jede Schicht für sich isoliert betrachtet wird.
function calcAutoSplit(topf) {
  const rundung = einstellungen.rundung;
  const eingezahlt = Math.floor(topf / rundung) * rundung;
  return { eingezahlt, imBecher: round2(topf - eingezahlt) };
}

// Aktualisiert die Bestätigungs-Zeile "20,00 € + 2,35 € = 22,35 €"
function updateSplitCheck(eingezahlt, imBecher, topf) {
  document.getElementById("split-check").innerHTML =
    `${formatAmount(eingezahlt)} + ${formatAmount(imBecher)} = <strong>${formatAmount(topf)}</strong>`;
}

// Der "Im Becher"-Wert IST der neue Becherbestand nach dieser Abrechnung
// (Topf minus Einzahlen) - die Zusammenfassungszeile über dem Speichern-
// Button bekommt diesen Wert live mit.
function updateNeuerBecherbestand(imBecher) {
  document.getElementById("shift-neuer-becher-summary").textContent =
    `Neuer Becherbestand: ${formatAmount(imBecher)}`;
}

function openShiftDialog() {
  const heutigesSchichtTotal = calcDayTotal();
  const vorherigerBecherbestand = calcBecherBestand();
  const gesamtTopf = round2(vorherigerBecherbestand + heutigesSchichtTotal);
  const { eingezahlt, imBecher } = calcAutoSplit(gesamtTopf);

  document.getElementById("shift-bisher-becher-value").textContent = formatAmount(vorherigerBecherbestand);
  document.getElementById("shift-schicht-value").textContent = formatAmount(heutigesSchichtTotal);
  document.getElementById("shift-gesamt-value").textContent = formatAmount(gesamtTopf);
  updateNeuerBecherbestand(imBecher);

  document.getElementById("shift-paid-out").value = eingezahlt.toFixed(2);
  document.getElementById("shift-in-cup").value = imBecher.toFixed(2);
  updateSplitCheck(eingezahlt, imBecher, gesamtTopf);

  switchScreen("schicht");
}

function saveShiftSummary() {
  const heutigesSchichtTotal = calcDayTotal();
  const vorherigerBecherbestand = calcBecherBestand();
  const gesamtTopf = round2(vorherigerBecherbestand + heutigesSchichtTotal);

  const eingezahltRoh = parseFloat(document.getElementById("shift-paid-out").value);
  // Bei ungültiger/leerer Eingabe gilt: nichts eingezahlt, alles im Becher.
  // Der eingezahlte Betrag darf jetzt aus dem GESAMTEN Topf kommen (auch aus
  // dem bisherigen Becherbestand), nicht nur aus der heutigen Schicht.
  const eingezahlt = isNaN(eingezahltRoh) ? 0 : Math.min(Math.max(0, eingezahltRoh), gesamtTopf);

  // Wie viel von DIESER Schicht im Becher verbleibt. Das kann negativ sein,
  // wenn mehr eingezahlt wurde, als die Schicht allein hergibt - dann kam
  // der Rest aus dem alten Becherbestand. Genau deshalb wird das zum
  // bestehenden Tageseintrag ADDIERT statt gleichgesetzt: nur so ergibt
  // calcBecherBestand() (Summe aller inCup-Werte) am Ende wieder exakt
  // neuerBecherbestand.
  const inCupDelta = round2(heutigesSchichtTotal - eingezahlt);

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
  const heute = todayDateKey();
  const bisherigerEintrag = dailySummaries[heute] || { total: 0, paidOut: 0, inCup: 0 };
  dailySummaries[heute] = {
    total: round2(bisherigerEintrag.total + heutigesSchichtTotal),
    paidOut: round2(bisherigerEintrag.paidOut + eingezahlt),
    inCup: round2(bisherigerEintrag.inCup + inCupDelta),
    closedAt: new Date().toISOString(),
  };

  persistEntries();
  persistDailySummaries();
  renderEntries();
  renderDayTotal();
  renderVerlauf();
  renderSavingsTotal();
  renderSavingsChart();
  renderBecherBestand();
  renderSparziel();

  // Nach erfolgreicher Abrechnung direkt zeigen, wie sich die Sparrücklage
  // verändert hat - deshalb automatisch zum Sparziel-Tab wechseln.
  switchScreen("sparziel");
}

function renderSavingsTotal() {
  document.getElementById("savings-total-value").textContent = formatAmount(calcSavingsTotal());
}

function renderBecherBestand() {
  document.getElementById("becher-bestand-value").textContent = formatAmount(calcBecherBestand());
}

// ============================================================================
// 8. Sparziel: Zielbetrag + Fortschritt
//
// Der Zielbetrag ist direkt auf dem Sparziel-Screen editierbar (noch kein
// eigener Einstellungen-Screen). Die Karte wird komplett neu gerendert
// (wie renderEntries()/renderVerlauf()) statt einzelne Elemente ein- und
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

  container.innerHTML = `
    <div class="goal-card__header">
      <span class="goal-card__label">Sparziel</span>
      <button class="goal-card__edit" id="goal-edit-btn">✏️ ${formatAmount(sparzielBetrag)}</button>
    </div>
    <div class="goal-card__bar-track">
      <div class="goal-card__bar-fill${erreicht ? " goal-card__bar-fill--erreicht" : ""}" style="width: ${prozent}%"></div>
    </div>
    <div class="goal-card__meta">
      <span>${formatAmount(sparruecklage)} von ${formatAmount(sparzielBetrag)}</span>
      <span>${prozent}%</span>
    </div>
    ${erreicht ? `<p class="goal-card__celebrate">Ziel erreicht! 🎉</p>` : ""}
  `;
  document.getElementById("goal-edit-btn").addEventListener("click", openGoalDialog);
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

// Wochentags-Kürzel, indiziert wie Date.getDay() (0 = Sonntag).
const WOCHENTAGS_KUERZEL = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

// Kleines Balkendiagramm: ein Balken pro Tag der letzten 7 Tage, Höhe
// zeigt, wie viel an dem Tag eingezahlt wurde (0, wenn der Tag noch nicht
// abgerechnet wurde), mit Wochentags-Kürzel darunter.
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

  renderSavingsStats(tage);
}

// Wochendurchschnitt (aus den 7 im Diagramm gezeigten Tagen) + bester
// jemals abgerechneter Tag (paidOut, über alle dailySummaries hinweg).
function renderSavingsStats(letzte7Tage) {
  const avgEl = document.getElementById("savings-stat-avg");
  const bestEl = document.getElementById("savings-stat-best");

  const durchschnitt = letzte7Tage.reduce((summe, t) => summe + t.wert, 0) / 7;
  avgEl.innerHTML = `Wochendurchschnitt: <strong>${formatAmount(round2(durchschnitt))}</strong>`;

  const tagesEintraege = Object.entries(dailySummaries);
  if (tagesEintraege.length === 0) {
    bestEl.textContent = "";
    return;
  }

  const [besterTag, bestesEintrag] = tagesEintraege.reduce((bester, aktuell) =>
    aktuell[1].paidOut > bester[1].paidOut ? aktuell : bester
  );

  const [jahr, monat, tag] = besterTag.split("-").map(Number);
  const wochentag = WOCHENTAGS_KUERZEL[new Date(jahr, monat - 1, tag).getDay()];
  const datumsText = `${wochentag}, ${String(tag).padStart(2, "0")}.${String(monat).padStart(2, "0")}.${jahr}`;
  bestEl.innerHTML = `Bester Tag: <strong>${formatAmount(bestesEintrag.paidOut)}</strong> (${datumsText})`;
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

  const zeitpunkt = daten.exportiertAm
    ? new Date(daten.exportiertAm).toLocaleString("de-DE")
    : "unbekanntem Zeitpunkt";

  if (!confirm(`Backup vom ${zeitpunkt} einspielen? Das ersetzt ALLE aktuellen Einträge und Tagesabrechnungen.`)) {
    statusEl.textContent = "";
    return;
  }

  entries = daten.eintraege;
  dailySummaries = daten.tagesabrechnungen;
  persistEntries();
  persistDailySummaries();

  renderEntries();
  renderDayTotal();
  renderVerlauf();
  renderSavingsTotal();
  renderSavingsChart();
  renderBecherBestand();
  renderSparziel();
  renderSettings();

  statusEl.textContent = "Backup erfolgreich eingespielt.";
}

function initSettings() {
  document.getElementById("settings-app-version").textContent = APP_VERSION;

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
// 11. Backup/Export
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

  const eingezahltFeld = document.getElementById("shift-paid-out");
  const becherFeld = document.getElementById("shift-in-cup");

  // Die beiden Felder sind gekoppelt: sobald eins geändert wird, berechnet
  // sich das andere automatisch (Gesamttopf - eins = das andere), und die
  // Check-Zeile plus der "Neuer Becherbestand"-Kasten werden mit aktualisiert.
  eingezahltFeld.addEventListener("input", () => {
    const gesamtTopf = calcGesamtTopf();
    const roh = parseFloat(eingezahltFeld.value);
    const eingezahlt = isNaN(roh) ? 0 : Math.max(0, roh);
    const imBecher = Math.max(0, round2(gesamtTopf - eingezahlt));
    becherFeld.value = imBecher.toFixed(2);
    updateSplitCheck(eingezahlt, imBecher, gesamtTopf);
    updateNeuerBecherbestand(imBecher);
  });

  becherFeld.addEventListener("input", () => {
    const gesamtTopf = calcGesamtTopf();
    const roh = parseFloat(becherFeld.value);
    const imBecher = isNaN(roh) ? 0 : Math.max(0, roh);
    const eingezahlt = Math.max(0, round2(gesamtTopf - imBecher));
    eingezahltFeld.value = eingezahlt.toFixed(2);
    updateSplitCheck(eingezahlt, imBecher, gesamtTopf);
    updateNeuerBecherbestand(imBecher);
  });
}


// ============================================================================
// 12. Verlauf-Screen (alle Einträge, nach Tag gruppiert)
//
// Anders als die "Letzte Einträge"-Liste auf dem Eintrag-Screen zeigt der
// Verlauf ALLE Einträge, inklusive bereits abgerechneter (settled: true) -
// die bleiben hier als Historie sichtbar, sind aber nicht mehr antippbar
// (siehe openVerlaufEntry weiter unten): ihr Betrag steckt schon in einer
// Tagesabrechnung (dailySummaries), ein nachträgliches Ändern würde die
// durcheinanderbringen.
// ============================================================================

// Fasst eine flache Liste von Einträgen zu einem Objekt {datumsSchlüssel: [Einträge]}
// zusammen. Reine Funktion (bekommt die Liste rein, verändert nichts).
function groupEntriesByDay(liste) {
  const gruppen = {};
  for (const eintrag of liste) {
    const schluessel = dateKey(new Date(eintrag.timestamp));
    if (!gruppen[schluessel]) gruppen[schluessel] = [];
    gruppen[schluessel].push(eintrag);
  }
  return gruppen;
}

// "Heute" / "Gestern" statt Datum, wo es das gibt - sonst "05.08.2026".
function verlaufTagesLabel(datumsSchluessel) {
  const gestern = new Date();
  gestern.setDate(gestern.getDate() - 1);

  if (datumsSchluessel === todayDateKey()) return "Heute";
  if (datumsSchluessel === dateKey(gestern)) return "Gestern";

  const [jahr, monat, tag] = datumsSchluessel.split("-");
  return `${tag}.${monat}.${jahr}`;
}

function renderVerlauf() {
  const container = document.getElementById("verlauf-groups");
  const leerHinweis = document.getElementById("verlauf-empty");

  container.innerHTML = "";
  leerHinweis.style.display = entries.length === 0 ? "block" : "none";
  if (entries.length === 0) return;

  const gruppen = groupEntriesByDay(entries);

  // Datums-Schlüssel sind "JJJJ-MM-TT" - als Text sortiert entspricht das
  // automatisch der zeitlichen Reihenfolge. reverse() dreht das um, damit
  // der neueste Tag zuerst kommt.
  const tage = Object.keys(gruppen).sort().reverse();

  for (const tag of tage) {
    const eintraegeDesTages = gruppen[tag].slice().sort(
      (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
    );
    const tagesSumme = eintraegeDesTages.reduce((summe, eintrag) => summe + eintrag.amount, 0);

    const gruppenElement = document.createElement("section");
    gruppenElement.className = "verlauf-group";
    gruppenElement.innerHTML = `
      <div class="verlauf-group__header">
        <span class="verlauf-group__day">${verlaufTagesLabel(tag)}</span>
        <span class="verlauf-group__total">${formatAmount(tagesSumme)}</span>
      </div>
      <ul class="entries__list"></ul>
    `;

    const liste = gruppenElement.querySelector("ul");
    for (const eintrag of eintraegeDesTages) {
      const li = document.createElement("li");
      li.className = eintrag.settled ? "entry entry--settled" : "entry";
      li.innerHTML = `
        <div>
          <div class="entry__amount">${formatAmount(eintrag.amount)}</div>
          <div class="entry__time">${formatTime(eintrag.timestamp)}</div>
        </div>
        <span class="entry__hint">${eintrag.settled ? "" : "›"}</span>
      `;
      // Abgerechnete Einträge bekommen bewusst KEINEN Klick-Handler - siehe
      // Kommentar am Anfang dieses Abschnitts.
      if (!eintrag.settled) {
        li.addEventListener("click", () => openEditDialog(eintrag.id));
      }
      liste.appendChild(li);
    }

    container.appendChild(gruppenElement);
  }
}


// ============================================================================
// 13. Bottom-Nav / Screen-Umschaltung
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
}

function initBottomNav() {
  // ":not([disabled])" -> der "Verlauf"-Tab hat noch keinen Screen dahinter
  // und bleibt deaktiviert, bis der gebaut ist.
  document.querySelectorAll(".nav-btn:not([disabled])").forEach((button) => {
    button.addEventListener("click", () => switchScreen(button.dataset.screen));
  });
}


// ============================================================================
// 14. Motivations-Text
// ============================================================================

const MOTIVATIONSSPRUECHE = [
  "Weiter so – jeder Cent zählt! 💪",
  "Kleine Beträge, große Wirkung. 🌱",
  "Dein Becher füllt sich, deine Rücklage auch. 🐷",
  "Gute Schicht, gutes Sparen. ✨",
  "Ein Trinkgeld nach dem anderen. 😊",
];

function renderMotivation() {
  const anzeige = document.getElementById("motivation-text");

  // Einstellung 8: aus -> Element bleibt einfach leer, statt es per CSS zu
  // verstecken (dann bräuchte man keine Höhe im Layout einzuplanen, das
  // Element ist eh nur eine einzeilige <p>).
  if (!einstellungen.motivationAn) {
    anzeige.textContent = "";
    return;
  }

  const spruch = MOTIVATIONSSPRUECHE[Math.floor(Math.random() * MOTIVATIONSSPRUECHE.length)];
  anzeige.textContent = spruch;
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
// 15. Start
// ============================================================================

function init() {
  wendeFarbmodusAn(); // vor allem anderen, damit kein falsches Theme aufblitzt

  updateDisplay();
  renderEntries();
  renderDayTotal();
  renderVerlauf();
  renderSavingsTotal();
  renderSavingsChart();
  renderBecherBestand();
  renderSparziel();
  renderMotivation();
  renderSettings();

  initKeypad();
  initEditDialog();
  initShiftDialog();
  initGoalDialog();
  initExport();
  initSettings();
  initMaxDialog();
  initBottomNav();
  initServiceWorker();
}

document.addEventListener("DOMContentLoaded", init);
