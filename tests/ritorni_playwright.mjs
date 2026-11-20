// Prova nel browser: retest nella galleria (badge, nota, filtro) e nella Vista unificata (testo, filtro).
import { createRequire } from "node:module"; const { chromium } = createRequire(import.meta.url)("playwright"); import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const root = new URL("../site/", import.meta.url).pathname;
const ix = JSON.parse(fs.readFileSync(path.join(root, "data/index.json"), "utf8"));
const uscito = ix.basi.find((b) => b.stato === "uscito_sopra" && !b.prima_vista && b.chiave.endsWith("|1D")) || ix.basi.find((b) => b.stato === "uscito_sopra" && b.chiave.endsWith("|1D"));
const T = uscito.chiave.split("|")[0];
uscito.prima_vista = false; uscito.ritorni = { n: 2, date: ["2026-11-05", "2026-11-12"], esito: "tenuto" };   // forzato: nei dati reali può non esserci
const j = (r, o, s = 200) => { r.writeHead(s, { "content-type": "application/json" }); r.end(JSON.stringify(o)); };
const unif = { aggiornato: "2026-11-12T22:35:00+00:00", punteggi_data: "2026-11-12", db: true, righe: [
  { ticker: T, dist_ath: -0.3, punteggio: { punti: 4, segnale: "WATCH" }, basi: { "1D": { stato: "uscito_sopra", pos: 1.2, uscito_il: "2026-11-01", ritorni: uscito.ritorni } } },
  { ticker: "ZZZ", dist_ath: -0.1, punteggio: null, basi: { "1D": { stato: "uscito_sopra", pos: 1.1, uscito_il: "2026-11-03", ritorni: { n: 0, date: [], esito: "in_attesa" } } } }], scheduler: [] };
const srv = http.createServer((q, r) => {
  const u = q.url.split("?")[0];
  if (u === "/api/me") return j(r, { modalita: "access", email: "capo@example.com", admin: true, abilitato: true });
  if (u === "/api/utenti/me") return j(r, { admin: true, abilitato: true });
  if (u === "/api/unificato") return j(r, unif);
  if (u === "/api/screening") return j(r, { data: "2026-11-12", righe: [] });
  if (u === "/api/dati/watchlist") return j(r, { sha: "v1", puo_modificare: false, dati: { entries: [] } });
  if (u === "/data/index.json") return j(r, ix);
  const f = path.join(root, u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); }
    r.setHeader("content-type", f.endsWith(".js") ? "text/javascript" : f.endsWith(".json") ? "application/json" : f.endsWith(".css") ? "text/css" : "text/html"); r.end(d); });
}).listen(8772, async () => {
  const b = await chromium.launch(); let esito = 0; const ok = (n, c) => { console.log((c ? "✓ " : "✗ ") + n); if (!c) esito = 1; };
  const p = await (await b.newContext({ viewport: { width: 1200, height: 900 } })).newPage(); p.on("pageerror", (e) => { console.log("ERR", e.message); esito = 1; });
  // Vista unificata
  await p.goto("http://localhost:8772/unificato.html"); await p.waitForTimeout(700);
  await p.selectOption("#f-mostra", "tutte"); await p.waitForTimeout(300);
  const tab = await p.textContent("#tab");
  ok("unificata: il testo del retest compare nella cella dell'uscita", tab.includes("Retest: 2 (ultimo il 12/11, tenuto)") && tab.includes("In attesa di retest"));
  await p.selectOption("#f-mostra", "retest"); await p.waitForTimeout(300);
  const righe = await p.$$eval("#tab tbody tr", (r) => r.map((x) => x.textContent));
  ok("unificata: filtro «con retest» tiene solo i titoli tornati sul livello", righe.length === 1 && righe[0].includes(T));
  // Galleria
  await p.goto("http://localhost:8772/index.html"); await p.waitForTimeout(900);
  await p.selectOption("#f-stato", "retest"); await p.waitForTimeout(400);
  const card = await p.$$eval("#griglia article.card", (c) => c.map((x) => x.textContent));
  ok("galleria: filtro retest mostra la card del titolo con badge e nota", card.some((t) => t.includes(T) && t.includes("retest 2") && t.includes("Retest: 2 (ultimo il 12/11, tenuto)")));
  await p.selectOption("#f-stato", "attive"); await p.waitForTimeout(300);
  ok("galleria: tra le basi attive non compare il titolo uscito", !(await p.textContent("#griglia")).includes(T + "retest"));
  await b.close(); srv.close(); process.exit(esito);
});
