// Collegamento automatico del Chat ID Telegram: codici monouso, webhook protetto, comandi. D1 simulato (SQLite).
import assert from "node:assert/strict"; import { DatabaseSync } from "node:sqlite";
import * as ut from "../src/utenti.js"; import worker from "../src/worker.js";
const sq = new DatabaseSync(":memory:");
const db = { prepare: (q) => { const st = sq.prepare(q); let a = []; const o = { bind: (...x) => { a = x; return o; }, first: async () => st.get(...a) || null, all: async () => ({ results: st.all(...a) }), run: async () => { st.run(...a); return {}; }, _run: () => st.run(...a) }; return o; }, batch: async (l) => { for (const s of l) s._run(); } };
let n = 0; const ok = (m) => { n++; console.log("✓ " + m); };
const T0 = new Date("2026-11-11T10:00:00Z"), min = (m) => new Date(T0.getTime() + m * 60000);

// utenti: anna (attiva, canale nessuno), beppe (disattivato)
await ut.richiedi(db, { email: "anna@x.it", nome: "Anna Rossi" }); await ut.richiedi(db, { email: "beppe@x.it", nome: "Beppe Neri" });
await ut.approva(db, {}, "anna@x.it"); await ut.approva(db, {}, "beppe@x.it"); await ut.rimuovi(db, {}, "beppe@x.it");
sq.prepare("UPDATE utenti SET canale='nessuno' WHERE email='anna@x.it'").run();

// generazione
const c1 = await ut.generaCodice(db, "anna@x.it", T0);
assert.ok(c1.ok && /^[A-HJKMNP-Z2-9]{8}$/.test(c1.codice) && c1.scade_in_min === 15); ok("codice: 8 caratteri senza ambigui, scade in 15 minuti");
assert.equal((await ut.generaCodice(db, "beppe@x.it", T0)).ok, false); assert.equal((await ut.generaCodice(db, "admin@x.it", T0)).ok, false); ok("codice negato a utenti disattivati e all'admin (senza riga)");
const c2 = await ut.generaCodice(db, "anna@x.it", min(1));
assert.equal(sq.prepare("SELECT COUNT(*) n FROM codici WHERE email='anna@x.it' AND usato IS NULL").get().n, 1); ok("un solo codice attivo per email: il nuovo invalida il precedente");
assert.equal((await ut.collegaChat(db, c1.codice, "555000111", min(2))).ok, false); ok("codice sostituito: non funziona più");
assert.equal(new Set(Array.from({ length: 200 }, () => ut.nuovoCodice())).size, 200); ok("codici casuali (nessuna collisione su 200)");

// scadenza, forma, chat non private
assert.equal((await ut.collegaChat(db, c2.codice, "555000111", min(1 + 16))).ok, false); ok("scaduto dopo 15 minuti: rifiutato");
const c3 = await ut.generaCodice(db, "anna@x.it", min(30));
assert.equal((await ut.collegaChat(db, "abc", "555000111", min(31))).ok, false); assert.equal((await ut.collegaChat(db, c3.codice, "-100123456789", min(31))).ok, false); ok("forma errata e chat di gruppo (id negativo): rifiutate");
assert.equal(sq.prepare("SELECT usato FROM codici WHERE codice=?").get(c3.codice).usato, null); ok("i tentativi respinti non consumano il codice");

// collegamento atomico + monouso (replay)
const r = await ut.collegaChat(db, c3.codice.toLowerCase(), "555000111", min(32));
assert.ok(r.ok && r.email === "anna@x.it" && r.nome === "Anna Rossi" && r.precedente === null); ok("collegamento riuscito (codice accettato anche in minuscolo)");
const u = sq.prepare("SELECT canale,telegram_chat_id FROM utenti WHERE email='anna@x.it'").get(); assert.ok(u.telegram_chat_id === "555000111" && u.canale === "telegram"); ok("chat salvata e canale «nessuno» → telegram");
assert.equal((await ut.collegaChat(db, c3.codice, "999888777", min(33))).ok, false); assert.equal(sq.prepare("SELECT telegram_chat_id t FROM utenti WHERE email='anna@x.it'").get().t, "555000111"); ok("replay: un codice usato non collega un'altra chat");
// due arrivi insieme: vince uno solo
const c4 = await ut.generaCodice(db, "anna@x.it", min(40));
const gara = await Promise.all([ut.collegaChat(db, c4.codice, "111111111", min(41)), ut.collegaChat(db, c4.codice, "222222222", min(41))]);
assert.equal(gara.filter((x) => x.ok).length, 1); ok("due richieste con lo stesso codice: ne vince una sola");
const nuova = gara.find((x) => x.ok); assert.ok(nuova.precedente === "555000111"); ok("collegamento che sostituisce una chat: restituisce la precedente (per l'avviso)");

// ── gestisciUpdate ──
const inviati = []; const fetchTg = async (url, o) => { const b = JSON.parse(o.body); if (String(url).includes("api.telegram.org")) inviati.push(b); else inviati.push({ altro: String(url) }); return new Response("{}", { status: 200 }); };
const env = { TELEGRAM_BOT_TOKEN: "T" };
const msg = (testo, chat = 777000111, tipo = "private") => ({ message: { text: testo, chat: { id: chat, type: tipo } } });
const c5 = await ut.generaCodice(db, "anna@x.it", min(50));
assert.equal((await ut.gestisciUpdate(db, env, msg("ciao come va"), fetchTg, min(51))).azione, "ignorato"); assert.equal(inviati.length, 0); ok("messaggio qualsiasi: silenzio totale");
assert.equal((await ut.gestisciUpdate(db, env, msg("/start"), fetchTg, min(51))).azione, "ignorato"); assert.equal(inviati.length, 0); ok("/start senza codice: silenzio");
assert.equal((await ut.gestisciUpdate(db, env, msg("/start " + c5.codice, -100555, "group"), fetchTg, min(51))).azione, "ignorato"); assert.equal(inviati.length, 0); ok("gruppo: ignorato");
assert.equal((await ut.gestisciUpdate(db, env, { edited_message: {} }, fetchTg, min(51))).azione, "ignorato"); assert.equal((await ut.gestisciUpdate(db, env, null, fetchTg)).azione, "ignorato"); ok("update senza messaggio testuale: ignorato");
assert.equal((await ut.gestisciUpdate(db, env, msg("/start ZZZZZZZZ"), fetchTg, min(51))).azione, "codice_errato"); assert.ok(inviati[0].text.includes("non valido")); ok("codice errato: una sola risposta di cortesia");
inviati.length = 0;
let g = await ut.gestisciUpdate(db, env, msg("/start@bot_alert " + c5.codice), fetchTg, min(52));
assert.equal(g.azione, "collegato"); assert.ok(inviati.some((m) => m.chat_id === "777000111" && m.text.includes("Collegato")));
assert.ok(inviati.some((m) => m.chat_id === "111111111" || m.chat_id === "222222222")); ok("/start@bot CODICE: collega, conferma e avvisa la chat sostituita");
inviati.length = 0;
await ut.gestisciUpdate(db, env, msg("/stato"), fetchTg, min(53)); assert.ok(inviati[0].text.includes("Anna Rossi")); ok("/stato: dice a chi è collegata la chat");
await ut.gestisciUpdate(db, env, msg("/stato", 123456789), fetchTg, min(53)); assert.ok(inviati[1].text.includes("non è collegata")); ok("/stato su chat sconosciuta: non collegata");
await ut.gestisciUpdate(db, env, msg("/scollega"), fetchTg, min(54));
assert.equal(sq.prepare("SELECT telegram_chat_id t FROM utenti WHERE email='anna@x.it'").get().t, null); ok("/scollega: Chat ID azzerato");
inviati.length = 0; await ut.gestisciUpdate(db, env, msg("/scollega"), fetchTg, min(55)); assert.ok(inviati[0].text.includes("non era collegata")); ok("/scollega ripetuto: nessun errore");

// ── Worker: webhook e endpoint ──
const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const jwk = { ...(await crypto.subtle.exportKey("jwk", publicKey)), kid: "k1", alg: "RS256", use: "sig" };
const b64url = (b) => Buffer.from(b).toString("base64url");
const firma = async (pl) => { const h = b64url(JSON.stringify({ alg: "RS256", kid: "k1" })), p = b64url(JSON.stringify(pl)); const s = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(`${h}.${p}`)); return `${h}.${p}.${b64url(s)}`; };
const DOM = "team.cloudflareaccess.com", AUD = "aud1";
const chiamate = []; globalThis.fetch = async (url, o) => { url = String(url); chiamate.push(url); if (url.includes("/certs")) return new Response(JSON.stringify({ keys: [jwk] })); return new Response("{}", { status: 404 }); };
const wenv = { ACCESS_TEAM_DOMAIN: DOM, ACCESS_AUD: AUD, ADMIN_EMAILS: "admin@x.it", DB: db, TELEGRAM_BOT_TOKEN: "T", TELEGRAM_CHAT_ID: "9", TELEGRAM_WEBHOOK_SECRET: "segreto-lungo-1234", ACCESSO_APERTO: "1", ASSETS: { fetch: async () => new Response("{}") } };
const attese = []; const ctx = { waitUntil: (p) => attese.push(p) };
const hook = (header, body) => worker.fetch(new Request("https://x.dev/api/telegram/webhook", { method: "POST", headers: header ? { "x-telegram-bot-api-secret-token": header } : {}, body: JSON.stringify(body) }), wenv, ctx);
let w = await hook("sbagliato-lungo-1234", msg("/stato")); assert.equal(w.status, 403); w = await hook(null, msg("/stato")); assert.equal(w.status, 403); assert.equal(attese.length, 0); ok("webhook: secret sbagliato o assente → 403, nessun lavoro in background");
w = await worker.fetch(new Request("https://x.dev/api/telegram/webhook"), wenv, ctx); assert.equal(w.status, 405); ok("webhook: solo POST");
w = await worker.fetch(new Request("https://x.dev/api/telegram/webhook", { method: "POST", headers: { "x-telegram-bot-api-secret-token": "x" }, body: "{}" }), { ...wenv, TELEGRAM_WEBHOOK_SECRET: "" }, ctx); assert.equal(w.status, 503); ok("webhook: secret non configurato → 503 (mai aperto)");
const c6 = await ut.generaCodice(db, "anna@x.it", new Date());
w = await hook("segreto-lungo-1234", msg("/start " + c6.codice, 424242424)); assert.equal(w.status, 200); await Promise.all(attese);
assert.equal(sq.prepare("SELECT telegram_chat_id t FROM utenti WHERE email='anna@x.it'").get().t, "424242424"); ok("webhook valido: 200 subito e collegamento eseguito in background, senza login Access");
w = await hook("segreto-lungo-1234", msg("ciao")); assert.equal(w.status, 200); ok("webhook: messaggio sconosciuto → 200 silenzioso");
const api = async (email, path = "/api/utenti/collegamento", method = "POST") => worker.fetch(new Request("https://x.dev" + path, { method, headers: { "content-type": "application/json", "cf-access-jwt-assertion": await firma({ iss: `https://${DOM}`, aud: [AUD], exp: Math.floor(Date.now() / 1000) + 600, email }) }, body: method === "POST" ? "{}" : undefined }), wenv, ctx);
w = await api("anna@x.it"); let j = await w.json(); assert.ok(w.status === 200 && /^[A-Z2-9]{8}$/.test(j.codice) && j.scade_in_min === 15); ok("endpoint collegamento: utente abilitato riceve il codice");
w = await api("admin@x.it"); assert.equal(w.status, 400); w = await api("beppe@x.it"); assert.equal(w.status, 403); w = await api("sconosciuto@x.it"); assert.equal(w.status, 403); ok("endpoint: admin 400; disattivato e sconosciuto bloccati");
w = await api("anna@x.it", "/api/utenti/collegamento", "GET"); assert.equal(w.status, 405); ok("endpoint: solo POST");
w = await worker.fetch(new Request("https://x.dev/api/utenti/collegamento", { method: "POST", body: "{}" }), wenv, ctx); assert.ok(w.status === 401 || w.status === 403); ok("endpoint senza login: respinto");
w = await worker.fetch(new Request("https://x.dev/api/utenti/collegamento", { method: "POST", headers: { origin: "https://evil.example", "cf-access-jwt-assertion": await firma({ iss: `https://${DOM}`, aud: [AUD], exp: Math.floor(Date.now() / 1000) + 600, email: "anna@x.it" }) }, body: "{}" }), wenv, ctx); assert.equal(w.status, 403); ok("endpoint: origine diversa respinta (CSRF)");
w = await worker.fetch(new Request("https://x.dev/api/utenti/collegamento", { method: "POST", headers: { "cf-access-jwt-assertion": await firma({ iss: `https://${DOM}`, aud: [AUD], exp: Math.floor(Date.now() / 1000) + 600, email: "anna@x.it" }) }, body: "{}" }), { ...wenv, TELEGRAM_WEBHOOK_SECRET: "" }, ctx); assert.equal(w.status, 503); ok("endpoint: senza secret del webhook il collegamento automatico non si offre");
console.log(`TUTTI I CHECK PASSATI (verifica_collegamento: ${n})`);
