// Finestra di dettaglio di un titolo (stessa scheda di «Basi di accumulo»): grafico con range, POC/VWAP e livelli personali + tutte le informazioni.
// Uso: Scheda.apri("ADBE"). Un clic su un elemento con data-scheda="TICKER" la apre. I dati riservati (screening, watchlist) richiedono il login.
window.Scheda = (() => {
  const LIB = "vendor/lightweight-charts.standalone.production.js";
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const nz = (x) => (typeof x === "number" && Number.isFinite(x) ? x : null);
  const nomeFile = (t) => [...t].map((c) => (/[A-Za-z0-9\-_.]/.test(c) ? c : "_")).join("");
  const fmt = (v) => (nz(v) === null ? "–" : Number(v).toLocaleString("it-IT", { maximumFractionDigits: 2 }));
  let cache = null, libP = null, chart = null;

  const libreria = () => libP || (libP = window.LightweightCharts ? Promise.resolve() : new Promise((ok, ko) => {
    const s = document.createElement("script"); s.src = LIB; s.onload = ok; s.onerror = ko; document.head.append(s); }));
  async function dati() {
    if (cache) return cache;
    const j = (u) => fetch(u, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const [ix, sc, wl] = await Promise.all([j("data/index.json"), j("/api/screening"), j("/api/dati/watchlist")]);
    const scr = {}; for (const r of (sc && sc.righe) || []) scr[r.ticker] = r;
    const w = {}; for (const e of ((wl && wl.dati) || {}).entries || []) w[e.ticker] = e;
    const basi = {}; for (const b of (ix && ix.basi) || []) { const [t, tf] = String(b.chiave).split("|"); (basi[t] = basi[t] || {})[tf] = b; }
    return (cache = { scr, w, basi, puoMod: !!(wl && wl.puo_modificare), dataScr: sc && sc.data, ath: (ix && ix.titoli) || {} });
  }
  class Rettangolo {
    constructor(t1, top, bottom, colore) { this.t1 = t1; this.top = top; this.bottom = bottom; this.colore = colore; }
    attached({ chart: c, series }) { this.chart = c; this.series = series; }
    detached() {} updateAllViews() {}
    paneViews() { return [{ zOrder: () => "bottom", renderer: () => ({ draw: (t) => this.disegna(t) }) }]; }
    disegna(target) {
      target.useBitmapCoordinateSpace((s) => {
        const x1 = this.chart.timeScale().timeToCoordinate(this.t1), y1 = this.series.priceToCoordinate(this.top), y2 = this.series.priceToCoordinate(this.bottom);
        if (y1 == null || y2 == null) return;
        const xa = Math.max(0, x1 == null ? 0 : x1) * s.horizontalPixelRatio;
        s.context.fillStyle = this.colore;
        s.context.fillRect(xa, Math.min(y1, y2) * s.verticalPixelRatio, s.bitmapSize.width - xa, Math.abs(y2 - y1) * s.verticalPixelRatio);
      });
    }
  }
  const zona = (t) => { const m = /([\d.]+)\s*[–-]\s*([\d.]+)/.exec(String(t || "")); return m ? [Number(m[1]), Number(m[2])] : null; };
  // Due etichette di livello più vicine di così (in pixel verticale) si accavallano:
  // sui range stretti le etichette si tolgono (la linea resta), top e bottom mai.
  const SOGLIA_ETICHETTE_PX = 14;
  const SEZ = [
    ["Segnale", ["Segnale", "Seg_Punti", "Origine_Segnale", "Priorità", "Confluenza", "Trend", "In zona", "Sifrediana_Today"]],
    ["Prezzo e tecnica", ["Prezzo", "DD%", "DD_2a%", "RSI", "ATR%", "SMA50", "SMA200", "Dist_SMA200%", "Sopra_SMA200", "W_SMA13", "W_SMA52", "Ret_4s%", "RS_4s%"]],
    ["Livelli", ["Z1c", "VWAP60", "VWA1", "VWA2", "VWA3", "Z1", "Z2", "Bottom", "Bottom_DD", "Bottom_RSI", "Bottom_Zona", "Bottom_Decel"]],
    ["Qualità e fondamentali", ["Health", "H_ROE", "H_DE", "H_Margine", "H_Crescita", "H_FCF", "PE_trailing", "PE_forward", "EV_EBITDA", "P_S", "Qualita_Dati"]],
    ["Wyckoff, insider, squeeze", ["Wyckoff", "W_Score", "Insider_Cluster", "WI_Confluence", "Short_Float_%", "Squeeze"]],
    ["Settore", ["Settore", "Sector", "SectorETF", "SectorScore", "Δ EW−CW", "Vento", "Sotto-settore", "SottoScore", "SottoΔ", "Z_Sconto_Settore", "Z_Medio_Settore"]],
    ["Bonus (somma di lettura)", ["Bonus_Settore", "Bonus_Confluenza", "Bonus_Sifrediana", "Bonus_Insider", "Bonus_WI", "Bonus_Regime", "Bonus_Volatilita", "Bonus_Compresso", "Bonus_Totale"]],
  ];
  const ETI = { Z1c: "POC (centro zona 1)", VWA1: "VWAP ancorato 1", VWA2: "VWAP ancorato 2", VWA3: "VWAP ancorato 3", Seg_Punti: "Punti del segnale", H_ROE: "ROE", H_DE: "Debito/Equity", H_Margine: "Margine", H_Crescita: "Crescita", H_FCF: "Free cash flow", "DD%": "Drawdown max 5a %", "DD_2a%": "Drawdown 2a %" };
  const fx = (v) => (typeof v === "boolean" ? (v ? "sì" : "no") : typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : String(v));

  function sezioni(sc, w) {
    const g = el("div", "sezioni");
    const sez = (t, voci) => { if (!voci.length) return; const s = el("section"); s.append(el("h4", null, t));
      for (const [k, v] of voci) { const r = el("div"); r.append(el("span", null, k), el("b", null, v)); s.append(r); } g.append(s); };
    if (sc) {
      const x = sc.extra || {};
      for (const [t, ks] of SEZ) sez(t, ks.filter((k) => x[k] !== undefined && x[k] !== null && x[k] !== "" && x[k] !== "—").map((k) => [ETI[k] || k, k === "Seg_Punti" ? x[k] + "/6" : fx(x[k])]));
      sez("Flag del segnale", ["B", "C", "G", "D", "E"].filter((k) => x["Seg_" + k] !== undefined && x["Seg_" + k] !== null).map((k) => [k, x["Seg_" + k] ? "✔" : "·"]));
    }
    if (w) sez("Watchlist", [["Origine", w.origin === "manual" ? "👤 manuale" : "🤖 automatica"], ["Aggiunto", (w.created || "").slice(0, 10)], ["Ultima revisione", (w.last_reviewed || "").slice(0, 10)],
      ["Livelli personali", ["L1", "L2", "L3"].filter((k) => w.levels && w.levels[k]).map((k) => `${k} ${w.levels[k]}`).join(" · ") || "–"], ["Data target", w.target_date || "–"],
      ["Settore (file)", [w.sector, w.sub].filter(Boolean).join(" / ") || "–"]].filter(([, v]) => v !== "–" && v !== ""));
    if (!g.children.length) g.append(el("p", "nota", "Nessuna scheda di screening per questo simbolo (indici e materie prime hanno solo grafico e range); se è un titolo, effettua il login."));
    return g;
  }

  function chiudi() { if (chart) { chart.remove(); chart = null; } document.getElementById("scheda-ov")?.remove(); document.body.style.overflow = ""; document.removeEventListener("keydown", tasto); }
  const tasto = (e) => { if (e.key === "Escape") chiudi(); };

  async function apri(ticker) {
    chiudi();
    const ov = el("div", "scheda-ov"); ov.id = "scheda-ov"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true");
    const fin = el("div", "scheda"); ov.append(fin); document.body.append(ov); document.body.style.overflow = "hidden";
    ov.addEventListener("click", (e) => { if (e.target === ov) chiudi(); }); document.addEventListener("keydown", tasto);
    const testa = el("div", "scheda-testa"); testa.append(el("h2", null, ticker));
    const x = el("button", "az", "✕ Chiudi"); x.type = "button"; x.addEventListener("click", chiudi); testa.append(x); fin.append(testa);
    const corpo = el("div"); corpo.append(el("p", "nota", "Caricamento…")); fin.append(corpo);
    const d = await dati(), sc = d.scr[ticker], w = d.w[ticker], basi = d.basi[ticker] || {};
    if (!document.getElementById("scheda-ov")) return;                       // chiusa nel frattempo
    corpo.replaceChildren();
    const badge = el("div", "scheda-badge");
    for (const tf of ["1W", "1D"]) { const b = basi[tf]; if (b) badge.append(el("span", "badge", `${tf === "1W" ? "Sett." : "Giorn."}: ${({ in_range: "in range", rallenta: "rallenta", uscito_sopra: "uscito sopra", uscito_sotto: "uscito sotto" })[b.stato] || b.stato}`)); }
    if (sc && sc.punti != null && sc.segnale && sc.segnale !== "—") badge.append(el("span", "badge", `punteggio ${sc.punti}/6`));
    if (w) badge.append(el("span", "badge", w.origin === "manual" ? "👀 watchlist 👤" : "👀 watchlist 🤖"));
    const tv = el("a", "link", "📈 TradingView"); tv.href = "https://www.tradingview.com/chart/?symbol=" + encodeURIComponent(ticker); tv.target = "_blank"; tv.rel = "noopener noreferrer";
    const yf = el("a", "link", "Yahoo Finance"); yf.href = "https://finance.yahoo.com/quote/" + encodeURIComponent(ticker); yf.target = "_blank"; yf.rel = "noopener noreferrer";
    badge.append(tv, yf); corpo.append(badge);
    if (d.puoMod && !w) {                                           // «Promuovi in watchlist»: solo per chi può scrivere
      const bw = el("button", "az pri", "👀 Aggiungi alla watchlist"); bw.type = "button";
      const es = el("span", "muted"); bw.addEventListener("click", async () => {
        bw.disabled = true; es.textContent = "Salvo…";
        try {
          const r = await fetch("/api/watchlist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "add", ticker, levels: {}, target_date: null }) });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(j.errore || "errore " + r.status);
          d.w[ticker] = { ticker, origin: "manual", created: new Date().toISOString(), levels: {} }; bw.remove(); es.textContent = "✅ Aggiunto alla watchlist (👤 manuale)";
        } catch (e) { bw.disabled = false; es.textContent = "❌ " + e.message; }
      });
      badge.append(bw, es);
    }
    {                                                               // spiegazione AI (stesso motore di «Basi di accumulo»)
      const ba = el("button", "az", "🧠 Spiegazione AI"); ba.type = "button";
      const box = el("div", "scheda-ai"); box.hidden = true;
      ba.addEventListener("click", async () => {
        ba.disabled = true; box.hidden = false; box.replaceChildren(el("p", "nota", "Sto preparando la spiegazione… (può richiedere qualche secondo)"));
        try {
          const r = await fetch("/api/analisi", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ticker }) });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(j.errore || "errore " + r.status);
          box.replaceChildren();
          for (const riga of String(j.testo).split(/\n+/).map((x) => x.trim()).filter(Boolean)) box.append(/^[A-ZÀ-Ü' ]{6,}:?$/.test(riga) ? el("h4", null, riga.replace(/:$/, "")) : el("p", null, riga));
          box.append(el("p", "nota", `Riassunto automatico dei numeri del portale (dati del ${j.aggiornato || "?"}${j.cache ? ", da cache" : ""}): non è un consiglio operativo.`));
        } catch (e) { box.replaceChildren(el("p", "nota", "❌ " + e.message)); }
        ba.disabled = false;
      });
      badge.append(ba); corpo.append(box);
    }

    const serie = await fetch(`data/serie/${nomeFile(ticker)}.json`, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const tfs = ["1D", "1W"].filter((t) => serie && serie[t] && serie[t].length);
    if (tfs.length) {
      let tf = basi["1D"] || !basi["1W"] ? "1D" : "1W"; if (!tfs.includes(tf)) tf = tfs[0];
      const lv = { poc: true, vwap: true, anc: false, zone: false, miei: true, range: true };
      const barraTf = el("div", "scheda-barra"), box = el("div", "scheda-grafico"), barraLiv = el("div", "livelli");
      const disegna = async () => {
        await libreria(); if (chart) { chart.remove(); chart = null; } box.replaceChildren();
        const LW = window.LightweightCharts, b = basi[tf], xx = (sc && sc.extra) || {}, barre = serie[tf];
        chart = LW.createChart(box, { autoSize: true, layout: { background: { color: "transparent" }, textColor: css("--muto"), fontSize: 12 },
          grid: { vertLines: { color: css("--griglia-chart") }, horzLines: { color: css("--griglia-chart") } }, rightPriceScale: { borderColor: css("--bordo") },
          timeScale: { borderColor: css("--bordo"), timeVisible: false, rightOffset: 6 }, crosshair: { mode: 0 } });
        const c = chart.addSeries(LW.CandlestickSeries, { upColor: css("--verde"), downColor: css("--rosso"), borderVisible: false, wickUpColor: css("--verde"), wickDownColor: css("--rosso") });
        c.setData(barre.map((q) => ({ time: q.t, open: q.o, high: q.h, low: q.l, close: q.c })));
        const n = barre.length, v = tf === "1W" ? 156 : 260;
        if (n > v) chart.timeScale().setVisibleLogicalRange({ from: n - v, to: n + 5 }); else chart.timeScale().fitContent();
        // prima il range visibile (l'autoscala dipende dalle barre visibili),
        // poi si raccolgono le linee e si decide QUALI tengono l'etichetta:
        // top e bottom del range sempre; le altre solo se non si accavallano.
        const linee = [];
        if (b && lv.range) {
          c.attachPrimitive(new Rettangolo(b.inizio, b.top, b.bottom, b.stato === "in_range" ? "rgba(46,166,111,.14)" : b.stato === "rallenta" ? "rgba(217,162,59,.14)" : "rgba(76,141,255,.12)"));
          linee.push({ prezzo: b.top, nome: "top", colore: css("--verde"), stile: 2, fissa: true });
          linee.push({ prezzo: b.bottom, nome: "bottom", colore: css("--rosso"), stile: 2, fissa: true });
        }
        if (lv.poc && nz(xx.Z1c) !== null) linee.push({ prezzo: xx.Z1c, nome: "POC", colore: "#f59e0b", stile: 0 });
        if (lv.vwap && nz(xx.VWAP60) !== null) linee.push({ prezzo: xx.VWAP60, nome: "VWAP60", colore: "#a855f7", stile: 0 });
        if (lv.anc) ["VWA1", "VWA2", "VWA3"].forEach((k, i) => { if (nz(xx[k]) !== null) linee.push({ prezzo: xx[k], nome: "VWAP anc." + (i + 1), colore: "#ec4899", stile: 3 }); });
        if (lv.zone) for (const [k, col] of [["Z1", "rgba(245,158,11,.13)"], ["Z2", "rgba(245,158,11,.07)"]]) { const z = zona(xx[k]); if (z) c.attachPrimitive(new Rettangolo(barre[0].t, Math.max(...z), Math.min(...z), col)); }
        if (lv.miei && w && w.levels) for (const k of ["L1", "L2", "L3"]) if (nz(w.levels[k]) !== null && w.levels[k] > 0) linee.push({ prezzo: w.levels[k], nome: k + " (mio)", colore: "#38bdf8", stile: 1 });
        const visibili = [];
        for (const l of linee) {
          const y = c.priceToCoordinate(l.prezzo);
          const libera = y == null || visibili.every((g) => g.y == null || Math.abs(g.y - y) >= SOGLIA_ETICHETTE_PX);
          if (l.fissa || libera) {
            l.y = y; visibili.push(l);
            c.createPriceLine({ price: l.prezzo, color: l.colore, lineWidth: 1, lineStyle: l.stile, axisLabelVisible: true, title: l.nome });
          } else {
            c.createPriceLine({ price: l.prezzo, color: l.colore, lineWidth: 1, lineStyle: l.stile, axisLabelVisible: false, title: "" });
          }
        }
        box.dataset.etichette = visibili.map((l) => l.nome).join(" · ");   // quali etichette sono visibili (test e screen reader)
      };
      for (const t of tfs) { const bt = el("button", "az" + (t === tf ? " pri" : ""), t === "1W" ? "Settimanale" : "Giornaliero"); bt.type = "button";
        bt.addEventListener("click", () => { tf = t; [...barraTf.children].forEach((x2) => x2.classList.toggle("pri", x2 === bt)); disegna(); }); barraTf.append(bt); }
      const voci = [["range", "Range"], ["poc", "POC"], ["vwap", "VWAP 60"], ["anc", "VWAP ancorati"], ["zone", "Zone volumetriche"]];
      if (w && w.levels && Object.keys(w.levels).length) voci.push(["miei", "Miei livelli"]);
      barraLiv.append(el("span", "muted", "Sul grafico:"));
      for (const [k, n] of voci) { const l = el("label"), cb = el("input"); cb.type = "checkbox"; cb.checked = !!lv[k]; cb.addEventListener("change", () => { lv[k] = cb.checked; disegna(); }); l.append(cb, document.createTextNode(" " + n)); barraLiv.append(l); }
      corpo.append(barraTf, box, barraLiv); disegna().catch(() => box.replaceChildren(el("p", "nota", "Grafico non disponibile.")));
      const b = basi[tf]; if (b) corpo.append(el("p", "nota", `Range ${tf === "1W" ? "settimanale" : "giornaliero"}: ${fmt(b.bottom)} – ${fmt(b.top)} · ampiezza ${nz(b.ampiezza) !== null ? Math.round(b.ampiezza * 100) + "%" : "–"} · ${b.barre ?? "–"} barre`));
    } else corpo.append(el("p", "nota", "Grafico non disponibile: questo titolo non è nell'universo dei range di basewatch (le serie si generano solo per i titoli in watchlist con un range)."));
    corpo.append(sezioni(sc, w));
    if (sc && d.dataScr) corpo.append(el("p", "nota", `Dati dello screening del ${d.dataScr}. Lettura, mai ordine.`));
  }
  document.addEventListener("click", (e) => { const t = e.target.closest("[data-scheda]"); if (t) { e.preventDefault(); e.stopPropagation(); apri(t.dataset.scheda); } }, true);
  return { apri, chiudi };
})();
