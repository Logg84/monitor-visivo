/* Basi di accumulo — sito statico. Dati: data/index.json (stato) e data/serie.json (candele). */
(() => {
  "use strict";
  const LW = window.LightweightCharts;
  const NOME_STATO = { in_range: "In range", rallenta: "Rallenta", uscito_sopra: "Uscito sopra", uscito_sotto: "Uscito sotto" };
  const NOME_TF = { "1W": "Settimanale", "1D": "Giornaliero" };
  const RANGO = { in_range: 3, uscito_sopra: 2, uscito_sotto: 2, rallenta: 1 };
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const $ = (id) => document.getElementById(id);
  const fmt = (x, d = 2) => (x == null ? "–" : Number(x).toLocaleString("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d }));
  const pct = (x, d = 0) => (x == null ? "–" : (x * 100).toLocaleString("it-IT", { maximumFractionDigits: d }) + "%");
  const eEl = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

  let basi = [], serie = {}, gruppi = [];
  const grafici = new Map();            // elemento card → { chart, ro }

  // ── Rettangolo del range (primitive di Lightweight Charts) ─────────────
  class Rettangolo {
    constructor(t1, top, bottom, colore) { this.t1 = t1; this.top = top; this.bottom = bottom; this.colore = colore; }
    attached({ chart, series }) { this.chart = chart; this.series = series; }
    detached() {}
    updateAllViews() {}
    paneViews() { return [{ zOrder: () => "bottom", renderer: () => ({ draw: (target) => this.disegna(target) }) }]; }
    disegna(target) {
      target.useBitmapCoordinateSpace((s) => {
        const x1 = this.chart.timeScale().timeToCoordinate(this.t1);
        const y1 = this.series.priceToCoordinate(this.top);
        const y2 = this.series.priceToCoordinate(this.bottom);
        if (y1 == null || y2 == null) return;
        const xa = Math.max(0, x1 == null ? 0 : x1) * s.horizontalPixelRatio;
        const ctx = s.context;
        ctx.fillStyle = this.colore;
        ctx.fillRect(xa, Math.min(y1, y2) * s.verticalPixelRatio, s.bitmapSize.width - xa,
                     Math.abs(y2 - y1) * s.verticalPixelRatio);
      });
    }
  }

  function creaGrafico(box, b, barre) {
    const colTesto = css("--muto"), colGriglia = css("--griglia-chart"), colBordo = css("--bordo");
    const chart = LW.createChart(box, {
      autoSize: true,
      layout: { background: { color: "transparent" }, textColor: colTesto, fontSize: 11 },
      grid: { vertLines: { color: colGriglia }, horzLines: { color: colGriglia } },
      rightPriceScale: { borderColor: colBordo },
      timeScale: { borderColor: colBordo, timeVisible: false, rightOffset: 6 },
      crosshair: { mode: 0 },
    });
    const candele = chart.addSeries(LW.CandlestickSeries, {
      upColor: css("--verde"), downColor: css("--rosso"), borderVisible: false,
      wickUpColor: css("--verde"), wickDownColor: css("--rosso"),
    });
    candele.setData(barre.map((x) => ({ time: x.t, open: x.o, high: x.h, low: x.l, close: x.c })));
    const attivo = b.stato === "in_range" || b.stato === "rallenta";
    const colore = attivo ? (b.stato === "in_range" ? "rgba(46,166,111,.14)" : "rgba(217,162,59,.14)") : "rgba(76,141,255,.12)";
    candele.attachPrimitive(new Rettangolo(b.inizio, b.top, b.bottom, colore));
    candele.createPriceLine({ price: b.top, color: css("--verde"), lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "top" });
    candele.createPriceLine({ price: b.bottom, color: css("--rosso"), lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "bottom" });
    chart.timeScale().fitContent();
    return chart;
  }

  // ── Card ───────────────────────────────────────────────────────────────
  function posizione(b) {
    const h = b.top - b.bottom;
    return h > 0 ? (b.ultimo - b.bottom) / h : null;
  }

  function disegnaCard(g, tf) {
    const b = g.tfs[tf];
    const card = g.card;
    card.replaceChildren();
    const testa = eEl("div", "card-testa");
    testa.append(eEl("span", "ticker", g.ticker), eEl("span", `badge b-${b.stato}`, NOME_STATO[b.stato]));
    const sel = eEl("div", "tf");
    for (const t of ["1W", "1D"]) {
      const bt = eEl("button", null, t === "1W" ? "Sett." : "Giorn.");
      bt.type = "button";
      bt.setAttribute("aria-pressed", String(t === tf));
      bt.setAttribute("aria-label", NOME_TF[t]);
      bt.disabled = !g.tfs[t];
      bt.addEventListener("click", () => { g.tf = t; disegnaCard(g, t); osserva(g); });
      sel.append(bt);
    }
    testa.append(sel);
    const box = eEl("div", "grafico");
    box.setAttribute("role", "img");
    box.setAttribute("aria-label", `Grafico ${g.ticker} ${NOME_TF[tf]} con range ${fmt(b.bottom)}–${fmt(b.top)}`);
    const dati = eEl("div", "dati");
    const pos = posizione(b);
    const voci = [
      ["Range", `${fmt(b.bottom)} – ${fmt(b.top)}`],
      ["Ampiezza", pct(b.ampiezza)],
      ["Dal minimo", `${b.barre} barre`],
      ["Ultima chiusura", fmt(b.ultimo)],
      ["Posizione nel range", pos == null ? "–" : pct(pos)],
      ["Swing (min/max)", `${b.swing_minimi ?? "–"} / ${b.swing_massimi ?? "–"}`],
    ];
    for (const [k, v] of voci) { const d = eEl("div"); d.append(eEl("span", null, k), eEl("b", null, v)); dati.append(d); }
    const nota = eEl("p", "nota");
    nota.textContent = b.stato === "in_range"
      ? `Range congelato dal ${b.congelato_il ?? "—"}. Alert se una chiusura ${NOME_TF[tf].toLowerCase()} esce da ${fmt(b.bottom)}–${fmt(b.top)}.`
      : b.stato === "rallenta"
        ? "La discesa rallenta ma la struttura a 4 swing non è ancora completa: il range non è congelato."
        : `Uscito il ${b.uscito_il ?? "—"}. Si rivaluta solo se rientra nel range o riprende a scendere.`;
    if (g.tfs["1W"] && g.tfs["1D"]) nota.textContent += ` Presente anche sul ${tf === "1W" ? "giornaliero" : "settimanale"} (${NOME_STATO[g.tfs[tf === "1W" ? "1D" : "1W"].stato].toLowerCase()}).`;
    card.append(testa, box, dati, nota);
    g.box = box;
  }

  // Disegna il grafico solo quando la card entra in vista (decine di grafici = pesante).
  const osservatore = new IntersectionObserver((voci) => {
    for (const v of voci) {
      if (!v.isIntersecting) continue;
      const g = gruppi.find((x) => x.card === v.target);
      if (g && !g.disegnato) { montaGrafico(g); }
    }
  }, { rootMargin: "300px" });

  function montaGrafico(g) {
    const b = g.tfs[g.tf];
    const barre = serie[g.ticker] && serie[g.ticker][g.tf];
    g.disegnato = true;
    if (!barre || !barre.length) { g.box.replaceChildren(eEl("p", "nota", "Grafico non disponibile per questo titolo.")); return; }
    if (g.chart) { g.chart.remove(); g.chart = null; }
    g.chart = creaGrafico(g.box, b, barre);
  }
  function osserva(g) { g.disegnato = false; if (g.chart) { g.chart.remove(); g.chart = null; } osservatore.observe(g.card); montaGrafico(g); }

  // ── Raggruppamento, filtri, ordine ──────────────────────────────────────
  function raggruppa() {
    const m = new Map();
    for (const b of basi) {
      const [ticker, tf] = b.chiave.split("|");
      if (!m.has(ticker)) m.set(ticker, { ticker, tfs: {} });
      m.get(ticker).tfs[tf] = b;
    }
    return [...m.values()].map((g) => {
      const ordine = ["1W", "1D"].filter((t) => g.tfs[t])
        .sort((a, c) => (RANGO[g.tfs[c].stato] - RANGO[g.tfs[a].stato]) || (a === "1W" ? -1 : 1));
      g.tf = ordine[0];                 // un solo timeframe in vista: il più avanzato (a parità, il settimanale)
      g.card = eEl("article", "card");
      return g;
    });
  }
  const storica = (b) => (b.stato === "uscito_sopra" || b.stato === "uscito_sotto") && b.prima_vista;
  const attiva = (b) => b.stato === "in_range" || b.stato === "rallenta";

  function visibile(g, filtro, cerca) {
    if (cerca && !g.ticker.toLowerCase().includes(cerca)) return false;
    const b = g.tfs[g.tf];
    if (filtro === "tutte") return !storica(b);
    if (filtro === "attive") return attiva(b);
    if (filtro === "uscite") return !attiva(b) && !storica(b);
    return b.stato === filtro;
  }
  const chiaveOrdine = {
    stato: (g) => -(RANGO[g.tfs[g.tf].stato] * 1000 + g.tfs[g.tf].barre),
    posizione: (g) => posizione(g.tfs[g.tf]) ?? 9,
    durata: (g) => -g.tfs[g.tf].barre,
    ticker: (g) => g.ticker,
  };

  function aggiorna() {
    const filtro = $("f-stato").value, ordine = $("f-ordine").value, cerca = $("f-cerca").value.trim().toLowerCase();
    const lista = gruppi.filter((g) => visibile(g, filtro, cerca))
      .sort((a, c) => { const x = chiaveOrdine[ordine](a), y = chiaveOrdine[ordine](c); return x < y ? -1 : x > y ? 1 : 0; });
    for (const g of gruppi) { osservatore.unobserve(g.card); if (g.chart) { g.chart.remove(); g.chart = null; } g.disegnato = false; }
    const griglia = $("griglia");
    griglia.replaceChildren();
    if (!lista.length) { griglia.append(eEl("p", "vuoto", "Nessun titolo con questi filtri.")); }
    for (const g of lista) { disegnaCard(g, g.tf); griglia.append(g.card); osservatore.observe(g.card); }
    $("conteggio").textContent = `${lista.length} ${lista.length === 1 ? "titolo" : "titoli"}`;
  }

  function tabellaStoriche() {
    const t = $("tab-storiche");
    const righe = basi.filter(storica).sort((a, c) => a.chiave.localeCompare(c.chiave));
    $("n-storiche").textContent = `(${righe.length})`;
    const testa = eEl("tr");
    for (const h of ["Titolo", "Timeframe", "Stato", "Bottom", "Top", "Ultima chiusura", "Uscita (barra)"]) testa.append(eEl("th", null, h));
    const thead = eEl("thead"); thead.append(testa);
    const tbody = eEl("tbody");
    for (const b of righe) {
      const [tk, tf] = b.chiave.split("|");
      const tr = eEl("tr");
      for (const v of [tk, NOME_TF[tf], NOME_STATO[b.stato], fmt(b.bottom), fmt(b.top), fmt(b.ultimo), b.uscita_data ?? "—"]) tr.append(eEl("td", null, v));
      tbody.append(tr);
    }
    t.replaceChildren(thead, tbody);
  }

  function riepilogo() {
    const c = { in_range: 0, rallenta: 0, uscite: 0 };
    for (const g of gruppi) { const b = g.tfs[g.tf]; if (storica(b)) continue; if (b.stato === "in_range") c.in_range++; else if (b.stato === "rallenta") c.rallenta++; else c.uscite++; }
    const el = $("riepilogo"); el.replaceChildren();
    for (const [k, v] of [["In range", c.in_range], ["Rallenta", c.rallenta], ["Uscite osservate", c.uscite]]) {
      const chip = eEl("span", "chip"); chip.append(document.createTextNode(k + " "), eEl("b", null, String(v))); el.append(chip);
    }
  }

  async function carica() {
    try {
      const [i, s] = await Promise.all([fetch("data/index.json", { cache: "no-cache" }), fetch("data/serie.json", { cache: "no-cache" })]);
      if (!i.ok || !s.ok) throw new Error(`HTTP ${i.status}/${s.status}`);
      const idx = await i.json(); serie = await s.json(); basi = idx.basi || [];
      const quando = new Date(idx.aggiornato);
      $("sottotitolo").textContent = `Aggiornato ${quando.toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" })} · ${basi.length} stati su ${new Set(basi.map((b) => b.chiave.split("|")[0])).size} titoli`;
    } catch (e) {
      $("sottotitolo").textContent = "Dati non disponibili: " + e.message;
      return;
    }
    gruppi = raggruppa();
    riepilogo(); tabellaStoriche(); aggiorna();
  }

  for (const id of ["f-stato", "f-ordine"]) $(id).addEventListener("change", aggiorna);
  let timer; $("f-cerca").addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(aggiorna, 150); });
  carica();
})();
