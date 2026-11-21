// Prova nel browser: tab «Indici / Materie prime» — POC e zone troppo lontani dal prezzo non si mostrano (API simulata).
import { createRequire } from "node:module"; const { chromium } = createRequire(import.meta.url)("playwright"); import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const root = new URL("../site/", import.meta.url).pathname, out = process.argv[2] || "/tmp";
const j = (r, o, s = 200) => { r.writeHead(s, { "content-type": "application/json" }); r.end(JSON.stringify(o)); };
const strum = (nome, simbolo, prezzo, poc, dist) => ({ nome, simbolo, riga: { Prezzo: prezzo, "DD 5a %": -5, RSI: 55, Bottom: 10, Wyckoff: "—", Confluenza: 1, "In zona": "—" },
  badge: { tono: "giallo", icona: "🟡", etichetta: "In correzione" }, posizione: null,
  distanze: [{ nome: "Zona Z1 (POC)", dist }, { nome: "VWAP 60 giorni", dist: 2.5 }], lettura: { quadro: "q", sezioni: [], glossari: {} },
  livelli: [{ Livello: "▶ Prezzo attuale", Prezzo: prezzo }, { Livello: "Zona Z1 (POC)", Prezzo: poc }, { Livello: "VWAP 60 giorni", Prezzo: prezzo * 0.98 }, { Livello: "Media mobile 50 giorni", Prezzo: prezzo * 0.95 }] });
const D = { tassi: [], strumenti: [strum("CAC 40", "^FCHI", 8200, 2540, 223), strum("S&P 500", "^GSPC", 6000, 5700, 5.3)], sintesi: [],
  tabella: [{ Gruppo: "Indici", Strumento: "CAC 40", Simbolo: "^FCHI", Prezzo: 8200, "POC (Z1)": 2540, "Dist. POC %": 223, "VWAP 60": 8000 }, { Gruppo: "Indici", Strumento: "S&P 500", Simbolo: "^GSPC", Prezzo: 6000, "POC (Z1)": 5700, "Dist. POC %": 5.3, "VWAP 60": 5900 }] };
const srv = http.createServer((q, r) => {
  const u = q.url.split("?")[0];
  if (u === "/api/pagina/strumenti") return j(r, { aggiornato: "2026-11-20T23:00:00Z", dati: D });
  if (u.startsWith("/api/")) return j(r, {});
  const f = path.join(root, u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); }
    r.setHeader("content-type", f.endsWith(".js") ? "text/javascript" : f.endsWith(".json") ? "application/json" : f.endsWith(".css") ? "text/css" : "text/html"); r.end(d); });
}).listen(8771, async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
  let err = 0; p.on("pageerror", (e) => { err++; console.log("ERR", e.message); });
  const ok = (n, c) => { console.log((c ? "✓ " : "✗ ") + n); if (!c) process.exitCode = 1; };
  await p.goto("http://localhost:8771/strumenti.html"); await p.waitForTimeout(700);
  const cards = await p.$$eval(".card", (e) => e.map((x) => x.textContent));
  ok("CAC: la distanza dal POC (+223%) non compare, c'è «fuori scala»", !cards[0].includes("223") && cards[0].includes("fuori scala") && cards[0].includes("VWAP 60"));
  ok("S&P: POC in scala resta con la sua distanza", cards[1].includes("Zona Z1 (POC)") && cards[1].includes("+5.3%") && !cards[1].includes("fuori scala"));
  const righe = await p.$$eval("details.storiche table tbody tr", (e) => e.map((x) => x.textContent));
  const cac = righe.find((x) => x.includes("CAC 40")), sp = righe.find((x) => x.includes("S&P 500"));
  ok("tabella tecnica: POC e distanza del CAC «fuori scala», S&P invariato", cac && cac.includes("fuori scala") && !cac.includes("2540") && sp && sp.includes("5700") && !sp.includes("fuori scala"));
  const svg = await p.$$eval("svg[aria-label='Scala dei livelli']", (e) => e.map((x) => x.textContent));
  ok("scala dei livelli del CAC senza la zona lontana, con gli altri livelli", svg.length === 1 && !svg[0].includes("Zona Z1") && svg[0].includes("VWAP 60"));
  ok("nessun errore di pagina", err === 0);
  await p.screenshot({ path: out + "/strumenti_scala.png", fullPage: true });
  await b.close(); srv.close();
});
