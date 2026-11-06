// Prova nel browser delle pagine Watchlist, Portafoglio e Condiviso con un'API simulata (stessa logica di src/archivio.js).
import { createRequire } from "node:module"; const { chromium } = createRequire(import.meta.url)("playwright"); import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { applicaOp, costruisciTabella, COL_PORT, COL_COND } from "../src/archivio.js";
const root = new URL("../site/", import.meta.url).pathname, out = process.argv[2] || "/tmp";
const st = { wl: { updated: "2026-11-06T10:00:00+00:00", entries: [
  { ticker: "CASY", origin: "manual", created: "2026-09-16T07:53:15+00:00", last_reviewed: "2026-09-16T07:53:15+00:00", poc: null, vwap: 681.4, levels: { L1: 600, L2: 440 }, notes: "", target_date: null, sector: "consumi_disc", sub: "distribuzione" },
  { ticker: "CARR", origin: "auto", created: "2026-09-16T07:26:34+00:00", last_reviewed: "2026-11-01T07:26:34+00:00", poc: 54.0, vwap: 58.0, levels: {}, notes: "", target_date: null, sector: "industriale", sub: null }] },
  port: [{ ID: "43a47f54", Ticker: "ADBE", Direzione: "Long", Data_Ingresso: "2026-10-24", Prezzo_Ingresso: 275.79, SL: 250, Stato: "Aperto" }], cond: [] };
let versione = 1, editor = false;
const j = (r, o, s = 200) => { r.writeHead(s, { "content-type": "application/json" }); r.end(JSON.stringify(o)); };
const body = (q) => new Promise((ok) => { let b = ""; q.on("data", (d) => (b += d)); q.on("end", () => ok(b ? JSON.parse(b) : {})); });
const srv = http.createServer(async (q, r) => {
  const u = q.url.split("?")[0];
  if (u === "/api/screening") return j(r, { data: "2026-11-05", righe: [{ ticker: "ADBE", segnale: "WATCH", punti: 3, extra: { Prezzo: 290.5, "DD%": -35.2, RSI: 41, Wyckoff: "Acc" } }, { ticker: "CASY", segnale: null, punti: 2, extra: { Prezzo: 650 } }] });
  if (u === "/api/dati/watchlist") return j(r, { sha: "v" + versione, puo_modificare: true, dati: st.wl });
  if (u === "/api/watchlist") { const b = await body(q); const x = applicaOp(st.wl.entries, b); if (!x.ok) return j(r, { errore: x.errore }, 400); st.wl.entries = x.voci; versione++; return j(r, { ok: true }); }
  if (u === "/api/dati/portafoglio") return j(r, { sha: "v" + versione, puo_modificare: true, colonne: COL_PORT, righe: st.port });
  if (u === "/api/portafoglio") { const b = await body(q); const t = costruisciTabella(b.righe, false); if (!t.ok) return j(r, { errore: t.errori.join(" · ") }, 400); st.port = t.righe; versione++; return j(r, { ok: true }); }
  if (u === "/api/dati/condiviso") return j(r, { sha: "v" + versione, puo_modificare: editor, colonne: COL_COND, righe: st.cond });
  if (u === "/api/condiviso") { const b = await body(q); const t = costruisciTabella(b.righe, true); if (!t.ok) return j(r, { errore: t.errori.join(" · ") }, 400); st.cond = t.righe; return j(r, { ok: true, alert: "avviato" }); }
  const f = path.join(root, u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); }
    r.setHeader("content-type", f.endsWith(".js") ? "text/javascript" : f.endsWith(".json") ? "application/json" : f.endsWith(".css") ? "text/css" : "text/html"); r.end(d); });
}).listen(8767, async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
  p.on("pageerror", (e) => console.log("ERR", e.message)); p.on("dialog", (d) => d.accept());
  const ok = (n, c) => console.log((c ? "✓ " : "✗ ") + n);
  await p.goto("http://localhost:8767/watchlist.html"); await p.waitForTimeout(700);
  ok("watchlist: 2 righe", (await p.$$eval("#tab tbody tr", (e) => e.length)) === 2);
  await p.fill("#a-t", "nvda"); await p.fill("#a-l1", "100"); await p.click("#f-add button"); await p.waitForTimeout(600);
  ok("watchlist: aggiunta NVDA", st.wl.entries.some((e) => e.ticker === "NVDA" && e.levels.L1 === 100));
  await p.click('tr[data-t="NVDA"]'); await p.fill("#e-l2", "90"); await p.click("#f-ed button[type=submit]"); await p.waitForTimeout(600);
  ok("watchlist: modifica livelli", st.wl.entries.find((e) => e.ticker === "NVDA").levels.L2 === 90);
  await p.click('tr[data-t="NVDA"]'); await p.click("#b-del"); await p.waitForTimeout(600);
  ok("watchlist: rimozione", !st.wl.entries.some((e) => e.ticker === "NVDA"));
  await p.screenshot({ path: out + "/wl.png", fullPage: true });
  await p.goto("http://localhost:8767/portafoglio.html"); await p.waitForTimeout(700);
  ok("portafoglio: ADBE con prezzo dallo screening", (await p.textContent("#tab")).includes("290,50"));
  await p.fill("#a-t", "rng"); await p.fill("#a-dt", "2026-10-24"); await p.fill("#a-p", "43.25"); await p.click("#f-add button"); await p.waitForTimeout(600);
  ok("portafoglio: aggiunta RNG", st.port.some((x) => x.Ticker === "RNG"));
  await p.fill("#a-t", "bad"); await p.fill("#a-dt", "2026-10-24"); await p.fill("#a-p", "10"); await p.fill("#a-sl", "12"); await p.click("#f-add button"); await p.waitForTimeout(600);
  ok("portafoglio: SL incoerente → errore visibile", (await p.textContent("#esito")).includes("SL"));
  await p.click('tr[data-i="43a47f54"]'); await p.fill("#c-p", "300"); await p.click("#f-ch button[type=submit]"); await p.waitForTimeout(600);
  ok("portafoglio: chiusura trade", st.port.find((x) => x.ID === "43a47f54").Stato === "Chiuso");
  await p.screenshot({ path: out + "/pf.png", fullPage: true });
  await p.goto("http://localhost:8767/condiviso.html"); await p.waitForTimeout(700);
  ok("condiviso: sola lettura, form nascosto", await p.$eval("#blocco-add", (e) => e.hidden));
  editor = true; await p.reload(); await p.waitForTimeout(700);
  await p.fill("#a-t", "mu"); await p.fill("#a-dt", "2026-11-06"); await p.fill("#a-p", "90"); await p.fill("#a-q", "2"); await p.click("#f-add button"); await p.waitForTimeout(600);
  ok("condiviso: editor aggiunge, avviso partito", st.cond.length === 1 && (await p.textContent("#esito")).includes("Telegram"));
  await p.click("tr[data-i]"); await p.fill("#c-p", "99"); await p.click("#f-ch button[type=submit]"); await p.waitForTimeout(600);
  ok("condiviso: P&L netto (99-90)*2-2 = 16,00", (await p.textContent("#kpi")).includes("+16,00"));
  await p.screenshot({ path: out + "/cd.png", fullPage: true });
  await b.close(); srv.close();
});
