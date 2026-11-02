// Test senza rete di Cloudflare Access nel Worker: JWT firmati con una chiave RSA di prova.
import assert from "node:assert/strict";
import worker, { verificaJwt } from "../src/worker.js";

const ok = (n) => console.log("✓ " + n);
const { publicKey, privateKey } = await crypto.subtle.generateKey(
  { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const jwk = { ...(await crypto.subtle.exportKey("jwk", publicKey)), kid: "k1", alg: "RS256", use: "sig" };
const b64url = (b) => Buffer.from(b).toString("base64url");
async function firma(payload, kid = "k1", chiave = privateKey) {
  const h = b64url(JSON.stringify({ alg: "RS256", kid })), p = b64url(JSON.stringify(payload));
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", chiave, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${b64url(sig)}`;
}
const DOM = "team.cloudflareaccess.com", AUD = "aud123";
const base = { iss: `https://${DOM}`, aud: [AUD], exp: Math.floor(Date.now() / 1000) + 600 };
const index = { aggiornato: "2026-11-02", titoli: {}, basi: [{ chiave: "AAA|1D", stato: "in_range", bottom: 60, top: 90, ampiezza: .5, barre: 10, ultimo: 80, calo: .4 }] };
const env = { ACCESS_TEAM_DOMAIN: DOM, ACCESS_AUD: AUD, ADMIN_EMAILS: "Admin@x.it", GITHUB_TOKEN: "gh", AI_KEY: "k", AI_BASE_URL: "https://ai.test/v1", AI_MODEL: "m",
  ASSETS: { fetch: async (req) => new URL(req.url).pathname === "/data/index.json" ? new Response(JSON.stringify(index)) : new Response("no", { status: 404 }) } };
let put = null;
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  if (url.includes("/cdn-cgi/access/certs")) return new Response(JSON.stringify({ keys: [jwk] }));
  if (url.includes("api.github.com")) {
    if (init.method === "PUT") { put = JSON.parse(init.body); return new Response("{}", { status: 201 }); }
    return new Response("{}", { status: 404 });
  }
  return new Response(JSON.stringify({ choices: [{ message: { content: "TECNICA\nok" } }] }));
};
const ctx = { waitUntil() {} };
const chiama = async (path, email, opt = {}) => {
  const headers = { "content-type": "application/json" };
  if (email) headers["cf-access-jwt-assertion"] = await firma({ ...base, email });
  return worker.fetch(new Request("https://x.dev" + path, { method: opt.method || "POST", headers, body: opt.method === "GET" ? undefined : JSON.stringify(opt.body || {}) }), env, ctx);
};

assert.ok(await verificaJwt(await firma({ ...base, email: "a@b.it" }), env)); ok("JWT valido accettato");
assert.equal(await verificaJwt(await firma({ ...base, aud: ["altro"], email: "a@b.it" }), env), null); ok("audience sbagliata rifiutata");
assert.equal(await verificaJwt(await firma({ ...base, exp: 1, email: "a@b.it" }), env), null); ok("JWT scaduto rifiutato");
assert.equal(await verificaJwt(await firma({ ...base, iss: "https://evil.test", email: "a@b.it" }), env), null); ok("issuer sbagliato rifiutato");
const altra = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign"]);
assert.equal(await verificaJwt(await firma({ ...base, email: "a@b.it" }, "k1", altra.privateKey), env), null); ok("firma di un'altra chiave rifiutata");

let r = await chiama("/api/me", null, { method: "GET" });
assert.equal(r.status, 401); ok("/api/me senza login → 401");
r = await chiama("/api/me", "admin@x.it", { method: "GET" });
let j = await r.json();
assert.deepEqual([j.admin, j.email, j.modalita], [true, "admin@x.it", "access"]); ok("admin riconosciuto (maiuscole ignorate)");
j = await (await chiama("/api/me", "utente@x.it", { method: "GET" })).json();
assert.equal(j.admin, false); ok("utente normale non è admin");

r = await chiama("/api/range", "utente@x.it", { body: { chiave: "AAA|1D", top: 100, bottom: 50 } });
assert.equal(r.status, 403); assert.equal(put, null); ok("utente normale non può salvare range → 403, nulla scritto");
r = await chiama("/api/range", "admin@x.it", { body: { chiave: "AAA|1D", top: 40, bottom: 50 } });
assert.equal(r.status, 400); ok("top < bottom → 400");
r = await chiama("/api/range", "admin@x.it", { body: { chiave: "ZZZ|1D", top: 100, bottom: 50 } });
assert.equal(r.status, 404); ok("base inesistente → 404");
r = await chiama("/api/range", "admin@x.it", { body: { chiave: "AAA|1D", top: 100, bottom: 50 } });
assert.equal(r.status, 200);
const scritto = JSON.parse(Buffer.from(put.content, "base64").toString());
assert.deepEqual([scritto["AAA|1D"].top, scritto["AAA|1D"].bottom, scritto["AAA|1D"].da], [100, 50, "admin@x.it"]); ok("admin salva il range: commit con l'autore");
r = await chiama("/api/analisi", null, { body: { ticker: "AAA" } });
assert.equal(r.status, 401); ok("analisi senza login → 401");
r = await chiama("/api/analisi", "utente@x.it", { body: { ticker: "AAA" } });
assert.equal(r.status, 200); ok("analisi con login (anche non admin) → 200");
console.log("\nTUTTI I CHECK PASSATI (verifica_access)");
