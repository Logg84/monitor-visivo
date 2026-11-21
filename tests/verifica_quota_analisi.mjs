// Quota giornaliera delle analisi AI per persona: limite, messaggio, cache, admin escluso, azzeramento il giorno dopo.
import assert from "node:assert/strict"; import { DatabaseSync } from "node:sqlite";
import worker from "../src/worker.js";
const ok = (n) => console.log("✓ " + n);
const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const jwk = { ...(await crypto.subtle.exportKey("jwk", publicKey)), kid: "k1", alg: "RS256", use: "sig" };
const b64url = (b) => Buffer.from(b).toString("base64url");
const firma = async (pl) => { const h = b64url(JSON.stringify({ alg: "RS256", kid: "k1" })), p = b64url(JSON.stringify(pl)); const s = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(`${h}.${p}`)); return `${h}.${p}.${b64url(s)}`; };
const DOM = "team.cloudflareaccess.com", AUD = "aud1";
const sq = new DatabaseSync(":memory:");
const db = { prepare: (q) => { const st = sq.prepare(q); let a = []; const o = { bind: (...x) => { a = x; return o; }, first: async () => st.get(...a) || null, all: async () => ({ results: st.all(...a) }), run: async () => { st.run(...a); return {}; }, _run: () => st.run(...a) }; return o; }, batch: async (l) => { for (const s of l) s._run(); } };
let chiamateAI = 0;
globalThis.fetch = async (url) => { url = String(url); if (url.includes("/certs")) return new Response(JSON.stringify({ keys: [jwk] }));
  if (url.includes("/chat/completions")) { chiamateAI++; return new Response(JSON.stringify({ choices: [{ message: { content: "Analisi di prova." } }] })); }
  if (url.includes("api.telegram.org")) return new Response("{}"); return new Response("{}", { status: 404 }); };
const env = { ACCESS_TEAM_DOMAIN: DOM, ACCESS_AUD: AUD, ADMIN_EMAILS: "admin@x.it", ACCESSO_APERTO: "1", DB: db, AI_KEY: "k", AI_BASE_URL: "https://ai.x/v1", AI_MODEL: "m", ANALISI_MAX_GIORNO: "3",
  ASSETS: { fetch: async (rq) => { const u = String(rq.url || rq); return u.endsWith("/data/index.json") ? new Response(JSON.stringify({ aggiornato: "2026-11-20", titoli: {}, basi: ["AAA", "BBB", "CCC", "DDD", "EEE"].map((t) => ({ chiave: t + "|1D", stato: "x" })) })) : new Response("{}", { status: 404 }); } } };
const ctx = { waitUntil: () => {} };
const analisi = async (email, ticker, rigenera = true) => worker.fetch(new Request("https://x.dev/api/analisi", { method: "POST", headers: { "content-type": "application/json", "cf-access-jwt-assertion": await firma({ email, aud: [AUD], iss: "https://" + DOM, exp: Math.floor(Date.now() / 1000) + 600 }) }, body: JSON.stringify({ ticker, rigenera }) }), env, ctx);
await worker.fetch(new Request("https://x.dev/api/utenti/richiesta", { method: "POST", headers: { "content-type": "application/json", "cf-access-jwt-assertion": await firma({ email: "u@x.it", aud: [AUD], iss: "https://" + DOM, exp: Math.floor(Date.now() / 1000) + 600 }) }, body: JSON.stringify({ nome: "Utente Uno" }) }), env, ctx);
sq.exec("UPDATE richieste SET stato='attesa'");
const adm = await firma({ email: "admin@x.it", aud: [AUD], iss: "https://" + DOM, exp: Math.floor(Date.now() / 1000) + 600 });
let r = await worker.fetch(new Request("https://x.dev/api/utenti/azione", { method: "POST", headers: { "content-type": "application/json", "cf-access-jwt-assertion": adm }, body: JSON.stringify({ azione: "approva", email: "u@x.it" }) }), env, ctx);
assert.equal(r.status, 200); ok("utente abilitato");

for (const [i, t] of ["AAA", "BBB", "CCC"].entries()) { r = await analisi("u@x.it", t); assert.equal(r.status, 200, t); const j = await r.json(); assert.equal(j.analisi_restanti, 2 - i); }
ok("3 analisi consentite, con il contatore delle restanti"); assert.equal(chiamateAI, 3);
r = await analisi("u@x.it", "DDD"); assert.equal(r.status, 429); let j = await r.json();
assert.ok(j.codice === "quota_analisi" && j.limite === 3 && j.errore.includes("limite di 3 analisi") && j.errore.includes("domani")); assert.equal(chiamateAI, 3); ok("4ª analisi: 429 con messaggio, nessuna chiamata al motore");
r = await analisi("u@x.it", "EEE"); assert.equal(r.status, 429); ok("resta bloccato per tutto il giorno");
r = await analisi("admin@x.it", "DDD"); assert.equal(r.status, 200); j = await r.json(); assert.ok(!("analisi_restanti" in j)); ok("l'amministratore non ha limite");
await worker.fetch(new Request("https://x.dev/api/utenti/richiesta", { method: "POST", headers: { "content-type": "application/json", "cf-access-jwt-assertion": await firma({ email: "v@x.it", aud: [AUD], iss: "https://" + DOM, exp: Math.floor(Date.now() / 1000) + 600 }) }, body: JSON.stringify({ nome: "Utente Due" }) }), env, ctx);
await worker.fetch(new Request("https://x.dev/api/utenti/azione", { method: "POST", headers: { "content-type": "application/json", "cf-access-jwt-assertion": adm }, body: JSON.stringify({ azione: "approva", email: "v@x.it" }) }), env, ctx);
r = await analisi("v@x.it", "AAA"); assert.equal(r.status, 200); ok("il limite è per singola persona");
// il giorno dopo si azzera (e i giorni vecchi vengono ripuliti)
sq.exec("UPDATE uso_analisi SET giorno='2000-01-01'");
r = await analisi("u@x.it", "DDD"); assert.equal(r.status, 200); j = await r.json(); assert.equal(j.analisi_restanti, 2);
assert.equal(sq.prepare("SELECT COUNT(*) n FROM uso_analisi WHERE giorno='2000-01-01'").get().n, 0); ok("giorno nuovo: contatore azzerato, righe vecchie eliminate");
// quota di default
const { quotaAnalisi } = await import("../src/utenti.js"); assert.equal(quotaAnalisi({}), 30); assert.equal(quotaAnalisi({ ANALISI_MAX_GIORNO: "abc" }), 30); assert.equal(quotaAnalisi({ ANALISI_MAX_GIORNO: "50" }), 50); ok("limite di default 30, configurabile con ANALISI_MAX_GIORNO");
console.log("\nTutto ok.");
