// Pagina «Briefing per LLM» nel browser: API simulate, anteprima, opzioni, download del .md, errori di fonte, menu.
import { createRequire } from "node:module"; const { chromium } = createRequire(import.meta.url)("playwright"); import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { macro, settori, strumenti, insider, calendario, screening, indice, watchlist, portafoglio } from "./fixtures_briefing.mjs";
const root = new URL("../site/", import.meta.url).pathname, out = process.argv[2] || "/tmp";
const j = (r, o, s = 200) => { r.writeHead(s, { "content-type": "application/json" }); r.end(JSON.stringify(o)); };
let senzaInsider = false, ricevuto = null, esitoAI = { testo: "QUADRO DI MERCATO\nTutto regolare.\n\nCOSA CONTROLLARE OGGI\nVerifica AAA.", troncato: false, analisi_restanti: 4 }, statoAI = 200;
const srv = http.createServer((q, r) => {
  const u = q.url.split("?")[0];
  if (u === "/api/utenti/me") return j(r, { abilitato: true, admin: false });
  if (u === "/api/pagina/macro") return j(r, macro); if (u === "/api/pagina/settori") return j(r, settori); if (u === "/api/pagina/strumenti") return j(r, strumenti);
  if (u === "/api/pagina/insider") return senzaInsider ? j(r, { errore: "x" }, 404) : j(r, insider); if (u === "/api/pagina/calendario") return j(r, calendario);
  if (u === "/api/screening") return j(r, screening);
  if (u === "/api/analisi-briefing") { let d = ""; q.on("data", (x) => d += x); q.on("end", () => { ricevuto = JSON.parse(d); j(r, esitoAI, statoAI); }); return; }
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
  ok("watchlist e portafoglio presi dal Worker (AAA, P/L +25.0)", /AAA \| USD \| manuale/.test(md) && /\+25\.0/.test(md));
  ok("istruzioni per l'LLM incluse di default, con «FUORI dal file»", md.includes("## 0. Istruzioni per l'LLM") && md.includes("FUORI dal file"));
  await p.uncheck("#o-ist"); ok("spunta istruzioni: tolta → sezione 0 assente", !(await p.inputValue("#anteprima")).includes("## 0.")); await p.check("#o-ist");
  ok("controllo livelli attivo nel browser (colonna presente)", md.includes("Controllo livelli") && md.includes("L1 95 (+5%)"));
  await p.uncheck("#o-wl"); await p.uncheck("#o-pf"); md = await p.inputValue("#anteprima");
  ok("opzioni: togliendo le spunte spariscono le sezioni personali", !md.includes("## 7.") && !md.includes("## 8.") && md.includes("## 6."));
  await p.check("#o-wl");
  // ── Analisi AI ──
  ok("pulsante «Analisi AI» attivo e nota sull'invio al motore", !(await p.$eval("#ai", (e) => e.disabled)) && (await p.textContent("#nota-ai")).includes("viene inviato al motore AI"));
  await p.click("#ai"); await p.waitForSelector("#esito-ai h4");
  ok("analisi: il testo inviato è il briefing SENZA le istruzioni per l'LLM e con le sezioni dati", ricevuto && ricevuto.testo.includes("## 1.") && !ricevuto.testo.includes("## 0. Istruzioni") && ricevuto.testo.includes("AAA"));
  ok("analisi: titoli in maiuscolo come intestazioni e paragrafi sotto", (await p.$$eval("#esito-ai h4", (l) => l.map((x) => x.textContent))).join("|") === "QUADRO DI MERCATO|COSA CONTROLLARE OGGI" && (await p.textContent("#esito-ai")).includes("Verifica AAA"));
  ok("analisi: nota sui limiti e analisi rimaste", /senza notizie dal web/.test(await p.textContent("#esito-ai")) && /rimaste oggi: 4/.test(await p.textContent("#esito-ai")));
  await p.uncheck("#o-wl"); await p.uncheck("#o-pf"); await p.click("#ai"); await p.waitForFunction(() => !document.getElementById("ai").disabled);
  ok("analisi senza watchlist/portafoglio: non vengono inviati", !ricevuto.testo.includes("## 7.") && !ricevuto.testo.includes("## 8."));
  await p.check("#o-wl"); await p.check("#o-pf");
  statoAI = 429; esitoAI = { errore: "Hai raggiunto il limite di 3 analisi al giorno", codice: "quota_analisi" };
  await p.click("#ai"); await p.waitForFunction(() => document.getElementById("esito-ai").textContent.startsWith("Analisi non riuscita"));
  ok("errore (quota): messaggio mostrato e pulsante di nuovo attivo", (await p.textContent("#esito-ai")).includes("limite di 3 analisi") && !(await p.$eval("#ai", (e) => e.disabled)));
  statoAI = 200;
  // ── Chat esterne ──
  ok("tre pulsanti chat esterne attivi", (await p.$$eval("[data-chat]", (l) => l.map((x) => x.textContent.trim() + ":" + x.disabled))).join("|") === "DeepSeek:false|Qwen:false|GLM:false");
  await c.route(/^https:\/\/chat\./, (r) => r.fulfill({ contentType: "text/html", body: "<title>chat finta</title>" }));  // niente rete vera
  for (const [nome, host] of [["DeepSeek", "chat.deepseek.com"], ["Qwen", "chat.qwen.ai"], ["GLM", "chat.z.ai"]]) {
    const [nuova] = await Promise.all([c.waitForEvent("page"), p.click(`[data-chat][data-chat*="${host}"]`)]); await nuova.waitForLoadState("domcontentloaded").catch(() => {}); const url = nuova.url(); await nuova.close().catch(() => {}); await p.bringToFront();
    const cop = await p.evaluate(() => navigator.clipboard.readText());
    ok(`${nome}: apre ${host} in una nuova scheda e copia il briefing completo (con le istruzioni)`, url.includes(host) && cop.includes("## 0. Istruzioni per l'LLM") && cop.includes("## 1.") && (await p.textContent("#info")).includes(`chat di ${nome}`));
  }
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
