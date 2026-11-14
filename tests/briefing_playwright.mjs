// Pagina «Briefing per LLM» nel browser: API simulate, anteprima, opzioni, download del .md, errori di fonte, menu.
import { createRequire } from "node:module"; const { chromium } = createRequire(import.meta.url)("playwright"); import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { macro, settori, strumenti, insider, calendario, screening, indice, watchlist, portafoglio } from "./fixtures_briefing.mjs";
const root = new URL("../site/", import.meta.url).pathname, out = process.argv[2] || "/tmp";
const j = (r, o, s = 200) => { r.writeHead(s, { "content-type": "application/json" }); r.end(JSON.stringify(o)); };
let senzaInsider = false;
const srv = http.createServer((q, r) => {
  const u = q.url.split("?")[0];
  if (u === "/api/utenti/me") return j(r, { abilitato: true, admin: false });
  if (u === "/api/pagina/macro") return j(r, macro); if (u === "/api/pagina/settori") return j(r, settori); if (u === "/api/pagina/strumenti") return j(r, strumenti);
  if (u === "/api/pagina/insider") return senzaInsider ? j(r, { errore: "x" }, 404) : j(r, insider); if (u === "/api/pagina/calendario") return j(r, calendario);
  if (u === "/api/screening") return j(r, screening);
  if (u === "/api/dati/watchlist") return j(r, { sha: "a", puo_modificare: true, dati: watchlist });
  if (u === "/api/dati/portafoglio") return j(r, { sha: "b", puo_modificare: true, righe: portafoglio.righe });
  if (u === "/data/index.json" || u === "/data/index.json/") return j(r, indice);
  const f = path.join(root, u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); }
    r.setHeader("content-type", f.endsWith(".js") ? "text/javascript" : f.endsWith(".css") ? "text/css" : f.endsWith(".json") ? "application/json" : "text/html"); r.end(d); });
}).listen(8773, async () => {
  const b = await chromium.launch(), c = await b.newContext({ acceptDownloads: true, viewport: { width: 1200, height: 900 } });
  await c.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://localhost:8773" });
  const p = await c.newPage();
  let err = 0; p.on("pageerror", (e) => { err++; console.log("ERR", e.message); });
  const ok = (n, x) => { console.log((x ? "✓ " : "✗ ") + n); if (!x) process.exitCode = 1; };
  await p.goto("http://localhost:8773/briefing.html"); await p.waitForFunction(() => document.getElementById("anteprima").value.length > 100);
  let md = await p.inputValue("#anteprima");
  ok("anteprima: tutte le sezioni con dati", ["## 1.", "## 2.", "## 3.", "## 4.", "## 5.", "## 6.", "## 7.", "## 8."].every((k) => md.includes(k)) && !md.includes("Non disponibile"));
  ok("pulsanti attivi e dimensione mostrata", !(await p.$eval("#scarica", (e) => e.disabled)) && /KB/.test(await p.textContent("#info")));
  ok("watchlist e portafoglio presi dal Worker (AAA, P/L +25.0)", /AAA \| manuale/.test(md) && /\+25\.0/.test(md));
  await p.uncheck("#o-wl"); await p.uncheck("#o-pf"); md = await p.inputValue("#anteprima");
  ok("opzioni: togliendo le spunte spariscono le sezioni personali", !md.includes("## 7.") && !md.includes("## 8.") && md.includes("## 6."));
  await p.check("#o-wl");
  const [dl] = await Promise.all([p.waitForEvent("download"), p.click("#scarica")]);
  const tmp = out + "/briefing-test.md"; await dl.saveAs(tmp);
  ok("download: nome briefing-AAAA-MM-GG.md e contenuto = anteprima", /^briefing-\d{4}-\d{2}-\d{2}\.md$/.test(dl.suggestedFilename()) && fs.readFileSync(tmp, "utf8") === (await p.inputValue("#anteprima")));
  await p.click("#copia"); await p.waitForTimeout(200);
  ok("copia: testo negli appunti", (await p.evaluate(() => navigator.clipboard.readText())) === (await p.inputValue("#anteprima")));
  ok("menu: voce «Briefing LLM» evidenziata", await p.$$eval("#menu a", (e) => e.some((x) => x.textContent === "Briefing LLM" && x.getAttribute("aria-current") === "page")));
  await p.screenshot({ path: out + "/briefing.png", fullPage: false });
  senzaInsider = true; await p.goto("http://localhost:8773/briefing.html"); await p.waitForFunction(() => document.getElementById("anteprima").value.length > 100);
  md = await p.inputValue("#anteprima");
  ok("fonte mancante: avviso a video e sezione «Non disponibile» nel file", !(await p.$eval("#avviso", (e) => e.hidden)) && (await p.textContent("#avviso")).includes("insider") && /## 5\.[^#]*Non disponibile/.test(md));
  ok("nessun errore JS", err === 0);
  await b.close(); srv.close();
});
