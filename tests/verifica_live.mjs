// Prova di site/live.js: validità del file (3 ore), sovrascrittura delle righe dello screening, titoli assenti.
import assert from "node:assert/strict"; import { readFileSync } from "node:fs"; import vm from "node:vm";
const ok = (m) => console.log("✓ " + m);
const codice = readFileSync(new URL("../site/live.js", import.meta.url), "utf8");
function ambiente(file, adesso) {
  const ctx = { console, Date: class extends Date { static now() { return adesso; } }, fetch: async () => file === null ? { ok: false } : { ok: true, json: async () => file } };
  ctx.window = ctx; vm.createContext(ctx); vm.runInContext(codice, ctx); return ctx;
}
const T0 = Date.parse("2026-11-19T14:45:00Z");
const file = { aggiornato: "2026-11-19T14:45:00+00:00", titoli: { AAPL: { p: 204, v: 2 }, "BP.L": { p: 396, v: -1 } } };
let c = ambiente(file, T0 + 30 * 60e3); await c.Live.carica();
const righe = [{ ticker: "AAPL", extra: { Prezzo: 200, Prezzo_live: null } }, { ticker: "MSFT", extra: { Prezzo: 400 } }, { ticker: "BP.L" }];
assert.equal(c.Live.applica(righe), 2); assert.equal(righe[0].extra.Prezzo_live, 204); assert.equal(righe[0].extra["Var_oggi_%"], 2);
assert.equal(righe[1].extra.Prezzo_live, undefined); assert.equal(righe[2].extra.Prezzo_live, 396); ok("applica: sovrascrive i titoli presenti, lascia gli altri, crea extra se manca");
assert.equal(righe[0].extra.Prezzo, 200); ok("la chiusura (Prezzo) non si tocca mai");
c = ambiente(file, T0 + 179 * 60e3); await c.Live.carica(); assert.ok(c.Live.di("AAPL")); ok("file di 2h59: valido");
c = ambiente(file, T0 + 181 * 60e3); await c.Live.carica(); assert.equal(c.Live.di("AAPL"), null); assert.equal(c.Live.applica([{ ticker: "AAPL", extra: {} }]), 0); ok("file di oltre 3 ore: ignorato");
c = ambiente(file, T0 - 30 * 60e3); await c.Live.carica(); assert.equal(c.Live.di("AAPL"), null); ok("file con data nel futuro: ignorato");
c = ambiente(null, T0); assert.equal(await c.Live.carica(), null); assert.equal(c.Live.applica([{ ticker: "AAPL" }]), 0); ok("file assente: nessun effetto, nessun errore");
c = ambiente({ aggiornato: "boh", titoli: {} }, T0); assert.equal(await c.Live.carica(), null); ok("data illeggibile: ignorato");
console.log("OK: verifica_live");
