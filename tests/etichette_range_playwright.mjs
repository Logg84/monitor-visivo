// Prova nel browser (b): etichette di livello sui grafici delle basi — sui range
// stretti le etichette che si accavallerebbero (POC, VWAP, livelli personali a meno
// di 14px da una già visibile) vengono tolte, la linea resta; top e bottom del range
// restano SEMPRE visibili. Il box del grafico espone in data-etichette l'elenco.
import { createRequire } from "node:module"; const { chromium } = createRequire(import.meta.url)("playwright"); import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const root = new URL("../site/", import.meta.url).pathname, out = process.argv[2] || "/tmp";

// STRETTA: POC a 3px dal top e L1 a 2px dal bottom (misurato: si accavallano);
// LARGA: tutti i livelli ben distanziati (nessuna etichetta tolta).
const barre = (min, max, n) => Array.from({ length: n }, (_, i) => { const d = new Date(Date.UTC(2026, 10, 12) - (n - 1 - i) * 864e5).toISOString().slice(0, 10);
  const c = min + (max - min) * (0.5 + 0.5 * Math.sin(i / 5)); const o = c * 0.997, h = Math.max(o, c) * 1.004, l = Math.min(o, c) * 0.996;
  return { t: d, o: +o.toFixed(2), h: +h.toFixed(2), l: +l.toFixed(2), c: +c.toFixed(2) }; });
const base = (tk, top, bottom, ultimo) => ({ chiave: tk + "|1D", aggiornato: "2026-11-12", ampiezza: +(top / bottom - 1).toFixed(3), barre: 60, bottom, calo: 0.35, congelato_il: "2026-11-01", data_ultimo: "2026-11-12", inizio: "2026-08-01", stato: "in_range", swing_massimi: 9, swing_minimi: 7, top, ultimo });
const indexFx = { aggiornato: "2026-11-12T22:35:00+00:00",
  titoli: { STRETTA: { ath: 149.8, ath_data: "2026-01-02", dist_ath: -0.32, ultimo: 101.4 }, LARGA: { ath: 168.3, ath_data: "2026-01-05", dist_ath: -0.22, ultimo: 131.0 } },
  basi: [base("STRETTA", 102, 100, 101.4), base("LARGA", 160, 100, 131.0)] };
const serieFx = { STRETTA: { "1D": barre(99, 103, 80) }, LARGA: { "1D": barre(96, 164, 80) } };
const screening = { data: "2026-11-12", righe: [
  { ticker: "STRETTA", punti: 4, priorita: "A", segnale: "WATCH", extra: { Prezzo: 101.4, Z1c: 101.9, VWAP60: 101.0, RSI: 43 } },
  { ticker: "LARGA", punti: 2, priorita: "B", segnale: "—", extra: { Prezzo: 131.0, Z1c: 130.0, VWAP60: 142.0 } }] };
const wl = { updated: "2026-11-12T10:00:00+00:00", entries: [
  { ticker: "STRETTA", origin: "manual", created: "2026-09-16T07:53:15+00:00", last_reviewed: "2026-09-16T07:53:15+00:00", poc: 101.9, vwap: 101.0, levels: { L1: 100.05 }, notes: "", target_date: null, sector: "tech", sub: null },
  { ticker: "LARGA", origin: "auto", created: "2026-09-16T07:26:34+00:00", last_reviewed: "2026-11-01T07:26:34+00:00", poc: 130, vwap: 142, levels: { L1: 110 }, notes: "", target_date: null, sector: "industriale", sub: null }] };

const j = (r, o, s = 200) => { r.writeHead(s, { "content-type": "application/json" }); r.end(JSON.stringify(o)); };
const srv = http.createServer((q, r) => {
  const u = q.url.split("?")[0];
  if (u === "/api/me") return j(r, { modalita: "access", email: "capo@example.com", admin: true, abilitato: true });
  if (u === "/api/screening") return j(r, screening);
  if (u === "/api/dati/watchlist") return j(r, { sha: "v1", puo_modificare: true, dati: wl });
  if (u === "/data/index.json") return j(r, indexFx);
  if (u.startsWith("/data/serie/")) { const tk = path.basename(u, ".json"); if (serieFx[tk]) return j(r, serieFx[tk]); }
  const f = path.join(root, u === "/" ? "index.html" : u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); }
    r.setHeader("content-type", f.endsWith(".js") ? "text/javascript" : f.endsWith(".json") ? "application/json" : f.endsWith(".css") ? "text/css" : "text/html"); r.end(d); });
}).listen(8782, async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
  p.on("pageerror", (e) => console.log("ERR", e.message));
  const ok = (n, c) => console.log((c ? "✓ " : "✗ ") + n);
  await p.goto("http://localhost:8782/index.html"); await p.waitForTimeout(2500);   // i grafici si montano quando entrano in vista
  const etichette = await p.$$eval(".grafico", (e) => e.map((x) => x.dataset.etichette || ""));
  ok("due grafici montati con l'elenco delle etichette", (await p.$$eval(".card canvas", (e) => e.length)) >= 2 && etichette.length === 2 && etichette.every((x) => x.length > 0));
  const stretta = etichette[0].split(" · "), larga = etichette[1].split(" · ");
  ok("range STRETTO: top e bottom del range sempre visibili (POC a 3px e L1 a 2px si accavallerebbero)",
     stretta.includes("top") && stretta.includes("bottom") && !stretta.includes("POC") && !stretta.includes("L1 (mio)"));
  ok("range STRETTO: il livello ben distanziato (VWAP60) resta etichettato", stretta.includes("VWAP60"));
  ok("range LARGO: tutte le etichette visibili (nessuna accavallata)",
     ["top", "bottom", "POC", "VWAP60", "L1 (mio)"].every((n) => larga.includes(n)));
  const card = await p.$$(".card");
  if (card[0]) await card[0].screenshot({ path: out + "/etichette-stretta.png" });
  if (card[1]) await card[1].screenshot({ path: out + "/etichette-larga.png" });
  // Stessa regola nella finestra di dettaglio (scheda.js)
  await p.goto("http://localhost:8782/screening.html"); await p.waitForTimeout(800);
  await p.evaluate(() => window.Scheda.apri("STRETTA")); await p.waitForTimeout(1500);
  const etScheda = await p.$eval(".scheda-grafico", (e) => (e.dataset.etichette || "").split(" · "));
  ok("scheda del titolo con range stretto: canvas + top/bottom sempre, POC e L1 tolti",
     !!(await p.$("#scheda-ov canvas")) && etScheda.includes("top") && etScheda.includes("bottom")
     && !etScheda.includes("POC") && !etScheda.includes("L1 (mio)") && etScheda.includes("VWAP60"));
  ok("scheda: i valori di POC e livelli restano leggibili nelle sezioni sotto il grafico",
     (await p.textContent("#scheda-ov")).includes("POC"));
  await p.screenshot({ path: out + "/etichette-scheda.png" });
  await b.close(); srv.close();
});
