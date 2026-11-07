// File personali di un utente (data/users/<uid>/): creazione dalla base automatica e isolamento dalla watchlist principale.
import assert from "node:assert/strict";
import { creaWatchlistPersonale, modificaWatchlist, leggiFile, aB64, daB64 } from "../src/archivio.js";
const repo = new Map([["data/watchlist.json", JSON.stringify({ updated: "x", entries: [
  { ticker: "AAA", origin: "auto", levels: {} }, { ticker: "MIO", origin: "manual", levels: { L1: 5 } }, { ticker: "BBB", origin: "auto", levels: {} }] })]]);
const scritture = [];
const fetchFn = async (url, o = {}) => {
  const p = decodeURIComponent(url.split("/contents/")[1].split("?")[0]);
  if (o.method === "PUT") { const b = JSON.parse(o.body); if (repo.has(p) && !b.sha) return { ok: false, status: 422, json: async () => ({}) };
    repo.set(p, daB64(b.content)); scritture.push([p, b.message]); return { ok: true, status: 200, json: async () => ({ content: { sha: "n" + scritture.length } }) }; }
  if (!repo.has(p)) return { ok: false, status: 404, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => ({ sha: "s" + repo.get(p).length, content: aB64(repo.get(p)) }) };
};
const env = { PRIVATE_REPO_TOKEN: "t" };
const f = await creaWatchlistPersonale(env, "anna", fetchFn);
assert.ok(f.ok); const d = JSON.parse(f.testo); assert.deepEqual(d.entries.map((e) => e.ticker), ["AAA", "BBB"]); console.log("✓ watchlist personale = solo voci automatiche (le manuali dell'admin restano private)");
assert.ok(repo.has("data/users/anna/watchlist.json") && scritture[0][0] === "data/users/anna/watchlist.json"); console.log("✓ scritta in data/users/anna/");
const r = await modificaWatchlist(env, { op: "add", ticker: "ccc", levels: { L1: 10 } }, "anna@x.it", fetchFn, "anna");
assert.ok(r.ok); assert.deepEqual(JSON.parse(repo.get("data/users/anna/watchlist.json")).entries.map((e) => e.ticker), ["AAA", "BBB", "CCC"]); console.log("✓ aggiunta manuale nella propria watchlist");
assert.deepEqual(JSON.parse(repo.get("data/watchlist.json")).entries.map((e) => e.ticker), ["AAA", "MIO", "BBB"]); console.log("✓ la watchlist principale non cambia");
// nuovo utente che modifica subito: viene creata e poi modificata
const r2 = await modificaWatchlist(env, { op: "remove", ticker: "AAA" }, "luca@x.it", fetchFn, "luca");
assert.ok(r2.ok); assert.deepEqual(JSON.parse(repo.get("data/users/luca/watchlist.json")).entries.map((e) => e.ticker), ["BBB"]); console.log("✓ prima modifica di un nuovo utente: base automatica + modifica");
// seconda lettura non ricrea
const n = scritture.length; await leggiFile(env, "watchlist", fetchFn, "anna"); assert.equal(scritture.length, n); console.log("✓ nessuna ricreazione");
console.log("TUTTI I CHECK PASSATI (verifica_personali)");
