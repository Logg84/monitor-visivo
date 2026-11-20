// Testo e filtro dei retest (site/retest.js): nessuna rete, nessuna AI.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { compatta } from "../src/dati.js";
const R = createRequire(import.meta.url)("../site/retest.js");
let n = 0; const ok = (nome, c) => { assert.ok(c, nome); n++; console.log("✓ " + nome); };

ok("senza campo → testo vuoto e non attivo", R.testo({ stato: "uscito_sopra" }) === "" && !R.attivo({ stato: "uscito_sopra" }) && R.testo(null) === "" && !R.attivo(undefined));
ok("in attesa", R.testo({ ritorni: { n: 0, date: [], esito: "in_attesa" } }) === "In attesa di retest" && !R.attivo({ ritorni: { n: 0, esito: "in_attesa" } }));
const t2 = { ritorni: { n: 2, date: ["2026-11-05", "2026-11-12"], esito: "tenuto" } };
ok("due ritorni: numero, data dell'ultimo (gg/mm) e «tenuto»", R.testo(t2) === "Retest: 2 (ultimo il 12/11, tenuto)" && R.attivo(t2));
ok("n totale maggiore delle date conservate", R.testo({ ritorni: { n: 7, date: ["2026-11-12"], esito: "tenuto" } }).startsWith("Retest: 7 "));
ok("rientrato dopo un retest: non attivo", R.testo({ ritorni: { n: 1, date: ["2026-11-05"], esito: "rientro" } }) === "Retest: 1 (poi rientrato nel range)" && !R.attivo({ ritorni: { n: 1, esito: "rientro" } }));
ok("uscita fallita senza retest", R.testo({ ritorni: { n: 0, date: [], esito: "rientro" } }) === "Uscita fallita: rientrato nel range");
ok("compatta() porta il campo ritorni fino alla Vista unificata", compatta({ stato: "uscito_sopra", top: 10, bottom: 8, ultimo: 11, ritorni: t2.ritorni }).ritorni.n === 2
  && !("ritorni" in compatta({ stato: "in_range", top: 10, bottom: 8, ultimo: 9 })));
console.log(`OK: verifica_ritorni (${n})`);
