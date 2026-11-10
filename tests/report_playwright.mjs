// Prova nel browser della pagina Report (API simulata, struttura identica a data/report/ultimo.json del repo privato).
import { createRequire } from "node:module"; const { chromium } = createRequire(import.meta.url)("playwright"); import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const root = new URL("../site/", import.meta.url).pathname, out = process.argv[2] || "/tmp";
const j = (r, o, s = 200) => { r.writeHead(s, { "content-type": "application/json" }); r.end(JSON.stringify(o)); };
const R = { data: "2026-11-16", regime: { nome: "Reflazione", mese: "2026-11", G: 0.18, I: 0.75 }, settori_favoriti: ["Energia", "Industriali", "Finanziari"],
  candidati: [{ ticker: "RKLB", settore: "Industriali", punti: 5, prezzo: 59.38, dd: -60.5, rsi: 52, in_zona: true, priorita: 86 }, { ticker: "<b>X</b>", settore: "Energia", punti: 4, prezzo: null, dd: -30, rsi: 40, in_zona: false, priorita: 50 }],
  cambio: { primo_report: false, regime_prima: "Espansione", regime_cambiato: true, entrati: ["Energia"], usciti: ["Tecnologia"], transizione: true },
  ultime_settimane: { disponibile: true, data_precedente: "2026-11-02", righe: [{ ticker: "AAA", settore: "Energia", prezzo_allora: 8, prezzo_oggi: 10, var: 25 }, { ticker: "BBB", settore: "Industriali", prezzo_allora: 25, prezzo_oggi: 20, var: -20 }, { ticker: "ZZZ", settore: "Energia", prezzo_allora: 3, prezzo_oggi: null, var: null }], n: 2, positivi: 1, media: 2.5 },
  dati_screening: "2026-11-13", nota: "Questo report non contiene consigli di investimento: sono calcoli fatti su dati scaricati pubblicamente.", limite: "Il legame fra regime e settori non ha una prova statistica.",
  in_breve: { testo: "Il regime attuale è Reflazione.", origine: "llm" } };
let modo = "ok";
const srv = http.createServer((q, r) => {
  const u = q.url.split("?")[0];
  if (u === "/api/utenti/me") return j(r, { abilitato: true, admin: false });
  if (u === "/api/pagina/report") return modo === "404" ? j(r, { errore: "pagina non ancora caricata" }, 404) : j(r, { aggiornato: "2026-11-16T05:10:00+00:00", dati: { report: R, archivio: ["2026-11-16"] } });
  const f = path.join(root, u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); }
    r.setHeader("content-type", f.endsWith(".js") ? "text/javascript" : f.endsWith(".css") ? "text/css" : "text/html"); r.end(d); });
}).listen(8771, async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1200, height: 1000 } });
  let err = 0; p.on("pageerror", (e) => { err++; console.log("ERR", e.message); });
  const ok = (n, c) => { console.log((c ? "✓ " : "✗ ") + n); if (!c) process.exitCode = 1; };
  await p.goto("http://localhost:8771/report.html"); await p.waitForTimeout(500);
  ok("report: sei sezioni", (await p.$$eval("#rep .rep-sez", (e) => e.length)) === 6);
  ok("report: regime e testo «In breve»", (await p.textContent("#rep")).includes("Reflazione") && (await p.textContent("#rep")).includes("Il regime attuale è Reflazione."));
  ok("report: candidati in tabella, HTML del ticker neutralizzato", (await p.$$eval("#rep table tbody tr", (e) => e.length)) >= 2 && (await p.$$eval("#rep b", (e) => e.every((x) => x.textContent !== "X"))));
  ok("report: cambio di stato (regime cambiato, transizione)", (await p.textContent("#rep")).includes("Il regime è cambiato") && (await p.textContent("#rep")).includes("in transizione"));
  ok("report: ultime settimane con colori e n/d", (await p.$$eval("#rep td.pos", (e) => e.length)) === 1 && (await p.$$eval("#rep td.neg", (e) => e.length)) === 1);
  ok("report: nota non-consigli", (await p.textContent("#rep")).includes("dati scaricati pubblicamente"));
  ok("report: voce «Report» nel menu", await p.$$eval("#menu a", (e) => e.some((x) => x.textContent === "Report")));
  await p.emulateMedia({ media: "print" });
  ok("stampa: menu e pulsanti nascosti", (await p.$eval("#menu", (e) => getComputedStyle(e).display)) === "none" && (await p.$eval("#azioni", (e) => getComputedStyle(e).display)) === "none");
  await p.emulateMedia({ media: "screen" });
  await p.screenshot({ path: out + "/report.png", fullPage: true });
  modo = "404"; await p.goto("http://localhost:8771/report.html"); await p.waitForTimeout(400);
  ok("report: 404 → messaggio chiaro", (await p.textContent("#sottotitolo")).includes("Nessun report ancora"));
  ok("report: nessun errore JS", err === 0);
  await b.close(); srv.close();
});
