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
  const LIM = { candidati: 40, insider: 12, eventi: 25, giorniEventi: 21 };

  function rangeDi(indice, ticker, tf) {
    const b = ((indice && indice.basi) || []).find((x) => x.chiave === `${ticker}|${tf}`);
    if (!b) return "assente";
    if (nz(b.top) === null || nz(b.bottom) === null || !(b.top > b.bottom) || nz(b.ultimo) === null) return `${t(b.stato)}; ${px(b.bottom)}–${px(b.top)}`;
    const u = b.ultimo, dove = u > b.top ? `prezzo ${f((u / b.top - 1) * 100, 0)}% sopra il massimo` : u < b.bottom ? `prezzo ${f((1 - u / b.bottom) * 100, 0)}% sotto il minimo` : `pos ${Math.round(((u - b.bottom) / (b.top - b.bottom)) * 100)}%`;
    return `${t(b.stato)}; ${px(b.bottom)}–${px(b.top)}; ${dove}`;
  }
  const agg = (p) => (p && p.aggiornato ? `Dati aggiornati al: ${t(p.aggiornato).replace("T", " ").slice(0, 16)}${String(p.aggiornato).length > 10 ? " UTC" : ""}.\n\n` : "");
  const valuta = (tk) => { const m = /\.([A-Z]+)$/.exec(String(tk || "").toUpperCase()); const x = m ? m[1] : ""; return x === "L" ? "GBp (pence)" : ["DE", "PA", "AS", "MI", "MC", "BR"].includes(x) ? "EUR" : x === "" ? "USD" : "n/d"; };
  function setup(indice, ticker) {
    const trova = (tf) => ((indice && indice.basi) || []).find((x) => x.chiave === `${ticker}|${tf}`);
    const tf = trova("1D") ? "1D" : trova("1W") ? "1W" : null, b = tf && trova(tf);
    if (!b || nz(b.top) === null || nz(b.bottom) === null || !(b.top > b.bottom) || nz(b.ultimo) === null) return "senza range";
    const u = b.ultimo, pos = (u - b.bottom) / (b.top - b.bottom), ext = (u / b.top - 1) * 100;
    const e = u > b.top ? (ext <= 3 ? "breakout recente (≤3% sopra il massimo del range)" : ext <= 10 ? "breakout in corso (3–10% sopra il massimo)" : "già esteso (>10% sopra il massimo)")
      : u < b.bottom ? "sotto il minimo del range"
      : b.stato === "uscito_sopra" ? `rientrato nel range dopo un'uscita sopra (pos ${Math.round(pos * 100)}%)`
      : b.stato === "rallenta" ? `range che si stringe (pos ${Math.round(pos * 100)}%)`
      : `dentro il range, parte ${pos < 1 / 3 ? "bassa" : pos < 2 / 3 ? "centrale" : "alta"} (pos ${Math.round(pos * 100)}%)`;
    return `${e} [${tf}]`;
  }
  const sett = (x) => t(x).replace(/^⚠️\s*/, "");
  const ultimo = (indice, tk) => { const x = indice && indice.titoli && indice.titoli[tk]; return x ? x.ultimo : null; };
  const athDi = (indice, ticker) => { const x = indice && indice.titoli && indice.titoli[ticker]; return x && nz(x.dist_ath) !== null ? sg(x.dist_ath * 100, 0) : "n/d"; };

  function sezIntro(c, ora) {
    return `# Briefing di mercato — portale screening\n\n` +
      `- Generato: ${ora}\n` +
      `- Cos'è: istantanea di un portale personale di screening (titoli USA S&P 500 + Nasdaq 100, FTSE 100, DAX, CAC 40). Tutti i numeri vengono da dati pubblici di mercato elaborati dal portale; possono avere ore o giorni di ritardo (la data di ciascuna fonte è indicata sotto).\n` +
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
      `- **Contesto:** conferma con fonti indipendenti dal portale il quadro macro (crescita, inflazione, tassi e banche centrali), le notizie dei settori coinvolti e il calendario macro e delle trimestrali delle prossime settimane: il calendario del portale NON li contiene.\n` +
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
      `Punteggio massimo 6 = B 1 + C 1 + G 2 + D 1 + E 1. B = la caduta rallenta (variazione a 10 giorni migliore di quella di 10 giorni prima); C = prezzo in una zona di volumi forte o a meno di 1 ATR da un VWAP ancorato; G = chiusura sopra la media a 20 giorni dopo averla incrociata negli ultimi 5 giorni; D = spinta di rientro (incrocio sopra il VWAP a 60 giorni, massimo a 20 giorni superato, minimo settimanale più alto dopo un calo, o candelona recente); E = qualità fondamentale (ROE, debito, margini, crescita, flusso di cassa). «Priorità» = ordinamento interno del portale (più alto = più in alto nella lista). «Prezzo screening» = prezzo al momento del run dello screening (06:30 o 14:30 UTC: per i titoli USA è la chiusura precedente o un prezzo a mercato appena aperto) e su questo sono calcolati DD, RSI, VWAP e punteggio; «Ultimo prezzo» = ultima chiusura contenuta nei dati dei range (aggiornati a fine giornata, indicati sopra): se diverso, è il più recente. «Tipo di setup» = lettura automatica dei range (usa il giornaliero, se manca il settimanale): dentro il range (parte bassa/centrale/alta), range che si stringe, breakout recente/in corso/già esteso rispetto al massimo del range, sotto il minimo. «In zona» = prezzo dentro la zona di volumi Z1…Z4 (Z1 = quella con più volumi). «Vento» = tendenza del sotto-settore: favore (in crescita), contro (in calo), misto. «Score settore» 0–100. Wyckoff = punteggio a 10 della struttura di accumulo. «Range 1D/1W» = base di accumulo individuata dal prezzo sul grafico giornaliero/settimanale: stato; minimo–massimo; posizione del prezzo nel range (pos 0% = prezzo al minimo del range, 100% = al massimo; se il prezzo è fuori dal range lo scarto è dato in % dal limite). Stati: in_range = prezzo dentro il range; rallenta = range che si stringe; uscito_sopra / uscito_sotto = ultima chiusura oltre il massimo / sotto il minimo del range.\n\n`;
    const scelti = righe.filter((r) => nz(r.punti) !== null && r.punti >= 4).sort((a, b) => (nz(b.priorita) ?? -1) - (nz(a.priorita) ?? -1)).slice(0, LIM.candidati);
    if (!scelti.length) return o + "Nessun titolo con punteggio ≥ 4/6.\n\n";
    o += `Elenco: i ${scelti.length} titoli con punteggio ≥ 4/6 a priorità più alta.\n\n`;
    o += tab(["Ticker", "Valuta", "Settore", "Score settore", "Vento", "Punti", "Prezzo screening", "Ultimo prezzo", "DD 5a %", "DD da ATH %", "RSI", "ATR%", "In zona", "VWAP60", "Wyckoff", "Insider cluster", "Priorità", "Tipo di setup", "Range 1D", "Range 1W"],
      scelti.map((r) => { const e = ex(r); return [r.ticker, valuta(r.ticker), sett(e.Settore), num(e.SectorScore), e.Vento, `${r.punti}/6`, px(e.Prezzo), px(ultimo(ind, r.ticker)), sg(e["DD%"]), athDi(ind, r.ticker), f(e.RSI, 0), f(e["ATR%"], 2), e["In zona"] || "—", px(e.VWAP60), e.Wyckoff, e.Insider_Cluster ? "sì" : "no", num(r.priorita), setup(ind, r.ticker), rangeDi(ind, r.ticker, "1D"), rangeDi(ind, r.ticker, "1W")]; }));
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
    o += `Acquisti più grandi\n\n` + tab(colI,
      top.map(riga)) +
      (dettCl.length ? `\nTutti gli acquisti dei titoli con cluster (per verificare chi ha comprato e quando)\n\n` + tab(colI, dettCl.map(riga)) : "");
    return o + "\n";
  }

  function sezCalendario(c, ora) {
    let o = `## 6. Calendario eventi (prossimi ${LIM.giorniEventi} giorni)\n\n`;
    const ev = c && c.dati && Array.isArray(c.dati.eventi) ? c.dati.eventi : null;
    if (!ev) return o + "_Non disponibile._\n\n";
    const oggi = Date.parse(String(ora).slice(0, 10)), fino = oggi + LIM.giorniEventi * 864e5;
    const v = ev.filter((e) => { const d = Date.parse(data(e.data_attesa)); return Number.isFinite(d) && d >= oggi - 864e5 && d <= fino; }).sort((a, b) => String(a.data_attesa).localeCompare(String(b.data_attesa))).slice(0, LIM.eventi);
    o += agg(c) + `Il calendario del portale raccoglie SOLO catalizzatori inseriti a mano o dal controllo eventi (es. decisioni FDA, eventi societari); NON contiene trimestrali né dati macro (inflazione, occupazione, banche centrali): quelli vanno cercati fuori. Le date «attese» possono slittare; «stato data» indica se è confermata.\n\n`;
    if (!v.length) { const futuri = ev.map((e) => data(e.data_attesa)).filter((d) => Date.parse(d) > fino).sort(); return o + `Nessun evento nei prossimi ${LIM.giorniEventi} giorni (eventi registrati in tutto: ${ev.length}${futuri.length ? `; il prossimo è del ${futuri[0]}` : ""}).\n\n`; }
    return o + tab(["Data", "Ticker", "Nome", "Tipo", "Settore", "Descrizione", "Stato data"], v.map((e) => [data(e.data_attesa), e.ticker || "—", e.nome, e.tipo, e.settore, e.descrizione, e.stato_data])) + "\n";
  }

  function sezPersonali(c, opz) {
    let o = "";
    const scr = {}; for (const r of (c.screening && c.screening.righe) || []) scr[r.ticker] = r;
    const prezzo = (tk) => { const u = ultimo(c.indice, tk); return u !== null && u !== undefined ? u : scr[tk] && scr[tk].extra && nz(scr[tk].extra.Prezzo) !== null ? scr[tk].extra.Prezzo : null; };
    if (opz.watchlist) {
      o += `## 7. Watchlist personale dell'utente\n\n`;
      const e = c.watchlist && c.watchlist.entries;
      if (!Array.isArray(e)) o += "_Non disponibile._\n\n";
      else {
        o += `${e.length} titoli. «Livelli» = prezzi di riferimento scelti dall'utente (L1–L3); «Prezzo» = ultima chiusura dei dati dei range, o in mancanza il prezzo dello screening; «origine» = manuale (aggiunto dall'utente) o auto (entrato dallo screening). «Controllo livelli» segnala livelli in ordine inatteso (si attende L1 ≥ L2 ≥ L3) o molto lontani dal prezzo (>50%): possibili refusi dell'utente, da verificare con lui prima di usarli.\n\n`;
        o += tab(["Ticker", "Valuta", "Origine", "Settore (chiave interna)", "Livelli (% = prezzo rispetto al livello)", "Controllo livelli", "Data target", "Note", "Punti", "Prezzo", "DD da ATH %", "Tipo di setup", "Range 1D", "Range 1W"],
          e.map((w) => { const s = scr[w.ticker], pz = prezzo(w.ticker), ctl = window_Livelli().controlla(w.levels, pz), lv = Object.entries(w.levels || {}).filter(([, v]) => v !== null && v !== "").map(([k, v]) => `${k} ${v}${nz(ctl.distanze[k]) === null ? "" : ` (${sg(ctl.distanze[k], 0)}%)`}`).join(", ");
            return [w.ticker, valuta(w.ticker), w.origin === "manual" ? "manuale" : "auto", w.sector, lv || "—", ctl.avvisi.length ? "⚠ " + ctl.avvisi.join("; ") : "ok", w.target_date || "—", w.notes || "—", s && nz(s.punti) !== null ? `${s.punti}/6` : "n/d", px(pz), athDi(c.indice, w.ticker), setup(c.indice, w.ticker), rangeDi(c.indice, w.ticker, "1D"), rangeDi(c.indice, w.ticker, "1W")]; })) + "\n";
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

  function costruisci(ctx, opz) {
    const c = ctx || {}, o = Object.assign({ istruzioni: true, watchlist: true, portafoglio: true }, opz || {});
    const ora = c.ora || new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";
    const parti = [sezIntro(c, ora), o.istruzioni === false ? "" : sezIstruzioni(), sezRegime(c.macro), sezSettori(c.settori), sezStrumenti(c.strumenti), sezScreening(c.screening, c.indice), sezInsider(c.insider), sezCalendario(c.calendario, ora), sezPersonali(c, o)];
    return parti.join("").replace(/\n{3,}/g, "\n\n").trim() + "\n";
  }
  const api = { costruisci };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else radice.Briefing = api;
})(typeof window !== "undefined" ? window : globalThis);
