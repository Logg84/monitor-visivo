// Controllo coerenza livelli watchlist (site/livelli.js). Senza rete.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { controlla } = createRequire(import.meta.url)("../site/livelli.js");
let n = 0; const ok = (nome, c) => { assert.ok(c, nome); n++; console.log("✓ " + nome); };

let r = controlla({ L1: 305, L2: 285, L3: 28 }, 301);
ok("GE: L3 28 lontano dal prezzo, «forse manca una cifra (280)»", r.avvisi.length === 1 && /L3 \(28\) dista 91%/.test(r.avvisi[0]) && /manca una cifra \(280\)/.test(r.avvisi[0]));
r = controlla({ L1: 35, L2: 69, L3: 28 }, 60);
ok("FIS: L2 sopra L1 (ordine) e L1 lontano dal prezzo", r.avvisi.some((a) => /L2 \(69\) è sopra L1 \(35\)/.test(a)) && r.avvisi.some((a) => /L1 \(35\) dista 42%/.test(a)) === false);
ok("FIS: un livello a -42% dal prezzo non è «lontano» (soglia 50%)", r.avvisi.length === 2 && r.avvisi.some((a) => /L3 \(28\) è sopra/.test(a) === false));
r = controlla({ L1: 600, L2: 440, L3: 400 }, 500);
ok("CASY: livelli ordinati e vicini → nessun avviso", r.avvisi.length === 0);
ok("distanze: prezzo rispetto al livello in %", Math.abs(r.distanze.L1 - (500 / 600 - 1) * 100) < 1e-9 && r.distanze.L3 > 0);
ok("senza prezzo: solo il controllo d'ordine, nessuna distanza", controlla({ L1: 10, L2: 20 }, null).avvisi.length === 1 && Object.keys(controlla({ L1: 10 }, null).distanze).length === 0);
ok("livelli vuoti, testo o a zero ignorati", controlla({ L1: "", L2: "abc", L3: 0 }, 50).avvisi.length === 0 && controlla(null, 50).avvisi.length === 0 && controlla(undefined, undefined).avvisi.length === 0);
ok("livelli scritti come stringhe numeriche accettati", controlla({ L1: "100", L2: "90" }, "95").avvisi.length === 0);
ok("una cifra in più: 3000 con prezzo 301 → «una cifra in più (300)»", /una cifra in più \(300\)/.test(controlla({ L1: 3000 }, 301).avvisi[0]));
console.log(`\nVERIFICA LIVELLI: ${n} controlli ok`);
