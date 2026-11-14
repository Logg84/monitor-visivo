// Pagina Watchlist: avviso «⚠️ livelli?» sui livelli personali incoerenti (API simulata).
import { createRequire } from "node:module"; const { chromium } = createRequire(import.meta.url)("playwright"); import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const root = new URL("../site/", import.meta.url).pathname;
const j = (r, o, s = 200) => { r.writeHead(s, { "content-type": "application/json" }); r.end(JSON.stringify(o)); };
const wl = { updated: "2026-11-14T10:00:00+00:00", entries: [
  { ticker: "GE", origin: "manual", levels: { L1: 305, L2: 285, L3: 28 }, sector: "industriale" },
  { ticker: "FIS", origin: "manual", levels: { L1: 35, L2: 69, L3: 28 }, sector: "tech" },
  { ticker: "CASY", origin: "manual", levels: { L1: 600, L2: 440, L3: 400 }, sector: "consumi_disc" },
  { ticker: "NOPRICE", origin: "auto", levels: { L1: 1 }, sector: null }] };
const srv = http.createServer((q, r) => {
  const u = q.url.split("?")[0];
  if (u === "/api/utenti/me") return j(r, { abilitato: true, admin: false });
  if (u === "/api/screening") return j(r, { data: "2026-11-13", righe: [{ ticker: "GE", punti: 1, extra: { Prezzo: 301 } }, { ticker: "FIS", punti: 0, extra: { Prezzo: 60 } }, { ticker: "CASY", punti: 2, extra: { Prezzo: 500 } }] });
  if (u === "/api/dati/watchlist") return j(r, { sha: "v1", puo_modificare: true, dati: wl });
  const f = path.join(root, u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); }
    r.setHeader("content-type", f.endsWith(".js") ? "text/javascript" : f.endsWith(".json") ? "application/json" : f.endsWith(".css") ? "text/css" : "text/html"); r.end(d); });
}).listen(8775, async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  let err = 0; p.on("pageerror", (e) => { err++; console.log("ERR", e.message); });
  const ok = (n, c) => { console.log((c ? "✓ " : "✗ ") + n); if (!c) process.exitCode = 1; };
  await p.goto("http://localhost:8775/watchlist.html"); await p.waitForTimeout(600);
  const riga = async (t) => p.$eval(`tr[data-t="${t}"]`, (e) => e.textContent + "|" + [...e.querySelectorAll(".bq")].map((x) => x.title).join(";"));
  const ge = await riga("GE"), fis = await riga("FIS"), casy = await riga("CASY"), np = await riga("NOPRICE");
  ok("GE: ⚠️ livelli? col dettaglio «manca una cifra (280)»", ge.includes("⚠️ livelli?") && ge.includes("manca una cifra (280)"));
  ok("FIS: ⚠️ per l'ordine (L2 69 sopra L1 35)", fis.includes("⚠️ livelli?") && fis.includes("L2 (69) è sopra L1 (35)"));
  ok("CASY (livelli ordinati e vicini): nessun avviso", !casy.includes("livelli?"));
  ok("senza prezzo: nessun avviso (un solo livello)", !np.includes("livelli?"));
  ok("la spiegazione è in pagina", (await p.textContent("body")).includes("⚠️ livelli?"));
  ok("nessun errore JS", err === 0);
  await b.close(); srv.close();
});
