// Dati simulati (stessa struttura delle API del Worker) per i test del briefing.
export const macro = { aggiornato: "2026-11-14", dati: { corrente: { regime: "Reflazione", descrizione: "crescita in accelerazione, inflazione in aumento", mese: "2026-11", mesi_nel_regime: 2, precedente: "Reflazione", G: 0.18, I: 0.75, sahm: false,
  tassi_reali: { valore: 1.9, data: "2026-11-12" }, avvertenze: ["segnale di crescita debole"], settori: { XLE: 1, XLRE: -1 } },
  parametri: { min_mesi: 24 }, forza: { XLE: 3.2 },
  studio: [{ regime: "Reflazione", settore: "Energia", etf: "XLE", assoluto: 0.9, media: 0.5, positivi: 58, mesi: 40 }, { regime: "Reflazione", settore: "Immobiliare", etf: "XLRE", assoluto: -0.1, media: -0.5, positivi: 44, mesi: 12 }, { regime: "Espansione", settore: "Energia", etf: "XLE", assoluto: 1, media: 0.1, positivi: 50, mesi: 30 }] } };
export const settori = { dati: { meta: { asof: "2026-11-13", benchmark: "SPY" }, gics: [{ Settore: "Health Care", Stato: "FORTE", Score: 94, "CW 3m": 3.1, "EW 3m": 5.3, "Δ 3m": 2.2, "RS 3m": 4.5, "Pos 52": 80, Streak: 4 }, { Settore: "Industrials", Stato: "DEBOLE", Score: 26, "CW 3m": -2, "EW 3m": -1, "Δ 3m": 1, "RS 3m": -3, "Pos 52": 20, Streak: -3 }],
  sotto: [{ Settore: "Biotecnologie", GICS: "Health Care", Stato: "FORTE", Score: 78, "Δ 3m": -11.1, "RS 3m": 2 }] } };
export const strumenti = { dati: { strumenti: [{ nome: "EUR/USD", simbolo: "6E=F", riga: { Prezzo: 1.1036, "DD 5a %": -7.9, RSI: 32.4, "ATR20 %": 0.57 }, badge: { etichetta: "In correzione — nessun segnale ancora (0/5)" },
  distanze: [{ nome: "Media mobile 50 giorni", dist: -1.2 }, { nome: "Media mobile 200 giorni", dist: -2.5 }, { nome: "VWAP 60 giorni", dist: -0.9 }] }, { nome: "Senza dati", simbolo: "X", riga: null }],
  tassi: [{ nome: "Rendimento Treasury 10 anni", valore: 5.1, unita: "p.p.", data: "2026-11-12", var1m: -0.14, var3m: 0.42, percentile: 98, stato: "in salita", fermo: false }] } };
export const screening = { data: "2026-11-13", righe: [
  { ticker: "AAA", punti: 5, priorita: 100, extra: { Settore: "⚠️ Information Technology", SectorScore: 39, Vento: "contro", Prezzo: 100, "DD%": -40, RSI: 35, "ATR%": 4.2, "In zona": "Z1", VWAP60: 110, Wyckoff: "6/10", Insider_Cluster: true } },
  { ticker: "BBB", punti: 4, priorita: 120, extra: { Settore: "Health Care", SectorScore: 94, Vento: "favore", Prezzo: 50, "DD%": -30 } },
  { ticker: "CCC", punti: 2, priorita: 200, extra: { Settore: "Energy", Prezzo: 10, "DD%": -10 } }] };
export const indice = { titoli: { AAA: { dist_ath: -0.42, ultimo: 100 } }, basi: [{ chiave: "AAA|1D", stato: "uscito_sopra", bottom: 70, top: 90, ultimo: 100 }, { chiave: "AAA|1W", stato: "in_range", bottom: 80, top: 120, ultimo: 100 }, { chiave: "BBB|1D", stato: "uscito_sotto", bottom: 55, top: 70, ultimo: 50 }] };
export const insider = { dati: { acquisti: { colonne: ["Ticker", "Data", "Insider", "Classe", "Importo_$", "Cluster", "Settore"], righe: [["AAA", "2026-11-10", "Mario | Rossi", "CEO", 1500000, true, "tech"], ["BBB", "2026-11-09", "Anna", "Director", 90000, false, "sanita"]] } } };
export const calendario = { dati: { eventi: [{ data_attesa: "2026-11-18", ticker: "AAA", nome: "AAA Inc", tipo: "Earnings", settore: "tech", descrizione: "Trimestrale", stato_data: "confermata" }, { data_attesa: "2027-03-01", nome: "Lontano", tipo: "FDA" }, { data_attesa: "2026-09-01", nome: "Passato", tipo: "FDA" }] } };
export const watchlist = { entries: [{ ticker: "AAA", origin: "manual", sector: "tech", levels: { L1: 95, L2: "" }, notes: "da seguire", target_date: "2026-12-01" }, { ticker: "ZZZ", origin: "auto", sector: "x", levels: {}, notes: "" }] };
export const portafoglio = { righe: [{ Ticker: "AAA", Direzione: "Long", Stato: "Aperto", Data_Ingresso: "2026-10-24", Prezzo_Ingresso: "80", SL: "70" }, { Ticker: "BBB", Direzione: "Short", Stato: "Chiuso", Data_Ingresso: "2026-10-01", Prezzo_Ingresso: "60", Prezzo_Uscita: "54" }] };
export const ctx = { ora: "2026-11-14 14:00 UTC", macro, settori, strumenti, screening, indice, insider, calendario, watchlist, portafoglio, errori: [] };

