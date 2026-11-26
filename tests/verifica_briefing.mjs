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
ok("screening: «⚠️» tolto dal settore, vento e score presenti, cluster sì", /\| AAA \| USD \| Information Technology \| 39 \| contro \| 5\/6 \| 100\.00 \| 2026-11-17 \| 101\.50 \| \+1\.50 \| 100\.00 \| -40\.0 \| -42 \|/.test(sez(4)) && /\| sì \|/.test(sez(4)));
ok("range: prezzo sopra il massimo, dentro (pos), sotto il minimo, assente", /uscito_sopra; 70\.00–90\.00; prezzo 11% sopra il massimo/.test(sez(4)) && /in_range; 80\.00–120\.00; pos 50%/.test(sez(4)) && /uscito_sotto; 55\.00–70\.00; prezzo 9% sotto il minimo/.test(sez(4)) && /assente/.test(sez(4)));
ok("screening: conteggi dell'universo", /3 titoli nell'universo; 2 con calo ≥ 25%/.test(sez(4)) && /≥4\/6: 2/.test(sez(4)));
ok("insider: cluster, importo formattato, «|» nel nome non rompe la tabella", /Titoli con cluster: AAA/.test(sez(5)) && /1,500,000/.test(sez(5)) && /Mario \/ Rossi/.test(sez(5)));
ok("calendario: solo eventi nelle prossime 3 settimane", /2026-11-18/.test(sez(6)) && !/Lontano/.test(sez(6)) && !/Passato/.test(sez(6)));
ok("watchlist: livelli compatti, origine, punti dallo screening", /AAA \| USD \| manuale \| tech \| L1 95 \(\+5%\) \| ok \| 2026-12-01 \| da seguire \| in portafoglio: Long dal 2026-10-24 a 80\.00 \| 3 gg \(2026-11-18\) \| 5\/6/.test(sez(7)) && /ZZZ \| USD \| auto/.test(sez(7)) && /ZZZ \|[^\n]*solo osservato/.test(sez(7)));
ok("sezione 4: maschera B-C-G-D-E, qualità, fondamentali, trimestrale, RVOL/OBV, stagionalità", /AAA \| B1 C1 G0 D1 E1 \| ROE ok, Debito KO, Margine ok, Crescita ok, FCF ok \(4\/5\) \| n\/d \| 14\.6 \|/.test(sez(4)) && /3 gg \(2026-11-18\) \| 1\.80 \| 1\.20 \| \+0\.31 \| -0\.10 \| conferma rialzista \| 5a \+1\.2% \/ 60% \| 5a \+2\.0% \/ 70%/.test(sez(4)) && /BBB \| n\/d \| n\/d/.test(sez(4)));
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
ok("fonti mancanti: nessuna eccezione, ogni sezione dichiara «Non disponibile», elenco errori in testa", (vuoto.match(/_Non disponibile\._/g) || []).length === 9 && /Fonti non disponibili in questo briefing: regime macro; screening/.test(vuoto));
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
ok("prezzo: «Prezzo screening» e «Ultimo prezzo» distinti, con la spiegazione dell'orario del run", /Prezzo screening \| Barra \| Prezzo live \| Var oggi % \| Ultimo prezzo/.test(sez(4)) && /barra chiusa/.test(sez(4)) && /2026-11-17/.test(sez(4)) && /\+1\.50/.test(sez(4)));
const dopo = costruisci({ ...ctx, screening: { data: "d", righe: [{ ticker: "NOIDX", punti: 1, priorita: 1, extra: { Prezzo: 60 } }] }, indice: { titoli: {}, basi: [] }, watchlist: { entries: [{ ticker: "NOIDX", origin: "manual", sector: "x", levels: { L1: 35, L2: 69, L3: 28 } }] } });
ok("watchlist: senza prezzo nei range si usa quello dello screening (e il controllo livelli lavora)", /NOIDX \| USD \| manuale \| x \| L1 35 \(\+71%\), L2 69 \(-13%\), L3 28 \(\+114%\) \| ⚠ L2 \(69\) è sopra L1 \(35\)/.test(dopo) && /\| 60\.00 \|/.test(dopo.slice(dopo.indexOf("## 7."))));
const vuotoCal = costruisci({ ...ctx, calendario: { aggiornato: "2026-11-14", dati: { eventi: [{ data_attesa: "2027-03-01", nome: "FDA" }, { data_attesa: "2026-01-01", nome: "vecchio" }] } } });
ok("calendario vuoto: lo dice, indica il totale e il prossimo evento, e avverte che mancano le trimestrali", /Nessun evento nei prossimi 21 giorni \(eventi registrati in tutto: 2; il prossimo è del 2027-03-01\)/.test(vuotoCal) && /NON contiene le trimestrali/.test(vuotoCal));
ok("istruzioni: il portale elenca solo le date macro, non valori attesi né trimestrali", /elenca solo le date macro programmate \(sezione 6\), non i valori attesi, i risultati né le trimestrali/.test(md));
const calMacro = { aggiornato: "2026-11-17", dati: { eventi: [], macro_eventi: [
  { data: "2026-11-18", nome: "CPI", descrizione: "Consumer Price Index" }, { data: "2026-12-09", nome: "FOMC", descrizione: "Riunione FOMC" },
  { data: "2027-02-01", nome: "Lontano", descrizione: "fuori finestra" }, { data: "2026-10-01", nome: "Passato", descrizione: "già avvenuto" }] } };
const conMacro = costruisci({ ...ctx, ora: "2026-11-17 08:29 UTC", calendario: calMacro });
ok("macro programmati: sottosezione con gli eventi dei prossimi 45 giorni, in ordine", /### Eventi macro programmati \(prossimi 45 giorni\)/.test(conMacro) && /CPI/.test(conMacro) && /FOMC/.test(conMacro) && conMacro.indexOf("CPI") < conMacro.indexOf("FOMC"));
ok("macro programmati: niente eventi lontani o passati", !/Lontano/.test(conMacro) && !/Passato/.test(conMacro));
ok("macro programmati: compaiono anche se non ci sono eventi di titoli", /Nessun evento nei prossimi 21 giorni/.test(conMacro) && /Eventi macro programmati/.test(conMacro));
const senzaMacro = costruisci({ ...ctx, calendario: { aggiornato: "2026-11-17", dati: { eventi: [] } } });
ok("macro programmati: se l'export non li ha ancora, nessuna sottosezione (nessun errore)", !/Eventi macro programmati/.test(senzaMacro));
const macroVuoto = costruisci({ ...ctx, ora: "2027-06-01 08:00 UTC", calendario: { aggiornato: "2027-06-01", dati: { eventi: [], macro_eventi: [{ data: "2026-12-09", nome: "FOMC", descrizione: "x" }] } } });
ok("macro programmati: elenco vuoto nel periodo → lo dice", /Nessun evento macro programmato nel periodo/.test(macroVuoto));
ok("insider: elenco completo degli acquisti dei titoli con cluster", /Tutti gli acquisti dei titoli con cluster/.test(sez(5)) && (sez(5).split("| AAA |").length - 1) >= 2);
ok("nessun imperativo operativo nel testo fisso («compra», «vendi»)", !/\b(compra|vendi|acquista|apri una posizione)\b/i.test(md.replace(/\| [^\n]*\n/g, "")));

// ── 9. Basi di accumulo ──
const ixBasi = { aggiornato: "2026-11-20T22:30:45+00:00", titoli: {}, basi: [
  { chiave: "AAA|1D", stato: "uscito_sopra", bottom: 70, top: 90, ultimo: 100, ampiezza: 0.22, barre: 40, calo: 0.5, inizio: "2026-09-01", uscita_data: "2026-10-20", ritorni: { n: 2, date: ["2026-11-05", "2026-11-12"], esito: "tenuto" } },
  { chiave: "AAA|1W", stato: "in_range", bottom: 80, top: 120, ultimo: 100, ampiezza: 0.33, barre: 20 },
  { chiave: "BBB|1D", stato: "uscito_sopra", bottom: 10, top: 12, ultimo: 11.5, ritorni: { n: 0, date: [], esito: "in_attesa" } },
  { chiave: "OLD|1D", stato: "uscito_sopra", bottom: 10, top: 12, ultimo: 90 },
  { chiave: "ZZZ|1D", stato: "uscito_sopra", bottom: 5, top: 6, ultimo: 6.2, ritorni: { n: 1, date: ["2026-11-10"], esito: "rientro" } },
] };
const scBasi = { data: "2026-11-20", righe: [{ ticker: "AAA", punti: 5, extra: { Z1c: 95, Z1: "92-98 · forte", Z2: "60-65 · media" } }, { ticker: "BBB", punti: 4, extra: { Z1c: 300, Z1: "x", Z2: "y" } }] };
const mb = costruisci({ ...ctx, indice: ixBasi, screening: scBasi }); const sb = (() => { const i = mb.indexOf("## 9."); return mb.slice(i); })();
ok("basi: sezione 9 con data di aggiornamento, definizioni e conteggi", /## 9\. Basi di accumulo/.test(sb) && /Dati aggiornati al: 2026-11-20/.test(sb) && /Basi attive: 4/.test(sb) && /escluse 1 con prezzo troppo lontano/.test(sb) && /Definizioni:/.test(sb));
ok("basi: il range obsoleto non compare in tabella", !/\| OLD \|/.test(sb));
ok("basi: retest tenuto con numero e date, ordinato per primo", /\| AAA \| giornaliero \| uscito_sopra \| 70\.00 \| 90\.00 \| 22\.0 \| 40 \| 2026-09-01 \| 50 \| 100\.00 \| 150 \| 2026-10-20 \| tenuto \(2\) \| 2026-11-05, 2026-11-12 \| 95\.00 \| 92-98 · forte \| 60-65 · media \| 5\/6 \|/.test(sb) && sb.indexOf("| AAA | giornaliero") < sb.indexOf("| BBB |"));
ok("basi: in attesa e rientro", /\| BBB \| giornaliero .* in attesa \|/.test(sb) && /\| ZZZ \| giornaliero .* rientro dopo 1 retest \|/.test(sb));
ok("basi: POC e zone fuori scala non vengono mostrati", /\| BBB \|.*fuori scala \| fuori scala \| fuori scala \| 4\/6 \|/.test(sb));
ok("basi: timeframe settimanale (livelli dello screening ripetuti) e titolo fuori dallo screening senza livelli", /\| AAA \| settimanale \| in_range .* \| 95\.00 \|/.test(sb) && /\| ZZZ \| giornaliero .* \| — \| — \| — \| — \|/.test(sb));
const senzaIx = costruisci({ ...ctx, indice: null }); ok("basi: senza index.json lo dichiara e il resto resta valido", /## 9\. Basi di accumulo[^\n]*\n\n_Non disponibile\._/.test(senzaIx) && /## 4\./.test(senzaIx));
const molte = costruisci({ ...ctx, indice: { aggiornato: "2026-11-20", basi: Array.from({ length: 150 }, (_, i) => ({ chiave: `T${String(i).padStart(3, "0")}|1D`, stato: "in_range", bottom: 10, top: 12, ultimo: 11 })) }, screening: null });
ok("basi: elenco limitato a 120 con avviso", /Elenco limitato alle prime 120 basi su 150/.test(molte) && (molte.match(/\| T\d{3} \|/g) || []).length === 120);
// ── Correzioni del 26/11/2026 (anomalie del briefing reale) ──
ok("intestazione: elenca anche il FTSE MIB", /DAX, CAC 40, FTSE MIB\)/.test(md));
ok("legenda E: almeno 2 controlli su 5 e utili non negativi", /persistenza della spinta di rientro: almeno 2 dei 5 controlli[^.]*sorpresa sugli utili non negativa/.test(sez(4)));
const riga = (extra) => ({ ticker: "EEE", punti: 5, priorita: 90, extra: { Settore: "Health Care", SectorScore: 80, Vento: "favore", Prezzo: 100, Data_barra: "2026-11-17", ...extra } });
const conExtra = (extra) => costruisci({ ...ctx, screening: { data: "2026-11-17", righe: [riga(extra)] } });
const tutteOk = { H_ROE: true, H_DE: true, H_Margine: true, H_Crescita: true, H_FCF: true, Seg_B: true, Seg_C: true, Seg_G: 2 > 1, Seg_D: true };
const e0 = conExtra({ ...tutteOk, Seg_E: false });
ok("qualità: totale e E0 con 5/5 ok = manca la persistenza (o utili sotto le attese)", /Debito ok, Margine ok, Crescita ok, FCF ok \(5\/5\) → E0: qualità ok ma manca la persistenza della spinta \(o utili sotto le attese\)/.test(e0));
const e1 = conExtra({ ...tutteOk, H_ROE: false, H_DE: false, H_Margine: false, Seg_E: true });
ok("qualità: 2/5 ok con E1 senza nota", /\(2\/5\)(?! →)/.test(e1) && !/E0:/.test(e1));
const e0b = conExtra({ ...tutteOk, H_ROE: false, H_DE: false, H_Margine: false, H_FCF: false, Seg_E: false });
ok("qualità: 1/5 ok con E0 = meno di 2 controlli", /\(1\/5\) → E0: meno di 2 controlli ok/.test(e0b));
const conUtili = (v) => conExtra({ ...tutteOk, Seg_E: false, Utili_Positivi: v });
ok("utili: E0 con utili sotto le attese è dichiarato, senza ipotesi", /\(5\/5\) · utili ultima trim\.: sotto le attese → E0: utili dell'ultima trimestrale sotto le attese/.test(conUtili(false)));
ok("utili: E0 con utili ok punta alla persistenza", /\(5\/5\) · utili ultima trim\.: sopra le attese → E0: qualità e utili ok ma manca la persistenza della spinta/.test(conUtili(true)));
ok("utili: senza dato resta la dicitura prudente e nessun «utili ultima trim.»", /→ E0: qualità ok ma manca la persistenza della spinta \(o utili sotto le attese\)/.test(conUtili(undefined)) && !/utili ultima trim\.:/.test(conUtili(undefined)));
const zone = conExtra({ ...tutteOk, Seg_E: true, Prezzo: 736, Z1: "13.02–118.36 ·100", Z2: "700.00–760.00 ·50" });
ok("zone di volume: lontana dal prezzo = fuori scala, vicina resta", /fuori scala \| 700\.00–760\.00 ·50/.test(zone));
const insDup = costruisci({ ...ctx, insider: { dati: { acquisti: { colonne: ["Ticker", "Data", "Insider", "Classe", "Importo_$", "Cluster", "Settore"],
  righe: [["ROL", "2026-10-29", "Trust X", "10% Owner", 49956665, true, "cons"], ["ROL", "2026-10-29", "Lor Inc", "10% Owner", 49956665, true, "cons"], ["AAA", "2026-11-10", "Mario", "CEO", 500000, true, "tech"], ["AAA", "2026-11-11", "Anna", "Director", 90000, true, "tech"]] } } } });
ok("insider: doppia segnalazione unita, ROL non è un cluster, AAA sì", /\(1 righe duplicate della stessa operazione unite\)/.test(sez5(insDup)) && /Titoli con cluster: AAA\./.test(sez5(insDup)) && !/ROL \| 2 \|/.test(sez5(insDup)));
function sez5(m) { const i = m.indexOf("## 5."); const j = m.indexOf("\n## ", i + 3); return m.slice(i, j < 0 ? undefined : j); }

console.log(`\nVERIFICA BRIEFING: ${n} controlli ok`);
