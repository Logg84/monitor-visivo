// Test senza rete del Worker: asset e motore AI simulati.
import assert from "node:assert/strict";
import worker, { costruisciPrompt } from "../src/worker.js";

const index = { aggiornato: "2026-11-02T20:00:00+00:00",
  titoli: { AAA: { ath: 200, ath_data: "2021-11-05", dist_ath: -0.6, ultimo: 80 } },
  basi: [{ chiave: "AAA|1D", stato: "in_range", bottom: 60, top: 90, ampiezza: 0.5, barre: 100, ultimo: 80, swing_minimi: 3, swing_massimi: 3, calo: 0.4 }] };
const fond = { aggiornato: "2026-11-02", dati: { trailingPE: 12, profitMargins: 0.2 } };
let chiamateAI = 0, ultimoPrompt = "";
const env = {
  ACCESS_CODE: "segreto", AI_KEY: "k", AI_BASE_URL: "https://ai.test/v1", AI_MODEL: "m",
  ASSETS: { fetch: async (req) => {
    const p = new URL(req.url).pathname;
    if (p === "/data/index.json") return new Response(JSON.stringify(index));
    if (p === "/data/fond/AAA.json") return new Response(JSON.stringify(fond));
    return new Response("nope", { status: 404 });
  } },
};
globalThis.fetch = async (url, init) => {
  chiamateAI++; ultimoPrompt = JSON.parse(init.body).messages[1].content;
  assert.equal(init.headers.Authorization, "Bearer k");
  return new Response(JSON.stringify({ choices: [{ message: { content: "TECNICA\nok" } }] }));
};
const ctx = { waitUntil() {} };
const post = (body, codice = "segreto", method = "POST") => worker.fetch(new Request("https://x.dev/api/analisi", {
  method, headers: { "x-codice": codice, "content-type": "application/json" }, body: method === "POST" ? JSON.stringify(body) : undefined }), env, ctx);
const ok = (n) => console.log("✓ " + n);

assert.equal((await post({ ticker: "AAA" }, "sbagliato")).status, 401); ok("codice errato → 401");
assert.equal((await post({ ticker: "AAA" }, "segreto", "GET")).status, 405); ok("GET → 405");
assert.equal((await post({ ticker: "ZZZ" })).status, 404); ok("ticker sconosciuto → 404");
assert.equal(chiamateAI, 0); ok("nessuna chiamata AI per richieste rifiutate");
const r = await post({ ticker: "AAA" });
const j = await r.json();
assert.equal(r.status, 200); assert.equal(j.testo, "TECNICA\nok"); assert.equal(j.fondamentali, true); ok("richiesta valida → testo");
assert.ok(ultimoPrompt.includes("range 60–90") && ultimoPrompt.includes("ATH 200") && ultimoPrompt.includes("trailingPE")); ok("il prompt contiene range, ATH e fondamentali");
const p2 = costruisciPrompt("BBB", index.basi, null, null);
assert.ok(p2.includes("NON DISPONIBILI") && p2.includes("ATH non disponibile")); ok("senza fondamentali/ATH lo dichiara");
const env2 = { ...env, AI_KEY: "" };
assert.equal((await worker.fetch(new Request("https://x.dev/api/analisi", { method: "POST", body: "{}" }), env2, ctx)).status, 503); ok("senza chiave → 503");
const st = await worker.fetch(new Request("https://x.dev/data/index.json"), env, ctx);
assert.equal(st.status, 200); ok("altri percorsi → file statici");
globalThis.fetch = async () => new Response("err", { status: 429 });
assert.equal((await post({ ticker: "AAA", rigenera: true })).status, 502); ok("errore del motore AI → 502 senza crash");
console.log("\nTUTTI I CHECK PASSATI (verifica_worker)");
