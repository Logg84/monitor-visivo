// Briefing per LLM (site/briefing.js): ogni sezione, fonti mancanti, tabelle ben formate, nessuna frase di consiglio. Senza rete.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { costruisci } = createRequire(import.meta.url)("../site/briefing.js");
let n = 0; const ok = (nome, c) => { assert.ok(c, nome); n++; console.log("✓ " + nome); };

import { ctx } from "./fixtures_briefing.mjs";

const md = costruisci(ctx);
const sez = (k) => { const i = md.indexOf(`## ${k}.`); const j = md.indexOf("\n## ", i + 3); return md.slice(i, j < 0 ? undefined : j); };
ok("intestazione con data e avviso «non è un consiglio»", md.startsWith("# Briefing di mercato") && /2026-11-14 14:00 UTC/.test(md) && /non è un consiglio di investimento/.test(md));
ok("8 sezioni numerate, nell'ordine regime → settori → strumenti → screening → insider → calendario → personali", [1, 2, 3, 4, 5, 6, 7, 8].every((k, i, a) => md.indexOf(`## ${k}.`) > (i ? md.indexOf(`## ${a[i - 1]}.`) : -1)));
ok("regime: nome, punteggi, mesi, avvertenza", /\*\*Reflazione\*\*/.test(sez(1)) && /\+0\.18/.test(sez(1)) && /\+0\.75/.test(sez(1)) && /mesi consecutivi nel regime: 2/.test(sez(1)) && /segnale di crescita debole/.test(sez(1)));
ok("regime: solo i settori del regime corrente, atteso dal modello e campione scarso", /Energia \| XLE \| \+0\.90 \| \+0\.50 \| 58 \| 40 \| favorito \| ok \| \+3\.2/.test(sez(1)) && /Immobiliare \| XLRE .* sfavorito \| scarso/.test(sez(1)) && !/Espansione/.test(sez(1).split("Storia dei settori")[1]));
ok("settori: ordinati per score decrescente", sez(2).indexOf("Health Care") < sez(2).indexOf("Industrials") && /Sotto-settori \(per score\)/.test(sez(2)));
ok("strumenti: stato, DD, distanze da MA50/MA200/VWAP; riga senza dati esclusa", /EUR\/USD \| 6E=F \| 1\.1036 \| In correzione[^|]*\| -7\.9 \| 32\.4 \| 0\.57 \| -1\.2 \| -2\.5 \| -0\.9/.test(sez(3)) && !/Senza dati/.test(sez(3)));
ok("tassi: valore con unità e percentile", /Rendimento Treasury 10 anni \| 5\.10 p\.p\. \| 2026-11-12 \| -0\.14 \| \+0\.42 \| 98/.test(sez(3)));
ok("screening: solo punti ≥ 4 (CCC escluso), ordinati per priorità (BBB prima di AAA)", sez(4).indexOf("| BBB |") > 0 && sez(4).indexOf("| BBB |") < sez(4).indexOf("| AAA |") && !/\| CCC \|/.test(sez(4)));
ok("screening: «⚠️» tolto dal settore, vento e score presenti, cluster sì", /\| AAA \| Information Technology \| 39 \| contro \| 5\/6 \| 100\.00 \| -40\.0 \| -42 \|/.test(sez(4)) && /\| sì \|/.test(sez(4)));
ok("range: prezzo sopra il massimo, dentro (pos), sotto il minimo, assente", /uscito_sopra; 70\.00–90\.00; prezzo 11% sopra il massimo/.test(sez(4)) && /in_range; 80\.00–120\.00; pos 50%/.test(sez(4)) && /uscito_sotto; 55\.00–70\.00; prezzo 9% sotto il minimo/.test(sez(4)) && /assente/.test(sez(4)));
ok("screening: conteggi dell'universo", /3 titoli nell'universo; 2 con calo ≥ 25%/.test(sez(4)) && /≥4\/6: 2/.test(sez(4)));
ok("insider: cluster, importo formattato, «|» nel nome non rompe la tabella", /Titoli con cluster: AAA/.test(sez(5)) && /1,500,000/.test(sez(5)) && /Mario \/ Rossi/.test(sez(5)));
ok("calendario: solo eventi nelle prossime 3 settimane", /2026-11-18/.test(sez(6)) && !/Lontano/.test(sez(6)) && !/Passato/.test(sez(6)));
ok("watchlist: livelli compatti, origine, punti dallo screening", /AAA \| manuale \| tech \| L1 95 \| 2026-12-01 \| da seguire \| 5\/6/.test(sez(7)) && /ZZZ \| auto/.test(sez(7)));
ok("portafoglio: P/L long con ultimo prezzo, short chiuso con prezzo di uscita", /AAA \| Long \| Aperto .* \| \+25\.0 \|/.test(sez(8)) && /BBB \| Short \| Chiuso .* \| \+10\.0 \|/.test(sez(8)));

// ogni riga di tabella ha lo stesso numero di colonne della sua intestazione
let ben = true;
const righe = md.split("\n");
for (let i = 0; i < righe.length; i++) if (/^\|---/.test(righe[i])) {
  const k = righe[i].split("|").length; let m = i - 1; if (righe[m].split("|").length !== k) ben = false;
  for (m = i + 1; m < righe.length && righe[m].startsWith("|"); m++) if (righe[m].split("|").length !== k) ben = false;
}
ok("tutte le tabelle hanno righe con lo stesso numero di colonne", ben);

const senza = costruisci(ctx, { watchlist: false, portafoglio: false });
ok("opzioni: senza watchlist e portafoglio le sezioni 7 e 8 non ci sono", !/## 7\./.test(senza) && !/## 8\./.test(senza) && /## 6\./.test(senza));

const vuoto = costruisci({ ora: "2026-11-14 14:00 UTC", macro: null, settori: null, strumenti: null, screening: null, insider: null, calendario: null, watchlist: null, portafoglio: null, errori: ["regime macro", "screening"] });
ok("fonti mancanti: nessuna eccezione, ogni sezione dichiara «Non disponibile», elenco errori in testa", (vuoto.match(/_Non disponibile\._/g) || []).length === 8 && /Fonti non disponibili in questo briefing: regime macro; screening/.test(vuoto));
ok("input vuoto: non lancia", typeof costruisci() === "string" && typeof costruisci({}, {}) === "string");
ok("nessun imperativo operativo nel testo fisso («compra», «vendi»)", !/\b(compra|vendi|acquista|apri una posizione)\b/i.test(md.replace(/\| [^\n]*\n/g, "")));
console.log(`\nVERIFICA BRIEFING: ${n} controlli ok`);
