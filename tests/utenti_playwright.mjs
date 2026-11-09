// Prova nel browser: Richiedi accesso, Profilo, Utenti (API simulata).
import { createRequire } from "node:module"; const { chromium } = createRequire(import.meta.url)("playwright"); import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const root = new URL("../site/", import.meta.url).pathname, out = process.argv[2] || "/tmp";
let admin = false, richieste = [], salvato = null, azioni = [], inviata = null;
const j = (r, o, s = 200) => { r.writeHead(s, { "content-type": "application/json" }); r.end(JSON.stringify(o)); };
const body = (q) => new Promise((ok) => { let b = ""; q.on("data", (d) => (b += d)); q.on("end", () => ok(b ? JSON.parse(b) : {})); });
const srv = http.createServer(async (q, r) => {
  const u = q.url.split("?")[0];
  if (u === "/api/richiedi") { inviata = await body(q); return j(r, { ok: true }); }
  if (u === "/api/utenti/me") { if (q.method === "POST") { salvato = await body(q); if (salvato.canale === "telegram" && !salvato.telegram_chat_id) return j(r, { errore: "Per gli alert su Telegram serve il tuo Chat ID." }, 400); return j(r, {}); }
    return j(r, admin ? { email: "m@x.it", admin: true, uid: "" } : { email: "anna@x.it", admin: false, uid: "anna", nome: "Anna", canale: "telegram", telegram_chat_id: "", email_alert: null }); }
  if (u === "/api/utenti" ) return j(r, { access_automatico: false, richieste, editors: [], utenti: [{ email: "luca@x.it", uid: "luca", nome: "Luca", canale: "email", creato: "2026-11-01T10:00:00Z", attivo: 1 }] });
  if (u === "/api/utenti/azione") { const b = await body(q); azioni.push(b); richieste = []; return j(r, { ok: true, access: "manuale" }); }
  const f = path.join(root, u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); }
    r.setHeader("content-type", f.endsWith(".js") ? "text/javascript" : f.endsWith(".css") ? "text/css" : "text/html"); r.end(d); });
}).listen(8769, async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1200, height: 900 } });
  p.on("pageerror", (e) => console.log("ERR", e.message)); p.on("dialog", (d) => d.accept());
  const ok = (n, c) => console.log((c ? "✓ " : "✗ ") + n);
  await p.goto("http://localhost:8769/richiedi.html");
  await p.fill("#nome", "Anna Rossi"); await p.fill("#email", "anna@x.it"); await p.click("button[type=submit]"); await p.waitForTimeout(400);
  ok("richiedi: invio e conferma", inviata && inviata.email === "anna@x.it" && (await p.textContent("#esito")).includes("Richiesta inviata"));
  ok("richiedi: campo-trappola vuoto", inviata.sito === "");
  await p.goto("http://localhost:8769/profilo.html"); await p.waitForTimeout(500);
  ok("profilo: form visibile, chat Telegram mostrata", await p.isVisible("#f") && await p.isVisible("#chat") && !(await p.isVisible("#mail")));
  await p.click("#f button[type=submit]"); await p.waitForTimeout(300);
  ok("profilo: errore se manca il Chat ID", (await p.textContent("#esito")).includes("Chat ID"));
  await p.selectOption("#canale", "entrambi"); ok("profilo: entrambi mostra i due campi", await p.isVisible("#chat") && await p.isVisible("#mail"));
  await p.fill("#chat", "123456789"); await p.click("#f button[type=submit]"); await p.waitForTimeout(300);
  ok("profilo: salvato", salvato.canale === "entrambi" && salvato.telegram_chat_id === "123456789" && (await p.textContent("#esito")).includes("Salvato"));
  ok("menu utente non admin: nessuna voce Utenti", !(await p.$$eval("#menu a", (e) => e.some((x) => x.textContent === "Utenti"))));
  admin = true; richieste = [{ email: "anna@x.it", nome: "Anna Rossi", messaggio: "collega", creato: "2026-11-07T10:00:00Z", stato: "attesa" }];
  await p.goto("http://localhost:8769/utenti.html"); await p.waitForTimeout(600);
  ok("utenti: voce nel menu per l'admin", await p.$$eval("#menu a", (e) => e.some((x) => x.textContent === "Utenti")));
  ok("utenti: richiesta e utente elencati", (await p.textContent("#rich")).includes("anna@x.it") && (await p.textContent("#ute")).includes("data/users/luca/"));
  ok("utenti: avviso Access manuale", (await p.textContent("#nota-access")).includes("Cloudflare Access non è collegato"));
  await p.click('button[data-a="approva"]'); await p.waitForTimeout(500);
  ok("utenti: approva invia l'azione e ricorda l'aggiunta manuale", azioni[0].azione === "approva" && azioni[0].email === "anna@x.it" && (await p.textContent("#esito")).includes("Ricorda"));
  await p.check('input[data-ed="luca@x.it"]'); await p.waitForTimeout(400);
  ok("utenti: interruttore portafoglio condiviso invia l'azione editor", azioni.some((a) => a.azione === "editor" && a.email === "luca@x.it" && a.attivo === true));
  await p.screenshot({ path: out + "/utenti.png", fullPage: true });
  await b.close(); srv.close();
});
