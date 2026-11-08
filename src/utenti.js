// Utenti del portale: richieste di accesso, approvazione (anche su Cloudflare Access), profilo e canale degli alert.
// Tabelle D1 create al primo uso. L'amministratore (ADMIN_EMAILS) non ha riga: usa i file storici (uid vuoto).

const EMAIL = /^[^\s@<>"',;]{1,64}@[^\s@<>"',;]{1,190}\.[^\s@<>"',;]{2,24}$/;
export const CANALI = ["telegram", "email", "entrambi", "nessuno"];
const MAX_ATTESA = 40, MAX_AL_GIORNO = 15;

const pulisci = (s, n) => String(s ?? "").replace(/[\u0000-\u001f<>]/g, " ").trim().slice(0, n);
export const emailOk = (e) => typeof e === "string" && e.length <= 254 && EMAIL.test(e.trim());
const norm = (e) => String(e || "").trim().toLowerCase();

let pronto = false;
export async function schema(db) {
  if (pronto) return;
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS utenti (email TEXT PRIMARY KEY, uid TEXT NOT NULL UNIQUE, nome TEXT, canale TEXT NOT NULL DEFAULT 'telegram', telegram_chat_id TEXT, email_alert TEXT, creato TEXT NOT NULL, attivo INTEGER NOT NULL DEFAULT 1)"),
    db.prepare("CREATE TABLE IF NOT EXISTS richieste (email TEXT PRIMARY KEY, nome TEXT, messaggio TEXT, creato TEXT NOT NULL, stato TEXT NOT NULL DEFAULT 'attesa')"),
  ]);
  pronto = true;
}
export const _azzeraSchema = () => { pronto = false; };

export function creaUid(nome, email, esistenti) {
  let base = pulisci(nome, 40).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (base.length < 2) base = norm(email).split("@")[0].replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (base.length < 2) base = "utente";
  base = base.slice(0, 30);
  let uid = base, n = 2;
  while (esistenti.has(uid) || uid === "default") uid = `${base}-${n++}`;
  return uid;
}

/** Richiesta pubblica. Risposta sempre generica per non rivelare chi è già iscritto. */
export async function richiedi(db, d, ora = new Date()) {
  await schema(db);
  if (d && d.sito) return { ok: true };                       // campo-trappola per i bot
  const email = norm(d && d.email);
  if (!emailOk(email)) return { ok: false, stato: 400, errore: "Inserisci un'email valida." };
  const nome = pulisci(d.nome, 80), msg = pulisci(d.messaggio, 300);
  if (nome.length < 2) return { ok: false, stato: 400, errore: "Indica nome e cognome." };
  if ((await db.prepare("SELECT 1 FROM utenti WHERE email=?").bind(email).first())) return { ok: true, esistente: true };
  const giorno = ora.toISOString().slice(0, 10);
  const c = await db.prepare("SELECT COUNT(*) n FROM richieste WHERE stato='attesa'").first();
  const g = await db.prepare("SELECT COUNT(*) n FROM richieste WHERE creato >= ?").bind(giorno).first();
  if ((c && c.n >= MAX_ATTESA) || (g && g.n >= MAX_AL_GIORNO)) return { ok: false, stato: 429, errore: "Troppe richieste: riprova domani o scrivi direttamente al responsabile." };
  const gia = await db.prepare("SELECT stato FROM richieste WHERE email=?").bind(email).first();
  if (gia && gia.stato === "rifiutata") return { ok: true };   // nessuna nuova notifica per richieste già rifiutate
  await db.prepare("INSERT INTO richieste (email,nome,messaggio,creato,stato) VALUES (?,?,?,?, 'attesa') ON CONFLICT(email) DO UPDATE SET nome=excluded.nome, messaggio=excluded.messaggio")
    .bind(email, nome, msg, ora.toISOString()).run();
  return { ok: true, nuova: !gia, email, nome };
}

/** Invia un messaggio a Telegram. Ritorna {ok, errore}: l'errore è la spiegazione di Telegram (es. «chat not found»). */
export async function inviaTelegram(env, testo, fetchFn = fetch) {
  if (!env.TELEGRAM_BOT_TOKEN) return { ok: false, errore: "Manca il secret TELEGRAM_BOT_TOKEN nel Worker." };
  if (!env.TELEGRAM_CHAT_ID) return { ok: false, errore: "Manca il secret TELEGRAM_CHAT_ID nel Worker." };
  try {
    const r = await fetchFn(`https://api.telegram.org/bot${String(env.TELEGRAM_BOT_TOKEN).trim()}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: String(env.TELEGRAM_CHAT_ID).trim(), text: testo, disable_web_page_preview: true }) });
    if (r.ok) return { ok: true };
    const j = await r.json().catch(() => ({}));
    return { ok: false, errore: `Telegram risponde ${r.status}: ${j.description || "errore sconosciuto"}` };
  } catch (e) { return { ok: false, errore: "Telegram non raggiungibile dal Worker." }; }
}
export async function notificaTelegram(env, testo, fetchFn = fetch) { return (await inviaTelegram(env, testo, fetchFn)).ok; }

/** Stato di un'email già autenticata da Access: abilitato | disattivato | attesa | rifiutata | nuovo. Non crea nulla. */
export async function statoAccesso(db, email) {
  await schema(db);
  const e = norm(email);
  const r = await db.prepare("SELECT attivo FROM utenti WHERE email=?").bind(e).first();
  if (r) return { stato: r.attivo ? "abilitato" : "disattivato" };
  const q = await db.prepare("SELECT stato FROM richieste WHERE email=?").bind(e).first();
  return { stato: q ? q.stato : "nuovo" };
}

export async function elenco(db) {
  await schema(db);
  const r = await db.prepare("SELECT email,nome,messaggio,creato,stato FROM richieste ORDER BY creato DESC LIMIT 100").all();
  const u = await db.prepare("SELECT email,uid,nome,canale,telegram_chat_id,email_alert,creato,attivo FROM utenti ORDER BY creato").all();
  return { richieste: r.results || [], utenti: u.results || [] };
}

// ── Cloudflare Access: elenco delle email ammesse nella regola ────────────────────────────────────────
// Servono solo CF_ACCOUNT_ID e CF_ACCESS_TOKEN: la regola con le email si trova da sola (ACCESS_POLICY_ID / ACCESS_APP_ID la forzano).
const API = "https://api.cloudflare.com/client/v4";
export const accessConfigurato = (env) => Boolean(env.CF_ACCOUNT_ID && env.CF_ACCESS_TOKEN);
/** Con ACCESSO_APERTO=1 la regola di Access lascia entrare chiunque verifichi la propria email: è il portale a decidere chi è abilitato. */
export const accessAperto = (env) => String(env.ACCESSO_APERTO || "") === "1";
const intest = (env) => ({ authorization: `Bearer ${env.CF_ACCESS_TOKEN}`, "content-type": "application/json" });
async function cf(env, percorso, fetchFn, init = {}) {
  const r = await fetchFn(`${API}/accounts/${env.CF_ACCOUNT_ID}/access/${percorso}`, { ...init, headers: intest(env) });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok && j.success !== false, stato: r.status, risultato: j.result, errori: j.errors };
}
const msgCf = (x) => (x && x.errori && x.errori[0] && x.errori[0].message ? ` — Cloudflare dice: «${x.errori[0].message}»` : "");
/** Il token è valido? (token utente oppure token di account). */
async function tokenValido(env, fetchFn) {
  const prove = [`${API}/user/tokens/verify`, `${API}/accounts/${env.CF_ACCOUNT_ID}/tokens/verify`];
  let ultimo = null;
  for (const u of prove) {
    try {
      const r = await fetchFn(u, { headers: intest(env) }); const j = await r.json().catch(() => ({}));
      if (r.ok && j.success !== false && j.result && j.result.status === "active") return { ok: true };
      ultimo = { stato: r.status, errori: j.errors };
    } catch (e) { ultimo = { stato: 0 }; }
  }
  return { ok: false, ...ultimo };
}
const conEmail = (p) => p && p.decision === "allow" && Array.isArray(p.include) && p.include.some((x) => x && x.email);
/** Legge una regola: prima come «riutilizzabile», poi come regola di un'applicazione. */
async function leggiPolicy(env, c, fetchFn) {
  if (!c.appId) { const g = await cf(env, `policies/${c.policyId}`, fetchFn); if (g.ok && g.risultato) return { url: `policies/${c.policyId}`, p: g.risultato, app: c.appName }; }
  if (c.appId) { const g = await cf(env, `apps/${c.appId}/policies/${c.policyId}`, fetchFn); if (g.ok && g.risultato) return { url: `apps/${c.appId}/policies/${c.policyId}`, p: g.risultato, app: c.appName }; }
  const g2 = await cf(env, `policies/${c.policyId}`, fetchFn); if (g2.ok && g2.risultato) return { url: `policies/${c.policyId}`, p: g2.risultato, app: c.appName };
  return null;
}
/** Trova la regola «allow» che elenca le email degli utenti ammessi. */
export async function trovaPolicy(env, fetchFn = fetch) {
  let cand = [];
  if (env.ACCESS_POLICY_ID) cand = [{ policyId: env.ACCESS_POLICY_ID, appId: env.ACCESS_APP_ID || "" }];
  else {
    const a = await cf(env, "apps?per_page=100", fetchFn);
    if (!a.ok) {
      const t = await tokenValido(env, fetchFn);
      if (!t.ok) return { ok: false, errore: `Il token non è valido o è stato copiato male (${t.stato})${msgCf(t)}. Ricopialo per intero (senza spazi) nel secret CF_ACCESS_TOKEN oppure creane uno nuovo.` };
      return { ok: false, errore: `Il token è valido ma Cloudflare rifiuta la lettura delle regole di Access (${a.stato})${msgCf(a)}. Controlla che abbia il permesso «Access: Apps and Policies Edit» a livello Account, per questo account, e che CF_ACCOUNT_ID sia giusto.` };
    }
    for (const app of a.risultato || []) for (const p of app.policies || []) if (p && p.id) cand.push({ policyId: p.id, appId: app.id, appName: app.name });
  }
  const viste = new Set(), trovate = [];
  for (const c of cand) {
    if (viste.has(c.policyId)) continue; viste.add(c.policyId);
    const l = await leggiPolicy(env, c, fetchFn);
    if (l && conEmail(l.p)) trovate.push(l);
  }
  if (!trovate.length) return { ok: false, errore: "Nessuna regola di Access con elenco di email trovata: aggiungi le email a mano o indica ACCESS_POLICY_ID." };
  if (trovate.length > 1) return { ok: false, errore: "Più regole con elenco di email (" + trovate.map((t) => t.p.name).join(", ") + "): indica quale con il secret ACCESS_POLICY_ID." };
  return { ok: true, ...trovate[0] };
}
async function modificaPolicy(env, fn, fetchFn) {
  const t = await trovaPolicy(env, fetchFn);
  if (!t.ok) return t;
  const p = t.p, nuovo = fn(Array.isArray(p.include) ? p.include : []);
  if (!nuovo) return { ok: true, invariato: true };
  const corpo = { ...p, include: nuovo };
  for (const k of ["id", "uid", "created_at", "updated_at", "version", "app_count", "reusable", "archived_at"]) delete corpo[k];
  const w = await cf(env, t.url, fetchFn, { method: "PUT", body: JSON.stringify(corpo) });
  if (!w.ok) return { ok: false, errore: "Cloudflare Access: aggiornamento della regola non riuscito (" + w.stato + ")" + (w.errori && w.errori[0] ? ": " + w.errori[0].message : "") };
  return { ok: true };
}
const haEmail = (inc, e) => inc.some((x) => x && x.email && norm(x.email.email) === e);
export async function accessAggiungi(env, email, fetchFn = fetch) {
  if (accessAperto(env)) return { ok: true, nonNecessario: true };
  if (!accessConfigurato(env)) return { ok: true, manuale: true };
  const e = norm(email);
  return modificaPolicy(env, (inc) => (haEmail(inc, e) ? null : [...inc, { email: { email: e } }]), fetchFn);
}
export async function accessRimuovi(env, email, fetchFn = fetch) {
  if (accessAperto(env)) return { ok: true, nonNecessario: true };
  if (!accessConfigurato(env)) return { ok: true, manuale: true };
  const e = norm(email);
  return modificaPolicy(env, (inc) => (haEmail(inc, e) ? inc.filter((x) => !(x && x.email && norm(x.email.email) === e)) : null), fetchFn);
}
/** Prova di collegamento (non scrive nulla). */
export async function verificaAccess(env, fetchFn = fetch) {
  if (!accessConfigurato(env)) return { ok: false, errore: "Mancano i secret CF_ACCESS_TOKEN e/o CF_ACCOUNT_ID nel Worker." };
  const t = await trovaPolicy(env, fetchFn);
  if (!t.ok) return t;
  return { ok: true, regola: t.p.name, applicazione: t.app || null, email: t.p.include.filter((x) => x.email).length };
}

export async function approva(db, env, email, fetchFn = fetch, ora = new Date()) {
  await schema(db);
  const e = norm(email);
  const r = await db.prepare("SELECT nome FROM richieste WHERE email=?").bind(e).first();
  if (!r) return { ok: false, stato: 404, errore: "richiesta non trovata" };
  const a = await accessAggiungi(env, e, fetchFn);
  if (!a.ok) return { ok: false, stato: 502, errore: a.errore };
  const usati = new Set(((await db.prepare("SELECT uid FROM utenti").all()).results || []).map((x) => x.uid));
  const uid = creaUid(r.nome, e, usati);
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO utenti (email,uid,nome,canale,creato) VALUES (?,?,?,?,?)").bind(e, uid, r.nome, "telegram", ora.toISOString()),
    db.prepare("DELETE FROM richieste WHERE email=?").bind(e),
  ]);
  return { ok: true, uid, access: a.nonNecessario ? "non_necessario" : a.manuale ? "manuale" : "aggiunto" };
}
export async function rifiuta(db, email) {
  await schema(db);
  await db.prepare("UPDATE richieste SET stato='rifiutata' WHERE email=?").bind(norm(email)).run();
  return { ok: true };
}
export async function rimuovi(db, env, email, fetchFn = fetch) {
  await schema(db);
  const e = norm(email);
  const a = await accessRimuovi(env, e, fetchFn);
  if (!a.ok) return { ok: false, stato: 502, errore: a.errore };
  await db.prepare("UPDATE utenti SET attivo=0 WHERE email=?").bind(e).run();   // i dati personali restano nel repo
  return { ok: true, access: a.nonNecessario ? "non_necessario" : a.manuale ? "manuale" : "rimosso" };
}

/** Profilo dell'utente (None per l'amministratore). Se l'email passa da Access ma non ha riga, la crea (canale: telegram). */
export async function profilo(db, email, nome = "", ora = new Date()) {
  await schema(db);
  const e = norm(email);
  let u = await db.prepare("SELECT email,uid,nome,canale,telegram_chat_id,email_alert,attivo FROM utenti WHERE email=?").bind(e).first();
  if (!u) {
    const usati = new Set(((await db.prepare("SELECT uid FROM utenti").all()).results || []).map((x) => x.uid));
    const uid = creaUid(nome, e, usati);
    await db.prepare("INSERT OR IGNORE INTO utenti (email,uid,nome,canale,creato) VALUES (?,?,?,?,?)").bind(e, uid, pulisci(nome, 80) || null, "telegram", ora.toISOString()).run();
    u = await db.prepare("SELECT email,uid,nome,canale,telegram_chat_id,email_alert,attivo FROM utenti WHERE email=?").bind(e).first();
  }
  return u;
}
export async function aggiornaProfilo(db, email, d) {
  await schema(db);
  const canale = CANALI.includes(d.canale) ? d.canale : null;
  if (!canale) return { ok: false, stato: 400, errore: "canale non valido" };
  const chat = pulisci(d.telegram_chat_id, 20), ea = norm(d.email_alert);
  if (chat && !/^-?\d{5,16}$/.test(chat)) return { ok: false, stato: 400, errore: "Il Chat ID di Telegram è un numero (es. 123456789)." };
  if (ea && !emailOk(ea)) return { ok: false, stato: 400, errore: "Email per gli alert non valida." };
  if ((canale === "telegram" || canale === "entrambi") && !chat) return { ok: false, stato: 400, errore: "Per gli alert su Telegram serve il tuo Chat ID." };
  if ((canale === "email" || canale === "entrambi") && !ea) return { ok: false, stato: 400, errore: "Per gli alert via email serve l'indirizzo." };
  await db.prepare("UPDATE utenti SET canale=?, telegram_chat_id=?, email_alert=?, nome=COALESCE(NULLIF(?, ''), nome) WHERE email=?")
    .bind(canale, chat || null, ea || null, pulisci(d.nome, 80), norm(email)).run();
  return { ok: true };
}
