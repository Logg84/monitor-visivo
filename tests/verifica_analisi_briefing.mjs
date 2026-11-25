// Analisi AI del briefing (POST /api/analisi-briefing): accesso, testo troppo corto, troncamento, prompt di sistema, quota condivisa con le analisi dei titoli.
import assert from "node:assert/strict"; import { DatabaseSync } from "node:sqlite";
import worker, { SYSTEM_BRIEFING } from "../src/worker.js";
import { ENV_ACCESSO, accesso } from "./_accesso.mjs";
import * as ut from "../src/utenti.js";
const ok = (n) => console.log("✓ " + n);
const sq = new DatabaseSync(":memory:");
const db = { prepare: (q) => { const st = sq.prepare(q); let a = []; const o = { bind: (...x) => { a = x; return o; }, first: async () => st.get(...a) || null, all: async () => ({ results: st.all(...a) }), run: async () => { st.run(...a); return { success: true }; } }; return o; }, exec: async (q) => sq.exec(q), batch: async (l) => { for (const x of l) await x.run(); return []; } };
let chiamate = [], rispostaAI = () => new Response(JSON.stringify({ choices: [{ message: { content: "<think>x</think>QUADRO DI MERCATO\nTutto bene.\n\nCOSA CONTROLLARE OGGI\nVerifica A." } }] }));
globalThis.fetch = async (url, init) => { if (String(url).includes("/chat/completions")) { chiamate.push(JSON.parse(init.body)); return rispostaAI(); } return new Response("{}", { status: 404 }); };
const env = { ...ENV_ACCESSO, ACCESSO_APERTO: "1", DB: db, AI_KEY: "k", AI_BASE_URL: "https://ai.x/v1", AI_MODEL: "m", ANALISI_MAX_GIORNO: "2", ASSETS: { fetch: async () => new Response("{}", { status: 404 }) } };
const ctx = { waitUntil() {} };
const bri = async (utente, testo, metodo = "POST") => worker.fetch(new Request("https://x.dev/api/analisi-briefing", { method: metodo, headers: { ...(await accesso(utente)), "content-type": "application/json" }, body: metodo === "POST" ? JSON.stringify({ testo }) : undefined }), env, ctx);
const TESTO = "# Briefing\n" + "Regime Espansione. ".repeat(60);

await ut.richiedi(db, { email: "u@x.it", nome: "Utente Prova" }); await ut.approva(db, "u@x.it");

let r = await bri(null, TESTO); assert.equal(r.status, 401); assert.equal(chiamate.length, 0); ok("senza login → 401, nessuna chiamata al motore");
r = await bri("intruso@x.it", TESTO); assert.equal(r.status, 403); assert.equal(chiamate.length, 0); ok("login ma non abilitato → 403 (porta)");
r = await bri("admin@x.it", TESTO, "GET"); assert.equal(r.status, 405); ok("solo POST");
r = await bri("admin@x.it", "troppo corto"); assert.equal(r.status, 400); assert.equal(chiamate.length, 0); ok("testo vuoto o corto → 400 senza consumare il motore");

r = await bri("admin@x.it", TESTO); let j = await r.json(); assert.equal(r.status, 200);
assert.ok(j.testo.startsWith("QUADRO DI MERCATO") && !j.testo.includes("think") && j.troncato === false && j.analisi_restanti === undefined); ok("admin: risposta pulita dal <think>, nessun contatore (admin escluso dalla quota)");
const m = chiamate.at(-1).messages; assert.equal(m[0].content, SYSTEM_BRIEFING); assert.ok(m[1].content.startsWith("BRIEFING:") && m[1].content.includes("Regime Espansione")); ok("al motore vanno il prompt del briefing e il testo");
assert.ok(/Non hai accesso al web/.test(SYSTEM_BRIEFING) && /MAI indicazioni operative/.test(SYSTEM_BRIEFING)); ok("il prompt vieta notizie inventate e indicazioni operative");

const lungo = "x".repeat(70000); r = await bri("admin@x.it", lungo); j = await r.json();
assert.equal(j.troncato, true); assert.ok(chiamate.at(-1).messages[1].content.length < 60500 && chiamate.at(-1).messages[1].content.includes("briefing troncato")); ok("briefing oltre 60.000 caratteri: troncato con avviso");

r = await bri("u@x.it", TESTO); j = await r.json(); assert.equal(r.status, 200); assert.equal(j.analisi_restanti, 1);
r = await bri("u@x.it", TESTO); j = await r.json(); assert.equal(j.analisi_restanti, 0); ok("utente: ogni analisi del briefing conta nella quota giornaliera (2 → 1 → 0)");
const n = chiamate.length; r = await bri("u@x.it", TESTO); j = await r.json();
assert.equal(r.status, 429); assert.equal(j.codice, "quota_analisi"); assert.equal(chiamate.length, n); ok("a quota esaurita: 429 senza chiamare il motore");

rispostaAI = () => new Response("quota esaurita", { status: 429 });
r = await bri("admin@x.it", TESTO); j = await r.json(); assert.equal(r.status, 502); assert.ok(j.errore.includes("motore AI: errore 429")); ok("errore del motore: 502 con il messaggio");
rispostaAI = () => new Response(JSON.stringify({ choices: [{ message: { content: "" } }] }));
r = await bri("admin@x.it", TESTO); assert.equal(r.status, 502); ok("risposta vuota: 502");
console.log("\nTUTTI I CHECK PASSATI (verifica_analisi_briefing)");
