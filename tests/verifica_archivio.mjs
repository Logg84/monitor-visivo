// Test senza rete di src/archivio.js e delle rotte /api/dati|watchlist|portafoglio|condiviso (GitHub simulato).
import assert from "node:assert/strict";
import worker from "../src/worker.js";
import { applicaOp, costruisciTabella, csvLeggi, csvScrivi, aB64, daB64, COL_PORT } from "../src/archivio.js";
const ok = (n) => console.log("✓ " + n);

assert.equal(daB64(aB64("àèé, “ciao” €")), "àèé, “ciao” €"); ok("base64 UTF-8");
const c = csvLeggi('ID,Ticker,Note\n1,ABC,"a, ""b""\nc"\n2,XYZ,\n');
assert.equal(c.righe.length, 2); assert.equal(c.righe[0].Note, 'a, "b"\nc'); assert.equal(c.righe[1].Note, null);
assert.equal(csvScrivi(["ID", "Ticker", "Note"], c.righe), 'ID,Ticker,Note\n1,ABC,"a, ""b""\nc"\n2,XYZ,\n'); ok("CSV: virgolette, a capo, vuoti (andata e ritorno)");

const t0 = [{ ticker: "AAA", levels: {}, origin: "auto" }];
assert.equal(applicaOp(t0, { op: "add", ticker: "bbb", levels: { L1: 10, L2: 0 }, target_date: "2026-12-01" }).voci[1].levels.L1, 10); ok("add: ticker maiuscolo, livelli > 0");
assert.equal(applicaOp(t0, { op: "add", ticker: "AAA" }).cambiato, false); ok("add su esistente: nessun cambio");
assert.equal(applicaOp(t0, { op: "add", ticker: "../x" }).ok, false); ok("ticker non valido rifiutato");
assert.equal(applicaOp(t0, { op: "edit", ticker: "AAA", levels: { L1: "x" } }).ok, false); ok("livello non numerico rifiutato");
assert.equal(applicaOp(t0, { op: "edit", ticker: "AAA", levels: { L1: 5, L3: 9 }, target_date: null }).voci[0].levels.L3, 9); ok("edit livelli");
assert.equal(applicaOp(t0, { op: "remove", ticker: "AAA" }).voci.length, 0); ok("remove");
assert.equal(applicaOp(t0, { op: "review", ticker: "ZZZ" }).ok, false); ok("review su titolo assente: errore");

const base = { Ticker: "adbe", Direzione: "Long", Data_Ingresso: "2026-10-24", Prezzo_Ingresso: "275.79", Stato: "Aperto" };
const t1 = costruisciTabella([base], false);
assert.ok(t1.ok && t1.righe[0].Ticker === "ADBE" && t1.righe[0].ID.length === 8 && t1.testo.startsWith(COL_PORT.join(",") + "\n")); ok("portafoglio: normalizza, genera ID");
assert.equal(costruisciTabella([{ ...base, SL: 300 }], false).ok, false); ok("SL sopra l'ingresso (Long) rifiutato");
assert.equal(costruisciTabella([{ ...base, TP1: 300, TP2: 290 }], false).ok, false); ok("TP non crescenti rifiutati");
assert.equal(costruisciTabella([{ ...base, Direzione: "Short", SL: 280, TP1: 270 }], false).ok, true); ok("Short coerente accettato");
assert.equal(costruisciTabella([{ ...base, Stato: "Chiuso" }], false).ok, false); ok("chiuso senza prezzo uscita rifiutato");
assert.equal(costruisciTabella([base], true).ok, false); ok("condiviso: quantità obbligatoria");
assert.equal(costruisciTabella([{ ...base, Quantita: 3, Comm_Ingresso: -1 }], true).ok, false); ok("condiviso: costi negativi rifiutati");
assert.equal(costruisciTabella([{ ...base, ID: "a" }, { ...base, ID: "a" }], false).ok, false); ok("ID duplicati rifiutati");

// ── Worker con GitHub simulato (login Access con JWT di prova) ──
const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const jwk = { ...(await crypto.subtle.exportKey("jwk", publicKey)), kid: "k1", alg: "RS256", use: "sig" };
const b64url = (b) => Buffer.from(b).toString("base64url");
const firma = async (payload) => { const h = b64url(JSON.stringify({ alg: "RS256", kid: "k1" })), p = b64url(JSON.stringify(payload));
  return `${h}.${p}.${b64url(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(`${h}.${p}`)))}`; };
const DOM = "team.cloudflareaccess.com", AUD = "aud1";
const repo = new Map(); const sha = (t) => "s" + t.length + "_" + [...t].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 1e9, 7);
let put = [], dispatch = [], forzaConflitto = 0;
repo.set("data/watchlist.json", JSON.stringify({ updated: "x", entries: [{ ticker: "AAA", levels: {}, origin: "auto" }] }, null, 2) + "\n");
repo.set("data/portafoglio.csv", COL_PORT.join(",") + "\n43a47f54,ADBE,Long,2026-10-24,275.79,,,,,,Aperto,,,\n");
repo.set("data/portafoglio_condiviso_editor.json", JSON.stringify({ editors: ["amico@x.it"] }));
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url);
  if (u.pathname.includes("/cdn-cgi/access/certs")) return new Response(JSON.stringify({ keys: [jwk] }));
  assert.equal(init.headers.Authorization, "Bearer tok");
  if (u.pathname.endsWith("/dispatches")) { dispatch.push(u.pathname); return new Response(null, { status: 204 }); }
  const p = u.pathname.replace("/repos/Logg84/monitor-trading-marco/contents/", "");
  if (!init.method || init.method === "GET") { const t = repo.get(p); return t === undefined ? new Response("{}", { status: 404 }) : new Response(JSON.stringify({ sha: sha(t), content: aB64(t) })); }
  const b = JSON.parse(init.body); const att = repo.get(p);
  if (forzaConflitto > 0) { forzaConflitto--; repo.set(p, att.replace('"updated": "x"', '"updated": "y"')); return new Response("{}", { status: 409 }); }
  if (att !== undefined && b.sha !== sha(att)) return new Response("{}", { status: 409 });
  const t = daB64(b.content); repo.set(p, t); put.push({ p, msg: b.message }); return new Response(JSON.stringify({ content: { sha: sha(t) } }));
};
const env = { ACCESS_TEAM_DOMAIN: DOM, ACCESS_AUD: AUD, ADMIN_EMAILS: "admin@x.it", PRIVATE_REPO_TOKEN: "tok", GITHUB_TOKEN: "g" };
const ctx = { waitUntil() {} };
const chiama = async (path, email, { metodo = "GET", body, origin } = {}) => {
  const headers = { "content-type": "application/json" };
  if (email) headers["cf-access-jwt-assertion"] = await firma({ iss: `https://${DOM}`, aud: [AUD], exp: Math.floor(Date.now() / 1000) + 600, email });
  if (origin) headers.origin = origin;
  return worker.fetch(new Request("https://x.dev" + path, { method: metodo, headers, body: body ? JSON.stringify(body) : undefined }), env, ctx);
};
const A = "admin@x.it";
assert.equal((await chiama("/api/dati/watchlist", null)).status, 401); ok("senza login → 401");
assert.equal((await chiama("/api/dati/watchlist", "altro@x.it")).status, 403); ok("non admin: area personale → 403");
let r = await chiama("/api/dati/watchlist", A), j = await r.json();
assert.equal(r.status, 200); assert.equal(j.dati.entries[0].ticker, "AAA"); assert.ok(j.sha); ok("admin legge la watchlist (JSON incollato)");
r = await chiama("/api/watchlist", A, { metodo: "POST", body: { op: "add", ticker: "bbb", levels: { L1: 12 } } });
assert.equal(r.status, 200); assert.equal(JSON.parse(repo.get("data/watchlist.json")).entries.length, 2); assert.ok(put.at(-1).msg.includes("add BBB")); ok("add → commit sul file giusto");
forzaConflitto = 1; r = await chiama("/api/watchlist", A, { metodo: "POST", body: { op: "remove", ticker: "BBB" } });
assert.equal(r.status, 200); assert.equal(JSON.parse(repo.get("data/watchlist.json")).entries.length, 1); assert.equal(JSON.parse(repo.get("data/watchlist.json")).updated.slice(0, 2), "20"); ok("conflitto 409 → rilegge e riapplica");
forzaConflitto = 2; r = await chiama("/api/watchlist", A, { metodo: "POST", body: { op: "add", ticker: "CCC" } });
assert.equal(r.status, 409); ok("conflitto persistente → 409 chiaro");
r = await chiama("/api/watchlist", A, { metodo: "POST", body: { op: "add", ticker: "CCC" }, origin: "https://evil.test" });
assert.equal(r.status, 403); ok("origine diversa → 403");
r = await chiama("/api/dati/portafoglio", A); j = await r.json();
assert.equal(j.righe[0].Ticker, "ADBE"); assert.equal(j.colonne.length, 14); ok("portafoglio letto come righe");
const righe = [...j.righe, { Ticker: "rng", Direzione: "Long", Data_Ingresso: "2026-10-24", Prezzo_Ingresso: 43.25, Stato: "Aperto" }];
r = await chiama("/api/portafoglio", A, { metodo: "POST", body: { sha: j.sha, righe } });
assert.equal(r.status, 200); assert.ok(repo.get("data/portafoglio.csv").includes("RNG")); ok("portafoglio salvato");
r = await chiama("/api/portafoglio", A, { metodo: "POST", body: { sha: j.sha, righe } });
assert.equal(r.status, 409); ok("sha vecchio → 409 «ricarica»");
r = await chiama("/api/portafoglio", A, { metodo: "POST", body: { sha: null, righe: [{ Ticker: "X", Prezzo_Ingresso: 0 }] } });
assert.equal(r.status, 400); ok("dati incoerenti → 400");
// condiviso
const cond = { Ticker: "mu", Direzione: "Long", Data_Ingresso: "2026-11-06", Prezzo_Ingresso: 90, Quantita: 2, Stato: "Aperto" };
r = await chiama("/api/condiviso", "estraneo@x.it", { metodo: "POST", body: { sha: null, righe: [cond] } });
assert.equal(r.status, 403); ok("condiviso: utente qualsiasi non scrive");
r = await chiama("/api/dati/condiviso", "estraneo@x.it"); assert.equal(r.status, 200); assert.equal((await r.json()).puo_modificare, false); ok("condiviso: lettura aperta a tutti");
r = await chiama("/api/condiviso", "amico@x.it", { metodo: "POST", body: { sha: null, righe: [cond] } }); j = await r.json();
assert.equal(r.status, 200); assert.equal(j.alert, "avviato"); assert.equal(dispatch.length, 1); assert.ok(repo.get("data/portafoglio_condiviso.csv").includes("MU")); ok("condiviso: editor scrive e parte il workflow degli avvisi");
r = await chiama("/api/dati/condiviso", A); assert.equal((await r.json()).puo_modificare, true); ok("admin è sempre editor");
delete env.PRIVATE_REPO_TOKEN; r = await chiama("/api/dati/watchlist", A); assert.equal(r.status, 503); ok("token mancante → 503 chiaro");
console.log("OK: verifica_archivio");
