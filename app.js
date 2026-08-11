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
//   8. Backup/Export
//   9. Verlauf-Screen (alle Einträge, nach Tag gruppiert)
//  10. Bottom-Nav / Screen-Umschaltung
//  11. Motivations-Text
//  12. Start
// ============================================================================

// localStorage kann nur Text speichern -> wir benutzen feste "Schlüssel"
// (Namen), unter denen unsere Daten abgelegt werden.
const STORAGE_KEY = "trinkgeld-eintraege";
const STORAGE_KEY_SUMMARIES = "veeno-tagesabrechnungen";

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

// Ein einzelnes Trinkgeld wird realistisch nie höher als das sein -
// weitere Ziffern über der Grenze werden von applyDigit einfach ignoriert.
const MAX_BETRAG = 9.99;

function applyDigit(text, ziffer) {
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
  if (!isNaN(zahl) && zahl > MAX_BETRAG) {
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

// Wie viel Kleingeld aktuell insgesamt im Becher liegt (Summe aller
// inCup-Werte aus allen bisherigen Tagesabrechnungen) - genau wie
// calcSavingsTotal(), nur mit inCup statt paidOut.
function calcBecherBestand() {
  return Object.values(dailySummaries).reduce((summe, tag) => summe + tag.inCup, 0);
}

// Automatische Aufteilung beim Öffnen: so viel wie möglich in vollen
// 5€-Scheinen einzahlen, der Rest (Münzen, krumme Beträge) bleibt im Becher.
// Beispiel: 22,35 € Topf -> 20 € einzahlen, 2,35 € im Becher.
// "Topf" ist NICHT nur die aktuelle Schicht, sondern Schicht + bisheriger
// Becherbestand zusammen (siehe openShiftDialog) - so ergeben sich über
// mehrere Schichten hinweg wieder volle Scheine, statt dass sich Kleingeld
// im Becher anhäuft, weil jede Schicht für sich isoliert betrachtet wird.
function calcAutoSplit(topf) {
  const eingezahlt = Math.floor(topf / 5) * 5;
  return { eingezahlt, imBecher: round2(topf - eingezahlt) };
}

// Aktualisiert die Bestätigungs-Zeile "20,00 € + 2,35 € = 22,35 €"
function updateSplitCheck(eingezahlt, imBecher, topf) {
  document.getElementById("split-check").innerHTML =
    `${formatAmount(eingezahlt)} + ${formatAmount(imBecher)} = <strong>${formatAmount(topf)}</strong>`;
}

// Der "Im Becher"-Wert IST der neue Becherbestand nach dieser Abrechnung
// (Topf minus Einzahlen) - beide Anzeigen bekommen also denselben Wert.
function updateNeuerBecherbestand(imBecher) {
  document.getElementById("shift-neuer-becher-value").textContent = formatAmount(imBecher);
}

function openShiftDialog() {
  const heutigesSchichtTotal = calcDayTotal();
  const vorherigerBecherbestand = calcBecherBestand();
  const gesamtTopf = round2(vorherigerBecherbestand + heutigesSchichtTotal);
  const { eingezahlt, imBecher } = calcAutoSplit(gesamtTopf);

  document.getElementById("shift-bisher-becher-value").textContent = formatAmount(vorherigerBecherbestand);
  document.getElementById("shift-schicht-value").textContent = formatAmount(heutigesSchichtTotal);
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

// Kleines Balkendiagramm: ein Balken pro Tag der letzten 7 Tage, Höhe
// zeigt, wie viel an dem Tag eingezahlt wurde (0, wenn der Tag noch nicht
// abgerechnet wurde).
function renderSavingsChart() {
  const container = document.getElementById("savings-chart");
  container.innerHTML = "";

  const werte = [];
  for (let tageZurueck = 6; tageZurueck >= 0; tageZurueck--) {
    const tag = new Date();
    tag.setDate(tag.getDate() - tageZurueck);
    const eintrag = dailySummaries[dateKey(tag)];
    werte.push(eintrag ? eintrag.paidOut : 0);
  }

  const maxWert = Math.max(...werte, 1); // min. 1, sonst Division durch 0
  for (const wert of werte) {
    const balken = document.createElement("div");
    balken.className = "savings-chart__bar";
    balken.style.height = `${Math.max(4, (wert / maxWert) * 100)}%`;
    container.appendChild(balken);
  }
}

// ============================================================================
// 8. Backup/Export
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
// 9. Verlauf-Screen (alle Einträge, nach Tag gruppiert)
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
// 10. Bottom-Nav / Screen-Umschaltung
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
// 11. Motivations-Text
// ============================================================================

const MOTIVATIONSSPRUECHE = [
  "Weiter so – jeder Cent zählt! 💪",
  "Kleine Beträge, große Wirkung. 🌱",
  "Dein Becher füllt sich, deine Rücklage auch. 🐷",
  "Gute Schicht, gutes Sparen. ✨",
  "Ein Trinkgeld nach dem anderen. 😊",
];

function renderMotivation() {
  const spruch = MOTIVATIONSSPRUECHE[Math.floor(Math.random() * MOTIVATIONSSPRUECHE.length)];
  document.getElementById("motivation-text").textContent = spruch;
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
// 12. Start
// ============================================================================

function init() {
  updateDisplay();
  renderEntries();
  renderDayTotal();
  renderVerlauf();
  renderSavingsTotal();
  renderSavingsChart();
  renderBecherBestand();
  renderMotivation();

  initKeypad();
  initEditDialog();
  initShiftDialog();
  initExport();
  initBottomNav();
  initServiceWorker();
}

document.addEventListener("DOMContentLoaded", init);
