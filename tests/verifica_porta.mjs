// La «porta» del Worker: chi passa da Access ma non è abilitato vede solo la richiesta di accesso.
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
const tg = [];
globalThis.fetch = async (url) => { url = String(url); if (url.includes("/certs")) return new Response(JSON.stringify({ keys: [jwk] })); if (url.includes("api.telegram.org")) { tg.push(url); return new Response("{}"); } return new Response("{}", { status: 404 }); };
const env = { ACCESS_TEAM_DOMAIN: DOM, ACCESS_AUD: AUD, ADMIN_EMAILS: "admin@x.it", DB: db, TELEGRAM_BOT_TOKEN: "T", TELEGRAM_CHAT_ID: "9", ASSETS: { fetch: async () => new Response("{}") } };
const chiama = async (path, email, body) => worker.fetch(new Request("https://x.dev" + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", "cf-access-jwt-assertion": await firma({ iss: `https://${DOM}`, aud: [AUD], exp: Math.floor(Date.now() / 1000) + 600, email }) }, body: body ? JSON.stringify(body) : undefined }), env, { waitUntil() {} });

let r = await chiama("/api/screening", "nuovo@x.it"); assert.equal(r.status, 403); assert.equal((await r.json()).errore, "non_abilitato"); ok("sconosciuto: dati riservati bloccati");
for (const p of ["/api/unificato", "/api/pagina/macro", "/api/dati/watchlist", "/api/utenti"]) { r = await chiama(p, "nuovo@x.it"); assert.equal(r.status, 403, p); } ok("sconosciuto: unificato, pagine, watchlist e utenti bloccati");
r = await chiama("/api/utenti/me", "nuovo@x.it"); let j = await r.json(); assert.ok(r.status === 200 && j.abilitato === false && j.stato === "nuovo"); ok("/api/utenti/me dice «non abilitato, nuovo»");
r = await chiama("/api/utenti/richiesta", "nuovo@x.it", { nome: "Nuovo Utente", messaggio: "ciao" }); assert.equal(r.status, 200); assert.equal((await r.json()).stato, "attesa"); assert.equal(tg.length, 1); ok("richiesta con email verificata → in attesa + Telegram");
r = await chiama("/api/utenti/richiesta", "nuovo@x.it", { nome: "Nuovo Utente" }); assert.equal(tg.length, 1); ok("richiesta ripetuta: nessun secondo avviso");
r = await chiama("/api/screening", "nuovo@x.it"); assert.equal(r.status, 403); ok("in attesa: ancora bloccato");
r = await chiama("/api/utenti/richiesta", "admin@x.it", { nome: "Admin" }); assert.equal(r.status, 400); ok("l'admin non fa richieste");
// admin non è mai bloccato e approva
r = await chiama("/api/utenti/azione", "admin@x.it", { azione: "approva", email: "nuovo@x.it" }); j = await r.json(); assert.ok(r.status === 200 && j.uid === "nuovo-utente" && j.access === "manuale"); ok("admin approva (Access non aperto: aggiunta manuale segnalata)");
r = await chiama("/api/utenti/me", "nuovo@x.it"); j = await r.json(); assert.ok(j.abilitato === true && j.uid === "nuovo-utente"); ok("approvato: abilitato con la sua cartella");
r = await chiama("/api/screening", "nuovo@x.it"); assert.notEqual(r.status, 403); ok("approvato: passa la porta");
r = await chiama("/api/utenti", "nuovo@x.it"); assert.equal(r.status, 403); ok("approvato ma non admin: pagina Utenti vietata");
// accesso aperto
env.ACCESSO_APERTO = "1";
await chiama("/api/utenti/richiesta", "b@x.it", { nome: "Beta Test" });
r = await chiama("/api/utenti/azione", "admin@x.it", { azione: "approva", email: "b@x.it" }); j = await r.json(); assert.equal(j.access, "non_necessario"); ok("accesso aperto: approvazione senza toccare Cloudflare");
r = await chiama("/api/utenti/azione", "admin@x.it", { azione: "rimuovi", email: "b@x.it" }); j = await r.json(); assert.equal(j.access, "non_necessario");
r = await chiama("/api/screening", "b@x.it"); assert.equal(r.status, 403); assert.equal((await r.json()).stato, "disattivato"); ok("rimosso: bloccato (disattivato)");
r = await chiama("/api/utenti", "admin@x.it"); j = await r.json(); assert.equal(j.accesso_aperto, true); ok("la pagina Utenti sa che l'accesso è aperto");
r = await chiama("/api/access-info", "x@x.it"); assert.equal(r.status, 200); ok("diagnosi del login sempre raggiungibile");
console.log("TUTTI I CHECK PASSATI (verifica_porta)");
