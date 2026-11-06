// Funzioni comuni delle pagine con dati personali (watchlist, portafoglio, condiviso).
window.C = (() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const num = (x) => { if (x === null || x === undefined || x === "") return null; const n = Number(x); return Number.isFinite(n) ? n : null; };
  const fmt = (v, d = 2) => (num(v) === null ? "–" : Number(v).toLocaleString("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d }));
  const dmy = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ""); return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : "–"; };
  const msg = (testo, tipo = "ok") => { const e = $("esito"); e.innerHTML = testo ? `<div class="msg ${tipo}" role="status">${esc(testo)}</div>` : ""; if (testo) window.scrollTo({ top: 0, behavior: "smooth" }); };
  /** GET/POST JSON con messaggi d'errore leggibili. Ritorna {ok, stato, dati}. */
  async function api(path, corpo) {
    try {
      const r = await fetch(path, corpo === undefined ? { cache: "no-store" } : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) });
      let dati = null; try { dati = await r.json(); } catch (e) { /* corpo vuoto */ }
      return { ok: r.ok, stato: r.status, dati };
    } catch (e) { return { ok: false, stato: 0, dati: { errore: "rete non raggiungibile" } }; }
  }
  const erroreDi = (r) => (r.stato === 401 ? "Accesso richiesto: effettua il login." : r.stato === 403 && r.dati && r.dati.errore ? r.dati.errore
    : r.stato === 503 ? "Servizio non configurato: " + ((r.dati && r.dati.errore) || "") : (r.dati && r.dati.errore) || "Errore " + r.stato);
  /** Ultime chiusure: ticker → prezzo, dallo screening (D1) con ripiego sul file pubblico dei range. */
  async function prezzi() {
    const p = {};
    try { const ix = await (await fetch("data/index.json", { cache: "no-store" })).json(); for (const [t, v] of Object.entries(ix.titoli || {})) if (num(v.ultimo) !== null) p[t] = v.ultimo; } catch (e) { /* facoltativo */ }
    const s = await api("/api/screening"); let data = null;
    if (s.ok && s.dati) { data = s.dati.data; for (const r of s.dati.righe || []) { const v = r.extra && num(r.extra.Prezzo); if (v !== null) p[r.ticker] = v; } }
    return { p, data, righe: s.ok && s.dati ? s.dati.righe || [] : [] };
  }
  return { $, esc, num, fmt, dmy, msg, api, erroreDi, prezzi };
})();
