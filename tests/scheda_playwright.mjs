// Prova nel browser: finestra di dettaglio (scheda.js), menu fisso (nav.js), ordinamento (ordina.js).
import { createRequire } from "node:module"; const { chromium } = createRequire(import.meta.url)("playwright"); import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const root = new URL("../site/", import.meta.url).pathname, out = process.argv[2] || "/tmp";
const j = (r, o, s = 200) => { r.writeHead(s, { "content-type": "application/json" }); r.end(JSON.stringify(o)); };
const righe = [
  { ticker: "ADBE", segnale: "WATCH", punti: 4, priorita: "A", extra: { Prezzo: 290.5, "DD%": -35.2, RSI: 41, Z1c: 280, VWAP60: 295, Seg_Punti: 4, Settore: "Tech", Wyckoff: "Acc", Z1: "270.0–290.0" } },
  { ticker: "ZZZZ", segnale: "—", punti: 0, extra: { Prezzo: 10, "DD%": -50, RSI: 30 } }];
const wl = { entries: [{ ticker: "ADBE", origin: "manual", created: "2026-09-16T00:00:00+00:00", levels: { L1: 250 }, sector: "tech" }, { ticker: "AAAA", origin: "auto", created: "2026-09-16T00:00:00+00:00", levels: {} }] };
const aggiunti = [];
const srv = http.createServer((q, r) => {
  const u = q.url.split("?")[0];
  if (u === "/api/screening") return j(r, { data: "2026-11-05", righe });
  if (u === "/api/analisi" && q.method === "POST") return j(r, { testo: "TECNICA\nIl titolo è sotto la media.\nFONDAMENTALE\nDati parziali.", aggiornato: "2026-11-05" });
  if (u === "/api/dati/watchlist") return j(r, { sha: "v1", puo_modificare: true, dati: wl });
  if (u === "/api/watchlist" && q.method === "POST") { let b = ""; q.on("data", (x) => (b += x)); return q.on("end", () => { const o = JSON.parse(b); aggiunti.push(o); j(r, { ok: true }); }); }
  const f = path.join(root, u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); }
    r.setHeader("content-type", f.endsWith(".js") ? "text/javascript" : f.endsWith(".json") ? "application/json" : f.endsWith(".css") ? "text/css" : "text/html"); r.end(d); });
}).listen(8768, async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
  p.on("pageerror", (e) => console.log("ERR", e.message));
  const ok = (n, c) => console.log((c ? "✓ " : "✗ ") + n);
  const menu = [];
  for (const pg of ["index", "screening", "watchlist", "insider", "macro", "settori", "strumenti"]) {
    await p.goto(`http://localhost:8768/${pg}.html`); await p.waitForTimeout(500);
    menu.push((await p.$$eval("#menu a", (e) => e.map((x) => x.textContent.trim()))).join("|"));
  }
  ok("menu identico su tutte le pagine (" + menu[0].split("|").length + " voci)", new Set(menu).size === 1 && menu[0].length > 20);
  await p.goto("http://localhost:8768/screening.html"); await p.waitForTimeout(800);
  await p.click('[data-scheda="ADBE"]'); await p.waitForTimeout(1200);
  ok("scheda aperta", !!(await p.$("#scheda-ov")));
  ok("canvas grafico", !!(await p.$("#scheda-ov canvas")));
  const tx = await p.textContent("#scheda-ov");
  ok("POC e punteggio nella scheda", tx.includes("POC") && tx.includes("4/6"));
  await p.screenshot({ path: out + "/scheda.png" });
  await p.keyboard.press("Escape"); ok("Esc chiude", !(await p.$("#scheda-ov")));
  await p.click('[data-scheda="ZZZZ"]'); await p.waitForTimeout(600);
  ok("senza serie: messaggio", (await p.textContent("#scheda-ov")).includes("Grafico non disponibile"));
  await p.click("#scheda-ov button:has-text('Aggiungi alla watchlist')"); await p.waitForTimeout(500);
  ok("promuovi in watchlist: POST add ZZZZ... ", aggiunti.length === 1 && aggiunti[0].op === "add" && aggiunti[0].ticker === "ZZZZ");
  await p.click("text=🧠 Spiegazione AI"); await p.waitForTimeout(500);
  ok("spiegazione AI mostrata con titoli di sezione", (await p.$$eval("#scheda-ov .scheda-ai h4", (e) => e.map((x) => x.textContent))).join() === "TECNICA,FONDAMENTALE" && (await p.textContent(".scheda-ai")).includes("sotto la media"));
  await p.mouse.click(5, 5); ok("clic fuori chiude", !(await p.$("#scheda-ov")));
  await p.goto("http://localhost:8768/watchlist.html"); await p.waitForTimeout(800);
  await p.click('#tab [data-scheda="ADBE"]'); await p.waitForTimeout(800);
  ok("watchlist: scheda con livello mio", (await p.textContent("#scheda-ov")).includes("L1") || !!(await p.$("#scheda-ov canvas")));
  await p.keyboard.press("Escape");
  await p.click("#tab thead th:nth-child(1)"); await p.waitForTimeout(200);
  const o1 = await p.$$eval("#tab tbody tr", (e) => e.map((x) => x.dataset.t)); await p.click("#tab thead th:nth-child(1)"); await p.waitForTimeout(200);
  const o2 = await p.$$eval("#tab tbody tr", (e) => e.map((x) => x.dataset.t));
  ok("watchlist: ordinamento al clic inverte", o1.join() !== o2.join());
  await p.screenshot({ path: out + "/wl.png", fullPage: true });
  await b.close(); srv.close();
});
