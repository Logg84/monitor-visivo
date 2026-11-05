/**
 * Worker del sito basewatch: serve i file statici (cartella site/) e, su
 * POST /api/analisi, genera il riassunto AI (tecnica + fondamentale) di un titolo.
 *
 * La chiave del motore AI vive SOLO qui (secret Cloudflare), mai nel browser.
 * Accesso: header x-codice = secret ACCESS_CODE. Motore: qualunque endpoint
 * compatibile OpenAI (Groq, OpenRouter, Gemini compat…) via AI_BASE_URL / AI_MODEL.
 * L'AI vede SOLO i dati calcolati (index.json + fond/<ticker>.json): niente notizie.
 */
import { CHIAVE_PAGINA, corpoPagina, corpoScreening, eseguiCron, leggiPunteggi, ultimiLog, unisci } from "./dati.js";

const SYSTEM = `Sei un assistente che riassume in italiano, in prosa chiara e discorsiva, dati di analisi tecnica e fondamentale già calcolati da un portale di monitoraggio personale. Regole assolute:
- Usa SOLO i dati forniti. Non inventare numeri, notizie, eventi, date o dividendi. Se un dato manca, dillo.
- Non dare MAI indicazioni operative (compra/vendi/target di prezzo). La decisione di aprire un trade spetta sempre e solo all'utente.
- Niente previsioni non supportate dai numeri. Se i segnali sono in conflitto o ambigui, dillo.
- VALUTE E UNITÀ: i prezzi e i livelli tecnici sono nella valuta di quotazione (se è GBp sono PENCE, non sterline). I dati di bilancio sono nella valuta di rendicontazione indicata nei dati (può essere diversa, es. USD per un titolo quotato a Londra): non chiamare mai «pence» o «sterline» un importo di bilancio e non confrontare direttamente prezzi e importi di bilancio.
- BILANCIO: gli anni indicati sono anni di chiusura dell'esercizio e sono dati CONSUNTIVI. Non esistono previsioni nei dati: non scrivere «previsione», «stima» o «atteso» per ricavi e utili. P/E e rapporti «forward» sono l'unica componente prospettica, e provengono da Yahoo.
- GIUDIZI: valuta liquidità e indebitamento con le metriche fornite (current ratio sotto 1 NON è «adeguato»; per il debito preferisci debito netto/EBITDA se presente) e senza soglie inventate. Ricorda che le soglie dipendono dal settore e dillo. Se un dato contraddice il giudizio che stavi per dare, correggi il giudizio.
- Chiama «tensione» solo una contraddizione reale tra segnali, non una situazione normale (es. prezzo vicino al top del range e lontano dall'ATH non è una contraddizione). Se un range è indicato «corretto a mano», specificalo: l'ha deciso l'utente.
- Niente markdown, niente elenchi puntati: solo paragrafi con questi titoli in maiuscolo, ciascuno su una riga: TECNICA, FONDAMENTALE, PUNTI DI ATTENZIONE, COSA CAMBIEREBBE IL QUADRO.
- Se ricevi immagini dei grafici (candele; area colorata = range riconosciuto con linee top/bottom; linee blu = range dell'altro timeframe), guardale davvero: descrivi la struttura che vedi (discesa, rallentamento, oscillazioni, eventuale wedge/flag, ultimi movimenti rispetto al range). I livelli di prezzo precisi vengono SEMPRE dai numeri forniti, non dalla lettura dell'immagine; se immagine e numeri non coincidono, fidati dei numeri e segnalalo. I volumi non sono disponibili: non commentarli.
- TECNICA: discesa precedente, base/range (top, bottom, ampiezza, durata, swing), posizione del prezzo nel range, distanza dall'ATH, e cosa dicono i due timeframe se presenti entrambi.
- FONDAMENTALE: redditività, crescita, indebitamento e liquidità, valutazione, andamento di ricavi e utili sugli anni disponibili. Sii concreto e approfondito su ciò che i dati permettono.
- PUNTI DI ATTENZIONE: tensioni tra tecnica e fondamentale, rischi che emergono dai numeri.
- COSA CAMBIEREBBE IL QUADRO: cosa invaliderebbe la lettura (es. chiusura fuori dal range, peggioramento di un indicatore dato).`;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

function uguali(a, b) {                       // confronto a tempo quasi costante
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

const nomeFile = (t) => [...t].map((c) => (/[A-Za-z0-9\-_.]/.test(c) ? c : "_")).join("");

const MONETARI = ["marketCap", "totalDebt", "totalCash", "freeCashflow", "operatingCashflow", "ebitda", "debito_netto"];
const PERCENTUALI = ["profitMargins", "operatingMargins", "grossMargins", "returnOnEquity", "returnOnAssets", "revenueGrowth", "earningsGrowth", "dividendYield", "payoutRatio"];

function importo(v, valuta) {
  const a = Math.abs(v);
  const u = a >= 1e9 ? [v / 1e9, " mld"] : a >= 1e6 ? [v / 1e6, " mln"] : [v, ""];
  return `${u[0].toFixed(2)}${u[1]} ${valuta}`;
}

/** Fondamentali in testo già formattato (unità e valute esplicite): l'AI non deve «indovinare». */
export function descriviFond(f) {
  const vf = f.financialCurrency || "valuta di rendicontazione non indicata";
  const out = [`Valuta di quotazione: ${f.currency || "n.d."} · valuta di rendicontazione del bilancio: ${vf}`];
  for (const k of ["longName", "sector", "industry"]) if (f[k]) out.push(`${k}: ${f[k]} (classificazione Yahoo, può essere approssimativa)`);
  for (const [k, v] of Object.entries(f)) {
    if (["longName", "sector", "industry", "currency", "financialCurrency", "bilancio_annuale"].includes(k)) continue;
    if (typeof v !== "number") { out.push(`${k}: ${v}`); continue; }
    if (MONETARI.includes(k)) out.push(`${k}: ${importo(v, vf)}`);
    else if (PERCENTUALI.includes(k)) out.push(`${k}: ${(v * 100).toFixed(1)}%`);
    else if (k === "debtToEquity") out.push(`debtToEquity: ${v.toFixed(1)}% (debito/patrimonio netto, Yahoo lo esprime in percentuale)`);
    else out.push(`${k}: ${Math.round(v * 100) / 100}`);
  }
  const b = f.bilancio_annuale || {};
  for (const [nome, anni] of Object.entries(b)) {
    const righe = Object.keys(anni).sort().map((a) => `${a}: ${importo(anni[a], vf)}`);
    out.push(`${nome} (esercizi chiusi, consuntivi, anno = anno di chiusura dell'esercizio): ${righe.join("; ")}`);
  }
  return out.join("\n");
}

export function costruisciPrompt(ticker, stati, titolo, fond) {
  const tfNome = { "1W": "settimanale", "1D": "giornaliero" };
  const righe = stati.map((b) => {
    const pos = b.top > b.bottom ? Math.round(((b.ultimo - b.bottom) / (b.top - b.bottom)) * 100) : null;
    return `- ${tfNome[b.chiave.split("|")[1]] || b.chiave}: stato ${b.stato}${b.manuale ? " (range corretto a mano)" : ""}; range ${b.bottom}–${b.top} ` +
      `(ampiezza ${Math.round((b.ampiezza ?? 0) * 100)}%); ${b.barre} barre dal minimo; ultima chiusura ${b.ultimo}` +
      (pos !== null ? ` (posizione nel range ${pos}%)` : "") +
      `; swing minimi/massimi ${b.swing_minimi ?? "n.d."}/${b.swing_massimi ?? "n.d."}; calo prima della base ${Math.round((b.calo ?? 0) * 100)}%`;
  });
  const ath = titolo ? `ATH ${titolo.ath} del ${titolo.ath_data}; distanza dall'ATH ${(titolo.dist_ath * 100).toFixed(1)}%` : "ATH non disponibile";
  const f = fond ? descriviFond(fond) : "NON DISPONIBILI per questo titolo: dichiaralo nella sezione FONDAMENTALE e non inventare nulla.";
  return `Titolo: ${ticker}\n\nDATI TECNICI (solo prezzi di chiusura):\n${righe.join("\n")}\n${ath}\n\n` +
    `DATI FONDAMENTALI (da Yahoo Finance):\n${f}`;
}

async function leggi(env, base, path) {
  try {
    const r = await env.ASSETS.fetch(new Request(base + path));
    return r.ok ? await r.json() : null;
  } catch (e) { return null; }
}

// ── Identità: Cloudflare Access (JWT verificato) oppure, in transizione, codice ──
const b64u = (x) => { x = x.replace(/-/g, "+").replace(/_/g, "/"); return Uint8Array.from(atob(x + "=".repeat((4 - (x.length % 4)) % 4)), (c) => c.charCodeAt(0)); };
let jwksCache = { t: 0, dom: "", keys: [] };

export async function verificaJwt(token, env) {
  try {
    const [h, p, sig] = String(token).split(".");
    if (!sig) return null;
    const dec = (x) => JSON.parse(new TextDecoder().decode(b64u(x)));
    const header = dec(h), payload = dec(p);
    if (header.alg !== "RS256") return null;
    if (!(payload.exp * 1000 > Date.now())) return null;
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!aud.includes(env.ACCESS_AUD)) return null;
    if (payload.iss !== `https://${env.ACCESS_TEAM_DOMAIN}`) return null;
    if (jwksCache.dom !== env.ACCESS_TEAM_DOMAIN || Date.now() - jwksCache.t > 3600e3 || !jwksCache.keys.some((k) => k.kid === header.kid)) {
      const r = await fetch(`https://${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`);
      if (!r.ok) return null;
      jwksCache = { t: Date.now(), dom: env.ACCESS_TEAM_DOMAIN, keys: (await r.json()).keys || [] };
    }
    const jwk = jwksCache.keys.find((k) => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64u(sig), new TextEncoder().encode(`${h}.${p}`));
    return ok ? payload : null;
  } catch (e) { return null; }
}

const modoAccess = (env) => Boolean(env.ACCESS_AUD && env.ACCESS_TEAM_DOMAIN);

/** {modalita, email, admin} oppure null se non autenticato. */
export async function identita(request, env) {
  if (modoAccess(env)) {
    const cookie = /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(request.headers.get("cookie") || "");
    const tok = request.headers.get("cf-access-jwt-assertion") || (cookie && cookie[1]);
    const pl = tok && (await verificaJwt(tok, env));
    if (!pl || !pl.email) return null;
    const admin = String(env.ADMIN_EMAILS || "").toLowerCase().split(",").map((x) => x.trim()).filter(Boolean).includes(String(pl.email).toLowerCase());
    return { modalita: "access", email: pl.email, admin };
  }
  if (env.ACCESS_CODE && uguali(request.headers.get("x-codice") || "", String(env.ACCESS_CODE))) return { modalita: "codice", email: "codice", admin: false };
  return null;
}

const b64 = (txt) => btoa(String.fromCharCode(...new TextEncoder().encode(txt)));
const deb64 = (x) => new TextDecoder().decode(Uint8Array.from(atob(x.replace(/\n/g, "")), (c) => c.charCodeAt(0)));

/** Scrive il range corretto a mano in data/override.json (token GitHub solo sul server). */
export async function scriviOverride(env, chiave, valori, utente) {
  const repo = env.GITHUB_REPO || "Logg84/monitor-visivo";
  const url = `https://api.github.com/repos/${repo}/contents/data/override.json`;
  const h = { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "User-Agent": "basewatch-worker" };
  for (let t = 0; t < 2; t++) {
    let sha, attuale = {};
    const r = await fetch(url, { headers: h });
    if (r.ok) { const j = await r.json(); sha = j.sha; try { attuale = JSON.parse(deb64(j.content)); } catch (e) { attuale = {}; } }
    else if (r.status !== 404) throw new Error(`GitHub ${r.status}`);
    attuale[chiave] = { ...valori, da: utente };
    const p = await fetch(url, { method: "PUT", headers: h, body: JSON.stringify({
      message: `override range ${chiave} (${utente})`, content: b64(JSON.stringify(attuale, null, 1) + "\n"), sha }) });
    if (p.ok) return;
    if (p.status !== 409 && p.status !== 422) throw new Error(`GitHub ${p.status}`);
  }
  throw new Error("conflitto di salvataggio, riprova");
}

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(eseguiCron(controller.cron, env));
  },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);

    if (url.pathname === "/api/me") {              // chi sono e cosa posso fare
      const io = await identita(request, env);
      if (io) return json({ modalita: io.modalita, email: io.email, admin: io.admin });
      if (modoAccess(env)) return json({ errore: "non autenticato" }, 401);
      // Configurazione guidata: finché ACCESS_AUD non è impostato, mostra i due valori pubblici
      // (team domain e AUD) letti dal token di Access, per copiarli in wrangler.jsonc. Non sono segreti.
      const tok = request.headers.get("cf-access-jwt-assertion");
      let diagnostica;
      try { const pl = JSON.parse(new TextDecoder().decode(b64u(tok.split(".")[1]))); diagnostica = { team_domain: String(pl.iss || "").replace(/^https:\/\//, ""), aud: pl.aud }; } catch (e) { /* senza Access davanti: nessun dato */ }
      return json(diagnostica ? { modalita: "codice", diagnostica } : { modalita: "codice" });
    }

    if (url.pathname === "/api/unificato") {       // range (pubblici) + punteggi (riservati, da D1): solo con login
      if (request.method !== "GET") return json({ errore: "metodo non consentito" }, 405);
      const io = await identita(request, env);
      if (!io) return json({ errore: "non autenticato" }, 401);
      const ix = await leggi(env, url.origin, "/data/index.json");
      if (!ix) return json({ errore: "dati dei range non disponibili" }, 503);
      let p = { data: null, righe: [] };
      if (env.DB) { try { p = await leggiPunteggi(env.DB); } catch (e) { return json({ errore: "database non raggiungibile: " + e.message }, 502); } }
      const out = { aggiornato: ix.aggiornato || null, punteggi_data: p.data, db: Boolean(env.DB), righe: unisci(ix, p.righe) };
      if (io.admin && env.DB) out.scheduler = await ultimiLog(env.DB, 5);
      return json(out);
    }

    if (url.pathname === "/api/screening") {       // tabella dello screening (dati riservati da D1): solo con login
      if (request.method !== "GET") return json({ errore: "metodo non consentito" }, 405);
      if (!(await identita(request, env))) return json({ errore: "non autenticato" }, 401);
      if (!env.DB) return json({ errore: "database non collegato" }, 503);
      try { return new Response(await corpoScreening(env.DB), { headers: { "content-type": "application/json", "cache-control": "no-store" } }); }
      catch (e) { return json({ errore: "database non raggiungibile: " + e.message }, 502); }
    }

    if (url.pathname.startsWith("/api/pagina/")) {  // istantanee delle pagine (dati riservati da D1): solo con login
      if (request.method !== "GET") return json({ errore: "metodo non consentito" }, 405);
      if (!(await identita(request, env))) return json({ errore: "non autenticato" }, 401);
      const chiave = url.pathname.slice("/api/pagina/".length);
      if (!CHIAVE_PAGINA.test(chiave)) return json({ errore: "pagina non valida" }, 400);
      if (!env.DB) return json({ errore: "database non collegato" }, 503);
      try {
        const c = await corpoPagina(env.DB, chiave);
        if (!c) return json({ errore: "pagina non ancora caricata" }, 404);
        return new Response(c, { headers: { "content-type": "application/json", "cache-control": "no-store" } });
      } catch (e) { return json({ errore: "database non raggiungibile: " + e.message }, 502); }
    }

    if (url.pathname === "/api/range") {           // solo admin, solo con Access
      if (request.method !== "POST") return json({ errore: "metodo non consentito" }, 405);
      const io = await identita(request, env);
      if (!io) return json({ errore: "non autenticato" }, 401);
      if (!io.admin || io.modalita !== "access") return json({ errore: "solo un amministratore può modificare i range" }, 403);
      if (!env.GITHUB_TOKEN) return json({ errore: "servizio di salvataggio non configurato" }, 503);
      let b;
      try { b = await request.json(); } catch (e) { return json({ errore: "richiesta non valida" }, 400); }
      const top = Number(b.top), bottom = Number(b.bottom), chiave = String(b.chiave || "");
      if (!(top > bottom && bottom > 0)) return json({ errore: "il top deve essere maggiore del bottom" }, 400);
      const ix = await leggi(env, url.origin, "/data/index.json");
      if (!((ix && ix.basi) || []).some((x) => x.chiave === chiave)) return json({ errore: "base sconosciuta" }, 404);
      try { await scriviOverride(env, chiave, { top, bottom }, io.email); } catch (e) { return json({ errore: "salvataggio non riuscito: " + e.message }, 502); }
      return json({ ok: true });
    }

    if (url.pathname !== "/api/analisi") return json({ errore: "percorso sconosciuto" }, 404);
    if (request.method !== "POST") return json({ errore: "metodo non consentito" }, 405);
    if (!env.AI_KEY || !env.AI_BASE_URL || !env.AI_MODEL || (!env.ACCESS_CODE && !modoAccess(env))) return json({ errore: "servizio AI non configurato" }, 503);
    if (!(await identita(request, env))) return json({ errore: modoAccess(env) ? "non autenticato" : "codice di accesso errato" }, 401);

    let body;
    try { body = await request.json(); } catch (e) { return json({ errore: "richiesta non valida" }, 400); }
    const ticker = String(body.ticker || "");
    const base = url.origin;
    const idx = await leggi(env, base, "/data/index.json");
    const stati = ((idx && idx.basi) || []).filter((b) => b.chiave.split("|")[0] === ticker);
    if (!stati.length) return json({ errore: "titolo sconosciuto" }, 404);

    // Stessa analisi richiesta più volte nello stesso giro di dati: dalla cache.
    const chiaveCache = new Request(`${base}/__cache/analisi/${encodeURIComponent(ticker)}/${idx.aggiornato}`);
    const cache = typeof caches !== "undefined" ? caches.default : null;
    if (cache && !body.rigenera) {
      try { const hit = await cache.match(chiaveCache); if (hit) return json({ ...(await hit.json()), cache: true }); } catch (e) { /* cache non disponibile */ }
    }

    const ff = await leggi(env, base, `/data/fond/${nomeFile(ticker)}.json`);
    // Immagini dei grafici (max 2: settimanale e giornaliero), solo JPEG/PNG in data URL, dimensione limitata.
    const immagini = (String(env.AI_VISION) !== "true" ? [] : Array.isArray(body.immagini) ? body.immagini : []).slice(0, 2)
      .filter((i) => i && typeof i.img === "string" && i.img.length < 1_500_000 && /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(i.img));
    const fond = ff && ff.dati && Object.keys(ff.dati).length ? ff.dati : null;
    let prompt = costruisciPrompt(ticker, stati, (idx.titoli || {})[ticker], fond);
    let contenuto = prompt;
    if (immagini.length) {
      prompt += "\n\nIMMAGINI ALLEGATE: " + immagini.map((i) => (i.tf === "1W" ? "grafico settimanale" : "grafico giornaliero")).join(", ") + ".";
      contenuto = [{ type: "text", text: prompt }, ...immagini.map((i) => ({ type: "image_url", image_url: { url: i.img } }))];
    }
    let r;
    try {
      r = await fetch(String(env.AI_BASE_URL).replace(/\/$/, "") + "/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.AI_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({ model: env.AI_MODEL, temperature: 0.3, max_tokens: Number(env.AI_MAX_TOKENS) || 4000,
          messages: [{ role: "system", content: SYSTEM }, { role: "user", content: contenuto }] }),
      });
    } catch (e) { return json({ errore: "motore AI non raggiungibile" }, 502); }
    if (!r.ok) {
      let dettaglio = "";
      try { dettaglio = (await r.text()).replace(/\s+/g, " ").slice(0, 300); } catch (e) { /* nessun dettaglio */ }
      return json({ errore: `motore AI: errore ${r.status}${dettaglio ? " — " + dettaglio : ""} [chiave in uso: …${String(env.AI_KEY).slice(-4)}]` }, 502);
    }
    let testo = "";
    try { testo = ((await r.json()).choices?.[0]?.message?.content || "").replace(/<think>[\s\S]*?<\/think>/g, "").trim(); } catch (e) { /* vuoto */ }
    if (!testo) return json({ errore: "il motore AI non ha restituito testo" }, 502);

    const esito = { testo, aggiornato: idx.aggiornato, fondamentali: Boolean(fond), immagini: immagini.length };
    if (cache) {
      try { ctx.waitUntil(cache.put(chiaveCache, new Response(JSON.stringify(esito), { headers: { "cache-control": "max-age=86400" } }))); } catch (e) { /* ok */ }
    }
    return json(esito);
  },
};
