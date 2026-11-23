// Briefing per un LLM esterno: UNO snapshot del portale in Markdown schematico (tabelle a colonne fisse, unità esplicite,
// «n/d» per i dati mancanti, sezioni numerate). Funzione pura: nessuna rete, nessun DOM. Provata da tests/verifica_briefing.mjs.
// Uso: Briefing.costruisci({ ora, macro, settori, strumenti, screening, indice, insider, calendario, watchlist, portafoglio, errori }, { watchlist: true, portafoglio: true })
// Ogni fonte può mancare (null): la sezione lo dichiara e il resto del file resta valido. Nessuna frase di consiglio: solo dati e definizioni.
(function (radice) {
  const nz = (x) => (typeof x === "number" && Number.isFinite(x) ? x : null);
  const f = (v, d = 1) => (nz(v) === null ? "n/d" : Number(v).toFixed(d));
  const sg = (v, d = 1) => (nz(v) === null ? "n/d" : (v > 0 ? "+" : "") + Number(v).toFixed(d));
  const px = (v) => (nz(v) === null ? "n/d" : Math.abs(v) < 10 ? Number(v).toFixed(4) : Number(v).toFixed(2));
  const t = (s) => String(s ?? "").replace(/\s+/g, " ").replace(/\|/g, "/").trim();             // cella di tabella: una riga, niente «|»
  const cella = (s) => (t(s) === "" ? "n/d" : t(s));
  const tab = (cols, righe) => !righe.length ? "_Nessuna riga._\n" :
    `| ${cols.join(" | ")} |\n|${cols.map(() => "---").join("|")}|\n` + righe.map((r) => `| ${r.map(cella).join(" | ")} |`).join("\n") + "\n";
  const data = (s) => String(s || "").slice(0, 10) || "n/d";
  const num = (n) => (nz(n) === null ? "n/d" : String(Math.round(n)));

  const window_Livelli = () => (typeof module !== "undefined" && module.exports ? require("./livelli.js") : radice.Livelli) || { controlla: () => ({ avvisi: [], distanze: {} }) };
  const LIM = { candidati: 40, insider: 12, eventi: 25, giorniEventi: 21, basi: 120 };

  function rangeDi(indice, ticker, tf) {
    const b = ((indice && indice.basi) || []).find((x) => x.chiave === `${ticker}|${tf}`);
    if (!b) return "assente";
    if (nz(b.top) === null || nz(b.bottom) === null || !(b.top > b.bottom) || nz(b.ultimo) === null) return `${t(b.stato)}; ${px(b.bottom)}–${px(b.top)}`;
    const u = b.ultimo;
    if (u > b.top * 2 || u < b.bottom * 0.5) return `${t(b.stato)}; ${px(b.bottom)}–${px(b.top)}; RANGE OBSOLETO (prezzo ${u > b.top ? f((u / b.top - 1) * 100, 0) + "% sopra il massimo" : f((1 - u / b.bottom) * 100, 0) + "% sotto il minimo"}: il prezzo è uscito da tempo, non operativo)`;
    const dove = u > b.top ? `prezzo ${f((u / b.top - 1) * 100, 0)}% sopra il massimo` : u < b.bottom ? `prezzo ${f((1 - u / b.bottom) * 100, 0)}% sotto il minimo` : `pos ${Math.round(((u - b.bottom) / (b.top - b.bottom)) * 100)}%`;
    return `${t(b.stato)}; ${px(b.bottom)}–${px(b.top)}; ${dove}`;
  }
  const agg = (p) => (p && p.aggiornato ? `Dati aggiornati al: ${t(p.aggiornato).replace("T", " ").slice(0, 16)}${String(p.aggiornato).length > 10 ? " UTC" : ""}.\n\n` : "");
  const valuta = (tk) => { const m = /\.([A-Z]+)$/.exec(String(tk || "").toUpperCase()); const x = m ? m[1] : ""; return x === "L" ? "GBp (pence)" : ["DE", "PA", "AS", "MI", "MC", "BR"].includes(x) ? "EUR" : x === "" ? "USD" : "n/d"; };
  function setup(indice, ticker) {
    const trova = (tf) => ((indice && indice.basi) || []).find((x) => x.chiave === `${ticker}|${tf}`);
    const tf = trova("1D") ? "1D" : trova("1W") ? "1W" : null, b = tf && trova(tf);
    if (!b || nz(b.top) === null || nz(b.bottom) === null || !(b.top > b.bottom) || nz(b.ultimo) === null) return "senza range";
    const u = b.ultimo, pos = (u - b.bottom) / (b.top - b.bottom), ext = (u / b.top - 1) * 100;
    if (u > b.top * 2 || u < b.bottom * 0.5) return `range obsoleto (prezzo molto fuori dal range: non operativo) [${tf}]`;
    const e = u > b.top ? (ext <= 3 ? "breakout recente (≤3% sopra il massimo del range)" : ext <= 10 ? "breakout in corso (3–10% sopra il massimo)" : "già esteso (>10% sopra il massimo)")
      : u < b.bottom ? "sotto il minimo del range"
      : b.stato === "uscito_sopra" ? `rientrato nel range dopo un'uscita sopra (pos ${Math.round(pos * 100)}%)`
      : b.stato === "rallenta" ? `range che si stringe (pos ${Math.round(pos * 100)}%)`
      : `dentro il range, parte ${pos < 1 / 3 ? "bassa" : pos < 2 / 3 ? "centrale" : "alta"} (pos ${Math.round(pos * 100)}%)`;
    return `${e} [${tf}]`;
  }
  const si = (v) => (v === true ? "sì" : v === false ? "no" : "n/d");
  // B/C/D/E valgono 1, G vale 2: la maschera mostra QUALE criterio manca (es. «B1 C1 G0 D1 E1» = 4/6, manca solo G).
  const maschera = (e) => ["B", "C", "G", "D", "E"].every((k) => typeof e["Seg_" + k] === "boolean") ? ["B", "C", "G", "D", "E"].map((k) => `${k}${e["Seg_" + k] ? (k === "G" ? 2 : 1) : 0}`).join(" ") : "n/d";
  const qualita = (e) => ["ROE", "DE", "Margine", "Crescita", "FCF"].every((k) => typeof e["H_" + k] === "boolean") ? ["ROE", "DE", "Margine", "Crescita", "FCF"].map((k) => `${k === "DE" ? "Debito" : k} ${e["H_" + k] ? "ok" : "KO"}`).join(", ") : "n/d";
  const trim = (e) => (nz(e.Trim_Giorni) !== null ? `${e.Trim_Giorni} gg (${t(e.Trim_Data)})` : e.Trim_Data === undefined ? "n/d" : "nessuna data nota");
  const sett = (x) => t(x).replace(/^⚠️\s*/, "");
  const ultimo = (indice, tk) => { const x = indice && indice.titoli && indice.titoli[tk]; return x ? x.ultimo : null; };
  const athDi = (indice, ticker) => { const x = indice && indice.titoli && indice.titoli[ticker]; return x && nz(x.dist_ath) !== null ? sg(x.dist_ath * 100, 0) : "n/d"; };

  function sezIntro(c, ora) {
    return `# Briefing di mercato — portale screening\n\n` +
      `- Generato: ${ora}\n` +
      `- Cos'è: istantanea di un portale personale di screening (titoli USA S&P 500 + Nasdaq 100, FTSE 100, DAX, CAC 40, FTSE MIB). Tutti i numeri vengono da dati pubblici di mercato elaborati dal portale; possono avere ore o giorni di ritardo (la data di ciascuna fonte è indicata sotto).\n` +
      `- Uso previsto: punto di partenza per un'analisi più ampia, non fonte unica: vedi le istruzioni qui sotto.\n` +
      `- Nota: descrive dati e stati calcolati dal portale; non è un consiglio di investimento.\n` +
      `- Convenzioni: percentuali in %; «n/d» = non disponibile; prezzi nella valuta di quotazione (titoli di Londra in pence, «GBp»; Francoforte, Parigi, Amsterdam in EUR; USA in USD); DD = distanza dal massimo; ATR% = oscillazione giornaliera tipica in % del prezzo; punteggio = criteri tecnici soddisfatti su 6 (più alto = più criteri).\n` +
      (c.errori && c.errori.length ? `- Fonti non disponibili in questo briefing: ${c.errori.map(t).join("; ")}.\n` : "") + "\n";
  }

  function sezIstruzioni() {
    return `## 0. Istruzioni per l'LLM\n\n` +
      `- **Questo file è un punto di partenza, non la fonte unica.** Vai a cercare informazioni e conferme anche FUORI dal file (ricerca web, siti ufficiali delle società, comunicati, dati di mercato aggiornati) e dichiara cosa hai verificato e dove.\n` +
      `- **Aggiornamento dei dati:** il file fotografa l'ultima chiusura disponibile (data in testa a ogni sezione). Controlla prezzi attuali, gap e notizie successive prima di usare i livelli.\n` +
      `- **Per ogni titolo che prendi in esame, cerca fuori dal file:** notizie e comunicati degli ultimi 30 giorni; data del prossimo bilancio o evento societario; risultati dell'ultimo trimestre e guidance; valutazione (multipli) e consenso degli analisti; operazioni di insider e investitori istituzionali; rischi specifici (cause legali, regolamentazione, debito, concorrenza).\n` +
      `- **Contesto:** conferma con fonti indipendenti dal portale il quadro macro (crescita, inflazione, tassi e banche centrali), le notizie dei settori coinvolti e le trimestrali delle prossime settimane: il portale elenca solo le date macro programmate (sezione 6), non i valori attesi, i risultati né le trimestrali.\n` +
      `- **Contraddizioni:** se una fonte esterna contraddice il file, segnalalo, dì quale ritieni più affidabile e perché.\n` +
      `- **Tracciabilità:** cita ogni fonte esterna (titolo, sito, data) ed etichetta ogni affermazione come «dato del portale», «dato esterno verificato» oppure «ipotesi/stima». Dichiara cosa non sei riuscito a verificare. Non inventare numeri.\n\n`;
  }

  function sezRegime(m) {
    let o = `## 1. Regime macro (ciclo crescita/inflazione, dati mensili)\n\n`;
    const c = m && m.dati && m.dati.corrente;
    if (!c) return o + "_Non disponibile._\n\n";
    o += agg(m) + `- Regime attuale: **${t(c.regime)}** (${t(c.descrizione)})\n- Dati di: ${t(c.mese)}; mesi consecutivi nel regime: ${f(c.mesi_nel_regime, 0)}; regime del mese precedente: ${t(c.precedente) || "n/d"}\n` +
      `- Punteggio crescita (ΔG, scala −1…+1): ${sg(c.G, 2)}; punteggio inflazione (ΔI): ${sg(c.I, 2)}\n`;
    if (c.sahm) o += `- Regola di Sahm ATTIVA (disoccupazione ≥ +0.5 punti sul minimo a 12 mesi; storicamente associata alle recessioni)\n`;
    if (c.tassi_reali && nz(c.tassi_reali.valore) !== null) o += `- Tasso reale 10 anni (TIPS): ${f(c.tassi_reali.valore, 2)}% al ${t(c.tassi_reali.data)}\n`;
    for (const a of c.avvertenze || []) o += `- Avvertenza del modello: ${t(a)}\n`;
    const mm = (m.dati.parametri && m.dati.parametri.min_mesi) || 0, forza = m.dati.forza || {};
    const righe = (m.dati.studio || []).filter((r) => r.regime === c.regime).sort((a, b) => (nz(b.media) ?? -99) - (nz(a.media) ?? -99));
    o += `\nStoria dei settori USA (ETF SPDR) nel mese SUCCESSIVO ai mesi passati in questo regime. «vs S&P» = rendimento mensile medio meno quello dell'S&P 500; «campione» = mesi osservati (sotto ${mm} = poco affidabile).\n\n`;
    o += tab(["Settore", "ETF", "Rend. medio %/mese", "vs S&P %/mese", "Mesi positivi %", "Mesi", "Atteso dal modello", "Campione", "Forza 3m vs S&P %"],
      righe.map((r) => { const at = (c.settori || {})[r.etf] || 0; return [r.settore, r.etf, sg(r.assoluto, 2), sg(r.media, 2), num(r.positivi), num(r.mesi), at > 0 ? "favorito" : at < 0 ? "sfavorito" : "neutro", r.mesi >= mm ? "ok" : "scarso", sg(forza[r.etf], 1)]; }));
    return o + "\n";
  }

  function sezSettori(s) {
    let o = `## 2. Settori e sotto-settori (forza relativa)\n\n`;
    const d = s && s.dati;
    if (!d || !Array.isArray(d.gics)) return o + "_Non disponibile._\n\n";
    const meta = d.meta || {};
    o += agg(s) + `Dati del ${t(meta.asof) || "n/d"}; benchmark ${t(meta.benchmark) || "n/d"}; Score 0–100 (più alto = più forte). CW = ponderato per capitalizzazione, EW = equiponderato; Δ = EW meno CW (positivo = vantaggio dei titoli piccoli del settore: leadership più ampia); RS 3m = forza relativa a 3 mesi vs benchmark.\n\n`;
    const ord = [...d.gics].sort((a, b) => (nz(b.Score) ?? -1) - (nz(a.Score) ?? -1));
    o += tab(["Settore", "Stato", "Score", "CW 3m %", "EW 3m %", "Δ 3m pt", "RS 3m", "Pos 52 sett. %", "Streak"],
      ord.map((r) => [r.Settore, r.Stato, num(r.Score), sg(r["CW 3m"]), sg(r["EW 3m"]), sg(r["Δ 3m"]), sg(r["RS 3m"]), num(r["Pos 52"]), nz(r.Streak) === null ? "n/d" : sg(r.Streak, 0)]));
    const sotto = (d.sotto || []).filter((r) => nz(r.Score) !== null).sort((a, b) => b.Score - a.Score);
    if (sotto.length) {
      const riga = (r) => [r.Settore, r.GICS, r.Stato, num(r.Score), sg(r["Δ 3m"]), sg(r["RS 3m"])], col = ["Sotto-settore", "Settore GICS", "Stato", "Score", "Δ 3m pt", "RS 3m"];
      if (sotto.length <= 12) o += `\nSotto-settori (per score)\n\n` + tab(col, sotto.map(riga));
      else o += `\nSotto-settori: 6 più forti\n\n` + tab(col, sotto.slice(0, 6).map(riga)) + `\nSotto-settori: 6 più deboli\n\n` + tab(col, sotto.slice(-6).reverse().map(riga));
    }
    return o + "\n";
  }

  function sezStrumenti(s) {
    let o = `## 3. Indici, materie prime, valute, tassi\n\n`;
    const d = s && s.dati;
    if (!d || !Array.isArray(d.strumenti)) return o + "_Non disponibile._\n\n";
    o += agg(s) + `Stato tecnico per strumento. «Vicino ai massimi» = entro 4 ATR dal massimo a 5 anni; MA = media mobile semplice; VWAP60 = prezzo medio ponderato per volume degli ultimi 60 giorni; distanze in % (positivo = prezzo sopra il livello).\n\n`;
    const dist = (x, nome) => { const e = (x.distanze || []).find((y) => t(y.nome).toLowerCase().includes(nome)); return e ? sg(e.dist) : "n/d"; };
    o += tab(["Strumento", "Simbolo", "Prezzo", "Stato", "DD 5a %", "RSI", "ATR20 %", "vs MA50 %", "vs MA200 %", "vs VWAP60 %"],
      d.strumenti.filter((x) => x.riga).map((x) => { const r = x.riga; return [x.nome, x.simbolo, px(r.Prezzo), (x.badge && x.badge.etichetta) || "n/d", sg(r["DD 5a %"]), f(r.RSI), f(r["ATR20 %"], 2), dist(x, "50"), dist(x, "200"), dist(x, "vwap")]; }));
    if ((d.tassi || []).length) {
      o += `\nTassi, curve e credito (fonte FRED)\n\n` + tab(["Indicatore", "Valore", "Data", "Var. 1 mese", "Var. 3 mesi", "Percentile 3 anni", "Stato"],
        d.tassi.map((r) => [r.nome, f(r.valore, 2) + (r.unita ? " " + r.unita : ""), data(r.data) + (r.fermo ? " (fermo)" : ""), sg(r.var1m, 2), sg(r.var3m, 2), num(r.percentile), r.stato]));
    }
    return o + "\n";
  }

  function sezScreening(sc, ind) {
    let o = `## 4. Screening: titoli con più criteri tecnici\n\n`;
    const righe = sc && Array.isArray(sc.righe) ? sc.righe : null;
    if (!righe || !righe.length) return o + "_Non disponibile._\n\n";
    const ex = (r) => r.extra || {};
    const dd = righe.filter((r) => nz(ex(r)["DD%"]) !== null && ex(r)["DD%"] <= -25).length;
    const conta = (k) => righe.filter((r) => nz(r.punti) !== null && r.punti >= k).length;
    o += `Screening del ${t(sc.data) || "n/d"}${ind && ind.aggiornato ? `; range (basi di accumulo) aggiornati al ${t(ind.aggiornato).replace("T", " ").slice(0, 16)} UTC` : ""}: ${righe.length} titoli nell'universo; ${dd} con calo ≥ 25% dal massimo a 5 anni; punteggio ≥4/6: ${conta(4)}, ≥5/6: ${conta(5)}, 6/6: ${conta(6)}.\n` +
      `Punteggio massimo 6 = B 1 + C 1 + G 2 + D 1 + E 1. B = la caduta rallenta (variazione a 10 giorni migliore di quella di 10 giorni prima); C = prezzo in una zona di volumi forte o a meno di 1 ATR da un VWAP ancorato; G = chiusura sopra la media a 20 giorni dopo averla incrociata negli ultimi 5 giorni; D = spinta di rientro (incrocio sopra il VWAP a 60 giorni, massimo a 20 giorni superato, minimo settimanale più alto dopo un calo, o candelona recente); E = qualità fondamentale (ROE, debito, margini, crescita, flusso di cassa). «Priorità» = ordinamento interno del portale (più alto = più in alto nella lista). «Prezzo screening» = ultima chiusura (barra chiusa) al momento del run dello screening (18:30 UTC per l'Europa, 22:00 UTC per gli USA); «Barra» = data di quella barra; DD, RSI, VWAP e punteggio sono calcolati su barre chiuse. «Prezzo live» e «Var oggi %» = ultimo prezzo e variazione rispetto all'ultima chiusura quando la borsa del titolo è aperta (vuoti a mercato chiuso): sono solo informativi e non entrano nei punteggi. «Ultimo prezzo» = ultima chiusura contenuta nei dati dei range (aggiornati a fine giornata, indicati sopra): se diverso, è il più recente. Un titolo può mancare dall'elenco perché escluso quando il suo dato non è aggiornato rispetto alla seduta attesa (il portale non usa prezzi vecchi). «Tipo di setup» = lettura automatica dei range (usa il giornaliero, se manca il settimanale): dentro il range (parte bassa/centrale/alta), range che si stringe, breakout recente/in corso/già esteso rispetto al massimo del range, sotto il minimo. «In zona» = prezzo dentro la zona di volumi Z1…Z4 (Z1 = quella con più volumi). «Vento» = tendenza del sotto-settore: favore (in crescita), contro (in calo), misto. «Score settore» 0–100. Wyckoff = punteggio a 10 della struttura di accumulo. «Range 1D/1W» = base di accumulo individuata dal prezzo sul grafico giornaliero/settimanale: stato; minimo–massimo; posizione del prezzo nel range (pos 0% = prezzo al minimo del range, 100% = al massimo; se il prezzo è fuori dal range lo scarto è dato in % dal limite). Stati: in_range = prezzo dentro il range; rallenta = range che si stringe; uscito_sopra / uscito_sotto = ultima chiusura oltre il massimo / sotto il minimo del range.\n\n`;
    const scelti = righe.filter((r) => nz(r.punti) !== null && r.punti >= 4).sort((a, b) => (nz(b.priorita) ?? -1) - (nz(a.priorita) ?? -1)).slice(0, LIM.candidati);
    if (!scelti.length) return o + "Nessun titolo con punteggio ≥ 4/6.\n\n";
    o += `Elenco: i ${scelti.length} titoli con punteggio ≥ 4/6 a priorità più alta.\n\n`;
    o += tab(["Ticker", "Valuta", "Settore", "Score settore", "Vento", "Punti", "Prezzo screening", "Barra", "Prezzo live", "Var oggi %", "Ultimo prezzo", "DD 5a %", "DD da ATH %", "RSI", "ATR%", "In zona", "VWAP60", "Wyckoff", "Insider cluster", "Priorità", "Tipo di setup", "Range 1D", "Range 1W"],
      scelti.map((r) => { const e = ex(r); return [r.ticker, valuta(r.ticker), sett(e.Settore), num(e.SectorScore), e.Vento, `${r.punti}/6`, px(e.Prezzo), t(e.Data_barra) || "—", nz(e.Prezzo_live) !== null ? px(e.Prezzo_live) : "—", nz(e["Var_oggi_%"]) !== null ? sg(e["Var_oggi_%"], 2) : "—", px(ultimo(ind, r.ticker)), sg(e["DD%"]), athDi(ind, r.ticker), f(e.RSI, 0), f(e["ATR%"], 2), e["In zona"] || "—", px(e.VWAP60), e.Wyckoff, e.Insider_Cluster ? "sì" : "no", num(r.priorita), setup(ind, r.ticker), rangeDi(ind, r.ticker, "1D"), rangeDi(ind, r.ticker, "1W")]; }));
    o += `\nDettaglio per titolo (stessi titoli). «Punteggio B-C-G-D-E»: 1 = criterio soddisfatto (G vale 2), 0 = no. «Qualità» = i 5 controlli fondamentali del criterio E (ROE, debito, margini, crescita, flusso di cassa: ok/KO). P/E, EV/EBITDA, P/S, Short float: dati Yahoo, possono mancare. «Z1»/«Z2» = fasce di prezzo delle zone di volume (estremi · forza). «Trimestrale» = giorni alla prossima nota (da Yahoo, da verificare). «RVOL 1g» = volume ultima barra / media 20 barre precedenti (a mercato aperto la barra è parziale); «RVOL 5g» = media 5 barre / media 50. «OBV 20/60» = variazione dell'On-Balance Volume su 20/60 barre divisa per il volume totale (da -1 a +1); «OBV segnale» = conferma o divergenza fra prezzo e OBV a 20 barre. «Stagionalità» = rendimento medio e % di anni positivi della finestra che parte da oggi (swing ≈ 20 sedute, position ≈ 60 sedute) su 5/10/tutti gli anni disponibili, da chiusure settimanali: indicativa, non condizionata al regime.\n\n`;
    o += tab(["Ticker", "Punteggio B-C-G-D-E", "Qualità (criterio E)", "P/E trailing", "P/E forward", "EV/EBITDA", "P/S", "Short float %", "Squeeze", "Z1 (prezzi · forza)", "Z2 (prezzi · forza)", "Dist. da SMA200 %", "Trimestrale", "RVOL 1g", "RVOL 5g", "OBV 20", "OBV 60", "OBV segnale", "Stagionalità swing", "Stagionalità position"],
      scelti.map((r) => { const e = ex(r); return [r.ticker, maschera(e), qualita(e), f(e.PE_trailing, 1), f(e.PE_forward, 1), f(e.EV_EBITDA, 1), f(e.P_S, 1), f(e["Short_Float_%"], 1), si(e.Squeeze), e.Z1 || "—", e.Z2 || "—", sg(e["Dist_SMA200%"], 0), trim(e), f(e.RVOL_1g, 2), f(e.RVOL_5g, 2), sg(e.OBV_20, 2), sg(e.OBV_60, 2), e.OBV_Segnale || "n/d", e.Stag_Swing || "n/d", e.Stag_Position || "n/d"]; }));
    const per = {};
    for (const r of righe) if (nz(r.punti) !== null && r.punti >= 4) { const s = sett(ex(r).Settore) || "n/d"; per[s] = (per[s] || 0) + 1; }
    const lista = Object.entries(per).sort((a, b) => b[1] - a[1]);
    if (lista.length) o += `\nTitoli con punteggio ≥ 4/6 per settore: ${lista.map(([k, n]) => `${k} ${n}`).join("; ")}.\n`;
    return o + "\n";
  }

  function sezInsider(i) {
    let o = `## 5. Acquisti degli insider (Form 4 SEC, titoli USA)\n\n`;
    const a = i && i.dati && i.dati.acquisti;
    if (!a || !Array.isArray(a.colonne) || !a.righe.length) return o + "_Non disponibile._\n\n";
    const ix = (n) => a.colonne.indexOf(n), g = (r, n) => (ix(n) >= 0 ? r[ix(n)] : null);
    const cluster = [...new Set(a.righe.filter((r) => g(r, "Cluster")).map((r) => g(r, "Ticker")))];
    o += agg(i) + `Acquisti a mercato registrati: ${a.righe.length}. Cluster = almeno 2 insider diversi in 30 giorni sullo stesso titolo. Titoli con cluster: ${cluster.length ? cluster.join(", ") : "nessuno"}.\n\n`;
    const top = [...a.righe].sort((x, y) => (nz(g(y, "Importo_$")) ?? 0) - (nz(g(x, "Importo_$")) ?? 0)).slice(0, LIM.insider);
    const riga = (r) => [g(r, "Ticker"), data(g(r, "Data")), g(r, "Insider"), g(r, "Classe"), nz(g(r, "Importo_$")) === null ? "n/d" : Math.round(g(r, "Importo_$")).toLocaleString("en-US"), g(r, "Cluster") ? "sì" : "no", g(r, "Settore")];
    const colI = ["Ticker", "Data", "Insider", "Ruolo/classe", "Importo (USD)", "Cluster", "Settore"];
    const dettCl = a.righe.filter((r) => cluster.includes(g(r, "Ticker"))).sort((x, y) => String(g(x, "Ticker")).localeCompare(String(g(y, "Ticker"))) || String(g(y, "Data")).localeCompare(String(g(x, "Data"))));
    const rc = cluster.map((tk) => { const v = a.righe.filter((r) => g(r, "Ticker") === tk), ins = new Set(v.map((r) => t(g(r, "Insider")))), ruoli = [...new Set(v.map((r) => t(g(r, "Classe"))))], ds = v.map((r) => data(g(r, "Data"))).sort();
      return [tk, ins.size, v.length, ruoli.join(", "), Math.round(v.reduce((s2, r) => s2 + (nz(g(r, "Importo_$")) ?? 0), 0)).toLocaleString("en-US"), `${ds[0]} → ${ds[ds.length - 1]}`]; });
    if (rc.length) o += `Riepilogo dei cluster (n. insider distinti, ruoli, controvalore totale; il prezzo medio di acquisto non è nei dati del portale)\n\n` + tab(["Ticker", "Insider distinti", "Acquisti", "Ruoli/classi", "Totale (USD)", "Periodo"], rc) + "\n";
    o += `Acquisti più grandi\n\n` + tab(colI,
      top.map(riga)) +
      (dettCl.length ? `\nTutti gli acquisti dei titoli con cluster (per verificare chi ha comprato e quando)\n\n` + tab(colI, dettCl.map(riga)) : "");
    return o + "\n";
  }

  const GIORNI_MACRO = 45;
  // Date macro programmate (BLS, Fed, FRED) da data/macro_events.json, esportate con la pagina Calendario (campo macro_eventi).
  function sezMacroProgrammati(c, ora) {
    const m = c && c.dati && Array.isArray(c.dati.macro_eventi) ? c.dati.macro_eventi : null;
    if (!m) return "";
    const oggi = Date.parse(String(ora).slice(0, 10)), fino = oggi + GIORNI_MACRO * 864e5;
    const v = m.filter((e) => { const d = Date.parse(data(e.data)); return Number.isFinite(d) && d >= oggi - 864e5 && d <= fino; })
      .sort((a, b) => String(a.data).localeCompare(String(b.data))).slice(0, 20);
    const t = `### Eventi macro programmati (prossimi ${GIORNI_MACRO} giorni)\n\n`;
    if (!v.length) return t + "Nessun evento macro programmato nel periodo.\n\n";
    return t + "Date da calendari ufficiali (BLS, Fed, FRED): solo la data, senza valori attesi; possono slittare.\n\n" + tab(["Data", "Evento", "Descrizione"], v.map((e) => [data(e.data), e.nome, e.descrizione])) + "\n";
  }

  function sezCalendario(c, ora) {
    let o = `## 6. Calendario eventi (prossimi ${LIM.giorniEventi} giorni)\n\n`;
    const ev = c && c.dati && Array.isArray(c.dati.eventi) ? c.dati.eventi : null;
    if (!ev) return o + "_Non disponibile._\n\n";
    const oggi = Date.parse(String(ora).slice(0, 10)), fino = oggi + LIM.giorniEventi * 864e5;
    const v = ev.filter((e) => { const d = Date.parse(data(e.data_attesa)); return Number.isFinite(d) && d >= oggi - 864e5 && d <= fino; }).sort((a, b) => String(a.data_attesa).localeCompare(String(b.data_attesa))).slice(0, LIM.eventi);
    o += agg(c) + `Il calendario del portale raccoglie SOLO catalizzatori inseriti a mano o dal controllo eventi (es. decisioni FDA, eventi societari); NON contiene le trimestrali: quelle vanno cercate fuori. Le date macro programmate (inflazione, occupazione, PIL, banche centrali) sono nella sottosezione che segue, quando disponibili; i valori attesi e i risultati vanno cercati fuori. Le date «attese» possono slittare; «stato data» indica se è confermata.\n\n`;
    const macro = sezMacroProgrammati(c, ora);
    if (!v.length) { const futuri = ev.map((e) => data(e.data_attesa)).filter((d) => Date.parse(d) > fino).sort(); return o + `Nessun evento nei prossimi ${LIM.giorniEventi} giorni (eventi registrati in tutto: ${ev.length}${futuri.length ? `; il prossimo è del ${futuri[0]}` : ""}).\n\n` + macro; }
    return o + tab(["Data", "Ticker", "Nome", "Tipo", "Settore", "Descrizione", "Stato data"], v.map((e) => [data(e.data_attesa), e.ticker || "—", e.nome, e.tipo, e.settore, e.descrizione, e.stato_data])) + "\n" + macro;
  }

  function sezPersonali(c, opz) {
    let o = "";
    const scr = {}; for (const r of (c.screening && c.screening.righe) || []) scr[r.ticker] = r;
    const prezzo = (tk) => { const u = ultimo(c.indice, tk); return u !== null && u !== undefined ? u : scr[tk] && scr[tk].extra && nz(scr[tk].extra.Prezzo) !== null ? scr[tk].extra.Prezzo : null; };
    const aperte = {}; if (opz.portafoglio && c.portafoglio && Array.isArray(c.portafoglio.righe)) for (const x of c.portafoglio.righe) if (x.Stato === "Aperto") aperte[x.Ticker] = x;
    const posiz = (tk) => !(opz.portafoglio && c.portafoglio && Array.isArray(c.portafoglio.righe)) ? "n/d (portafoglio non incluso)" : aperte[tk] ? `in portafoglio: ${aperte[tk].Direzione} dal ${data(aperte[tk].Data_Ingresso)} a ${px(Number(aperte[tk].Prezzo_Ingresso))}` : "solo osservato";
    if (opz.watchlist) {
      o += `## 7. Watchlist personale dell'utente\n\n`;
      const e = c.watchlist && c.watchlist.entries;
      if (!Array.isArray(e)) o += "_Non disponibile._\n\n";
      else {
        o += `${e.length} titoli. «Livelli» = prezzi di riferimento scelti dall'utente (L1–L3); «Prezzo» = ultima chiusura dei dati dei range, o in mancanza il prezzo dello screening; «origine» = manuale (aggiunto dall'utente) o auto (entrato dallo screening). «Controllo livelli» segnala livelli in ordine inatteso (si attende L1 ≥ L2 ≥ L3) o molto lontani dal prezzo (>50%): possibili refusi dell'utente, da verificare con lui prima di usarli.\n\n`;
        o += tab(["Ticker", "Valuta", "Origine", "Settore (chiave interna)", "Livelli (% = prezzo rispetto al livello)", "Controllo livelli", "Data target", "Note", "Posizione", "Trimestrale", "Punti", "Prezzo", "DD da ATH %", "Tipo di setup", "Range 1D", "Range 1W"],
          e.map((w) => { const s = scr[w.ticker], pz = prezzo(w.ticker), ctl = window_Livelli().controlla(w.levels, pz), lv = Object.entries(w.levels || {}).filter(([, v]) => v !== null && v !== "").map(([k, v]) => `${k} ${v}${nz(ctl.distanze[k]) === null ? "" : ` (${sg(ctl.distanze[k], 0)}%)`}`).join(", ");
            return [w.ticker, valuta(w.ticker), w.origin === "manual" ? "manuale" : "auto", w.sector, lv || "—", ctl.avvisi.length ? "⚠ " + ctl.avvisi.join("; ") : "ok", w.target_date || "—", w.notes || "—", posiz(w.ticker), s ? trim(s.extra || {}) : "n/d", s && nz(s.punti) !== null ? `${s.punti}/6` : "n/d", px(pz), athDi(c.indice, w.ticker), setup(c.indice, w.ticker), rangeDi(c.indice, w.ticker, "1D"), rangeDi(c.indice, w.ticker, "1W")]; })) + "\n";
      }
    }
    if (opz.portafoglio) {
      o += `## 8. Portafoglio personale dell'utente (operazioni registrate a mano)\n\n`;
      const r = c.portafoglio && c.portafoglio.righe;
      if (!Array.isArray(r)) o += "_Non disponibile._\n\n";
      else if (!r.length) o += "_Nessuna operazione registrata._\n\n";
      else {
        o += `«P/L %» è la variazione fra prezzo d'ingresso e ultimo prezzo disponibile del portale (non include costi né dividendi; per le uscite usa il prezzo di uscita). SL = stop loss, TP = target.\n\n`;
        o += tab(["Ticker", "Direzione", "Stato", "Data ingresso", "Prezzo ingresso", "Quantità", "SL", "TP1", "TP2", "TP3", "Ultimo prezzo", "P/L %", "Note"],
          r.map((x) => { const ing = Number(x.Prezzo_Ingresso), usc = Number(x.Prezzo_Uscita), chiuso = x.Stato && x.Stato !== "Aperto", fine = chiuso && nz(usc) !== null && usc > 0 ? usc : prezzo(x.Ticker);
            const pl = nz(ing) !== null && ing > 0 && nz(fine) !== null ? ((fine - ing) / ing) * 100 * (x.Direzione === "Short" ? -1 : 1) : null;
            return [x.Ticker, x.Direzione, x.Stato, data(x.Data_Ingresso), px(ing), x.Quantita, x.SL, x.TP1, x.TP2, x.TP3, px(prezzo(x.Ticker)), sg(pl), x.Note || x.Motivazione || "—"]; })) + "\n";
      }
    }
    return o;
  }

  // 9. Basi di accumulo: le stesse basi (range) dei grafici del portale, in forma numerica. Fonte: index.json (campo basi) + livelli volumetrici dello screening.
  function sezBasi(ind, sc) {
    let o = `## 9. Basi di accumulo (range dei grafici del portale)\n\n`;
    const basi = ind && Array.isArray(ind.basi) ? ind.basi : null;
    if (!basi || !basi.length) return o + "_Non disponibile._\n\n";
    const scr = {}; for (const r of (sc && sc.righe) || []) scr[r.ticker] = r;
    const ordStato = { tenuto: 0, in_attesa: 1, rientro: 2 };
    const righe = [];
    let obsoleti = 0;
    for (const b of basi) {
      const [tk, tf] = String(b.chiave || "").split("|");
      if (!tk || nz(b.top) === null || nz(b.bottom) === null || !(b.top > b.bottom) || nz(b.ultimo) === null) continue;
      const u = b.ultimo;
      if (u > b.top * 2 || u < b.bottom * 0.5) { obsoleti++; continue; }       // stessa regola del portale: prezzo troppo lontano = range non operativo
      const rt = b.ritorni && typeof b.ritorni === "object" ? b.ritorni : null;
      const e = (scr[tk] && scr[tk].extra) || {};
      const poc = nz(e.Z1c) !== null && !(e.Z1c > u * 2 || e.Z1c < u * 0.5) ? e.Z1c : null;
      const zoneOk = nz(e.Z1c) === null || poc !== null;
      righe.push({ tk, tf, b, u, rt, poc, e, zoneOk, ord: rt && rt.esito in ordStato ? ordStato[rt.esito] : 3 });
    }
    // Prima le uscite con retest tenuto, poi in attesa di retest, poi rientrate, poi le altre; a parità: stato e ticker.
    righe.sort((a, b) => a.ord - b.ord || String(a.b.stato).localeCompare(String(b.b.stato)) || a.tk.localeCompare(b.tk) || a.tf.localeCompare(b.tf));
    const conteggio = (st) => righe.filter((r) => r.b.stato === st).length;
    o += `${agg(ind)}Basi attive: ${righe.length} (${conteggio("uscito_sopra")} uscite sopra il massimo, ${conteggio("in_range")} dentro il range, ${conteggio("rallenta")} con range che si stringe, ${conteggio("uscito_sotto")} uscite sotto il minimo)` +
      `${obsoleti ? `; escluse ${obsoleti} con prezzo troppo lontano dal range (range obsoleto)` : ""}.\n\n` +
      `Definizioni: base di accumulo = fase laterale dopo un forte calo, con minimo e massimo del range (Bottom, Top). «Ampiezza» = (Top−Bottom)/Top in %; «Barre» = durata del range; «Calo prima» = calo che ha preceduto il range. «Pos. nel range» = 0% sul minimo, 100% sul massimo (oltre 100% = sopra il massimo, negativa = sotto il minimo). ` +
      `Stati: in_range = prezzo dentro; rallenta = il range si stringe; uscito_sopra / uscito_sotto = uscita dal range. «Retest» = dopo un'uscita sopra, il prezzo torna a ≤ 2% dal vecchio massimo chiudendo comunque sopra: «tenuto» = ha tenuto il livello (n = volte, date), «in attesa» = nessun ritorno ancora, «rientro» = è rientrato nel range (uscita fallita). ` +
      `POC = punto di maggior volume (centro della zona volumetrica 1) e Z1/Z2 = zone volumetriche del titolo, dallo screening: presenti solo se il titolo è nello screening e se vicini al prezzo (altrimenti «fuori scala» o «—»). Valuta: quella di quotazione.\n\n`;
    if (!righe.length) return o + "_Nessuna base attiva._\n\n";
    const tot = righe.length, mostra = righe.slice(0, LIM.basi);
    o += tab(["Ticker", "TF", "Stato", "Bottom", "Top", "Ampiezza %", "Barre", "Inizio", "Calo prima %", "Ultimo prezzo", "Pos. nel range %", "Data uscita", "Retest", "Date retest", "POC", "Z1", "Z2", "Punti screening"],
      mostra.map((r) => { const b = r.b, rt = r.rt, pos = (r.u - b.bottom) / (b.top - b.bottom) * 100, sr = scr[r.tk];
        return [r.tk, r.tf === "1W" ? "settimanale" : "giornaliero", b.stato, px(b.bottom), px(b.top), f(nz(b.ampiezza) === null ? null : b.ampiezza * 100, 1), num(b.barre), data(b.inizio), f(nz(b.calo) === null ? null : b.calo * 100, 0), px(r.u), f(pos, 0),
          data(b.uscita_data || b.uscito_il), rt ? (rt.esito === "rientro" ? `rientro${rt.n ? ` dopo ${rt.n} retest` : ""}` : rt.esito === "in_attesa" || !rt.n ? "in attesa" : `tenuto (${rt.n})`) : "n/d",
          rt && Array.isArray(rt.date) && rt.date.length ? rt.date.map(data).join(", ") : "—", r.poc !== null ? px(r.poc) : nz(r.e.Z1c) !== null ? "fuori scala" : "—",
          r.zoneOk ? t(r.e.Z1) || "—" : "fuori scala", r.zoneOk ? t(r.e.Z2) || "—" : "fuori scala", sr && nz(sr.punti) !== null ? `${sr.punti}/6` : "—"]; })) + "\n";
    if (tot > mostra.length) o += `Elenco limitato alle prime ${mostra.length} basi su ${tot} (ordine: retest tenuto, in attesa, rientro, poi le altre).\n\n`;
    return o;
  }

  function costruisci(ctx, opz) {
    const c = ctx || {}, o = Object.assign({ istruzioni: true, watchlist: true, portafoglio: true }, opz || {});
    const ora = c.ora || new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";
    const parti = [sezIntro(c, ora), o.istruzioni === false ? "" : sezIstruzioni(), sezRegime(c.macro), sezSettori(c.settori), sezStrumenti(c.strumenti), sezScreening(c.screening, c.indice), sezInsider(c.insider), sezCalendario(c.calendario, ora), sezPersonali(c, o), sezBasi(c.indice, c.screening)];
    return parti.join("").replace(/\n{3,}/g, "\n\n").trim() + "\n";
  }
  const api = { costruisci };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else radice.Briefing = api;
})(typeof window !== "undefined" ? window : globalThis);
