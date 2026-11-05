// Test senza rete di src/dati.js e delle route /api/unificato e scheduled, con SQLite reale (stesso motore di D1).
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import worker from "../src/worker.js";
import { eseguiCron, leggiPunteggi, ultimiLog, unisci, compatta, MAX_LOG } from "../src/dati.js";

const ok = (n) => console.log("✓ " + n);

// D1 finto sopra node:sqlite (stessa interfaccia usata dal codice: prepare/bind/run/all/first/batch)
function fakeD1() {
  const db = new DatabaseSync(":memory:");
  const stm = (sql, args = []) => ({
    bind: (...a) => stm(sql, a),
    run: async () => { db.prepare(sql).run(...args); return { success: true }; },
    all: async () => ({ results: db.prepare(sql).all(...args).map((r) => ({ ...r })) }),
    first: async (col) => { const r = db.prepare(sql).get(...args); return r ? (col ? r[col] : { ...r }) : null; },
    _exec: () => db.prepare(sql).run(...args),
  });
  return { raw: db, prepare: (sql) => stm(sql), batch: async (l) => { db.exec("BEGIN"); try { l.forEach((s) => s._exec()); db.exec("COMMIT"); } catch (e) { db.exec("ROLLBACK"); throw e; } return []; } };
}
const DDL_PUNTEGGI = `CREATE TABLE punteggi (ticker TEXT NOT NULL, data TEXT NOT NULL, run_utc TEXT, segnale TEXT, punti INTEGER, origine TEXT, priorita REAL, extra TEXT, PRIMARY KEY (ticker, data));
CREATE INDEX idx_punteggi_data ON punteggi (data);`;

// ── Tabella punteggi non ancora creata ──
let db = fakeD1();
let p = await leggiPunteggi(db);
assert.deepEqual(p, { data: null, righe: [], vuoto: true }); ok("punteggi: tabella assente → vuoto, nessun errore");
db.raw.exec(DDL_PUNTEGGI);
assert.deepEqual(await leggiPunteggi(db), { data: null, righe: [] }); ok("punteggi: tabella vuota → data null");
const ins = db.raw.prepare("INSERT INTO punteggi (ticker,data,run_utc,segnale,punti,origine,priorita,extra) VALUES (?,?,?,?,?,?,?,?)");
ins.run("AAA", "2026-11-03", "x", "🟡 2/6", 2, "vecchio", 1, null);
ins.run("AAA", "2026-11-04", "x", "🟢 5/6", 5, "nuovo", 2, '{"a":1}');
ins.run("BBB", "2026-11-04", "x", "🟡 3/6", 3, null, null, null);
ins.run("CCC", "2026-11-03", "x", "🟡 1/6", 1, null, null, null);
p = await leggiPunteggi(db);
assert.equal(p.data, "2026-11-04"); assert.deepEqual(p.righe.map((r) => r.ticker).sort(), ["AAA", "BBB"]);
assert.equal(p.righe.find((r) => r.ticker === "AAA").punti, 5); ok("punteggi: solo l'ultima data, versione più recente");
const piano = db.raw.prepare("EXPLAIN QUERY PLAN SELECT ticker FROM punteggi WHERE data = ?").all("2026-11-04").map((r) => r.detail).join(" ");
assert.match(piano, /idx_punteggi_data|PRIMARY/); ok("punteggi: la query per data usa un indice (niente scansione completa)");
db.prepare("SELECT 1").run && (await assert.rejects(() => fakeD1().prepare("SELECT * FROM x").all()));

// ── unisci / compatta ──
const index = { aggiornato: "2026-11-04T22:30:00+00:00", titoli: { AAA: { dist_ath: -0.25, ultimo: 90 } },
  basi: [{ chiave: "AAA|1D", stato: "in_range", bottom: 60, top: 100, ultimo: 90, barre: 50, ampiezza: 0.4 },
         { chiave: "AAA|1W", stato: "uscito_sopra", bottom: 60, top: 100, ultimo: 110, barre: 20, ampiezza: 0.4, uscito_il: "2026-11-02" },
         { chiave: "ZZZ|1D", stato: "rallenta", bottom: 10, top: 20, ultimo: 15, barre: 5, ampiezza: 0.5, prima_vista: true }] };
const r = unisci(index, p.righe);
assert.deepEqual(r.map((x) => x.ticker), ["AAA", "BBB", "ZZZ"]); ok("unisci: unione per ticker, ordinata");
assert.equal(r[0].basi["1D"].pos, 0.75); assert.equal(r[0].basi["1W"].pos, 1.25); assert.equal(r[0].basi["1W"].uscito_il, "2026-11-02"); ok("posizione nel range (0=bottom, 1=top, >1 sopra)");
assert.equal(r[0].punteggio.punti, 5); assert.equal(r[1].punteggio.punti, 3); assert.equal(r[2].punteggio, null); ok("punteggio assente → null, solo-punteggio → riga senza basi");
assert.equal(compatta({ stato: "x", top: 10, bottom: 10, ultimo: 10 }).pos, null); ok("range degenere → pos null");
assert.equal(r[0].dist_ath, -0.25); assert.equal(r[2].dist_ath, null);
assert.deepEqual(unisci(null, []), []); ok("input vuoto");

// ── Scheduler ──
const lunedi = new Date("2026-11-02T22:30:00Z"), domenica = new Date("2026-11-01T22:30:00Z");
const CRON = "30 22 * * mon-fri";
let chiamate = [];
const fetchOk = async (url, init) => { chiamate.push({ url, init }); return new Response(null, { status: 204 }); };
db = fakeD1();
let env = { DB: db, GITHUB_TOKEN: "tok" };
let es = await eseguiCron(CRON, env, { adesso: lunedi, fetchFn: fetchOk });
assert.equal(es[0].esito, "ok"); assert.equal(chiamate.length, 1);
assert.equal(chiamate[0].url, "https://api.github.com/repos/Logg84/monitor-visivo/actions/workflows/bases.yml/dispatches");
assert.equal(chiamate[0].init.method, "POST"); assert.equal(chiamate[0].init.headers.Authorization, "Bearer tok");
assert.deepEqual(JSON.parse(chiamate[0].init.body), { ref: "main" }); ok("cron lunedì → workflow_dispatch di bases.yml su main");
assert.equal((await ultimiLog(db))[0].esito, "ok"); ok("esito scritto in scheduler_log (tabella creata al volo)");

chiamate = [];
es = await eseguiCron(CRON, env, { adesso: domenica, fetchFn: fetchOk });
assert.equal(es[0].esito, "saltato"); assert.equal(chiamate.length, 0); ok("domenica → nessuna chiamata (filtro giorno nel codice)");

es = await eseguiCron("0 3 * * *", env, { adesso: lunedi, fetchFn: fetchOk });
assert.equal(es[0].esito, "sconosciuto"); assert.equal(chiamate.length, 0); ok("espressione cron non prevista → nessuna azione, loggata");

es = await eseguiCron(CRON, { DB: db }, { adesso: lunedi, fetchFn: fetchOk });
assert.equal(es[0].esito, "token_mancante"); assert.equal(chiamate.length, 0); ok("token mancante → errore chiaro, nessuna chiamata");

for (const [st, testo] of [[403, /Actions: Read and write/], [404, /non trovato/], [401, /non valido/], [422, /workflow_dispatch/]]) {
  es = await eseguiCron(CRON, env, { adesso: lunedi, fetchFn: async () => new Response("x", { status: st }) });
  assert.equal(es[0].esito, "errore"); assert.match(es[0].dettaglio, testo);
}
ok("errori GitHub 401/403/404/422 → messaggi in italiano, nessun nuovo tentativo");

let n = 0;
es = await eseguiCron(CRON, env, { adesso: lunedi, pausa: async () => {}, fetchFn: async () => (++n === 1 ? new Response("x", { status: 502 }) : new Response(null, { status: 204 })) });
assert.equal(n, 2); assert.equal(es[0].esito, "ok"); ok("errore 5xx → un solo nuovo tentativo");
n = 0;
es = await eseguiCron(CRON, env, { adesso: lunedi, pausa: async () => {}, fetchFn: async () => { n++; throw new Error("rete"); } });
assert.equal(n, 2); assert.equal(es[0].esito, "errore"); ok("rete assente → 2 tentativi in tutto, poi errore loggato");

es = await eseguiCron(CRON, { GITHUB_TOKEN: "tok" }, { adesso: lunedi, fetchFn: fetchOk });
assert.equal(es[0].esito, "ok"); ok("senza database il cron funziona comunque (log saltato)");

for (let i = 0; i < MAX_LOG + 30; i++) await eseguiCron(CRON, env, { adesso: lunedi, fetchFn: fetchOk });
const cnt = db.raw.prepare("SELECT COUNT(*) c FROM scheduler_log").get().c;
assert.ok(cnt <= MAX_LOG + 1 && cnt >= MAX_LOG); ok(`scheduler_log limitato a ~${MAX_LOG} righe (${cnt})`);

// ── Route /api/unificato e handler scheduled ──
db = fakeD1(); db.raw.exec(DDL_PUNTEGGI);
db.raw.prepare("INSERT INTO punteggi (ticker,data,segnale,punti) VALUES ('AAA','2026-11-04','🟢 5/6',5)").run();
const assets = { fetch: async (req) => new URL(req.url).pathname === "/data/index.json" ? new Response(JSON.stringify(index)) : new Response("no", { status: 404 }) };
const envW = { ACCESS_CODE: "segreto", ASSETS: assets, DB: db };
const get = (e, codice = "segreto", m = "GET") => worker.fetch(new Request("https://x.dev/api/unificato", { method: m, headers: codice ? { "x-codice": codice } : {} }), e, { waitUntil() {} });
assert.equal((await get(envW, null)).status, 401); ok("/api/unificato senza login → 401 (i punteggi non sono pubblici)");
assert.equal((await get(envW, "sbagliato")).status, 401);
assert.equal((await get(envW, "segreto", "POST")).status, 405);
let res = await get(envW); let j = await res.json();
assert.equal(res.status, 200); assert.equal(j.punteggi_data, "2026-11-04"); assert.equal(j.db, true);
assert.equal(j.righe.find((x) => x.ticker === "AAA").punteggio.punti, 5); assert.equal(j.scheduler, undefined); ok("/api/unificato con login → range + punteggi, log scheduler solo agli admin");
res = await get({ ...envW, DB: undefined }); j = await res.json();
assert.equal(res.status, 200); assert.equal(j.db, false); assert.equal(j.righe[0].punteggio, null); ok("senza D1 collegato → solo range, nessun errore");
res = await get({ ...envW, ASSETS: { fetch: async () => new Response("x", { status: 500 }) } });
assert.equal(res.status, 503); ok("index.json non disponibile → 503");
res = await get({ ...envW, DB: { prepare() { throw new Error("D1 giù"); } } });
assert.equal(res.status, 502); ok("D1 in errore → 502 con messaggio");

chiamate = []; globalThis.fetch = fetchOk;
let attese = [];
await worker.scheduled({ cron: CRON }, { GITHUB_TOKEN: "t", DB: db }, { waitUntil: (p) => attese.push(p) });
await Promise.all(attese);
const oggi = new Date().getUTCDay();
assert.equal(chiamate.length, oggi >= 1 && oggi <= 5 ? 1 : 0); ok("worker.scheduled → delega a eseguiCron (rispetta il giorno)");
console.log("OK: verifica_dati");
