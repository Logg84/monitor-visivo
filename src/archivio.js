/**
 * Archivio dei dati personali nel repo PRIVATO (watchlist, portafoglio, portafoglio condiviso).
 * Il Worker legge e scrive i file con l'API «contents» di GitHub (un commit per modifica): i workflow del
 * repo privato continuano a leggere gli stessi file di sempre, nessuna migrazione.
 * Concorrenza: ogni scrittura porta lo `sha` letto; se nel frattempo il file è cambiato (es. un workflow
 * ha aggiornato la watchlist) GitHub risponde 409/422 e si rilegge e si riapplica la modifica (watchlist)
 * oppure si chiede di ricaricare la pagina (tabelle intere).
 * Nessun import dal Worker principale. Secret richiesto: PRIVATE_REPO_TOKEN (Contents: R/W, Actions: R/W
 * solo sul repo privato).
 */

export const REPO_PRIVATO = "Logg84/monitor-trading-marco";
export const FILE = {
  watchlist: "data/watchlist.json",
  portafoglio: "data/portafoglio.csv",
  condiviso: "data/portafoglio_condiviso.csv",
  editor: "data/portafoglio_condiviso_editor.json",
};
export const MAX_BYTE = 400_000;
/** Percorso nel repo privato. uid vuoto = file storici dell'amministratore; altrimenti data/users/<uid>/. */
export const percorso = (nome, uid) => (uid && (nome === "watchlist" || nome === "portafoglio") ? `data/users/${uid}/${FILE[nome].split("/").pop()}` : FILE[nome]);
export const uidValido = (u) => typeof u === "string" && /^[a-z0-9][a-z0-9_-]{1,39}$/.test(u);

export const COL_PORT = ["ID", "Ticker", "Direzione", "Data_Ingresso", "Prezzo_Ingresso", "Quantita", "SL", "TP1", "TP2", "TP3",
  "Stato", "Prezzo_Uscita", "Data_Uscita", "Note"];
export const COL_COND = ["ID", "Ticker", "Direzione", "Data_Ingresso", "Prezzo_Ingresso", "Quantita", "SL", "TP1", "TP2", "TP3",
  "Stato", "Prezzo_Uscita", "Data_Uscita", "Comm_Ingresso", "Comm_Uscita", "Costi_Extra", "Motivazione", "Motivo_Uscita"];
const NUM = new Set(["Prezzo_Ingresso", "Quantita", "SL", "TP1", "TP2", "TP3", "Prezzo_Uscita", "Comm_Ingresso", "Comm_Uscita", "Costi_Extra"]);

// ── base64 UTF-8 ─────────────────────────────────────────────────────────────
export function daB64(b64) {
  const bin = atob(String(b64 || "").replace(/\s/g, ""));
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(u);
}
export function aB64(testo) {
  const u = new TextEncoder().encode(testo);
  let s = "";
  for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode(...u.subarray(i, i + 8192));
  return btoa(s);
}

// ── GitHub contents ──────────────────────────────────────────────────────────
function intest(env) {
  return { Authorization: `Bearer ${env.PRIVATE_REPO_TOKEN}`, Accept: "application/vnd.github+json", "User-Agent": "basewatch-worker",
    "X-GitHub-Api-Version": "2022-11-28" };
}
const MSG = { 401: "token del repo privato non valido", 403: "il token del repo privato non ha i permessi (Contents: Read and write)",
  404: "file o repo non trovato" };

/** {ok, sha, testo} | {ok:true, assente:true} | {ok:false, stato, errore} */
export async function leggiFile(env, nome, fetchFn = fetch, uid = "") {
  if (!env.PRIVATE_REPO_TOKEN) return { ok: false, stato: 503, errore: "secret PRIVATE_REPO_TOKEN non configurato" };
  let r;
  try { r = await fetchFn(`https://api.github.com/repos/${REPO_PRIVATO}/contents/${percorso(nome, uid)}?ref=main`, { headers: intest(env) }); }
  catch (e) { return { ok: false, stato: 502, errore: "GitHub non raggiungibile" }; }
  if (r.status === 404) return { ok: true, assente: true };
  if (!r.ok) return { ok: false, stato: r.status === 401 || r.status === 403 ? 503 : 502, errore: MSG[r.status] || `GitHub ha risposto ${r.status}` };
  const j = await r.json();
  if (!j.content) return { ok: false, stato: 502, errore: "file troppo grande o non leggibile" };
  return { ok: true, sha: j.sha, testo: daB64(j.content) };
}

/** {ok, sha} | {ok:false, conflitto:true} | {ok:false, stato, errore} */
export async function scriviFile(env, nome, testo, sha, messaggio, fetchFn = fetch, uid = "") {
  if (!env.PRIVATE_REPO_TOKEN) return { ok: false, stato: 503, errore: "secret PRIVATE_REPO_TOKEN non configurato" };
  if (testo.length > MAX_BYTE) return { ok: false, stato: 413, errore: "file troppo grande" };
  const corpo = { message: messaggio, content: aB64(testo), branch: "main" };
  if (sha) corpo.sha = sha;
  let r;
  try {
    r = await fetchFn(`https://api.github.com/repos/${REPO_PRIVATO}/contents/${percorso(nome, uid)}`,
      { method: "PUT", headers: { ...intest(env), "content-type": "application/json" }, body: JSON.stringify(corpo) });
  } catch (e) { return { ok: false, stato: 502, errore: "GitHub non raggiungibile" }; }
  if (r.status === 409 || r.status === 422) return { ok: false, conflitto: true, stato: 409, errore: "il file è stato modificato nel frattempo" };
  if (!r.ok) return { ok: false, stato: r.status === 401 || r.status === 403 ? 503 : 502, errore: MSG[r.status] || `GitHub ha risposto ${r.status}` };
  const j = await r.json();
  return { ok: true, sha: j.content && j.content.sha };
}

// ── CSV (RFC 4180, righe terminate da \n come pandas) ────────────────────────
export function csvLeggi(testo) {
  const righe = []; let riga = [], cella = "", q = false;
  const s = String(testo || "").replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cella += '"'; i++; } else q = false; } else cella += c; }
    else if (c === '"') q = true;
    else if (c === ",") { riga.push(cella); cella = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && s[i + 1] === "\n") i++; riga.push(cella); cella = ""; if (riga.length > 1 || riga[0] !== "") righe.push(riga); riga = []; }
    else cella += c;
  }
  if (cella !== "" || riga.length) { riga.push(cella); righe.push(riga); }
  if (!righe.length) return { colonne: [], righe: [] };
  const colonne = righe[0];
  return { colonne, righe: righe.slice(1).map((r) => Object.fromEntries(colonne.map((c, i) => [c, r[i] === undefined || r[i] === "" ? null : r[i]]))) };
}
const cella = (v) => { if (v === null || v === undefined) return ""; const s = String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function csvScrivi(colonne, righe) {
  return colonne.join(",") + "\n" + righe.map((r) => colonne.map((c) => cella(r[c])).join(",")).join("\n") + (righe.length ? "\n" : "");
}

// ── Tabelle trade (portafoglio personale e condiviso) ────────────────────────
const numero = (x) => { if (x === null || x === undefined || x === "") return null; const n = Number(x); return Number.isFinite(n) ? n : NaN; };
const id8 = () => [...crypto.getRandomValues(new Uint8Array(4))].map((b) => b.toString(16).padStart(2, "0")).join("");

/** Riga normalizzata (ticker maiuscolo, ID, tipi) oppure {errori}. Stesse regole di core/portafoglio.valida_trade. */
export function normalizzaTrade(r, colonne, condiviso) {
  const o = {};
  for (const c of colonne) o[c] = r[c] === undefined || r[c] === "" ? null : r[c];
  o.Ticker = String(o.Ticker || "").trim().toUpperCase();
  o.Direzione = o.Direzione === "Short" ? "Short" : "Long";
  o.Stato = o.Stato === "Chiuso" ? "Chiuso" : "Aperto";
  o.ID = o.ID ? String(o.ID).slice(0, 20) : id8();
  const err = [];
  for (const c of colonne) if (NUM.has(c)) { const n = numero(o[c]); if (Number.isNaN(n)) err.push(`${o.Ticker || "?"}: «${c}» non è un numero`); else o[c] = n; }
  for (const c of ["Data_Ingresso", "Data_Uscita"]) if (colonne.includes(c) && o[c] && !/^\d{4}-\d{2}-\d{2}$/.test(String(o[c]))) err.push(`${o.Ticker || "?"}: «${c}» deve essere AAAA-MM-GG`);
  if (!o.Ticker) return { errori: ["ticker mancante"] };
  if (!err.length) {
    const pe = o.Prezzo_Ingresso, lung = o.Direzione !== "Short";
    if (!(pe > 0)) err.push(`${o.Ticker}: prezzo di ingresso mancante o non valido`);
    else {
      if (o.SL !== null && (lung ? o.SL >= pe : o.SL <= pe)) err.push(`${o.Ticker}: lo SL deve stare ${lung ? "sotto" : "sopra"} l'ingresso`);
      let prev = pe;
      for (const k of ["TP1", "TP2", "TP3"]) { const v = o[k]; if (v === null) continue;
        if (lung ? v <= prev : v >= prev) err.push(`${o.Ticker}: ${k} deve stare ${lung ? "sopra" : "sotto"} ${prev === pe ? "l'ingresso" : "il TP precedente"}`); prev = v; }
    }
    if (o.Stato === "Chiuso" && !(o.Prezzo_Uscita > 0)) err.push(`${o.Ticker}: trade chiuso senza prezzo di uscita`);
    if (condiviso) {
      if (!(o.Quantita > 0)) err.push(`${o.Ticker}: quantità obbligatoria`);
      for (const c of ["Comm_Ingresso", "Comm_Uscita", "Costi_Extra"]) if (o[c] !== null && o[c] < 0) err.push(`${o.Ticker}: «${c}» non può essere negativo`);
    }
  }
  return err.length ? { errori: err } : { riga: o };
}

/** Valida tutta la tabella: {ok, testo} oppure {ok:false, errori}. */
export function costruisciTabella(righe, condiviso) {
  const colonne = condiviso ? COL_COND : COL_PORT;
  if (!Array.isArray(righe) || righe.length > 2000) return { ok: false, errori: ["tabella non valida o troppo grande"] };
  const out = [], errori = [];
  for (const r of righe) { const n = normalizzaTrade(r || {}, colonne, condiviso); if (n.errori) errori.push(...n.errori); else out.push(n.riga); }
  const visti = new Set(); for (const r of out) { if (visti.has(r.ID)) errori.push(`ID duplicato: ${r.ID}`); visti.add(r.ID); }
  return errori.length ? { ok: false, errori } : { ok: true, testo: csvScrivi(colonne, out), righe: out };
}

// ── Watchlist: operazioni applicate al file FRESCO ───────────────────────────
const TICKER = /^[A-Z0-9][A-Z0-9.\-=^]{0,14}$/;
const adesso = (d) => (d || new Date()).toISOString().replace("Z", "+00:00");

/** Applica `op` a `voci` (array). Ritorna {ok, voci, cambiato} | {ok:false, errore}. */
export function applicaOp(voci, op, now) {
  const t = String((op && op.ticker) || "").trim().toUpperCase();
  if (!TICKER.test(t)) return { ok: false, errore: "ticker non valido" };
  const i = voci.findIndex((e) => e.ticker === t);
  const liv = (l) => { const o = {}; for (const k of ["L1", "L2", "L3"]) { const n = numero(l && l[k]); if (Number.isNaN(n)) return null; if (n > 0) o[k] = n; } return o; };
  const data = (d) => (d === null || d === undefined || d === "" ? null : /^\d{4}-\d{2}-\d{2}$/.test(String(d)) ? String(d) : undefined);
  switch (op.op) {
    case "add": {
      if (i >= 0) return { ok: true, voci, cambiato: false };
      const lv = liv(op.levels), td = data(op.target_date);
      if (lv === null || td === undefined) return { ok: false, errore: "livelli o data non validi" };
      const nuova = { ticker: t, origin: "manual", created: adesso(now), last_reviewed: adesso(now), poc: null, poc_origin: null, vwap: null,
        levels: lv, notes: String(op.notes || "").slice(0, 500), target_date: td, sector: null, sub: null };
      return { ok: true, voci: [...voci, nuova], cambiato: true };
    }
    case "remove": return i < 0 ? { ok: true, voci, cambiato: false } : { ok: true, voci: voci.filter((e) => e.ticker !== t), cambiato: true };
    case "review": if (i < 0) return { ok: false, errore: "titolo non in watchlist" };
      return { ok: true, voci: voci.map((e, k) => (k === i ? { ...e, last_reviewed: adesso(now) } : e)), cambiato: true };
    case "edit": {
      if (i < 0) return { ok: false, errore: "titolo non in watchlist" };
      const lv = liv(op.levels), td = data(op.target_date);
      if (lv === null || td === undefined) return { ok: false, errore: "livelli o data non validi" };
      return { ok: true, voci: voci.map((e, k) => (k === i ? { ...e, levels: lv, target_date: td } : e)), cambiato: true };
    }
    default: return { ok: false, errore: "operazione sconosciuta" };
  }
}

/** Legge la watchlist, applica l'operazione e committa; un nuovo tentativo se il file è cambiato nel frattempo. */
export async function modificaWatchlist(env, op, utente, fetchFn = fetch, uid = "") {
  for (let tentativo = 0; tentativo < 2; tentativo++) {
    const f = await leggiFile(env, "watchlist", fetchFn, uid);
    if (!f.ok) return f;
    if (f.assente && !uid) return { ok: false, stato: 404, errore: "watchlist.json non trovato nel repo privato" };
    let doc; try { doc = f.assente ? { entries: [] } : JSON.parse(f.testo); } catch (e) { return { ok: false, stato: 502, errore: "watchlist.json illeggibile" }; }
    if (!doc || !Array.isArray(doc.entries)) return { ok: false, stato: 502, errore: "watchlist.json senza elenco" };
    const r = applicaOp(doc.entries, op);
    if (!r.ok) return { ok: false, stato: 400, errore: r.errore };
    if (!r.cambiato) return { ok: true, invariato: true, entries: r.voci };
    const testo = JSON.stringify({ ...doc, updated: adesso(), entries: r.voci }, null, 2) + "\n";
    const w = await scriviFile(env, "watchlist", testo, f.sha, `chore(portale): watchlist ${op.op} ${String(op.ticker).toUpperCase()} (${utente})`, fetchFn, uid);
    if (w.ok) return { ok: true, entries: r.voci };
    if (!w.conflitto) return w;
  }
  return { ok: false, stato: 409, errore: "la watchlist è stata modificata nel frattempo: riprova" };
}

// ── Permessi del portafoglio condiviso ───────────────────────────────────────
export function puoModificareCondiviso(io, editors) {
  if (!io || io.modalita !== "access") return false;
  if (io.admin) return true;
  return (editors || []).includes(String(io.email || "").toLowerCase());
}
export async function leggiEditor(env, fetchFn = fetch) {
  const f = await leggiFile(env, "editor", fetchFn);
  if (!f.ok || f.assente) return [];
  try { const l = JSON.parse(f.testo).editors; return Array.isArray(l) ? l.map((x) => String(x).trim().toLowerCase()) : []; } catch (e) { return []; }
}
