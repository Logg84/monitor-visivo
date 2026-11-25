// Test senza rete di src/dati.js e delle route /api/unificato e scheduled, con SQLite reale (stesso motore di D1).
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import worker from "../src/worker.js";
import { ENV_ACCESSO, accesso } from "./_accesso.mjs";
import * as ut from "../src/utenti.js";
import { eseguiCron, leggiPunteggi, ultimiLog, unisci, compatta, MAX_LOG, CRON_UNICO, PIANO, FINESTRA_MIN, lavoriDovuti, conflitti } from "../src/dati.js";

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

// ── Scheduler (un solo cron ogni 5 minuti, lavori dovuti per ora UTC) ──
const CRON = CRON_UNICO;
const lun = (k, hh = 22, mm = 30) => new Date(Date.UTC(2026, 10, 2 + 7 * k, hh, mm));      // lunedì 2/11/2026 + k settimane (UTC)
let chiamate = [];
const fetchOk = async (url, init) => { chiamate.push({ url, init }); return new Response(null, { status: 204 }); };
// La meccanica dello scheduler (finestra, log, errori, ripetizioni) si prova con un piano di un solo lavoro (bases, 22:30):
// dal 18/11/2026 alle 22:30 parte anche settori, che qui non c'entra.
const SB = PIANO.filter((l) => l.id === "bases");
db = fakeD1();
let env = { DB: db, GITHUB_TOKEN: "tok", PRIVATE_REPO_TOKEN: "priv" };
let es = await eseguiCron(CRON, env, { piano: SB, adesso: lun(0), fetchFn: fetchOk });
assert.equal(es.length, 1); assert.equal(es[0].id, "bases"); assert.equal(es[0].esito, "ok"); assert.equal(chiamate.length, 1);
assert.equal(chiamate[0].url, "https://api.github.com/repos/Logg84/monitor-visivo/actions/workflows/bases.yml/dispatches");
assert.equal(chiamate[0].init.method, "POST"); assert.equal(chiamate[0].init.headers.Authorization, "Bearer tok");
assert.deepEqual(JSON.parse(chiamate[0].init.body), { ref: "main" }); ok("lunedì 22:30 → workflow_dispatch di bases.yml su main");
assert.equal((await ultimiLog(db))[0].esito, "ok"); ok("esito scritto in scheduler_log (tabella creata al volo)");

const righe = () => db.raw.prepare("SELECT COUNT(*) c FROM scheduler_log").get().c;
chiamate = []; let prima = righe();
es = await eseguiCron(CRON, env, { piano: SB, adesso: lun(0, 22, 35), fetchFn: fetchOk });
assert.deepEqual(es, [{ id: "bases", esito: "gia_eseguito" }]); assert.equal(chiamate.length, 0); assert.equal(righe(), prima); ok("tick successivo nella stessa finestra → nessun doppio lancio, nessuna riga di log");
es = await eseguiCron(CRON, env, { piano: SB, adesso: lun(0, 22, 50), fetchFn: fetchOk });
assert.deepEqual(es, []); assert.equal(chiamate.length, 0); assert.equal(righe(), prima); ok("tick a vuoto → nessuna chiamata e NESSUNA riga di log (il log non si riempie ogni 5 minuti)");
es = await eseguiCron(CRON, env, { piano: SB, adesso: new Date("2026-11-01T22:30:00Z"), fetchFn: fetchOk });
assert.deepEqual(es, []); assert.equal(chiamate.length, 0); ok("domenica → nessuna chiamata (filtro giorno nel codice)");

es = await eseguiCron("30 22 * * mon-fri", env, { piano: SB, adesso: lun(900), fetchFn: fetchOk });
assert.deepEqual(es.map((x) => [x.id, x.esito]), [["bases", "ok"]]);
ok("il vecchio cron delle 22:30, se restasse configurato dopo la pubblicazione, lancia comunque bases (conta l'ora del tick, non l'espressione)");
chiamate = []; es = await eseguiCron(undefined, env, { piano: SB, adesso: lun(1, 3, 0), fetchFn: fetchOk });
assert.deepEqual(es, []); assert.equal(chiamate.length, 0); ok("senza espressione (prova locale /__scheduled) → decide solo l'ora; alle 03:00 niente da lanciare");

es = await eseguiCron(CRON, { DB: db }, { piano: SB, adesso: lun(1), fetchFn: fetchOk });
assert.equal(es[0].esito, "token_mancante"); assert.equal(chiamate.length, 0); ok("token mancante → errore chiaro, nessuna chiamata");

for (const [st, testo] of [[403, /Actions: Read and write/], [404, /non trovato/], [401, /non valido/], [422, /workflow_dispatch/]]) {
  es = await eseguiCron(CRON, env, { piano: SB, adesso: lun(2), fetchFn: async () => new Response("x", { status: st }) });
  assert.equal(es[0].esito, "errore"); assert.match(es[0].dettaglio, testo);
}
ok("errori GitHub 401/403/404/422 → messaggi in italiano, nessun nuovo tentativo");

let n = 0;
es = await eseguiCron(CRON, env, { piano: SB, adesso: lun(3), pausa: async () => {}, fetchFn: async () => (++n === 1 ? new Response("x", { status: 502 }) : new Response(null, { status: 204 })) });
assert.equal(n, 2); assert.equal(es[0].esito, "ok"); ok("errore 5xx → un solo nuovo tentativo");
n = 0;
es = await eseguiCron(CRON, env, { piano: SB, adesso: lun(4), pausa: async () => {}, fetchFn: async () => { n++; throw new Error("rete"); } });
assert.equal(n, 2); assert.equal(es[0].esito, "errore"); ok("rete assente → 2 tentativi in tutto, poi errore loggato");

// un lancio fallito al primo tick viene ritentato dal tick dopo (stessa finestra), poi non più
es = await eseguiCron(CRON, env, { piano: SB, adesso: lun(5, 22, 30), fetchFn: async () => new Response("x", { status: 403 }) }); assert.equal(es[0].esito, "errore");
chiamate = []; es = await eseguiCron(CRON, env, { piano: SB, adesso: lun(5, 22, 35), fetchFn: fetchOk }); assert.equal(es[0].esito, "ok"); assert.equal(chiamate.length, 1);
es = await eseguiCron(CRON, env, { piano: SB, adesso: lun(5, 22, 35), fetchFn: fetchOk }); assert.equal(es[0].esito, "gia_eseguito");
es = await eseguiCron(CRON, env, { piano: SB, adesso: lun(5, 22, 40), fetchFn: fetchOk }); assert.deepEqual(es, []);
ok("tick saltato o fallito → recuperato dal tick successivo nella finestra di 10 minuti, una sola volta");

es = await eseguiCron(CRON, { GITHUB_TOKEN: "tok" }, { piano: SB, adesso: lun(6), fetchFn: fetchOk });
assert.equal(es[0].esito, "ok"); ok("senza database il cron funziona comunque (log saltato)");

for (let i = 0; i < MAX_LOG + 30; i++) await eseguiCron(CRON, env, { piano: SB, adesso: lun(10 + i), fetchFn: fetchOk });
const cnt = righe();
assert.ok(cnt <= MAX_LOG + 1 && cnt >= MAX_LOG); ok(`scheduler_log limitato a ~${MAX_LOG} righe (${cnt})`);

// ── Piano: lavori migrati (canary, report, screening, alerts); gli altri del repo privato restano spenti ──
const GIORNO = 86400000, sab = (k, hh, mm) => new Date(lun(k, hh, mm).getTime() + 5 * GIORNO);
const lanciati = async (d) => { db = fakeD1(); env = { DB: db, GITHUB_TOKEN: "tok", PRIVATE_REPO_TOKEN: "priv" }; chiamate = []; return (await eseguiCron(CRON, env, { adesso: d, fetchFn: fetchOk })).map((x) => x.id); };
db = fakeD1(); env = { DB: db, GITHUB_TOKEN: "tok", PRIVATE_REPO_TOKEN: "priv" }; chiamate = [];
es = await eseguiCron(CRON, env, { adesso: lun(7, 12, 30), fetchFn: fetchOk });
assert.deepEqual(es.map((x) => [x.id, x.esito]), [["canary-fonti", "ok"]]); assert.equal(chiamate.length, 1);
assert.equal(chiamate[0].url, "https://api.github.com/repos/Logg84/monitor-trading-marco/actions/workflows/canary_fonti.yml/dispatches");
assert.equal(chiamate[0].init.headers.Authorization, "Bearer priv"); assert.deepEqual(JSON.parse(chiamate[0].init.body), { ref: "main" });
ok("canary: lunedì 12:30 → canary_fonti.yml sul repo privato con PRIVATE_REPO_TOKEN");
assert.deepEqual(await lanciati(new Date(lun(7, 12, 30).getTime() + GIORNO)), []); ok("canary: martedì 12:30 → niente (solo il lunedì)");
const MIGRATI = [[5, 0, "report-quindicinale", "report_quindicinale.yml"], [7, 0, "alerts-0700", "alerts.yml"],
  [11, 0, "alerts-1100", "alerts.yml"], [17, 0, "alerts-1700", "alerts.yml"], [18, 30, "screening-1830", "screening.yml"], [21, 30, "alerts-2130", "alerts.yml"], [22, 0, "screening-2200", "screening.yml"],
  [23, 0, "strumenti", "strumenti.yml"], [23, 30, "regime", "regime.yml"]];
for (const [hh, mm, idl, wf] of MIGRATI) {
  assert.deepEqual(await lanciati(lun(8, hh, mm)), [idl], `${hh}:${mm} doveva lanciare ${idl}`);
  assert.match(chiamate.at(-1).url, new RegExp(`monitor-trading-marco/actions/workflows/${wf.replace(".", "\\.")}/dispatches$`));
}
ok("migrati: report 05:00 (lun), screening 18:30/22:00, alerts 07:00/11:00/17:00/21:30 → workflow giusto sul repo privato");
for (const [hh, mm, idl] of [[10, 30, "prezzi-live-1030"], [14, 45, "prezzi-live-1445"]]) {
  assert.deepEqual(await lanciati(lun(8, hh, mm)), [idl]);
  assert.equal(chiamate.at(-1).url, "https://api.github.com/repos/Logg84/monitor-visivo/actions/workflows/prezzi_live.yml/dispatches");
  assert.equal(chiamate.at(-1).init.headers.Authorization, "Bearer tok");
}
assert.deepEqual(await lanciati(sab(8, 10, 30)), []); assert.deepEqual(await lanciati(sab(8, 14, 45)), []);
ok("prezzi live: lun-ven 10:30 e 14:45 → prezzi_live.yml sul repo pubblico (token del Worker), sabato niente");
assert.deepEqual(await lanciati(lun(8, 14, 30)), []); ok("14:30: nessuno screening (i prezzi di giornata li danno i giri prezzi-live)");
assert.deepEqual(await lanciati(lun(8, 6, 30)), []); ok("lunedì 06:30: lo screening del mattino non parte più (dati europei non affidabili prima dell'apertura)");
assert.deepEqual(await lanciati(sab(8, 6, 30)), []); assert.deepEqual(await lanciati(sab(8, 7, 0)), []); assert.deepEqual(await lanciati(sab(8, 5, 0)), []); ok("sabato: screening e alerts (lun-ven) e report (lun) non partono");
assert.deepEqual(await lanciati(new Date(lun(8, 5, 0).getTime() + GIORNO)), []); ok("report quindicinale: solo il lunedì (martedì 05:00 niente)");
assert.deepEqual(await lanciati(lun(8, 21, 45)), []); ok("21:45: nessun lancio (lo screening serale è stato spostato alle 22:00)");
for (const [hh, mm] of [[7, 10], [7, 30], [9, 0]]) {
  assert.ok(!(await lanciati(lun(8, hh, mm))).length, `${hh}:${mm} non doveva lanciare lavori`);
}
ok("lavori non ancora migrati (salute, events, consumo, braccio-destro, scorecard…): spenti");
assert.deepEqual(await lanciati(lun(8, 8, 0)), ["briefing-email"]);
assert.match(chiamate.at(-1).url, /monitor-trading-marco\/actions\/workflows\/briefing_email\.yml\/dispatches$/);
assert.deepEqual(await lanciati(sab(8, 8, 0)), []); ok("briefing-email: lun-ven 08:00 UTC → briefing_email.yml sul repo privato; sabato no");
assert.deepEqual(await lanciati(lun(8, 22, 30)), ["bases", "settori"]);
assert.match(chiamate.at(-1).url, /monitor-trading-marco\/actions\/workflows\/settori\.yml\/dispatches$/);
ok("22:30: bases (repo pubblico) e settori (repo privato), 30 minuti dopo lo screening delle 22:00");
const mar = (k, hh, mm) => new Date(lun(k, hh, mm).getTime() + GIORNO);
assert.deepEqual(await lanciati(mar(8, 0, 0)), ["insiders"]); assert.match(chiamate.at(-1).url, /monitor-trading-marco\/actions\/workflows\/insiders\.yml\/dispatches$/);
assert.deepEqual(await lanciati(sab(8, 0, 0)), ["insiders"]); assert.deepEqual(await lanciati(lun(8, 0, 0)), []); assert.deepEqual(await lanciati(new Date(lun(8, 0, 0).getTime() + 6 * GIORNO)), []);
ok("insiders: 00:00 UTC di martedì-sabato (cioè dopo la seduta di lunedì-venerdì); lunedì e domenica a mezzanotte no");
assert.deepEqual(await lanciati(sab(8, 9, 30)), ["regime-sabato"]); assert.match(chiamate.at(-1).url, /monitor-trading-marco\/actions\/workflows\/regime\.yml\/dispatches$/);
assert.deepEqual(await lanciati(lun(8, 9, 30)), []); ok("regime del sabato: solo sabato 09:30 UTC");
const tutti = PIANO.map((l) => ({ ...l, attivo: true }));
es = await eseguiCron(CRON, env, { adesso: lun(9, 17, 0), fetchFn: fetchOk, piano: tutti });
assert.deepEqual(es.map((x) => x.id), ["alerts-1700"]); assert.match(chiamate.at(-1).url, /monitor-trading-marco\/actions\/workflows\/alerts\.yml\/dispatches$/); ok("acceso il flag, lo stesso orario lancia il workflow giusto (alerts 17:00)");

// ── Finestra, giorni, mese ──
const id = (d, p) => lavoriDovuti(d, p).map((x) => x.id);
assert.deepEqual(id(lun(7, 12, 29)), []); assert.deepEqual(id(lun(7, 12, 30)), ["canary-fonti"]); assert.deepEqual(id(lun(7, 12, 35)), ["canary-fonti"]); assert.deepEqual(id(lun(7, 12, 40)), []);
ok(`finestra di ${FINESTRA_MIN} minuti: [ora, ora+${FINESTRA_MIN}) (12:29 no, 12:30 sì, 12:35 sì, 12:40 no)`);
const mensile = [{ id: "m", attivo: true, ora: "06:30", giorni: [0, 1, 2, 3, 4, 5, 6], giornoMese: 1 }];
assert.deepEqual(id(new Date("2026-12-01T06:30:00Z"), mensile), ["m"]); assert.deepEqual(id(new Date("2026-12-02T06:30:00Z"), mensile), []); ok("lavoro mensile: solo il giorno del mese indicato");
assert.deepEqual(id(new Date("2026-11-03T23:35:00Z"), tutti), ["regime"]); ok("23:35 cade ancora nella finestra del lavoro delle 23:30 (regime)");
for (const l of PIANO) {
  assert.match(l.ora, /^([01]\d|2[0-3]):[0-5][05]$/, `${l.id}: ora non multipla di 5 minuti`);
  assert.ok(l.giorni.length && l.giorni.every((g) => Number.isInteger(g) && g >= 0 && g <= 6), `${l.id}: giorni non validi`);
  assert.ok(l.repo && l.workflow.endsWith(".yml") && ["GITHUB_TOKEN", "PRIVATE_REPO_TOKEN"].includes(l.token), `${l.id}: voce incompleta`);
}
assert.equal(new Set(PIANO.map((l) => l.id)).size, PIANO.length); ok("PIANO: id unici, orari multipli di 5 minuti (il tick li raggiunge), giorni 0-6, repo/workflow/token presenti");

// ── Spaziatura nel gruppo di concurrency ──
assert.deepEqual(conflitti(PIANO), []); ok("lavori attivi: nessuna coppia dello stesso repo a meno di 30 minuti");
const cf = conflitti(tutti).map((c) => c.join("+"));
assert.ok(cf.includes("alerts-0700+salute") && cf.includes("salute+events")); ok(`guardia della spaziatura: con tutti i lavori accesi segnala ${cf.length} coppie sotto i 30 minuti (es. alerts-0700+salute) da sfalsare PRIMA di migrarli`);

// ── Coerenza con wrangler.jsonc ──
const wr = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8").replace(/^\s*\/\/.*$/gm, "");
assert.deepEqual(JSON.parse(wr.replace(/,(\s*[}\]])/g, "$1")).triggers.crons, [CRON_UNICO]); ok("wrangler.jsonc: unico cron = CRON_UNICO");

// ── Route /api/unificato e handler scheduled ──
db = fakeD1(); db.raw.exec(DDL_PUNTEGGI);
db.raw.prepare("INSERT INTO punteggi (ticker,data,segnale,punti) VALUES ('AAA','2026-11-04','🟢 5/6',5)").run();
const assets = { fetch: async (req) => new URL(req.url).pathname === "/data/index.json" ? new Response(JSON.stringify(index)) : new Response("no", { status: 404 }) };
const envW = { ...ENV_ACCESSO, ASSETS: assets, DB: db };
const get = async (e, utente = "admin@x.it", m = "GET") => worker.fetch(new Request("https://x.dev/api/unificato", { method: m, headers: await accesso(utente) }), e, { waitUntil() {} });
assert.equal((await get(envW, null)).status, 401); ok("/api/unificato senza login → 401 (i punteggi non sono pubblici)");
assert.equal((await get(envW, "intruso@x.it")).status, 403); ok("/api/unificato: chi ha fatto il login ma non è abilitato → 403");
assert.equal((await get(envW, "admin@x.it", "POST")).status, 405);
let res = await get(envW); let j = await res.json();
assert.equal(res.status, 200); assert.equal(j.punteggi_data, "2026-11-04"); assert.equal(j.db, true);
assert.equal(j.righe.find((x) => x.ticker === "AAA").punteggio.punti, 5); assert.ok(Array.isArray(j.scheduler)); ok("/api/unificato con login da amministratore → range + punteggi + log scheduler");
await ut.richiedi(db, { email: "u@x.it", nome: "Utente Prova" }); await ut.approva(db, "u@x.it");
const ju = await (await get(envW, "u@x.it")).json(); assert.equal(ju.punteggi_data, "2026-11-04"); assert.equal(ju.scheduler, undefined); ok("utente abilitato non amministratore → punteggi ma niente log dello scheduler");
res = await get({ ...envW, DB: undefined }); j = await res.json();
assert.equal(res.status, 200); assert.equal(j.db, false); assert.equal(j.righe[0].punteggio, null); ok("senza D1 collegato → solo range, nessun errore");
res = await get({ ...envW, ASSETS: { fetch: async () => new Response("x", { status: 500 }) } });
assert.equal(res.status, 503); ok("index.json non disponibile → 503");
res = await get({ ...envW, DB: { prepare() { throw new Error("D1 giù"); } } });
assert.equal(res.status, 502); ok("D1 in errore → 502 con messaggio");

chiamate = []; globalThis.fetch = fetchOk;
let attese = [];
const ctrl = (t) => ({ cron: CRON, scheduledTime: t.getTime() });
await worker.scheduled(ctrl(lun(30)), { GITHUB_TOKEN: "t", DB: db }, { waitUntil: (p) => attese.push(p) });
await worker.scheduled(ctrl(new Date("2026-11-01T22:30:00Z")), { GITHUB_TOKEN: "t", DB: db }, { waitUntil: (p) => attese.push(p) });
await Promise.all(attese);
assert.equal(chiamate.length, 1); ok("worker.scheduled → usa scheduledTime del tick: lunedì 22:30 lancia bases, domenica no");
// ── /api/screening ──
db = fakeD1(); db.raw.exec(DDL_PUNTEGGI);
const insx = db.raw.prepare("INSERT INTO punteggi (ticker,data,segnale,punti,priorita,extra) VALUES (?,?,?,?,?,?)");
insx.run("AAA", "2026-11-04", "🟢 5/6", 5, 100, '{"Prezzo":1.5,"Trend":"G↗ S↘","Squeeze":false}');
insx.run("BBB", "2026-11-04", "—", 1, null, null);
insx.run("CCC", "2026-11-04", "x", 2, 1, '"</script>"');            // extra non-oggetto → null
insx.run("OLD", "2026-11-03", "x", 2, 1, '{"Prezzo":9}');
const envS = { ...ENV_ACCESSO, ASSETS: assets, DB: db };
const getS = async (e, utente = "admin@x.it", m = "GET") => worker.fetch(new Request("https://x.dev/api/screening", { method: m, headers: await accesso(utente) }), e, { waitUntil() {} });
assert.equal((await getS(envS, null)).status, 401); ok("/api/screening senza login → 401");
assert.equal((await getS(envS, "admin@x.it", "POST")).status, 405);
assert.equal((await getS({ ...envS, DB: undefined })).status, 503); ok("senza database → 503");
res = await getS(envS); j = await res.json();
assert.equal(res.status, 200); assert.equal(j.data, "2026-11-04"); assert.equal(j.righe.length, 3);
assert.deepEqual(j.righe.find((x) => x.ticker === "AAA").extra, { Prezzo: 1.5, Trend: "G↗ S↘", Squeeze: false });
assert.equal(j.righe.find((x) => x.ticker === "BBB").extra, null); assert.equal(j.righe.find((x) => x.ticker === "CCC").extra, null); ok("/api/screening: ultima data, extra incollato come oggetto, extra non valido → null");
assert.equal(res.headers.get("cache-control"), "no-store");
db = fakeD1(); res = await getS({ ...envS, DB: db }); j = await res.json();
assert.deepEqual(j, { data: null, righe: [] }); ok("tabella assente → risposta vuota, non errore");
// carico realistico: 700 righe da 0,75 KB → tempo del solo codice
db = fakeD1(); db.raw.exec(DDL_PUNTEGGI);
const big = JSON.stringify(Object.fromEntries(Array.from({ length: 45 }, (_, i) => ["Col" + i, i % 3 ? i * 1.2345 : "testo " + i])));
const insBig = db.raw.prepare("INSERT INTO punteggi (ticker,data,segnale,punti,priorita,extra) VALUES (?,?,?,?,?,?)");
db.raw.exec("BEGIN"); for (let i = 0; i < 700; i++) insBig.run("T" + i, "2026-11-04", "x", 1, 1, big); db.raw.exec("COMMIT");
const t0 = performance.now(); const rb = await getS({ ...envS, DB: db }); const txt = await rb.text(); const ms = performance.now() - t0;
assert.equal(JSON.parse(txt).righe.length, 700); ok(`700 righe (${(txt.length / 1e6).toFixed(2)} MB): ${ms.toFixed(0)} ms in Node (inclusa la query SQLite)`);
// ── /api/pagina/<chiave> ──
db = fakeD1();
const getP = async (e, chiave, utente = "admin@x.it", m = "GET") => worker.fetch(new Request("https://x.dev/api/pagina/" + chiave, { method: m, headers: await accesso(utente) }), e, { waitUntil() {} });
const envP = { ...ENV_ACCESSO, ASSETS: assets, DB: db };
assert.equal((await getP(envP, "macro", null)).status, 401); ok("/api/pagina senza login → 401");
assert.equal((await getP(envP, "macro", "admin@x.it", "POST")).status, 405);
assert.equal((await getP(envP, "UPPER")).status, 400); assert.equal((await getP(envP, "a%20b")).status, 400); ok("chiave non valida → 400");
assert.equal((await getP({ ...envP, DB: undefined }, "macro")).status, 503);
assert.equal((await getP(envP, "macro")).status, 404); ok("tabella assente / pagina non caricata → 404");
db.raw.exec("CREATE TABLE pagine (chiave TEXT NOT NULL, parte INTEGER NOT NULL, aggiornato TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY (chiave, parte))");
assert.equal((await getP(envP, "macro")).status, 404);
const full = JSON.stringify({ regime: "Espansione", lista: Array.from({ length: 50 }, (_, i) => ({ i, t: "x".repeat(30) })) });
const insp = db.raw.prepare("INSERT INTO pagine VALUES (?,?,?,?)");
[full.slice(0, 700), full.slice(700, 1400), full.slice(1400)].forEach((p, n) => insp.run("macro", n, "2026-11-05T21:00:00+00:00", p));
insp.run("macro", 3, "2026-11-04T00:00:00+00:00", "ZZZ");                 // parte rimasta: ordinata per parte
db.raw.prepare("DELETE FROM pagine WHERE parte = 3").run();
res = await getP(envP, "macro"); j = await res.json();
assert.equal(res.status, 200); assert.equal(j.aggiornato, "2026-11-05T21:00:00+00:00"); assert.deepEqual(j.dati, JSON.parse(full)); ok("parti rimesse insieme nell'ordine giusto → JSON identico");
insp.run("rotta", 0, "x", '{"a":'); assert.equal((await getP(envP, "rotta")).status, 404); ok("JSON troncato non viene servito");
console.log("OK: verifica_dati");
