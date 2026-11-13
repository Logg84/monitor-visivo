// «In sintesi» (site/sintesi.js): frasi deterministiche per ogni stato di una base, senza AI e senza rete.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { frasi } = createRequire(import.meta.url)("../site/sintesi.js");
let n = 0; const ok = (nome, c) => { assert.ok(c, nome); n++; console.log("✓ " + nome); };

const base = { inizio: "2026-05-13", data_ultimo: "2026-11-12", bottom: 100, top: 120, ampiezza: 0.2, ultimo: 105 };
const ath = { dist_ath: -0.3 };

let s = frasi({ basi: { "1D": { ...base, stato: "in_range" } }, ath });
ok("in range: 3 frasi", s.frasi.length === 3 && s.tf === "1D");
ok("contesto: estremi, ampiezza, durata e distanza dal massimo", /tra 100 e 120/.test(s.frasi[0]) && /20%/.test(s.frasi[0]) && /circa 26 settimane/.test(s.frasi[0]) && /il prezzo è 30% sotto il massimo storico/.test(s.frasi[0]));
ok("in range: posizione nella parte bassa al 25%", /parte bassa/.test(s.frasi[1]) && /25%/.test(s.frasi[1]) && /nessuna uscita/.test(s.frasi[1]));
ok("invalidazione = minimo del range", /chiusura sotto 100/.test(s.frasi[2]));
ok("avviso: non è un consiglio", /non è un consiglio di investimento/.test(s.avviso));

s = frasi({ basi: { "1D": { ...base, stato: "in_range", ultimo: 115 } }, ath });
ok("parte alta oltre i due terzi", /parte alta/.test(s.frasi[1]));
s = frasi({ basi: { "1D": { ...base, stato: "rallenta", ultimo: 110 } }, ath });
ok("rallenta: range che si stringe, parte centrale", /si sta stringendo/.test(s.frasi[1]) && /centrale/.test(s.frasi[1]));
s = frasi({ basi: { "1D": { ...base, stato: "uscito_sopra", ultimo: 130, uscito_il: "2026-11-12" } }, ath });
ok("uscito sopra: data e livello da difendere", /chiuso sopra il massimo del range \(120\) il 12\/11\/2026/.test(s.frasi[1]) && /chiusura sotto 100/.test(s.frasi[2]));
s = frasi({ basi: { "1D": { ...base, stato: "uscito_sotto", ultimo: 90, uscito_il: "2026-11-10" } }, ath });
ok("uscito sotto: lettura venuta meno e condizione di rientro", /chiuso sotto il minimo del range \(100\) il 10\/11\/2026/.test(s.frasi[1]) && /rientro sopra 100/.test(s.frasi[2]));

s = frasi({ basi: { "1W": { ...base, stato: "in_range" } }, ath });
ok("solo settimanale: usa 1W", s.tf === "1W");
s = frasi({ basi: { "1D": { ...base, stato: "in_range" }, "1W": { ...base, bottom: 50, stato: "in_range" } }, ath });
ok("entrambi: preferisce il giornaliero (come la scheda)", s.tf === "1D" && /chiusura sotto 100/.test(s.frasi[2]));

s = frasi({ basi: {}, ath });
ok("senza range: una frase onesta con la distanza dal massimo", s.frasi.length === 1 && /non riconosce un range/.test(s.frasi[0]) && /30%/.test(s.frasi[0]) && s.tf === null);
s = frasi({ basi: {}, ath: null });
ok("senza range né massimo storico: nessun numero inventato", s.frasi.length === 1 && !/\d/.test(s.frasi[0]));
s = frasi({ basi: { "1D": { ...base, stato: "in_range" } }, ath, punti: 4, segnale: "WATCH" });
ok("punteggio presente: quarta frase", s.frasi.length === 4 && /4\/6 \(WATCH\)/.test(s.frasi[3]));
s = frasi({ basi: { "1D": { ...base, stato: "in_range" } }, ath, punti: 0, segnale: "—" });
ok("segnale «—»: nessuna frase sul punteggio", s.frasi.length === 3);
s = frasi({ basi: { "1D": { ...base, stato: "in_range", ultimo: null, ampiezza: null, inizio: null } }, ath: null });
ok("dati mancanti: nessun «NaN»/«undefined» nel testo", !/NaN|undefined|null/.test(s.frasi.join(" ")));
ok("mai verbi di ordine", !/(compra|vendi|acquista|entra|esci)/i.test(frasi({ basi: { "1D": { ...base, stato: "uscito_sopra" } }, ath }).frasi.join(" ")));
console.log(`TUTTI I CHECK PASSATI (${n}/${n})`);
