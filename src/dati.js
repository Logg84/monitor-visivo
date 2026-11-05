/**
 * Dati riservati (database D1) e scheduler del Worker. Nessun import dal Worker principale.
 *
 * Limiti del piano Free (documentazione Cloudflare, 5/11/2026): 10 ms di CPU per richiesta e per
 * esecuzione di cron, 50 richieste in uscita, D1 5 milioni di righe lette al giorno. Quindi:
 *  - il Worker NON scrive i punteggi: li carica il repo privato con l'API REST di D1 (tabella `punteggi`);
 *  - qui si legge SOLO l'ultima data (indice su `data`), ~700 righe per richiesta;
 *  - `scheduler_log` è l'unica tabella creata e scritta dal Worker (ultime 200 righe).
 */

export const MAX_LOG = 200;

const DDL_LOG = `CREATE TABLE IF NOT EXISTS scheduler_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, quando TEXT NOT NULL, job TEXT NOT NULL, esito TEXT NOT NULL, dettaglio TEXT)`;

// ── Scheduler: cron → workflow GitHub (workflow_dispatch) ────────────────────
// ATTENZIONE: nel cron di Cloudflare i giorni vanno da 1 = DOMENICA a 7 = sabato (non come in GitHub).
// Per questo si usano i nomi nel cron e si filtra il giorno ANCHE nel codice (getUTCDay: 0 = domenica).
export const PIANO = {
  "30 22 * * mon-fri": [
    { id: "bases", repo: "Logg84/monitor-visivo", workflow: "bases.yml", ref: "main", token: "GITHUB_TOKEN", giorni: [1, 2, 3, 4, 5] },
  ],
};

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

export async function scriviLog(env, job, esito, dettaglio = "") {
  if (!env.DB) return;
  try {
    await env.DB.prepare(DDL_LOG).run();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO scheduler_log (quando, job, esito, dettaglio) VALUES (?, ?, ?, ?)")
        .bind(new Date().toISOString(), job, esito, String(dettaglio).slice(0, 300)),
      env.DB.prepare(`DELETE FROM scheduler_log WHERE id <= (SELECT MAX(id) FROM scheduler_log) - ${MAX_LOG}`),
    ]);
  } catch (e) { console.log("log scheduler non scritto:", e.message); }
}

/** Esegue i lavori del cron `cron`. Ritorna la lista degli esiti (anche per i test). */
export async function eseguiCron(cron, env, opz = {}) {
  const adesso = opz.adesso || new Date();
  const fetchFn = opz.fetchFn || fetch;
  const pausa = opz.pausa || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const chiave = String(cron || "").trim().toLowerCase();
  const lavori = PIANO[chiave] || (cron ? [] : Object.values(PIANO).flat());
  if (!lavori.length) { await scriviLog(env, "cron", "sconosciuto", `espressione non prevista: ${cron}`); return [{ id: "cron", esito: "sconosciuto" }]; }
  const esiti = [];
  for (const l of lavori) {
    if (!l.giorni.includes(adesso.getUTCDay())) { esiti.push({ id: l.id, esito: "saltato" }); await scriviLog(env, l.id, "saltato", "giorno non previsto"); continue; }
    if (!env[l.token]) { esiti.push({ id: l.id, esito: "token_mancante" }); await scriviLog(env, l.id, "errore", `secret ${l.token} mancante`); continue; }
    let r = await avviaWorkflow(env, l, fetchFn);
    if (!r.ok && (r.rete || r.stato >= 500)) { await pausa(2000); r = await avviaWorkflow(env, l, fetchFn); }     // un solo nuovo tentativo
    esiti.push({ id: l.id, esito: r.ok ? "ok" : "errore", stato: r.stato, dettaglio: r.dettaglio });
    await scriviLog(env, l.id, r.ok ? "ok" : "errore", r.dettaglio);
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
