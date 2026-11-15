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
ok("screening: «⚠️» tolto dal settore, vento e score presenti, cluster sì", /\| AAA \| USD \| Information Technology \| 39 \| contro \| 5\/6 \| 100\.00 \| 100\.00 \| -40\.0 \| -42 \|/.test(sez(4)) && /\| sì \|/.test(sez(4)));
ok("range: prezzo sopra il massimo, dentro (pos), sotto il minimo, assente", /uscito_sopra; 70\.00–90\.00; prezzo 11% sopra il massimo/.test(sez(4)) && /in_range; 80\.00–120\.00; pos 50%/.test(sez(4)) && /uscito_sotto; 55\.00–70\.00; prezzo 9% sotto il minimo/.test(sez(4)) && /assente/.test(sez(4)));
ok("screening: conteggi dell'universo", /3 titoli nell'universo; 2 con calo ≥ 25%/.test(sez(4)) && /≥4\/6: 2/.test(sez(4)));
ok("insider: cluster, importo formattato, «|» nel nome non rompe la tabella", /Titoli con cluster: AAA/.test(sez(5)) && /1,500,000/.test(sez(5)) && /Mario \/ Rossi/.test(sez(5)));
ok("calendario: solo eventi nelle prossime 3 settimane", /2026-11-18/.test(sez(6)) && !/Lontano/.test(sez(6)) && !/Passato/.test(sez(6)));
ok("watchlist: livelli compatti, origine, punti dallo screening", /AAA \| USD \| manuale \| tech \| L1 95 \(\+5%\) \| ok \| 2026-12-01 \| da seguire \| in portafoglio: Long dal 2026-10-24 a 80\.00 \| 3 gg \(2026-11-18\) \| 5\/6/.test(sez(7)) && /ZZZ \| USD \| auto/.test(sez(7)) && /ZZZ \|[^\n]*solo osservato/.test(sez(7)));
ok("sezione 4: maschera B-C-G-D-E, qualità, fondamentali, trimestrale, RVOL/OBV, stagionalità", /AAA \| B1 C1 G0 D1 E1 \| ROE ok, Debito KO, Margine ok, Crescita ok, FCF ok \| n\/d \| 14\.6 \|/.test(sez(4)) && /3 gg \(2026-11-18\) \| 1\.80 \| 1\.20 \| \+0\.31 \| -0\.10 \| conferma rialzista \| 5a \+1\.2% \/ 60% \| 5a \+2\.0% \/ 70%/.test(sez(4)) && /BBB \| n\/d \| n\/d/.test(sez(4)));
ok("insider: riepilogo cluster con insider distinti, ruoli e totale", /Riepilogo dei cluster/.test(sez(5)) && /AAA \| 1 \| 1 \| CEO \| 1,500,000/.test(sez(5)));
const obs = costruisci({ screening: { data: "d", righe: [{ ticker: "T", punti: 4, priorita: 1, extra: {} }] }, indice: { basi: [{ chiave: "T|1W", stato: "uscito_sopra", top: 10, bottom: 8, ultimo: 170 }] } });
ok("range obsoleto: prezzo oltre il doppio del massimo → non operativo", /RANGE OBSOLETO/.test(obs) || /range obsoleto/.test(obs));
ok("posizione: non rivelata se il portafoglio non è incluso", /n\/d \(portafoglio non incluso\)/.test(costruisci(ctx, { portafoglio: false })));
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
ok("istruzioni: cercare FUORI dal file, per titolo e per macro, con fonti citate e etichette", /## 0\. Istruzioni per l'LLM/.test(md) && /anche FUORI dal file/.test(md) && /notizie e comunicati degli ultimi 30 giorni/.test(md) && /prossimo bilancio/.test(md) && /cita ogni fonte esterna/i.test(md) && /dato esterno verificato/.test(md) && /Non inventare numeri/.test(md));
ok("istruzioni: la spunta le toglie (sezione 0 assente)", !/## 0\./.test(costruisci(ctx, { istruzioni: false })) && /anche FUORI dal file/.test(md));
ok("istruzioni: prima di tutti i dati (sezione 0 prima della 1)", md.indexOf("## 0.") > 0 && md.indexOf("## 0.") < md.indexOf("## 1."));
ok("valuta: USA USD, Londra GBp, Parigi/Francoforte EUR", /\| AAA \| USD \|/.test(sez(4)) && !/n\/d \| n\/d \| n\/d \| n\/d \| n\/d \| n\/d \| n\/d \| n\/d \| n\/d \| n\/d \| n\/d \| n\/d \|/.test(sez(4)));
const sx = costruisci({ screening: { data: "2026-11-13", righe: ["X.L", "Y.DE", "Z.PA"].map((t, i) => ({ ticker: t, punti: 4, priorita: 10 - i, extra: { Settore: "S" } })) }, indice: { basi: [] } });
ok("valuta per suffisso", /\| X\.L \| GBp \(pence\) \|/.test(sx) && /\| Y\.DE \| EUR \|/.test(sx) && /\| Z\.PA \| EUR \|/.test(sx));
ok("tipo di setup: già esteso / sotto il minimo / senza range", /già esteso \(>10% sopra il massimo\) \[1D\]/.test(sez(4)) && /sotto il minimo del range \[1D\]/.test(sez(4)) && /senza range/.test(sx));
const ix = (ult, stato = "in_range") => ({ basi: [{ chiave: "T|1D", stato, bottom: 100, top: 200, ultimo: ult }] });
const set = (i) => costruisci({ screening: { data: "d", righe: [{ ticker: "T", punti: 4, priorita: 1, extra: {} }] }, indice: i }).match(/\| (breakout[^|]*|già esteso[^|]*|dentro il range[^|]*|range che si stringe[^|]*|rientrato[^|]*|sotto il minimo[^|]*|senza range) \|/)[1].trim();
ok("setup: 202→breakout recente, 215→in corso, 230→già esteso", /breakout recente/.test(set(ix(202, "uscito_sopra"))) && /breakout in corso/.test(set(ix(215, "uscito_sopra"))) && /già esteso/.test(set(ix(230, "uscito_sopra"))));
ok("setup: parte bassa/centrale/alta, stringe, rientrato", /parte bassa \(pos 20%\)/.test(set(ix(120))) && /parte centrale/.test(set(ix(150))) && /parte alta \(pos 90%\)/.test(set(ix(190))) && /range che si stringe/.test(set(ix(150, "rallenta"))) && /rientrato nel range/.test(set(ix(190, "uscito_sopra"))));
ok("date delle fonti in testa alle sezioni (aggiornato)", /Dati aggiornati al: 2026-11-14/.test(sez(1)) && /Dati aggiornati al: 2026-11-14/.test(sez(6)) && /range \(basi di accumulo\) aggiornati al 2026-11-13 22:31 UTC/.test(sez(4)));
ok("watchlist: controllo livelli segnala refusi (GE-like: L3 28 con prezzo 301)", /⚠ L3 \(28\) dista 91%[^|]*manca una cifra \(280\)/.test(costruisci({ ...ctx, watchlist: { entries: [{ ticker: "GE", origin: "manual", sector: "ind", levels: { L1: 305, L2: 285, L3: 28 } }] }, indice: { titoli: { GE: { ultimo: 301, dist_ath: -0.1 } }, basi: [] } })));
ok("prezzo: «Prezzo screening» e «Ultimo prezzo» distinti, con la spiegazione dell'orario del run", /Prezzo screening \| Ultimo prezzo/.test(sez(4)) && /06:30 o 14:30 UTC/.test(sez(4)));
const dopo = costruisci({ ...ctx, screening: { data: "d", righe: [{ ticker: "NOIDX", punti: 1, priorita: 1, extra: { Prezzo: 60 } }] }, indice: { titoli: {}, basi: [] }, watchlist: { entries: [{ ticker: "NOIDX", origin: "manual", sector: "x", levels: { L1: 35, L2: 69, L3: 28 } }] } });
ok("watchlist: senza prezzo nei range si usa quello dello screening (e il controllo livelli lavora)", /NOIDX \| USD \| manuale \| x \| L1 35 \(\+71%\), L2 69 \(-13%\), L3 28 \(\+114%\) \| ⚠ L2 \(69\) è sopra L1 \(35\)/.test(dopo) && /\| 60\.00 \|/.test(dopo.slice(dopo.indexOf("## 7."))));
const vuotoCal = costruisci({ ...ctx, calendario: { aggiornato: "2026-11-14", dati: { eventi: [{ data_attesa: "2027-03-01", nome: "FDA" }, { data_attesa: "2026-01-01", nome: "vecchio" }] } } });
ok("calendario vuoto: lo dice, indica il totale e il prossimo evento, e avverte che mancano trimestrali e macro", /Nessun evento nei prossimi 21 giorni \(eventi registrati in tutto: 2; il prossimo è del 2027-03-01\)/.test(vuotoCal) && /NON contiene trimestrali né dati macro/.test(vuotoCal));
ok("istruzioni: il calendario del portale non copre trimestrali e macro", /il calendario del portale NON li contiene/.test(md));
ok("insider: elenco completo degli acquisti dei titoli con cluster", /Tutti gli acquisti dei titoli con cluster/.test(sez(5)) && (sez(5).split("| AAA |").length - 1) >= 2);
ok("nessun imperativo operativo nel testo fisso («compra», «vendi»)", !/\b(compra|vendi|acquista|apri una posizione)\b/i.test(md.replace(/\| [^\n]*\n/g, "")));
console.log(`\nVERIFICA BRIEFING: ${n} controlli ok`);
