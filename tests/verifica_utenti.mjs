// Prova di src/utenti.js con un D1 simulato (SQLite) e un Cloudflare Access simulato.
import { DatabaseSync } from "node:sqlite"; import assert from "node:assert/strict";
import * as ut from "../src/utenti.js"; import { percorso, uidValido } from "../src/archivio.js";
const sq = new DatabaseSync(":memory:");
const db = { prepare: (q) => { const st = sq.prepare(q); let a = [];
  const o = { bind: (...x) => { a = x; return o; }, first: async () => st.get(...a) || null, all: async () => ({ results: st.all(...a) }), run: async () => { st.run(...a); return {}; }, _run: () => st.run(...a) }; return o; },
  batch: async (l) => { for (const s of l) s._run(); } };
let n = 0; const ok = (nome) => { n++; console.log("✓ " + nome); };

// richieste
assert.equal((await ut.richiedi(db, { email: "no", nome: "Anna" })).ok, false); ok("email non valida rifiutata");
assert.equal((await ut.richiedi(db, { email: "a@b.it", nome: "A" })).ok, false); ok("nome troppo corto rifiutato");
assert.deepEqual(await ut.richiedi(db, { email: "bot@x.it", nome: "Bot", sito: "http://spam" }), { ok: true }); assert.equal((await ut.elenco(db)).richieste.length, 0); ok("campo-trappola ignorato");
const r1 = await ut.richiedi(db, { email: "Anna.Rossi@Example.com", nome: "Anna Rossi", messaggio: "collega <b>logistica</b>" });
assert.ok(r1.ok && r1.nuova && r1.email === "anna.rossi@example.com"); ok("richiesta registrata (email normalizzata)");
assert.equal((await ut.richiedi(db, { email: "anna.rossi@example.com", nome: "Anna Rossi" })).nuova, false); ok("seconda richiesta non rinotifica");
const el = await ut.elenco(db); assert.equal(el.richieste.length, 1); assert.ok(!el.richieste[0].messaggio.includes("<")); ok("messaggio ripulito");

// approvazione con Access simulato
let policy = { name: "consenti", decision: "allow", precedence: 1, session_duration: "24h", include: [{ email: { email: "lorenzetti1984@gmail.com" } }], exclude: [], require: [] }, put = 0;
const cf = async (url, o = {}) => { assert.ok(url.includes("/access/apps/APP/policies/POL")); assert.equal(o.headers.authorization, "Bearer TK");
  if (o.method === "PUT") { put++; policy = { ...policy, ...JSON.parse(o.body) }; return { ok: true, status: 200, json: async () => ({ result: policy }) }; }
  return { ok: true, status: 200, json: async () => ({ result: policy }) }; };
const env = { CF_ACCOUNT_ID: "ACC", CF_ACCESS_TOKEN: "TK", ACCESS_APP_ID: "APP", ACCESS_POLICY_ID: "POL" };
const a = await ut.approva(db, env, "anna.rossi@example.com", cf);
assert.ok(a.ok && a.uid === "anna-rossi" && a.access === "aggiunto"); assert.equal(policy.include.length, 2); ok("approvata: utente creato e email aggiunta alla regola Access");
assert.equal((await ut.elenco(db)).richieste.length, 0); ok("richiesta chiusa dopo l'approvazione");
assert.equal(put, 1); await ut.accessAggiungi(env, "anna.rossi@example.com", cf); assert.equal(put, 1); ok("aggiunta ripetuta: nessuna doppia scrittura");
assert.equal(policy.include[0].email.email, "lorenzetti1984@gmail.com"); ok("le email esistenti restano");
// approvazione senza Access configurato → manuale
await ut.richiedi(db, { email: "luca@x.it", nome: "Luca Bianchi" });
const m = await ut.approva(db, {}, "luca@x.it", cf); assert.ok(m.ok && m.access === "manuale"); ok("senza token Access: approvazione con aggiunta manuale segnalata");
// Access in errore → nessuna modifica
await ut.richiedi(db, { email: "err@x.it", nome: "Err Or" });
const ko = await ut.approva(db, env, "err@x.it", async () => ({ ok: false, status: 500, json: async () => ({}) })); assert.equal(ko.ok, false); assert.equal((await ut.elenco(db)).richieste.length, 1); ok("errore Access: la richiesta resta in attesa");
// rifiuto e rimozione
await ut.rifiuta(db, "err@x.it"); assert.equal((await ut.richiedi(db, { email: "err@x.it", nome: "Err Or" })).nuova, undefined); ok("richiesta rifiutata: nessuna nuova notifica");
const rm = await ut.rimuovi(db, env, "anna.rossi@example.com", cf); assert.ok(rm.ok); assert.equal(policy.include.length, 1); ok("rimozione: email tolta da Access");
assert.equal((await ut.elenco(db)).utenti.find((u) => u.email === "anna.rossi@example.com").attivo, 0); ok("utente disattivato (dati conservati)");

// uid
assert.equal(ut.creaUid("Zoë Müller", "z@x.it", new Set()), "zoe-muller");
assert.equal(ut.creaUid("Anna Rossi", "a@x.it", new Set(["anna-rossi"])), "anna-rossi-2");
assert.equal(ut.creaUid("", "mario.verdi@x.it", new Set()), "mario-verdi"); ok("uid: accenti, duplicati, solo email");
assert.ok(uidValido("anna-rossi") && !uidValido("../x") && !uidValido("A")); ok("uid valido solo se sicuro per i percorsi");
assert.equal(percorso("watchlist", "anna-rossi"), "data/users/anna-rossi/watchlist.json");
assert.equal(percorso("portafoglio", "anna-rossi"), "data/users/anna-rossi/portafoglio.csv");
assert.equal(percorso("condiviso", "anna-rossi"), "data/portafoglio_condiviso.csv"); assert.equal(percorso("watchlist", ""), "data/watchlist.json"); ok("percorsi personali, condiviso comune, admin storico");

// profilo
const p = await ut.profilo(db, "nuovo@x.it", "Nuovo Utente"); assert.equal(p.uid, "nuovo-utente"); assert.equal(p.canale, "telegram"); ok("profilo creato al primo accesso");
assert.equal((await ut.aggiornaProfilo(db, "nuovo@x.it", { canale: "telegram", telegram_chat_id: "" })).ok, false); ok("telegram senza Chat ID rifiutato");
assert.equal((await ut.aggiornaProfilo(db, "nuovo@x.it", { canale: "email", email_alert: "bad" })).ok, false); ok("email alert non valida rifiutata");
assert.equal((await ut.aggiornaProfilo(db, "nuovo@x.it", { canale: "entrambi", telegram_chat_id: "123456789", email_alert: "n@x.it" })).ok, true);
const q = await ut.profilo(db, "nuovo@x.it"); assert.ok(q.canale === "entrambi" && q.telegram_chat_id === "123456789" && q.email_alert === "n@x.it"); ok("canale e destinatari salvati");
assert.equal((await ut.aggiornaProfilo(db, "nuovo@x.it", { canale: "sms" })).ok, false); ok("canale sconosciuto rifiutato");
// limite giornaliero
for (let i = 0; i < 20; i++) await ut.richiedi(db, { email: `u${i}@x.it`, nome: "Utente " + i });
assert.equal((await ut.richiedi(db, { email: "ultimo@x.it", nome: "Ultimo Utente" })).stato, 429); ok("limite di richieste (anti-spam)");
// Telegram
let tg = null; await ut.notificaTelegram({ TELEGRAM_BOT_TOKEN: "T", TELEGRAM_CHAT_ID: "9" }, "x", async (u, o) => { tg = [u, JSON.parse(o.body)]; return { ok: true }; });
assert.ok(tg[0].includes("botT/sendMessage") && tg[1].chat_id === "9"); assert.equal(await ut.notificaTelegram({}, "x"), false); ok("notifica Telegram (e silenzio se non configurata)");
console.log(`TUTTI I CHECK PASSATI (${n})`);
