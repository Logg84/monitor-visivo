// Prezzi di giornata «abbastanza aggiornati» (file pubblico site/data/prezzi_live.json, scritto dal giro leggero «prezzi-live»).
// Sono solo informativi: non entrano mai in punteggi o segnali. Il file vale 3 ore: oltre, il sito torna alla chiusura dello screening.
(() => {
  "use strict";
  const g = typeof window !== "undefined" ? window : globalThis;
  const ETA_MAX_MIN = 180;
  let dati = null, pronta = null;
  function carica() {
    if (!pronta) pronta = (async () => {
      try {
        const r = await fetch("data/prezzi_live.json", { cache: "no-store" });
        if (!r.ok) return null;
        const j = await r.json(), t = Date.parse(j && j.aggiornato);
        if (!Number.isFinite(t) || !j.titoli) return null;
        const eta = (Date.now() - t) / 60000;
        if (eta > ETA_MAX_MIN || eta < -10) return null;      // vecchio (o con data nel futuro): non si mostra
        dati = j; return j;
      } catch (e) { return null; }
    })();
    return pronta;
  }
  const di = (t) => (dati && dati.titoli && dati.titoli[t]) || null;
  /** Sovrascrive Prezzo_live e Var_oggi_% nelle righe dello screening ({ticker, extra}) dove il file ha il titolo. */
  function applica(righe) {
    if (!dati) return 0;
    let n = 0;
    for (const r of righe || []) {
      const l = di(r.ticker); if (!l) continue;
      const e = r.extra || (r.extra = {}); e.Prezzo_live = l.p; e["Var_oggi_%"] = l.v; n++;
    }
    return n;
  }
  const ora = () => (dati ? new Date(dati.aggiornato).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : null);
  g.Live = { carica, di, applica, ora };
})();
