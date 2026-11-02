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

  const REPO = "Logg84/monitor-visivo", FILE_OVERRIDE = "data/override.json";
  let basi = [], titoli = {}, gruppi = [];
  let me = { modalita: "codice" };           // chi sono: da /api/me (Cloudflare Access) o modalità a codice
  const cacheSerie = new Map();
  const nomeFile = (t) => [...t].map((c) => (/[A-Za-z0-9\-_.]/.test(c) ? c : "_")).join("");
  const leggiToken = () => { try { return localStorage.getItem("bw_token") || ""; } catch (e) { return ""; } };
  async function serieDi(ticker) {
    if (!cacheSerie.has(ticker)) {
      cacheSerie.set(ticker, fetch(`data/serie/${nomeFile(ticker)}.json`, { cache: "no-cache" })
        .then((r) => (r.ok ? r.json() : null)).catch(() => null));
    }
    return cacheSerie.get(ticker);
  }
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

  function creaGrafico(box, b, barre, altro, dim) {
    const colTesto = css("--muto"), colGriglia = css("--griglia-chart"), colBordo = css("--bordo");
    const chart = LW.createChart(box, {
      ...(dim ? { autoSize: false, width: dim.w, height: dim.h } : { autoSize: true }),
      layout: { background: { color: dim ? css("--superficie") : "transparent" }, textColor: colTesto, fontSize: dim ? 13 : 11 },
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
    if (altro) {   // riferimenti dell'altro timeframe: stesse soglie viste da qui
      const t = altro.tf === "1W" ? "sett." : "giorn.";
      for (const [prezzo, nome] of [[altro.b.top, "top " + t], [altro.b.bottom, "bottom " + t]]) {
        candele.createPriceLine({ price: prezzo, color: css("--altro"), lineWidth: 1, lineStyle: 1,
                                  axisLabelVisible: true, title: nome });
      }
    }
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
    if (b.manuale) testa.append(eEl("span", "badge b-manuale", "manuale"));
    testa.append(sel);
    const bz = eEl("button", "zoom", g.schermo ? "✕ Chiudi" : "⤢ Schermo intero");
    bz.type = "button"; bz.title = "Schermo intero (Esc per chiudere)";
    bz.addEventListener("click", () => schermoIntero(g, !g.schermo));
    testa.append(bz);
    const box = eEl("div", "grafico");
    box.setAttribute("role", "img");
    box.setAttribute("aria-label", `Grafico ${g.ticker} ${NOME_TF[tf]} con range ${fmt(b.bottom)}–${fmt(b.top)}`);
    box.addEventListener("dblclick", () => schermoIntero(g, !g.schermo));
    const dati = eEl("div", "dati");
    const pos = posizione(b), ti = titoli[g.ticker];
    const voci = [
      ["Range", `${fmt(b.bottom)} – ${fmt(b.top)}`],
      ["Ampiezza", pct(b.ampiezza)],
      ["Dal minimo", `${b.barre} barre`],
      ["Ultima chiusura", fmt(b.ultimo)],
      ["Posizione nel range", pos == null ? "–" : pct(pos)],
      ["Swing (min/max)", `${b.swing_minimi ?? "–"} / ${b.swing_massimi ?? "–"}`],
      ["ATH", ti ? `${fmt(ti.ath)} (${ti.ath_data})` : "–"],
      ["Distanza da ATH", ti ? pct(ti.dist_ath, 1) : "–"],
      ["Calo prima della base", pct(b.calo)],
    ];
    for (const [k, v] of voci) { const d = eEl("div"); d.append(eEl("span", null, k), eEl("b", null, v)); dati.append(d); }
    const nota = eEl("p", "nota");
    nota.textContent = b.stato === "in_range"
      ? `Range congelato dal ${b.congelato_il ?? "—"}. Alert se una chiusura ${NOME_TF[tf].toLowerCase()} esce da ${fmt(b.bottom)}–${fmt(b.top)}.`
      : b.stato === "rallenta"
        ? "La discesa rallenta ma la struttura a 4 swing non è ancora completa: il range non è congelato."
        : `Uscito il ${b.uscito_il ?? "—"}. Si rivaluta solo se rientra nel range o riprende a scendere.`;
    const ta = tf === "1W" ? "1D" : "1W", ba = g.tfs[ta];
    if (ba && !storica(ba)) nota.textContent += ` Sul ${ta === "1W" ? "settimanale" : "giornaliero"}: ${NOME_STATO[ba.stato].toLowerCase()}, range ${fmt(ba.bottom)}–${fmt(ba.top)} (linee blu nel grafico).`;
    if (b.manuale) nota.textContent += " Range corretto a mano.";
    const az = eEl("div", "azioni");
    if (me.modalita !== "access" || me.admin) {
      const bm = eEl("button", "link", "✎ Modifica range"); bm.type = "button";
      bm.addEventListener("click", () => pannelloModifica(g, tf, az));
      az.append(bm);
    }
    const ba_ = eEl("button", "link", "🧠 Analisi AI"); ba_.type = "button";
    ba_.addEventListener("click", () => analisiAI(g));
    az.append(ba_);
    card.append(testa, box, dati, nota, az);
    if (g.ai) card.append(pannelloAI(g.ai));
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

  async function montaGrafico(g) {
    const b = g.tfs[g.tf], tf = g.tf, box = g.box;
    g.disegnato = true;
    const dati = await serieDi(g.ticker);
    if (g.tf !== tf || g.box !== box) return;          // nel frattempo la card è cambiata
    const barre = dati && dati[tf];
    if (!barre || !barre.length) { box.replaceChildren(eEl("p", "nota", "Grafico non disponibile per questo titolo.")); return; }
    if (g.chart) { g.chart.remove(); g.chart = null; }
    const ta = tf === "1W" ? "1D" : "1W", ba = g.tfs[ta];
    const altro = ba && !storica(ba) ? { tf: ta, b: ba } : null;
    g.chart = creaGrafico(box, b, barre, altro);
  }
  function osserva(g) { g.disegnato = false; if (g.chart) { g.chart.remove(); g.chart = null; } osservatore.observe(g.card); montaGrafico(g); }

  // ── Analisi AI (tecnica + fondamentale), generata su richiesta dal Worker ──
  const AVVISO_AI = "Testo generato automaticamente da un modello linguistico a partire dai soli dati del portale (grafici, prezzi di chiusura e fondamentali Yahoo Finance): può contenere errori, non include notizie. Non è un consiglio di investimento né un ordine: la decisione di aprire un trade è solo tua.";
  function pannelloAI(ai) {
    const box = eEl("div", "ai");
    if (ai.caricamento) { box.append(eEl("p", "nota", "Analisi in corso…")); return box; }
    if (ai.errore) { box.append(eEl("p", "esito", "Analisi non disponibile: " + ai.errore)); return box; }
    for (const par of ai.testo.split(/\n{2,}|\n(?=[A-ZÀ-Ü' ]{6,}\s*$)/m).filter((x) => x.trim())) {
      const righe = par.trim().split("\n");
      if (/^[A-ZÀ-Ü' ]{6,}$/.test(righe[0].trim())) { box.append(eEl("h4", null, righe.shift().trim())); }
      if (righe.length) box.append(eEl("p", null, righe.join(" ").trim()));
    }
    box.append(eEl("p", "avviso", AVVISO_AI + (ai.fondamentali ? "" : " Fondamentali non disponibili per questo titolo.")));
    return box;
  }
  // Screenshot di un grafico (fuori schermo) da allegare all'analisi: JPEG ridotto.
  async function catturaGrafico(g, tf) {
    const b = g.tfs[tf], dati = await serieDi(g.ticker), barre = dati && dati[tf];
    if (!b || !barre || !barre.length) return null;
    const div = eEl("div"); div.style.cssText = "position:fixed;left:-3000px;top:0;width:960px;height:520px";
    document.body.append(div);
    try {
      const ta = tf === "1W" ? "1D" : "1W", ba = g.tfs[ta];
      const chart = creaGrafico(div, b, barre, ba && !storica(ba) ? { tf: ta, b: ba } : null, { w: 960, h: 520 });
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const url = chart.takeScreenshot().toDataURL("image/jpeg", 0.82);
      chart.remove();
      return { tf, img: url };
    } catch (e) { return null; } finally { div.remove(); }
  }

  async function analisiAI(g) {
    let codice = "";
    if (me.modalita !== "access") {
      try { codice = localStorage.getItem("bw_codice") || ""; } catch (e) { /* senza storage */ }
    }
    if (!codice && me.modalita !== "access") {
      codice = (prompt("Codice di accesso all'analisi AI (lo imposti tu nei secret Cloudflare):") || "").trim();
      if (!codice) return;
    }
    g.ai = { caricamento: true }; disegnaCard(g, g.tf); osserva(g);
    try {
      const immagini = (await Promise.all(["1W", "1D"].filter((t) => g.tfs[t] && !storica(g.tfs[t])).map((t) => catturaGrafico(g, t)))).filter(Boolean);
      const r = await fetch("/api/analisi", { method: "POST", headers: { "content-type": "application/json", ...(codice ? { "x-codice": codice } : {}) },
                                              body: JSON.stringify({ ticker: g.ticker, immagini }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (r.status === 401) { try { localStorage.removeItem("bw_codice"); } catch (e) { /* nulla */ } }
        throw new Error(j.errore || `errore ${r.status}`);
      }
      if (codice) { try { localStorage.setItem("bw_codice", codice); } catch (e) { /* nulla */ } }
      g.ai = j;
    } catch (e) { g.ai = { errore: e.message }; }
    disegnaCard(g, g.tf); osserva(g);
  }

  // ── Schermo intero: la card diventa un overlay (Esc o ✕ per chiudere) ─────
  function schermoIntero(g, on) {
    for (const x of gruppi) if (x !== g && x.schermo) { x.schermo = false; x.card.classList.remove("schermo"); disegnaCard(x, x.tf); osserva(x); }
    g.schermo = on;
    g.card.classList.toggle("schermo", on);
    document.body.classList.toggle("blocca", on);
    disegnaCard(g, g.tf); osserva(g);
    if (on) g.card.scrollTop = 0;
  }
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const g = gruppi.find((x) => x.schermo);
    if (g) schermoIntero(g, false);
  });

  // ── Modifica a mano del range (salvata nel repo: data/override.json) ──────
  const b64 = (txt) => btoa(String.fromCharCode(...new TextEncoder().encode(txt)));
  const deb64 = (b) => new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\n/g, "")), (c) => c.charCodeAt(0)));

  async function salvaOverride(chiave, valori, token) {
    const url = `https://api.github.com/repos/${REPO}/contents/${FILE_OVERRIDE}`;
    const h = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" };
    for (let tentativo = 0; tentativo < 2; tentativo++) {
      let sha, attuale = {};
      const r = await fetch(url, { headers: h, cache: "no-store" });
      if (r.ok) { const j = await r.json(); sha = j.sha; try { attuale = JSON.parse(deb64(j.content)); } catch (e) { attuale = {}; } }
      else if (r.status !== 404) throw new Error(r.status === 401 || r.status === 403 ? "token non valido o senza permesso di scrittura" : `GitHub ${r.status}`);
      attuale[chiave] = valori;
      const p = await fetch(url, { method: "PUT", headers: h, body: JSON.stringify({
        message: `override range ${chiave}`, content: b64(JSON.stringify(attuale, null, 1) + "\n"), sha }) });
      if (p.ok) return;
      if (p.status !== 409 && p.status !== 422) throw new Error(p.status === 401 || p.status === 403 ? "token non valido o senza permesso di scrittura" : `GitHub ${p.status}`);
    }
    throw new Error("conflitto di salvataggio, riprova");
  }

  function pannelloModifica(g, tf, contenitore) {
    const b = g.tfs[tf];
    contenitore.replaceChildren();
    const form = eEl("form", "modifica");
    const campo = (nome, val) => {
      const l = eEl("label", null, nome + " ");
      const i = eEl("input"); i.type = "number"; i.step = "any"; i.value = val; i.required = true;
      l.append(i); form.append(l); return i;
    };
    const iTop = campo("Top", b.top), iBot = campo("Bottom", b.bottom);
    const salva = eEl("button", "primario", "Salva"); salva.type = "submit";
    const annulla = eEl("button", "link", "Annulla"); annulla.type = "button";
    const esito = eEl("span", "esito");
    annulla.addEventListener("click", () => disegnaCard(g, tf) || osserva(g));
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const top = parseFloat(iTop.value), bottom = parseFloat(iBot.value);
      if (!(top > bottom && bottom > 0)) { esito.textContent = "Il top deve essere maggiore del bottom."; return; }
      if (me.modalita === "access") {            // login: il Worker scrive per conto dell'admin, nessun token nel browser
        salva.disabled = true; esito.textContent = "Salvataggio…";
        try {
          const r = await fetch("/api/range", { method: "POST", headers: { "content-type": "application/json" },
                                                body: JSON.stringify({ chiave: `${g.ticker}|${tf}`, top, bottom }) });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(j.errore || `errore ${r.status}`);
          Object.assign(b, { top, bottom, manuale: [top, bottom], ampiezza: top / bottom - 1 });
          disegnaCard(g, tf); osserva(g);
          g.card.querySelector(".azioni").append(eEl("span", "esito", "Salvato. Il motore lo applica al prossimo giro (circa 2 minuti): fino ad allora vale solo qui."));
        } catch (e) { esito.textContent = "Non salvato: " + e.message; salva.disabled = false; }
        return;
      }
      let token = leggiToken();
      if (!token) {
        token = (prompt("Token GitHub (fine-grained, solo repo monitor-visivo, Contents: Read and write).\nResta salvato solo in questo browser:") || "").trim();
        if (!token) return;
      }
      salva.disabled = true; esito.textContent = "Salvataggio…";
      try {
        await salvaOverride(`${g.ticker}|${tf}`, { top, bottom }, token);
        try { localStorage.setItem("bw_token", token); } catch (e) { /* senza storage va richiesto ogni volta */ }
        Object.assign(b, { top, bottom, manuale: [top, bottom], ampiezza: top / bottom - 1 });
        disegnaCard(g, tf); osserva(g);
        g.card.querySelector(".azioni").append(eEl("span", "esito", "Salvato. Il motore lo applica al prossimo giro (circa 2 minuti): fino ad allora vale solo qui."));
      } catch (e) {
        esito.textContent = "Non salvato: " + e.message;
        if (/token/.test(e.message)) { try { localStorage.removeItem("bw_token"); } catch (x) { /* nulla */ } }
        salva.disabled = false;
      }
    });
    form.append(salva, annulla, esito);
    contenitore.append(form);
  }

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
    if (cerca) return !storica(b);          // cercando un ticker si ignora il filtro di stato
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
      const m = await fetch("/api/me", { cache: "no-store" });
      if (m.ok) me = await m.json();
    } catch (e) { /* resta la modalità a codice */ }
    try {
      const i = await fetch("data/index.json", { cache: "no-cache" });
      if (!i.ok) throw new Error(`HTTP ${i.status}`);
      const idx = await i.json(); basi = idx.basi || []; titoli = idx.titoli || {};
      const quando = new Date(idx.aggiornato);
      $("sottotitolo").textContent = (me.modalita === "access" ? `${me.email}${me.admin ? " (admin)" : ""} · ` : "") + `Aggiornato ${quando.toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" })} · ${basi.length} stati su ${new Set(basi.map((b) => b.chiave.split("|")[0])).size} titoli`;
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
