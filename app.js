// ============================================================================
// Trinkgeld Tracker - app.js
//
// Alles, was die Eintrags-Seite tut, steht hier drin. Kein Framework, nur
// "normales" JavaScript. Der Code ist in kleine Funktionen aufgeteilt, die
// jeweils genau eine Sache tun - so kannst du später einzelne Teile
// austauschen, ohne den Rest zu verstehen.
// ============================================================================

// localStorage kann nur Text speichern -> wir benutzen einen festen
// "Schlüssel" (Namen), unter dem unsere Einträge abgelegt werden.
const STORAGE_KEY = "trinkgeld-eintraege";

// "buffer" ist das, was der Nutzer gerade auf dem Zahlenfeld eintippt,
// z.B. "12" oder "0,10". Er ist immer nur EIN String (Text), den wir bei
// Bedarf in eine Zahl umwandeln.
let buffer = "";

// Alle bisher gespeicherten Einträge, direkt beim Start aus dem
// localStorage geladen.
let entries = loadEntries();


// ============================================================================
// Speichern / Laden aus localStorage
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


// ============================================================================
// Zahlenfeld-Logik (die "Prefix-Logik" aus der Aufgabenstellung)
//
// Grundidee: "buffer" ist der Text, der gerade eingegeben wird.
// - Normale Ziffern (1-9, 0) hängen sich an den Text an.
// - Solange noch kein Komma im Text ist, bauen wir damit eine ganze
//   Euro-Zahl auf (z.B. "1" -> "12" -> "125").
// - Sobald ein Komma im Text ist, sind die nächsten 1-2 Ziffern die
//   Cent-Nachkommastellen (z.B. "0," -> "0,1" -> "0,10").
// - Die Tasten "0," und "0,0" setzen den Text einfach direkt auf diesen
//   Anfang, damit man nicht erst "0" und "," einzeln tippen muss.
// ============================================================================

function digitPressed(ziffer) {
  if (buffer === "") {
    // Erste Eingabe: einfach die Ziffer übernehmen (führende Nullen wie
    // "0" alleine sind ok, "00" wollen wir aber vermeiden).
    buffer = ziffer;
  } else if (buffer.includes(",")) {
    // Wir sind im Nachkommastellen-Modus (z.B. nach "0," oder "0,0").
    const nachkommastellen = buffer.split(",")[1];
    if (nachkommastellen.length < 2) {
      buffer += ziffer;
    }
    // Wenn schon 2 Nachkommastellen da sind, ignorieren wir weitere
    // Tastendrücke (mehr als Cent-genau geht bei Geld nicht).
  } else {
    // Ganze-Euro-Modus: Ziffer hinten anhängen. Eine führende "0" wird
    // dabei durch die neue Ziffer ersetzt (aus "0" + "5" wird "5", nicht "05").
    buffer = buffer === "0" ? ziffer : buffer + ziffer;
  }
  updateDisplay();
}

function startTensCent() {
  // Taste "0," - Abkürzung für Zehner-Cent, z.B. "0," + "1" -> "0,1" (=10 Cent)
  buffer = "0,";
  updateDisplay();
}

function startSingleCent() {
  // Taste "0,0" - Abkürzung für Einer-Cent, z.B. "0,0" + "1" -> "0,01"
  buffer = "0,0";
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


// ============================================================================
// Anzeige aktualisieren
// ============================================================================

function updateDisplay() {
  const anzeige = document.getElementById("display");
  anzeige.textContent = (buffer === "" ? "0" : buffer) + " €";
}

// Wandelt den buffer-Text ("12" oder "0,10") in eine echte Zahl (12 oder 0.1) um.
// Gibt null zurück, wenn (noch) nichts Sinnvolles eingegeben wurde.
function parseBuffer() {
  if (buffer === "" || buffer === "0," || buffer === "0,0") return null;
  const zahl = parseFloat(buffer.replace(",", "."));
  if (isNaN(zahl) || zahl <= 0) return null;
  return zahl;
}


// ============================================================================
// Eintrag speichern
// ============================================================================

function saveEntry() {
  const betrag = parseBuffer();
  if (betrag === null) {
    // Nichts (Sinnvolles) eingegeben -> einfach nichts tun.
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


// ============================================================================
// Liste der letzten Einträge anzeigen
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
  const letzteEintraege = entries.slice(0, 10);

  liste.innerHTML = "";
  leerHinweis.style.display = letzteEintraege.length === 0 ? "block" : "none";

  for (const eintrag of letzteEintraege) {
    const li = document.createElement("li");
    li.className = "entry";
    li.innerHTML = `
      <div>
        <div class="entry__amount">${formatAmount(eintrag.amount)}</div>
        <div class="entry__time">${formatTime(eintrag.timestamp)}</div>
      </div>
      <div class="entry__actions">
        <button data-delete="${eintrag.id}" title="Löschen">🗑️</button>
      </div>
    `;
    liste.appendChild(li);
  }

  // Klicks auf den Löschen-Button der einzelnen Einträge abfangen.
  liste.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = Number(button.dataset.delete);
      deleteEntry(id);
    });
  });
}


// ============================================================================
// Tagessumme berechnen
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

function renderDayTotal() {
  const summe = entries
    .filter((eintrag) => isToday(eintrag.timestamp))
    .reduce((gesamt, eintrag) => gesamt + eintrag.amount, 0);

  document.getElementById("day-total-value").textContent = formatAmount(summe);
}


// ============================================================================
// Alle Klicks auf dem Zahlenfeld verbinden
// ============================================================================

function initKeypad() {
  document.querySelectorAll(".key[data-digit]").forEach((button) => {
    button.addEventListener("click", () => digitPressed(button.dataset.digit));
  });

  document.getElementById("key-tens-cent").addEventListener("click", startTensCent);
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
// Start
// ============================================================================

function init() {
  updateDisplay();
  renderEntries();
  renderDayTotal();
  initKeypad();
  initServiceWorker();
}

document.addEventListener("DOMContentLoaded", init);
