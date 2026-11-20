// Grafici dei settori (site/grafici_settori.js): costruzione dell'SVG, buchi, serie vuote. Nessuna rete.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const G = createRequire(import.meta.url)("../site/grafici_settori.js");
let n = 0; const ok = (nome, c) => { assert.ok(c, nome); n++; console.log("✓ " + nome); };
const date = Array.from({ length: 10 }, (_, i) => `2026-11-${String(i + 1).padStart(2, "0")}`);
const a = [100, 101, 102, 101, 103, 104, 103, 105, 106, 107], b = [100, 99, 98, 99, null, null, 97, 96, 95, 94];

const r = G.costruisci({ date, base: 100, serie: [{ nome: "A", valori: a, colore: "#111" }, { nome: "B", valori: b, colore: "#222", tratteggio: true }] });
ok("SVG con una linea per serie e il cursore", !r.vuoto && (r.svg.match(/<path /g) || []).length === 2 && r.svg.includes('class="cur"') && r.n === 10);
ok("serie tratteggiata → stroke-dasharray sulla sola linea B", (r.svg.match(/stroke-dasharray="6 4"/g) || []).length === 1);
ok("i buchi (null) interrompono la linea: due segmenti M", (r.svg.match(/<path d="([^"]+)"[^>]*stroke="#222"/)[1].match(/M/g) || []).length === 2);
ok("nessun NaN/undefined nell'SVG", !/NaN|undefined|Infinity/.test(r.svg));
ok("linea di riferimento a 100 presente", r.svg.includes('stroke-dasharray="2 4"'));
ok("date sull'asse in formato gg/mm/aa", r.svg.includes("01/11/26") && r.svg.includes("10/11/26"));
ok("serie tutta vuota o una sola data → vuoto, nessun SVG", G.costruisci({ date, serie: [{ nome: "X", valori: [null, null] }] }).vuoto && G.costruisci({ date: ["2026-11-01"], serie: [{ nome: "A", valori: [100] }] }).vuoto && G.costruisci({}).vuoto);
ok("serie costante: la scala non si rompe", !/NaN|Infinity/.test(G.costruisci({ date, serie: [{ nome: "C", valori: date.map(() => 100) }] }).svg));
ok("nomi con caratteri HTML ripuliti nel cursore e colori", !G.costruisci({ date, serie: [{ nome: "<b>", valori: a, colore: '"><script>' }] }).svg.includes("<script>"));
console.log(`OK: verifica_grafici_settori (${n})`);
