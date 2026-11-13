// «In sintesi»: 3 frasi deterministiche (nessuna AI) che raccontano un titolo a chi non legge gli indicatori.
// Solo descrizione dei dati del portale: mai un ordine, mai un consiglio. Funzione pura, provata da tests/verifica_sintesi.mjs.
// Uso: Sintesi.frasi({ basi: {"1D": {...}, "1W": {...}}, ath: {dist_ath}, punti, segnale }) → { frasi: [..], avviso, tf }
(function (radice) {
  const nz = (x) => (typeof x === "number" && Number.isFinite(x) ? x : null);
  const num = (v) => Number(v).toLocaleString("it-IT", { maximumFractionDigits: 2 });
  const data = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || "")); return m ? `${m[3]}/${m[2]}/${m[1]}` : null; };
  const giorni = (a, b) => { const x = Date.parse(a), y = Date.parse(b); return Number.isFinite(x) && Number.isFinite(y) ? Math.round((y - x) / 864e5) : null; };

  function frasi(ctx) {
    const basi = ctx.basi || {};
    const tf = basi["1D"] || !basi["1W"] ? "1D" : "1W";                      // stessa scelta della scheda
    const b = basi[tf] || null;
    const out = [];
    const dist = ctx.ath && nz(ctx.ath.dist_ath) !== null ? Math.abs(Math.round(ctx.ath.dist_ath * 100)) : null;

    if (!b || nz(b.top) === null || nz(b.bottom) === null) {
      out.push(dist !== null ? `Per questo titolo il portale non riconosce un range di accumulo; il prezzo è ${dist}% sotto il massimo storico.`
        : "Per questo titolo il portale non riconosce un range di accumulo.");
    } else {
      const sett = giorni(b.inizio, b.data_ultimo || b.aggiornato);
      const durata = sett !== null && sett >= 7 ? ` da circa ${Math.max(1, Math.round(sett / 7))} settimane` : "";
      const amp = nz(b.ampiezza) !== null ? `, un range ampio ${Math.round(b.ampiezza * 100)}%` : "";
      out.push(`Il prezzo si muove${durata} tra ${num(b.bottom)} e ${num(b.top)}${amp}${dist !== null ? `; il prezzo è ${dist}% sotto il massimo storico` : ""}.`);

      const ampiezzaRange = b.top - b.bottom;
      const pos = nz(b.ultimo) !== null && ampiezzaRange > 0 ? (b.ultimo - b.bottom) / ampiezzaRange : null;
      const parte = pos === null ? null : pos < 1 / 3 ? "bassa" : pos < 2 / 3 ? "centrale" : "alta";
      const quando = data(b.uscito_il) ? ` il ${data(b.uscito_il)}` : "";
      if (b.stato === "in_range") {
        out.push(parte ? `Il prezzo (${num(b.ultimo)}) è nella parte ${parte} del range, al ${Math.round(pos * 100)}%: nessuna uscita finora.` : "Il prezzo è dentro il range: nessuna uscita finora.");
      } else if (b.stato === "rallenta") {
        out.push(parte ? `Il range si sta stringendo e il prezzo (${num(b.ultimo)}) è nella parte ${parte}, al ${Math.round(pos * 100)}%.` : "Il range si sta stringendo.");
      } else if (b.stato === "uscito_sopra") {
        out.push(`Il prezzo ha chiuso sopra il massimo del range (${num(b.top)})${quando}: ora conta se quel livello regge come supporto.`);
      } else if (b.stato === "uscito_sotto") {
        out.push(`Il prezzo ha chiuso sotto il minimo del range (${num(b.bottom)})${quando}: la lettura di accumulo è venuta meno.`);
      }
      out.push(b.stato === "uscito_sotto" ? `Una nuova lettura rialzista richiederebbe il rientro sopra ${num(b.bottom)}.`
        : `La lettura rialzista si indebolisce con una chiusura sotto ${num(b.bottom)}.`);
    }
    if (nz(ctx.punti) !== null && ctx.segnale && ctx.segnale !== "—") out.push(`Punteggio del portale: ${ctx.punti}/6 (${ctx.segnale}).`);
    return { frasi: out, tf: b ? tf : null, avviso: "Descrizione automatica dei dati del portale: non è un consiglio di investimento." };
  }
  const api = { frasi };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else radice.Sintesi = api;
})(typeof window !== "undefined" ? window : globalThis);
