// Prova nel browser (a): testi troncati — ogni testo lungo nelle tabelle ha ellipsis
// e tooltip col testo completo (span.taglia + title), niente tagli secchi senza tooltip.
// Pagine: screening, vista unificata, watchlist, portafoglio, condiviso, utenti, calendario.
import { createRequire } from "node:module"; const { chromium } = createRequire(import.meta.url)("playwright"); import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { COL_PORT, COL_COND } from "../src/archivio.js";
const root = new URL("../site/", import.meta.url).pathname, out = process.argv[2] || "/tmp";

const SETTORE = "Tecnologia — Semiconduttori e componenti per data center";
const SEGNALE = "WATCH su ritracciamento in zona con volumi in aumento e conferma settimanale del minimo";
const WYCKOFF = "Accumulazione primaria fase C con test di supply in corso";
const QUALITA = "⚠️ dato fermo da 2 sedute (ultima barra 2026-11-10); 2 barre da fonte di backup (tiingo)";
const NOTA = "Aperto sul ritracciamento del marzo 2025 con volume in aumento e conferma settimanale; raddoppio se torna sopra il POC con chiusura piena";
const MOTIVO = "Chiusura parziale su target 1 raggiunto con divergenza RSI e notizia trimestrale sopra attese";
const DESCR = "Presentazione dei risultati trimestrali con aggiornamento del piano industriale e guida sull'esercizio in corso, seguita da conferenza stampa con gli analisti";
const NOME_LUNGO = "STMicroelectronics NV — Q3 2026 Earnings Call";
const DETTAGLIO = "Screening completato: 167 titoli, 42 europei con dato fermo da 2 sedute; failover Tiingo attivo su 3 titoli; 12 uscite dal range segnalate";

const screening = { data: "2026-11-12", righe: [
  { ticker: "TESTLUNGO", punti: 4, priorita: "A", segnale: "WATCH", extra: { Prezzo: 101.4, "DD%": -32.1, RSI: 43, Settore: SETTORE, Wyckoff: WYCKOFF, Qualita_Dati: QUALITA, Confluenza: "POC settimanale sotto VWAP60 giornaliero con ritracciamento in zona 1" } },
  { ticker: "KO", punti: 1, priorita: "C", segnale: "—", extra: { Prezzo: 60, "DD%": -5, RSI: 55, Settore: "Consumi" } }] };
const wl = { updated: "2026-11-12T10:00:00+00:00", entries: [
  { ticker: "TESTLUNGO", origin: "manual", created: "2026-09-16T07:53:15+00:00", last_reviewed: "2026-09-16T07:53:15+00:00", poc: 101.9, vwap: 101.0, levels: { L1: 100.05, L2: 98 }, notes: "", target_date: null, sector: SETTORE, sub: null }] };
const port = [{ ID: "a1", Ticker: "TESTLUNGO", Direzione: "Long", Data_Ingresso: "2026-10-24", Prezzo_Ingresso: 100.4, Quantita: 10, SL: 95, Stato: "Aperto", Note: NOTA }];
const cond = [{ ID: "c1", Ticker: "TESTLUNGO", Direzione: "Long", Data_Ingresso: "2026-10-20", Prezzo_Ingresso: 105, Quantita: 2, SL: 95, Comm_Ingresso: 1, Comm_Uscita: 1, Costi_Extra: 0, Stato: "Aperto", Motivazione: NOTA },
  { ID: "c2", Ticker: "KO", Direzione: "Long", Data_Ingresso: "2026-10-20", Prezzo_Ingresso: 105, Quantita: 2, SL: 95, Comm_Ingresso: 1, Comm_Uscita: 1, Costi_Extra: 0, Stato: "Chiuso", Prezzo_Uscita: 128, Data_Uscita: "2026-11-10", Motivazione: NOTA, Motivo_Uscita: MOTIVO }];
const unif = { aggiornato: "2026-11-12T22:35:00+00:00", punteggi_data: "2026-11-12", db: true,
  righe: [{ ticker: "TESTLUNGO", dist_ath: -0.32, punteggio: { punti: 4, segnale: SEGNALE }, basi: { "1D": { stato: "in_range", pos: 0.7, uscito_il: null } } }],
  scheduler: [{ quando: "2026-11-12T22:35:00+00:00", job: "screening", esito: "ok", dettaglio: DETTAGLIO }] };
const calendario = { aggiornato: "2026-11-12T23:30:00+00:00", dati: { settori: ["Tecnologia"], log: [],
  eventi: [{ data_attesa: "2026-11-18", ticker: "TESTLUNGO", nome: NOME_LUNGO, settore: "Tecnologia", tipo: "Utili", descrizione: DESCR, fonte: "Yahoo Finance", stato_data: "confermata", orientamento: "futuro", link_ufficiale: "", verified: true }] } };
const utenti = { accesso_aperto: true, access_automatico: true, editors: [], richieste: [{ nome: "Mirko", email: "mirko@example.com", creato: "2026-11-11", messaggio: "Vorrei l'accesso per seguire il portafoglio condiviso", stato: "attesa" }],
  utenti: [{ nome: "Marco", email: "capo@example.com", uid: "marco", canale: "Telegram", creato: "2026-09-01", attivo: true }] };

const j = (r, o, s = 200) => { r.writeHead(s, { "content-type": "application/json" }); r.end(JSON.stringify(o)); };
const srv = http.createServer((q, r) => {
  const u = q.url.split("?")[0];
  if (u === "/api/me") return j(r, { modalita: "access", email: "capo@example.com", admin: true, abilitato: true });
  if (u === "/api/utenti/me") return j(r, { admin: true, abilitato: true });
  if (u === "/api/utenti") return j(r, utenti);
  if (u === "/api/screening") return j(r, screening);
  if (u === "/api/unificato") return j(r, unif);
  if (u === "/api/dati/watchlist") return j(r, { sha: "v1", puo_modificare: true, dati: wl });
  if (u === "/api/dati/portafoglio") return j(r, { sha: "v1", puo_modificare: true, colonne: COL_PORT, righe: port });
  if (u === "/api/dati/condiviso") return j(r, { sha: "v1", puo_modificare: true, colonne: COL_COND, righe: cond });
  if (u === "/api/pagina/calendario") return j(r, calendario);
  const f = path.join(root, u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); }
    r.setHeader("content-type", f.endsWith(".js") ? "text/javascript" : f.endsWith(".json") ? "application/json" : f.endsWith(".css") ? "text/css" : "text/html"); r.end(d); });
}).listen(8781, async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
  p.on("pageerror", (e) => console.log("ERR", e.message));
  const ok = (n, c) => console.log((c ? "✓ " : "✗ ") + n);
  const apri = async (pg, ms = 800) => { await p.goto("http://localhost:8781/" + pg); await p.waitForTimeout(ms); };
  // Invariante su ogni pagina: ogni .taglia ha tooltip col testo completo; nessun
  // elemento tagliato (overflow hidden/clip) senza tooltip.
  const invariante = () => {
    const senza = [];
    for (const el of document.querySelectorAll(".taglia")) {
      if (!el.title || el.title !== el.textContent) senza.push("span.taglia senza title completo: «" + el.textContent.slice(0, 30) + "…»");
    }
    for (const el of document.querySelectorAll("td, th, .chip, .bq")) {
      if (!el.textContent.trim()) continue;
      const cs = getComputedStyle(el);
      if (el.scrollWidth > el.clientWidth + 1 && ["hidden", "clip"].includes(cs.overflowX) && !el.title && !el.querySelector("[title]"))
        senza.push("testo tagliato senza tooltip: «" + el.textContent.trim().slice(0, 30) + "…»");
    }
    return senza;
  };

  await apri("screening.html");
  ok("screening: testo lungo (settore, wyckoff, confluenza) con ellipsis e tooltip completo",
     (await p.$$eval("#tab tbody span.taglia", (e, s) => {
       const x = e.find((t) => t.title === s);
       return !!x && x.scrollWidth > x.clientWidth;
     }, SETTORE))
     && (await p.$$eval("#tab tbody span.taglia", (e, w) => e.some((t) => t.title === w), WYCKOFF))
     && (await p.$$eval("#tab tbody span.taglia", (e) => e.some((t) => t.title.startsWith("POC settimanale")) && e.every((t) => t.title === t.textContent))));
  ok("screening: testo corto (ticker, numeri) resta semplice, senza span",
     (await p.$$eval("#tab tbody td:nth-child(1) span.taglia", (e) => e.length)) === 0);
  ok("screening: invariante pagina", (await p.evaluate(invariante)).length === 0);
  await p.screenshot({ path: out + "/testi-screening.png", fullPage: true });

  await apri("unificato.html");
  await p.selectOption("#f-mostra", "tutte"); await p.waitForTimeout(300);   // il filtro di default è «uscite»
  ok("unificato: segnale lungo con tooltip", (await p.$eval("#tab tbody tr:first-child td:nth-child(8) span.taglia", (e, s) => e.title === s, SEGNALE)));
  ok("unificato: dettaglio scheduler lungo con tooltip", (await p.$eval("#tab-sched tbody tr:first-child td:nth-child(4) span.taglia", (e, s) => e.title === s, DETTAGLIO)));
  ok("unificato: invariante pagina", (await p.evaluate(invariante)).length === 0);
  await p.screenshot({ path: out + "/testi-unificato.png", fullPage: true });

  await apri("watchlist.html");
  ok("watchlist: settore lungo con tooltip", (await p.$eval("#tab tbody tr:first-child td:nth-child(3) span.taglia", (e, s) => e.title === s, SETTORE)));
  ok("watchlist: badge qualità dati con testo completo nel tooltip (comportamento mantenuto)",
     (await p.$eval("#tab .bq", (e, q) => e.title === q, QUALITA.replace(/^⚠️\s*/, "").trim())));
  ok("watchlist: invariante pagina", (await p.evaluate(invariante)).length === 0);
  await p.screenshot({ path: out + "/testi-watchlist.png", fullPage: true });

  await apri("portafoglio.html");
  ok("portafoglio: nota lunga con ellipsis e tooltip completo",
     (await p.$eval("#tab tbody tr:first-child td:last-child span.taglia", (e, n) => e.title === n && e.scrollWidth > e.clientWidth, NOTA)));
  ok("portafoglio: invariante pagina", (await p.evaluate(invariante)).length === 0);
  await p.screenshot({ path: out + "/testi-portafoglio.png", fullPage: true });

  await apri("condiviso.html");
  ok("condiviso: motivazione (aperto) e motivo uscita (chiuso) con tooltip",
     (await p.$$eval("#tab span.taglia", (e) => e.map((x) => x.title))).join("|") === [NOTA, MOTIVO].join("|"));
  ok("condiviso: invariante pagina", (await p.evaluate(invariante)).length === 0);
  await p.screenshot({ path: out + "/testi-condiviso.png", fullPage: true });

  await apri("utenti.html");
  ok("utenti: richiesta in elenco e messaggio visibile (va a capo, niente tagli)",
     (await p.textContent("#rich")).includes("portafoglio condiviso"));
  ok("utenti: invariante pagina", (await p.evaluate(invariante)).length === 0);
  await p.screenshot({ path: out + "/testi-utenti.png", fullPage: true });

  await apri("calendario.html");
  const cellaDesc = await p.$eval("#tab tbody tr:first-child td:nth-child(6)", (e) => {
    const s = e.querySelector("span.taglia");
    return { intero: !!s, title: s && s.title, testo: s && s.textContent, ellipsis: s ? s.scrollWidth > s.clientWidth : false };
  });
  ok("calendario: descrizione INTEGRA nel DOM (niente più taglio a 80 caratteri) con tooltip",
     cellaDesc.intero && cellaDesc.testo === DESCR && cellaDesc.title === DESCR);
  ok("calendario: ellipsis visivo in cella, testo completo nel tooltip", cellaDesc.ellipsis);
  ok("calendario: nome lungo con tooltip", (await p.$eval("#tab tbody tr:first-child td:nth-child(3) span.taglia", (e, n) => e.title === n, NOME_LUNGO)));
  ok("calendario: invariante pagina", (await p.evaluate(invariante)).length === 0);
  await p.screenshot({ path: out + "/testi-calendario.png", fullPage: true });

  await b.close(); srv.close();
});
