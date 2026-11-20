// Ritorni al livello rotto dopo l'uscita dall'alto (retest): testo e filtro. Solo lettura dei dati del motore (campo `ritorni`).
// Un ritorno = il prezzo torna a ≤ 2% dal vecchio massimo del range chiudendo comunque sopra; non serve rientrare nel range.
// Funzione pura, provata da tests/verifica_ritorni.mjs.
(function (radice) {
  const dm = (iso) => { const m = /^\d{4}-(\d{2})-(\d{2})/.exec(String(iso || "")); return m ? `${m[2]}/${m[1]}` : ""; };
  const valido = (b) => Boolean(b && b.ritorni && typeof b.ritorni === "object");
  /** Testo breve per la base `b` (vuoto se non c'è nulla da dire). */
  function testo(b) {
    if (!valido(b)) return "";
    const r = b.ritorni, n = Number(r.n) || 0;
    if (r.esito === "rientro") return n ? `Retest: ${n} (poi rientrato nel range)` : "Uscita fallita: rientrato nel range";
    if (r.esito === "in_attesa" || n === 0) return "In attesa di retest";
    const ult = Array.isArray(r.date) && r.date.length ? r.date[r.date.length - 1] : null;
    return `Retest: ${n}${ult ? ` (ultimo il ${dm(ult)}, tenuto)` : ""}`;
  }
  /** Vero se l'uscita è ancora valida (non rientrata) e il prezzo è tornato a testare il livello almeno una volta. */
  const attivo = (b) => valido(b) && b.ritorni.esito === "tenuto" && (Number(b.ritorni.n) || 0) > 0;
  const api = { testo, attivo };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else radice.Ritorni = api;
})(typeof window !== "undefined" ? window : globalThis);
