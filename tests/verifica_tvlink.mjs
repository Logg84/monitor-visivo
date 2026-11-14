// Link TradingView del sito (site/tvlink.js): stesso formato del repo privato, senza rete.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const { simbolo, url } = createRequire(import.meta.url)("../site/tvlink.js");
let n = 0; const ok = (nome, c) => { assert.ok(c, nome); n++; console.log("✓ " + nome); };
const mappa = JSON.parse(readFileSync(new URL("../site/borse_us.json", import.meta.url), "utf8"));

ok("NYSE: JPM → NYSE:JPM", simbolo("JPM", mappa) === "NYSE:JPM");
ok("NASDAQ: AAPL → NASDAQ:AAPL", simbolo("AAPL", mappa) === "NASDAQ:AAPL");
ok("classe: BRK-B → NYSE:BRK.B", simbolo("BRK-B", mappa) === "NYSE:BRK.B");
ok("USA sconosciuto: solo il codice", simbolo("ZZZQ", mappa) === "ZZZQ" && simbolo("JPM") === "JPM");
ok("DAX/CAC/Amsterdam", simbolo("SAP.DE") === "XETR:SAP" && simbolo("MC.PA") === "EURONEXT:MC" && simbolo("MT.AS") === "EURONEXT:MT");
ok("LSE: GSK.L, BP.L (punto finale), BT-A.L", simbolo("GSK.L") === "LSE:GSK" && simbolo("BP.L") === "LSE:BP." && simbolo("BT-A.L") === "LSE:BT.A");
ok("suffisso sconosciuto: nessuna borsa inventata", simbolo("XYZ.QQ") === "XYZ");
ok("url: formato chart/?symbol= con i due punti leggibili", url("JPM", mappa) === "https://www.tradingview.com/chart/?symbol=NYSE:JPM");
ok("url: il punto finale LSE resta", url("BP.L") === "https://www.tradingview.com/chart/?symbol=LSE:BP.");
ok("mappa: ≥ 500 titoli, solo NYSE/NASDAQ", Object.keys(mappa).length >= 500 && Object.values(mappa).every((v) => v === "NYSE" || v === "NASDAQ"));
console.log(`\nVERIFICA TVLINK: ${n} controlli ok`);
