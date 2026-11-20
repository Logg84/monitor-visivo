// Prova nel browser: pagina Settori con serie storiche (selezione settori, grafico, dettaglio sotto-settore, assenza serie).
import { createRequire } from "node:module"; const { chromium } = createRequire(import.meta.url)("playwright"); import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const root = new URL("../site/", import.meta.url).pathname;
const date = Array.from({ length: 60 }, (_, i) => new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10));
const serie = (a) => date.map((_, i) => Math.round((100 + a * i + Math.sin(i / 5) * 2) * 100) / 100);
const gk = ["tech", "energy", "util", "fin"], riga = (k, i) => ({ key: k, Settore: k.toUpperCase(), "Etichetta CW": "XL", "Etichetta EW": "RSP", Stato: "Neutro", Score: 50, "CW 1m": 1, "CW 3m": 2, "CW 6m": 3, "EW 1m": 1, "EW 3m": 2, "EW 6m": 3, "Δ 1m": i, "Δ 3m": i * 2 - 3, "Δ 6m": i, "RS 3m": 0, Consistenza: 50, Streak: 1, "Range Δ": 100, "Pos 52": 50, Guida: "" });
const D = { gics: gk.map(riga), sotto: [{ ...riga("semis", 1), GICS: "Information Technology", Settore: "Semiconduttori", Note: "" }, { ...riga("senza", 0), GICS: "Energy", Settore: "Senza gambe", "Etichetta CW": "—", "Etichetta EW": "—" }], temi: [], gambe: [], vento: { semis: "favore", senza: "misto" },
  meta: { freschezza: "dati di prova", n_settori: 4, n_sotto: 2, n_temi: 0, benchmark: "SPY", bench_mom63: 1 },
  serie: { gics: { date, rapporto: { tech: serie(0.2), energy: serie(-0.2), util: serie(0.05) } }, sotto: { date, cw: { semis: serie(0.3) }, ew: { semis: serie(0.1) } } } };
let corpo = { dati: D };
const j = (r, o, s = 200) => { r.writeHead(s, { "content-type": "application/json" }); r.end(JSON.stringify(o)); };
const srv = http.createServer((q, r) => {
  const u = q.url.split("?")[0];
  if (u === "/api/pagina/settori") return j(r, corpo);
  if (u === "/api/me") return j(r, { modalita: "access", email: "capo@example.com", admin: true, abilitato: true });
  if (u === "/api/utenti/me") return j(r, { admin: true, abilitato: true });
  if (u === "/api/screening") return j(r, { data: "2026-11-12", righe: [] });
  const f = path.join(root, u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); }
    r.setHeader("content-type", f.endsWith(".js") ? "text/javascript" : f.endsWith(".css") ? "text/css" : "text/html"); r.end(d); });
}).listen(8773, async () => {
  const b = await chromium.launch(); let esito = 0; const ok = (n, c) => { console.log((c ? "✓ " : "✗ ") + n); if (!c) esito = 1; };
  const p = await (await b.newContext({ viewport: { width: 1200, height: 900 } })).newPage(); p.on("pageerror", (e) => { console.log("ERR", e.message); esito = 1; });
  await p.goto("http://localhost:8773/settori.html"); await p.waitForTimeout(700);
  ok("GICS: titolo, selezione con i settori che hanno la serie (3 su 4)", (await p.textContent("#out")).includes("Rapporto EW/CW nel tempo") && (await p.$$("#gsel input")).length === 3);
  ok("GICS: di partenza tutti i settori disponibili spuntati, una linea ciascuno", (await p.$$("#gch path")).length === 3);
  await p.uncheck('#gsel input[data-k="tech"]'); await p.waitForTimeout(200);
  ok("GICS: togliendo un settore la linea sparisce", (await p.$$("#gch path")).length === 2);
  const b1 = await p.locator("#gch svg").boundingBox(); await p.mouse.move(b1.x + b1.width / 2, b1.y + b1.height / 2); await p.waitForTimeout(150);
  ok("GICS: al passaggio compaiono data e valori", /\d{2}\/\d{2}\/\d{2}/.test(await p.textContent("#gtip")) && (await p.textContent("#gtip")).includes("ENERGY"));
  await p.click('#tabs button[data-t="sotto"]'); await p.waitForTimeout(300);
  ok("Sotto-settori: grafico CW (continua) ed EW (tratteggiata) del dettaglio", (await p.$$("#sgr path")).length === 2 && (await p.$$('#sgr path[stroke-dasharray="6 4"]')).length === 1);
  await p.selectOption("#d", "senza"); await p.waitForTimeout(300);
  ok("Sotto-settore senza gambe: «n/d», nessun grafico inventato", (await p.textContent("#sch")).includes("n/d") && (await p.$$("#sch svg")).length === 0);
  corpo = { dati: { ...D, serie: undefined } };
  await p.goto("http://localhost:8773/settori.html"); await p.waitForTimeout(700);
  ok("Export vecchio senza serie: la pagina resta viva e dice cosa lanciare", (await p.textContent("#out")).includes("esporta-pagine-d1") && (await p.$$("#out table")).length > 0);
  await b.close(); srv.close(); process.exit(esito);
});
