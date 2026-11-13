// Prova nel browser: (1) tabelle → card verticali su mobile, invariate su desktop; (2) scheda con «In sintesi» e vista semplice/completa.
import { createRequire } from "node:module"; const { chromium } = createRequire(import.meta.url)("playwright"); import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const root = new URL("../site/", import.meta.url).pathname, out = process.argv[2] || "/tmp";
const ix = JSON.parse(fs.readFileSync(path.join(root, "data/index.json"), "utf8"));
const serie = new Set(fs.readdirSync(path.join(root, "data/serie")).map((f) => f.replace(/\.json$/, "")));
const conSerie = (b) => serie.has([...b.chiave.split("|")[0]].map((c) => (/[A-Za-z0-9\-_.]/.test(c) ? c : "_")).join(""));   // il grafico richiede il file della serie
const uscito = ix.basi.find((b) => b.stato === "uscito_sopra" && b.chiave.endsWith("|1D") && conSerie(b)), inrange = ix.basi.find((b) => b.stato === "in_range" && b.chiave.endsWith("|1D") && conSerie(b));
const T1 = uscito.chiave.split("|")[0], T2 = inrange.chiave.split("|")[0];
const j = (r, o, s = 200) => { r.writeHead(s, { "content-type": "application/json" }); r.end(JSON.stringify(o)); };
const unif = { aggiornato: "2026-11-12T22:35:00+00:00", punteggi_data: "2026-11-12", db: true, righe: [
  { ticker: T1, dist_ath: -0.32, punteggio: { punti: 4, segnale: "WATCH" }, basi: { "1D": { stato: "uscito_sopra", pos: 1.4, uscito_il: "2026-11-12" }, "1W": { stato: "in_range", pos: 0.7 } } },
  { ticker: T2, dist_ath: -0.1, punteggio: null, basi: { "1D": { stato: "in_range", pos: 0.3 } } }], scheduler: [] };
const srv = http.createServer((q, r) => {
  const u = q.url.split("?")[0];
  if (u === "/api/me") return j(r, { modalita: "access", email: "capo@example.com", admin: true, abilitato: true });
  if (u === "/api/utenti/me") return j(r, { admin: true, abilitato: true });
  if (u === "/api/unificato") return j(r, unif);
  if (u === "/api/screening") return j(r, { data: "2026-11-12", righe: [{ ticker: T1, punti: 4, segnale: "WATCH", priorita: "A", extra: { Prezzo: 250, "DD%": -32, RSI: 55, Settore: "Tech", Seg_Punti: 4 } }] });
  if (u === "/api/dati/watchlist") return j(r, { sha: "v1", puo_modificare: false, dati: { entries: [] } });
  const f = path.join(root, u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); }
    r.setHeader("content-type", f.endsWith(".js") ? "text/javascript" : f.endsWith(".json") ? "application/json" : f.endsWith(".css") ? "text/css" : "text/html"); r.end(d); });
}).listen(8771, async () => {
  const b = await chromium.launch(); let esito = 0; const ok = (n, c) => { console.log((c ? "✓ " : "✗ ") + n); if (!c) esito = 1; };
  const nuova = async (w, h) => { const c = await b.newContext({ viewport: { width: w, height: h } }), p = await c.newPage(); p.on("pageerror", (e) => { console.log("ERR", e.message); esito = 1; }); return p; };

  // ── 1. card su mobile ─────────────────────────────────────────────────
  let p = await nuova(390, 844);
  await p.goto("http://localhost:8771/unificato.html"); await p.waitForTimeout(900);
  ok("mobile: tabella marcata come card (.cm)", await p.$eval("#tab", (t) => t.classList.contains("cm")));
  ok("mobile: intestazioni nascoste", (await p.$eval("#tab thead", (e) => getComputedStyle(e).display)) === "none");
  ok("mobile: ogni riga è un blocco (card) con bordo", (await p.$eval("#tab tbody tr", (e) => getComputedStyle(e).display)) === "block");
  const lab = await p.$$eval("#tab tbody tr:first-child td", (td) => td.map((x) => x.dataset.label));
  ok("mobile: ogni cella ha la sua etichetta di colonna", lab.join("|") === "Ticker|Da ATH|1D|Pos. 1D|1W|Pos. 1W|Punteggio|Segnale");
  ok("mobile: nessuno scorrimento orizzontale della pagina", await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  ok("mobile: etichetta visibile via CSS (::before)", (await p.$eval("#tab tbody tr:first-child td:nth-child(2)", (e) => getComputedStyle(e, "::before").content)).includes("Da ATH"));
  await p.screenshot({ path: path.join(out, "card-mobile-unificato.png"), fullPage: true });
  // ridisegno della tabella (filtro): le etichette tornano da sole
  await p.selectOption("#f-mostra", "tutte"); await p.waitForTimeout(400);
  ok("mobile: dopo il filtro le righe nuove hanno ancora le etichette", (await p.$$eval("#tab tbody tr:first-child td", (td) => td.map((x) => x.dataset.label))).length === 8);
  await p.close();

  // ── 2. desktop invariato ──────────────────────────────────────────────
  p = await nuova(1400, 900);
  await p.goto("http://localhost:8771/unificato.html"); await p.waitForTimeout(900);
  ok("desktop: intestazioni visibili", (await p.$eval("#tab thead", (e) => getComputedStyle(e).display)) !== "none");
  ok("desktop: righe restano righe di tabella", (await p.$eval("#tab tbody tr", (e) => getComputedStyle(e).display)) === "table-row");
  ok("desktop: nessuna etichetta mostrata nelle celle", (await p.$eval("#tab tbody tr:first-child td:nth-child(2)", (e) => getComputedStyle(e, "::before").content)) === "none");

  // ── 3. scheda: In sintesi + vista semplice/completa ───────────────────
  await p.click(`[data-scheda="${T1}"]`); await p.waitForTimeout(1500);
  const frasiTxt = await p.$$eval(".sintesi li", (l) => l.map((x) => x.textContent));
  ok("scheda: box «In sintesi» con 3-4 frasi", frasiTxt.length >= 3 && frasiTxt.length <= 4);
  ok("scheda: colore di stato del box = stato della base (uscito sopra)", await p.$eval(".sintesi", (e) => e.classList.contains("s-uscito_sopra")));
  ok("scheda: la frase cita il massimo del range reale", frasiTxt.join(" ").includes(Number(uscito.top).toLocaleString("it-IT", { maximumFractionDigits: 2 })));
  ok("scheda: avviso «non è un consiglio»", /non è un consiglio/.test(await p.$eval(".sintesi", (e) => e.textContent)));
  ok("scheda: di default vista semplice (sezioni quantitative nascoste)", await p.$eval(".scheda-pro", (e) => e.hidden));
  ok("scheda: il grafico c'è anche nella vista semplice", !!(await p.$(".scheda-grafico")));
  await p.screenshot({ path: path.join(out, "scheda-vista-semplice.png") });
  await p.click('button[data-vista="completa"]'); await p.waitForTimeout(200);
  ok("scheda: «Vista completa» mostra le sezioni", !(await p.$eval(".scheda-pro", (e) => e.hidden)) && (await p.$$(".scheda-pro section")).length > 0);
  await p.screenshot({ path: path.join(out, "scheda-vista-completa.png") });
  await p.keyboard.press("Escape"); await p.click(`[data-scheda="${T1}"]`); await p.waitForTimeout(1200);
  ok("scheda: la scelta «completa» resta alla riapertura", !(await p.$eval(".scheda-pro", (e) => e.hidden)));
  await p.click('button[data-vista="semplice"]'); await p.waitForTimeout(150);
  ok("scheda: si torna alla vista semplice", await p.$eval(".scheda-pro", (e) => e.hidden));
  await p.keyboard.press("Escape");
  await p.selectOption("#f-mostra", "tutte"); await p.waitForTimeout(300);
  await p.click(`[data-scheda="${T2}"]`); await p.waitForTimeout(1200);
  ok("scheda di un titolo in range: box colorato come lo stato", await p.$eval(".sintesi", (e) => e.classList.contains("s-in_range")));
  await p.close();

  // ── 4. scheda su mobile ────────────────────────────────────────────────
  p = await nuova(390, 844);
  await p.goto("http://localhost:8771/unificato.html"); await p.waitForTimeout(900);
  await p.click(`[data-scheda="${T1}"]`); await p.waitForTimeout(1500);
  ok("mobile: scheda senza scorrimento orizzontale", await p.evaluate(() => document.querySelector(".scheda").scrollWidth <= document.querySelector(".scheda").clientWidth + 1));
  await p.screenshot({ path: path.join(out, "scheda-mobile.png") });
  await b.close(); srv.close(); console.log(esito ? "FALLITO" : "TUTTI I CHECK PASSATI"); process.exit(esito);
});
