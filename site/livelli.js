// Controllo di coerenza dei livelli personali L1/L2/L3 della watchlist. Solo avvisi di lettura: non cambia nulla, non entra nei calcoli.
// Funzione pura, provata da tests/verifica_livelli.mjs. Uso: Livelli.controlla({L1:305,L2:285,L3:28}, 301.2) → { avvisi: [..], distanze: {L1: +1.3, ...} }
(function (radice) {
  const nz = (x) => { const n = typeof x === "string" && x.trim() !== "" ? Number(x) : x; return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null; };
  const SOGLIA_LONTANO = 0.5;   // oltre il 50% dal prezzo il livello è «lontano»

  function controlla(levels, prezzo) {
    const lv = {}, avvisi = [], distanze = {};
    for (const k of ["L1", "L2", "L3"]) lv[k] = nz((levels || {})[k]);
    const p = nz(prezzo);
    const presenti = ["L1", "L2", "L3"].filter((k) => lv[k] !== null);
    // 1) ordine: ci si aspetta L1 ≥ L2 ≥ L3 (dal livello più alto al più basso)
    for (let i = 1; i < presenti.length; i++) {
      const a = presenti[i - 1], b = presenti[i];
      if (lv[b] > lv[a]) avvisi.push(`${b} (${lv[b]}) è sopra ${a} (${lv[a]}): ordine inatteso, controlla di non avere invertito i livelli`);
    }
    // 2) distanza dal prezzo
    if (p !== null) for (const k of presenti) {
      const d = (p / lv[k] - 1) * 100;                       // prezzo rispetto al livello: + = prezzo sopra il livello
      distanze[k] = d;
      if (Math.abs(lv[k] / p - 1) > SOGLIA_LONTANO) {
        const v10 = lv[k] * 10, v01 = lv[k] / 10;
        const forse = Math.abs(v10 / p - 1) <= 0.2 ? `, forse manca una cifra (${v10})` : Math.abs(v01 / p - 1) <= 0.2 ? `, forse c'è una cifra in più (${v01})` : "";
        avvisi.push(`${k} (${lv[k]}) dista ${Math.round(Math.abs(lv[k] / p - 1) * 100)}% dal prezzo (${p})${forse}`);
      }
    }
    return { avvisi, distanze };
  }
  const api = { controlla, SOGLIA_LONTANO };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else radice.Livelli = api;
})(typeof window !== "undefined" ? window : globalThis);
