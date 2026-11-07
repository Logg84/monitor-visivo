(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  // Colonne essenziali (ordine di lettura); «tutte» aggiunge il resto in ordine alfabetico.
  const BASE = ["Ticker", "Range", "Segnale", "Priorità", "Bottom", "Prezzo", "DD%", "RSI", "VWAP60", "In zona", "Health", "Trend",
    "Settore", "Sector", "Confluenza", "RS_4s%", "Wyckoff", "Insider_Cluster", "WI_Confluence", "Sifrediana_Today", "Squeeze", "Qualita_Dati"];
  const BOOL_SI = new Set(["Insider_Cluster", "WI_Confluence", "Sifrediana_Today", "Squeeze"]);
  const ETICHETTE = { Insider_Cluster: "👔 Insider", WI_Confluence: "🔗 W+I", Sifrediana_Today: "Sifrediana", Squeeze: "⚡ Squeeze", Qualita_Dati: "Qualità dati",
    "RS_4s%": "RS 4s", Priorità: "Priorità", Bottom: "Bottom" };
  const NUM_1 = new Set(["DD%", "DD_2a%", "RSI", "RS_4s%", "Short_Float_%", "ATR%", "Δ EW−CW", "SottoΔ", "Z_Medio_Settore"]);
  let righe = [], vista = "tutti", ord = { k: "Bottom", asc: false }, colonne = [], indice = {};

  const val = (r, k) => (k === "Ticker" ? r.ticker : k === "Segnale" ? r.segnale : k === "Priorità" ? r.priorita : k === "Range" ? statoRange(r.ticker) : (r.extra || {})[k]);
  const RANGO = { uscito_sopra: 4, in_range: 3, rallenta: 2, uscito_sotto: 1 };
  function statoRange(t) {
    const bs = ["1D", "1W"].map((tf) => indice[t + "|" + tf]).filter(Boolean);
    if (!bs.length) return null;
    return bs.sort((a, b) => (RANGO[b.stato] || 0) - (RANGO[a.stato] || 0)).map((b) => b.stato)[0];
  }
  const ETI = { in_range: "in range", rallenta: "rallenta", uscito_sopra: "uscito sopra", uscito_sotto: "uscito sotto" };

  function cella(r, k) {
    const v = val(r, k);
    if (k === "Ticker") return `<td><b class="tk" data-scheda="${esc(v)}">${esc(v)}</b></td>`;
    if (k === "Range") return v ? `<td><span class="badge b-${esc(v)}">${esc(ETI[v] || v)}</span></td>` : `<td class="muted">–</td>`;
    if (v === undefined || v === null || v === "") return `<td class="muted">–</td>`;
    if (BOOL_SI.has(k) || typeof v === "boolean") return `<td>${v ? '<span class="si">✓</span>' : '<span class="no">·</span>'}</td>`;
    if (typeof v === "number") {
      const t = NUM_1.has(k) ? v.toFixed(1) : Number.isInteger(v) ? String(v) : v.toFixed(2);
      return `<td${(k === "DD%" || k === "RS_4s%") && v < 0 ? ' class="neg"' : ""}>${t}</td>`;
    }
    return `<td>${esc(v)}</td>`;
  }
  const ordinabile = (a, b, k) => {
    const x = val(a, k), y = val(b, k);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "it");
  };

  function disegna() {
    const tutte = $("f-col").value === "tutte", min = Number($("f-min").value), q = $("f-cerca").value.trim().toUpperCase();
    const presenti = new Set(); righe.forEach((r) => Object.keys(r.extra || {}).forEach((k) => presenti.add(k)));
    colonne = BASE.filter((k) => ["Ticker", "Range", "Segnale", "Priorità"].includes(k) || presenti.has(k));
    if (tutte) colonne = colonne.concat([...presenti].filter((k) => !colonne.includes(k)).sort());
    let v = righe.filter((r) => {
      if (q && !r.ticker.includes(q)) return false;
      if (min && !(r.punti >= min)) return false;
      const dd = (r.extra || {})["DD%"], pr = (r.extra || {}).Prezzo, vw = (r.extra || {}).VWAP60;
      if (vista === "sconto") return typeof dd === "number" && dd <= -25;
      if (vista === "alert") return typeof dd === "number" && dd <= -25 && typeof pr === "number" && typeof vw === "number" && pr <= vw;
      return true;
    });
    v.sort((a, b) => (ord.asc ? 1 : -1) * ordinabile(a, b, ord.k) || (a.ticker < b.ticker ? -1 : 1));
    $("conteggio").textContent = `${v.length} titoli`;
    $("tab").innerHTML = "<thead><tr>" + colonne.map((k) => `<th data-k="${esc(k)}" class="${ord.k === k ? "ord" + (ord.asc ? " asc" : "") : ""}">${esc(ETICHETTE[k] || k)}</th>`).join("") +
      "</tr></thead><tbody>" + (v.length ? v.map((r) => "<tr>" + colonne.map((k) => cella(r, k)).join("") + "</tr>").join("")
        : `<tr><td colspan="${colonne.length}" class="vuoto">Nessun titolo con questi filtri.</td></tr>`) + "</tbody>";
  }

  function conteggi() {
    const n = { tutti: righe.length, sconto: 0, alert: 0 };
    for (const r of righe) {
      const e = r.extra || {};
      if (typeof e["DD%"] === "number" && e["DD%"] <= -25) { n.sconto++; if (typeof e.Prezzo === "number" && typeof e.VWAP60 === "number" && e.Prezzo <= e.VWAP60) n.alert++; }
    }
    for (const b of document.querySelectorAll("#tabs button")) b.textContent += ` (${n[b.dataset.v]})`;
  }

  async function avvia() {
    let j;
    try {
      const [r, ri] = await Promise.all([fetch("/api/screening", { cache: "no-store" }), fetch("data/index.json", { cache: "no-cache" }).catch(() => null)]);
      if (r.status === 401) { $("sottotitolo").textContent = "Accesso richiesto: effettua il login."; return; }
      j = await r.json();
      if (!r.ok) { $("sottotitolo").textContent = j.errore || "Errore nel caricamento."; return; }
      try { const ix = ri && ri.ok ? await ri.json() : { basi: [] }; for (const b of ix.basi || []) indice[b.chiave] = b; } catch (e) { /* senza range */ }
    } catch (e) { $("sottotitolo").textContent = "Errore di rete."; return; }
    righe = j.righe;
    $("sottotitolo").textContent = `Screening del ${j.data || "n/d"} · ${righe.length} titoli`;
    if (!j.data) { $("avviso").hidden = false; $("avviso").textContent = "Nessun dato nel database: i punteggi arrivano dopo il prossimo screening del repo privato."; }
    else if (righe.length && !righe.some((r) => r.extra)) { $("avviso").hidden = false; $("avviso").textContent = "Mancano le colonne dello screening: aggiorna lo script di caricamento nel repo privato e rilancialo."; }
    for (const b of document.querySelectorAll("#tabs button")) b.addEventListener("click", () => {
      vista = b.dataset.v; document.querySelectorAll("#tabs button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); disegna();
    });
    for (const id of ["f-col", "f-min"]) $(id).addEventListener("change", disegna);
    $("f-cerca").addEventListener("input", disegna);
    $("tab").addEventListener("click", (e) => {
      const th = e.target.closest("th"); if (!th) return;
      ord = { k: th.dataset.k, asc: ord.k === th.dataset.k ? !ord.asc : false }; disegna();
    });
    conteggi(); disegna();
  }
  avvia();
})();
