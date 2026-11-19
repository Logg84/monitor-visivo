/**
 * Dati riservati (database D1) e scheduler del Worker. Nessun import dal Worker principale.
 *
 * Limiti del piano Free (documentazione Cloudflare, 5/11/2026): 10 ms di CPU per richiesta e per
 * esecuzione di cron, 50 richieste in uscita, D1 5 milioni di righe lette al giorno. Quindi:
 *  - il Worker NON scrive i punteggi: li carica il repo privato con l'API REST di D1 (tabella `punteggi`);
 *  - qui si legge SOLO l'ultima data (indice su `data`), ~700 righe per richiesta;
 *  - `scheduler_log` è l'unica tabella creata e scritta dal Worker (ultime MAX_LOG righe).
 */

export const MAX_LOG = 400;

const DDL_LOG = `CREATE TABLE IF NOT EXISTS scheduler_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, quando TEXT NOT NULL, job TEXT NOT NULL, esito TEXT NOT NULL, dettaglio TEXT)`;

// ── Scheduler: UN solo cron ogni 5 minuti → workflow GitHub (workflow_dispatch) ──────────────────────
// Il piano Free ammette al massimo 5 espressioni cron: invece di una per orario, il Worker si sveglia ogni 5 minuti
// e il codice decide quali lavori della tabella PIANO sono «dovuti» in quel momento (ora UTC).
//  - Un lavoro è dovuto se l'ora del tick cade nella finestra [ora, ora + FINESTRA_MIN): se un tick salta o ritarda,
//    quello successivo lo recupera; scheduler_log (esito «ok» nella stessa finestra) impedisce il doppio lancio.
//  - Giorni: getUTCDay (0 = domenica, 1 = lunedì…); `giornoMese` (opzionale) per i lavori mensili.
//  - `attivo: false` = definito ma NON lanciato (il workflow ha ancora il suo cron su GitHub). Si passa a `true`
//    lavoro per lavoro; solo allora va tolto lo `schedule:` dal workflow, altrimenti parte due volte.
//  - Nel log finiscono solo i lanci riusciti e gli errori (non i tick a vuoto).
export const CRON_UNICO = "*/5 * * * *";
export const FINESTRA_MIN = 10;
const REPO_PUB = "Logg84/monitor-visivo", REPO_PRIV = "Logg84/monitor-trading-marco";
const LV = [1, 2, 3, 4, 5];
const pub = (id, workflow, ora, giorni, extra = {}) => ({ id, repo: REPO_PUB, workflow, ref: "main", token: "GITHUB_TOKEN", ora, giorni, attivo: true, ...extra });
const priv = (id, workflow, ora, giorni, extra = {}) => ({ id, repo: REPO_PRIV, workflow, ref: "main", token: "PRIVATE_REPO_TOKEN", ora, giorni, attivo: false, ...extra });
export const PIANO = [
  pub("bases", "bases.yml", "22:30", LV),
  // 19/11/2026: giro leggero dei prezzi di giornata (repo pubblico, 1-2 minuti, nessuno screening): site/data/prezzi_live.json.
  // 10:30 = borse europee aperte da 2 ore e mezza; 14:45 = Wall Street aperta da un quarto d'ora (ora solare). Il file vale 3 ore nel sito.
  pub("prezzi-live-1030", "prezzi_live.yml", "10:30", LV),
  pub("prezzi-live-1445", "prezzi_live.yml", "14:45", LV),
  // 16/11/2026: pilota riuscito (canary lanciato dal Worker alle 12:30:13 UTC; il cron di GitHub quel giorno non è partito,
  // lo screening delle 06:30 e gli alert delle 07:00/11:00 nemmeno, il report delle 05:00 è partito alle 13:20). Migrati
  // al Worker: canary, report quindicinale, screening e alerts. Per questi lavori lo `schedule:` va TOLTO dal workflow
  // del repo privato (resta `workflow_dispatch:`), altrimenti partono due volte.
  priv("canary-fonti", "canary_fonti.yml", "12:30", [1], { attivo: true }),
  // Orari = quelli dei cron dei workflow del repo privato (UTC); i lavori non ancora migrati restano spenti (`attivo: false`).
  priv("report-quindicinale", "report_quindicinale.yml", "05:00", [1], { attivo: true }),
  priv("digest", "digest.yml", "06:00", [6]),
  // 19/11/2026: tolto lo screening delle 06:30. Prima dell'apertura europea Yahoo non restituisce la barra del giorno prima per i
  // titoli europei (19/11 06:33: 179 su 179 ferme al giorno precedente, nemmeno il rinfresco le recupera). Si lavora solo a barra
  // chiusa: Europa alle 18:30, USA alle 22:00. Il giro delle 14:30 è stato tolto lo stesso giorno: i prezzi di giornata li danno i giri «prezzi-live».
  priv("alerts-0700", "alerts.yml", "07:00", LV, { attivo: true }),
  priv("salute", "salute.yml", "07:10", LV),
  priv("events", "events.yml", "07:30", LV),
  priv("consumo", "consumo.yml", "07:30", [1]),
  // 18/11/2026: briefing LLM per email (corpo + allegato .md) a Marco. Il workflow ha solo workflow_dispatch, nessun cron.
  priv("briefing-email", "briefing_email.yml", "08:00", LV, { attivo: true }),
  priv("braccio-destro", "braccio_destro.yml", "08:00", [1]),
  priv("backtest", "backtest.yml", "08:00", [3, 6]),
  priv("scorecard", "scorecard.yml", "09:00", [0]),
  priv("regime-sabato", "regime.yml", "09:30", [6], { attivo: true }),
  priv("registro-segnali", "registro_segnali.yml", "10:00", [0]),
  priv("alerts-1100", "alerts.yml", "11:00", LV, { attivo: true }),
  // 19/11/2026: tolto lo screening delle 14:30. Il prezzo di giornata lo danno i giri leggeri «prezzi-live» (10:30 e 14:45, repo pubblico).
  // Era 15:50: d'inverno le borse europee chiudono alle 16:30 UTC. 17:00 è dopo la chiusura tutto l'anno (con la grazia di 15 minuti).
  priv("alerts-1700", "alerts.yml", "17:00", LV, { attivo: true }),
  // 19/11/2026: screening a barre europee chiuse (borse UE chiudono alle 16:30 UTC). 90 minuti dopo gli alert delle 17:00 e 3 ore
  // prima di quelli delle 21:30. Gli USA hanno ancora la barra odierna aperta (scartata): vale la chiusura di ieri.
  priv("screening-1830", "screening.yml", "18:30", LV, { attivo: true }),
  priv("alerts-2130", "alerts.yml", "21:30", LV, { attivo: true }),
  // Era 21:45 su GitHub: spostato a 22:00 per stare a 30 minuti dagli alert delle 21:30 (stesso gruppo di concurrency).
  // Resta dopo la chiusura USA (21:00 UTC con l'ora solare): il file storico del giorno è a barre complete.
  priv("screening-2200", "screening.yml", "22:00", LV, { attivo: true }),
  // 18/11/2026: gruppo serale migrato al Worker. Il cron di GitHub li faceva partire con 3-5 ore di ritardo (snapshot «di chiusura»
  // alle 03:35-04:40 UTC) e, con lo screening ora puntuale alle 22:00, settori avrebbe condiviso l'orario con lui: GitHub tiene in
  // coda UN solo job per gruppo e scarta gli altri. Sequenza a 30 minuti (AGENTS.md, «Orari serali»): alerts 21:30 · screening 22:00
  // · settori 22:30 · strumenti 23:00 · regime 23:30 · insiders 00:00 (UTC del giorno dopo: martedì-sabato, ~26 min a corsa).
  // Nei workflow del repo privato lo `schedule:` è stato TOLTO (resta `workflow_dispatch:`), altrimenti partirebbero due volte.
  priv("settori", "settori.yml", "22:30", LV, { attivo: true }),
  priv("strumenti", "strumenti.yml", "23:00", LV, { attivo: true }),
  priv("regime", "regime.yml", "23:30", LV, { attivo: true }),
  priv("insiders", "insiders.yml", "00:00", [2, 3, 4, 5, 6], { attivo: true }),
  priv("indici-mensile", "indices.yml", "06:30", [0, 1, 2, 3, 4, 5, 6], { giornoMese: 1 }),
  priv("macro-calendar-mensile", "macro_calendar.yml", "07:00", [0, 1, 2, 3, 4, 5, 6], { giornoMese: 1 }),
];

const minutiDi = (hhmm) => { const [h, m] = String(hhmm).split(":").map(Number); return h * 60 + m; };

/** Lavori attivi dovuti all'istante `adesso` (UTC): giorno della settimana (e del mese) previsto, ora nella finestra. */
export function lavoriDovuti(adesso, piano = PIANO) {
  const min = adesso.getUTCHours() * 60 + adesso.getUTCMinutes();
  return piano.filter((l) => l.attivo && l.giorni.includes(adesso.getUTCDay())
    && (!l.giornoMese || l.giornoMese === adesso.getUTCDate())
    && min >= minutiDi(l.ora) && min < minutiDi(l.ora) + FINESTRA_MIN);
}

/** Coppie di lavori ATTIVI dello stesso repo a meno di `distanzaMin` minuti nello stesso giorno: nel gruppo di concurrency
 *  condiviso un lavoro in coda viene scartato dal successivo (AGENTS.md, «Orari serali»). Vuoto = nessun rischio. */
export function conflitti(piano = PIANO, distanzaMin = 30) {
  const att = piano.filter((l) => l.attivo), out = [];
  for (let i = 0; i < att.length; i++) for (let j = i + 1; j < att.length; j++) {
    const a = att[i], b = att[j];
    if (a.repo !== b.repo) continue;
    const comuni = a.giorni.some((g) => b.giorni.includes(g)) && (!a.giornoMese || !b.giornoMese || a.giornoMese === b.giornoMese);
    if (comuni && Math.abs(minutiDi(a.ora) - minutiDi(b.ora)) < distanzaMin) out.push([a.id, b.id]);
  }
  return out;
}

const MESSAGGI = {
  401: "token GitHub non valido",
  403: "permessi insufficienti: il token deve avere «Actions: Read and write» sul repo",
  404: "workflow o repo non trovato (controlla nome del file e accesso del token)",
  422: "il workflow non ha workflow_dispatch o il ref non esiste",
};

/** Avvia un workflow. Ritorna {ok, stato, dettaglio}. Un solo tentativo. */
export async function avviaWorkflow(env, lavoro, fetchFn = fetch) {
  const url = `https://api.github.com/repos/${lavoro.repo}/actions/workflows/${lavoro.workflow}/dispatches`;
  let r;
  try {
    r = await fetchFn(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${env[lavoro.token]}`, Accept: "application/vnd.github+json",
        "User-Agent": "basewatch-worker", "X-GitHub-Api-Version": "2022-11-28", "content-type": "application/json" },
      body: JSON.stringify({ ref: lavoro.ref }),
    });
  } catch (e) { return { ok: false, rete: true, stato: 0, dettaglio: "GitHub non raggiungibile: " + e.message }; }
  if (r.status === 204) return { ok: true, stato: 204, dettaglio: "avviato" };
  return { ok: false, stato: r.status, dettaglio: MESSAGGI[r.status] || `GitHub ha risposto ${r.status}` };
}

/** Scrive una riga nel log (ultime MAX_LOG). `quando` = istante del tick (default: adesso). */
export async function scriviLog(env, job, esito, dettaglio = "", quando = new Date()) {
  if (!env.DB) return;
  try {
    await env.DB.prepare(DDL_LOG).run();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO scheduler_log (quando, job, esito, dettaglio) VALUES (?, ?, ?, ?)")
        .bind(quando.toISOString(), job, esito, String(dettaglio).slice(0, 300)),
      env.DB.prepare(`DELETE FROM scheduler_log WHERE id <= (SELECT MAX(id) FROM scheduler_log) - ${MAX_LOG}`),
    ]);
  } catch (e) { console.log("log scheduler non scritto:", e.message); }
}

/** Il lavoro è già partito (esito «ok») in QUESTA finestra? Se il log non è leggibile: false (meglio un doppio lancio che nessuno). */
async function giaLanciato(env, l, adesso) {
  if (!env.DB) return false;
  const da = Date.UTC(adesso.getUTCFullYear(), adesso.getUTCMonth(), adesso.getUTCDate(), 0, minutiDi(l.ora));
  const inizio = new Date(da).toISOString(), fine = new Date(da + FINESTRA_MIN * 60000).toISOString();     // stessa finestra [ora, ora + FINESTRA_MIN)
  try { return Boolean(await env.DB.prepare("SELECT 1 FROM scheduler_log WHERE job=? AND esito='ok' AND quando>=? AND quando<? LIMIT 1").bind(l.id, inizio, fine).first()); }
  catch (e) { return false; }
}

/** Esegue i lavori dovuti al tick `adesso` (`cron` non influisce, vedi sotto). Ritorna la lista degli esiti (anche per i test). Nessuna riga di log per i tick a vuoto. */
export async function eseguiCron(cron, env, opz = {}) {
  const adesso = opz.adesso || new Date();
  const fetchFn = opz.fetchFn || fetch;
  const pausa = opz.pausa || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const piano = opz.piano || PIANO;
  // L'espressione cron è solo il «sveglia»: i lavori dovuti si decidono dall'ora del tick, qualunque sia l'espressione.
  // Così, se dopo una pubblicazione restasse attivo il vecchio cron (30 22 * * mon-fri), bases partirebbe comunque.
  const esiti = [];
  for (const l of lavoriDovuti(adesso, piano)) {
    if (await giaLanciato(env, l, adesso)) { esiti.push({ id: l.id, esito: "gia_eseguito" }); continue; }
    if (!env[l.token]) { esiti.push({ id: l.id, esito: "token_mancante" }); await scriviLog(env, l.id, "errore", `secret ${l.token} mancante`, adesso); continue; }
    let r = await avviaWorkflow(env, l, fetchFn);
    if (!r.ok && (r.rete || r.stato >= 500)) { await pausa(2000); r = await avviaWorkflow(env, l, fetchFn); }     // un solo nuovo tentativo
    esiti.push({ id: l.id, esito: r.ok ? "ok" : "errore", stato: r.stato, dettaglio: r.dettaglio });
    await scriviLog(env, l.id, r.ok ? "ok" : "errore", r.dettaglio, adesso);
  }
  return esiti;
}

export async function ultimiLog(db, n = 5) {
  try {
    const { results } = await db.prepare("SELECT quando, job, esito, dettaglio FROM scheduler_log ORDER BY id DESC LIMIT ?").bind(n).all();
    return results || [];
  } catch (e) { return []; }                      // tabella non ancora creata: nessun lavoro eseguito
}

// ── Punteggi: lettura dell'ultima data e unione con i range ──────────────────
/** Ultima data di punteggi e le sue righe. Se la tabella non esiste ancora: {data:null, righe:[], vuoto:true}. */
export async function leggiPunteggi(db) {
  try {
    const d = await db.prepare("SELECT MAX(data) AS d FROM punteggi").first("d");
    if (!d) return { data: null, righe: [] };
    const { results } = await db.prepare(
      "SELECT ticker, data, run_utc, segnale, punti, origine, priorita, extra FROM punteggi WHERE data = ?").bind(d).all();
    return { data: d, righe: results || [] };
  } catch (e) {
    if (/no such table/i.test(String((e && e.message) || e))) return { data: null, righe: [], vuoto: true };
    throw e;
  }
}

const num = (x) => (typeof x === "number" && Number.isFinite(x) ? x : null);

/** Stato di una base in forma compatta + posizione del prezzo nel range (0 = bottom, 1 = top). */
export function compatta(b) {
  const top = num(b.top), bottom = num(b.bottom), ultimo = num(b.ultimo);
  const pos = top !== null && bottom !== null && ultimo !== null && top > bottom ? (ultimo - bottom) / (top - bottom) : null;
  const o = { stato: b.stato, bottom, top, ultimo, pos: pos === null ? null : Math.round(pos * 1000) / 1000,
    barre: num(b.barre), ampiezza: num(b.ampiezza) };
  for (const k of ["uscito_il", "rientro_il", "inizio", "data_ultimo"]) if (b[k]) o[k] = b[k];
  if (b.prima_vista) o.prima_vista = true;
  if (b.manuale) o.manuale = true;
  return o;
}

/** Una riga per ticker: range per timeframe (da index.json, pubblico) + ultimo punteggio (da D1, riservato). */
export function unisci(index, righe) {
  const per = new Map();
  const get = (t) => { if (!per.has(t)) per.set(t, { ticker: t, basi: {}, dist_ath: null, punteggio: null }); return per.get(t); };
  for (const b of (index && index.basi) || []) {
    const [t, tf] = String(b.chiave).split("|");
    if (!t || !tf) continue;
    const r = get(t);
    r.basi[tf] = compatta(b);
    const ti = (index.titoli || {})[t]; r.dist_ath = ti && num(ti.dist_ath) !== null ? ti.dist_ath : null;
  }
  for (const p of righe || []) {
    get(p.ticker).punteggio = { segnale: p.segnale || null, punti: p.punti === null || p.punti === undefined ? null : Number(p.punti),
      origine: p.origine || null, priorita: num(p.priorita), data: p.data, extra: p.extra || null };
  }
  return [...per.values()].sort((a, b) => (a.ticker < b.ticker ? -1 : a.ticker > b.ticker ? 1 : 0));
}

// ── Pagina Screening: ultima data completa, con le colonne in `extra` ─────────
/** Corpo JSON {data, righe:[{ticker,segnale,punti,origine,priorita,extra:{…}}]}.
 * `extra` (≈0,5 MB per giorno) viene incollato come testo, MAI riletto con JSON.parse:
 * il piano Free ha 10 ms di CPU per richiesta. Se `extra` non sembra un oggetto JSON diventa null. */
export async function corpoScreening(db) {
  const p = await leggiPunteggi(db);
  if (!p.data) return JSON.stringify({ data: null, righe: [] });
  const un = (r) => {
    const x = typeof r.extra === "string" ? r.extra : "";
    const extra = x.startsWith("{") && x.endsWith("}") ? x : "null";
    return `{"ticker":${JSON.stringify(r.ticker)},"segnale":${JSON.stringify(r.segnale ?? null)},"punti":${JSON.stringify(r.punti ?? null)},` +
      `"origine":${JSON.stringify(r.origine ?? null)},"priorita":${JSON.stringify(r.priorita ?? null)},"extra":${extra}}`;
  };
  return `{"data":${JSON.stringify(p.data)},"righe":[${p.righe.map(un).join(",")}]}`;
}

// ── Pagine «istantanea» (JSON preparato dal repo privato, tabella `pagine`) ───
export const CHIAVE_PAGINA = /^[a-z0-9_-]{1,40}$/;

/** {"aggiornato":…, "dati":<JSON>} oppure null se la pagina non è ancora stata caricata.
 * Le parti (≤ 40.000 caratteri ciascuna) si rimettono insieme come TESTO: nessun JSON.parse (CPU Free = 10 ms). */
export async function corpoPagina(db, chiave) {
  let results;
  try {
    ({ results } = await db.prepare("SELECT aggiornato, json FROM pagine WHERE chiave = ? ORDER BY parte").bind(chiave).all());
  } catch (e) {
    if (/no such table/i.test(String((e && e.message) || e))) return null;
    throw e;
  }
  if (!results || !results.length) return null;
  const dati = results.map((r) => r.json).join("");
  if (!(dati.startsWith("{") && dati.endsWith("}"))) return null;
  return `{"aggiornato":${JSON.stringify(results[0].aggiornato)},"dati":${dati}}`;
}
