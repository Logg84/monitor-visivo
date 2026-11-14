// Link TradingView dal ticker nel formato Yahoo del portale. Stessa logica di core/data_engine.py::tradingview_simbolo
// (repo privato): borsa USA dalla mappa borse_us.json, nessun prefisso inventato per i simboli sconosciuti,
// classi «BRK-B» → «BRK.B», LSE a 1-2 lettere col punto finale («BP.L» → «LSE:BP.»). Provata da tests/verifica_tvlink.mjs.
(function (radice) {
  const BORSE = { ".MI": "MIL", ".PA": "EURONEXT", ".DE": "XETR", ".MC": "BMAD", ".AS": "EURONEXT", ".L": "LSE", ".SW": "SIX", ".ST": "OMX", ".BR": "EURONEXT" };
  function simbolo(ticker, mappaUs) {
    const t = String(ticker || "").trim().toUpperCase();
    const i = t.lastIndexOf(".");
    let base = i > 0 ? t.slice(0, i) : t, suffisso = i > 0 ? t.slice(i) : "";
    base = base.replace(/-/g, ".");
    let ex;
    if (suffisso === "") ex = (mappaUs || {})[t];
    else { ex = BORSE[suffisso]; if (suffisso === ".L" && !base.includes(".") && base.length <= 2) base += "."; }
    return ex ? `${ex}:${base}` : base;
  }
  const url = (ticker, mappaUs) => "https://www.tradingview.com/chart/?symbol=" + encodeURIComponent(simbolo(ticker, mappaUs)).replace("%3A", ":");
  const api = { simbolo, url };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else radice.TvLink = api;
})(typeof window !== "undefined" ? window : globalThis);
