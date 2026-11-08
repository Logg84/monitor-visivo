// esportaUtentiAlert: scrive nel repo privato solo gli utenti attivi con Telegram valido.
import { DatabaseSync } from "node:sqlite"; import assert from "node:assert/strict";
import * as ut from "../src/utenti.js"; import { aB64 } from "../src/archivio.js";
const sq = new DatabaseSync(":memory:");
const db = { prepare: (q) => { const st = sq.prepare(q); let a = [];
  const o = { bind: (...x) => { a = x; return o; }, first: async () => st.get(...a) || null, all: async () => ({ results: st.all(...a) }), run: async () => { st.run(...a); return {}; }, _run: () => st.run(...a) }; return o; },
  batch: async (l) => { for (const s of l) s._run(); } };
await ut.profilo(db, "a@x.it", "Anna Rossi"); await ut.profilo(db, "b@x.it", "Bruno"); await ut.profilo(db, "c@x.it", "Carla"); await ut.profilo(db, "d@x.it", "Dario");
await ut.aggiornaProfilo(db, "a@x.it", { canale: "telegram", telegram_chat_id: "111222333" });
await ut.aggiornaProfilo(db, "c@x.it", { canale: "nessuno" });
await ut.aggiornaProfilo(db, "d@x.it", { canale: "telegram", telegram_chat_id: "444555666" });
sq.prepare("UPDATE utenti SET attivo=0 WHERE email='d@x.it'").run();   // Dario rimosso
let file = null, puts = 0;
const gh = async (url, o = {}) => {
  if (o.method === "PUT") { puts++; file = JSON.parse(Buffer.from(JSON.parse(o.body).content, "base64").toString()); return { ok: true, status: 200, json: async () => ({ content: { sha: "S2" } }) }; }
  return file ? { ok: true, status: 200, json: async () => ({ sha: "S1", content: aB64(JSON.stringify(file, null, 2) + "\n") }) } : { ok: false, status: 404 }; };
const env = { PRIVATE_REPO_TOKEN: "t" };
let r = await ut.esportaUtentiAlert(db, env, gh);
assert.ok(r.ok); assert.deepEqual(file.utenti, [{ uid: "anna-rossi", nome: "Anna Rossi", telegram_chat_id: "111222333" }]); console.log("✓ solo utenti attivi con Telegram valido");
r = await ut.esportaUtentiAlert(db, env, gh); assert.ok(r.invariato); assert.equal(puts, 1); console.log("✓ nessuna scrittura se invariato");
assert.equal((await ut.esportaUtentiAlert(db, {}, gh)).ok, false); console.log("✓ senza token: errore senza eccezioni");
console.log("TUTTI I CHECK PASSATI (alert utenti)");
