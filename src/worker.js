/**
 * Worker del sito basewatch: serve i file statici (cartella site/) e, su
 * POST /api/analisi, genera il riassunto AI (tecnica + fondamentale) di un titolo.
 *
 * La chiave del motore AI vive SOLO qui (secret Cloudflare), mai nel browser.
 * Accesso: header x-codice = secret ACCESS_CODE. Motore: qualunque endpoint
 * compatibile OpenAI (Groq, OpenRouter, Gemini compat…) via AI_BASE_URL / AI_MODEL.
 * L'AI vede SOLO i dati calcolati (index.json + fond/<ticker>.json): niente notizie.
 */

const SYSTEM = `Sei un assistente che riassume in italiano, in prosa chiara e discorsiva, dati di analisi tecnica e fondamentale già calcolati da un portale di monitoraggio personale. Regole assolute:
- Usa SOLO i dati forniti. Non inventare numeri, notizie, eventi, date o dividendi. Se un dato manca, dillo.
- Non dare MAI indicazioni operative (compra/vendi/target di prezzo). La decisione di aprire un trade spetta sempre e solo all'utente.
- Niente previsioni non supportate dai numeri. Se i segnali sono in conflitto o ambigui, dillo.
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
  const f = fond ? JSON.stringify(fond) : "NON DISPONIBILI per questo titolo: dichiaralo nella sezione FONDAMENTALE e non inventare nulla.";
  return `Titolo: ${ticker}\n\nDATI TECNICI (solo prezzi di chiusura):\n${righe.join("\n")}\n${ath}\n\n` +
    `DATI FONDAMENTALI (da Yahoo Finance, importi nella valuta del titolo):\n${f}`;
}

async function leggi(env, base, path) {
  try {
    const r = await env.ASSETS.fetch(new Request(base + path));
    return r.ok ? await r.json() : null;
  } catch (e) { return null; }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname !== "/api/analisi") return env.ASSETS.fetch(request);
    if (request.method !== "POST") return json({ errore: "metodo non consentito" }, 405);
    if (!env.ACCESS_CODE || !env.AI_KEY || !env.AI_BASE_URL || !env.AI_MODEL) return json({ errore: "servizio AI non configurato" }, 503);
    if (!uguali(request.headers.get("x-codice") || "", String(env.ACCESS_CODE))) return json({ errore: "codice di accesso errato" }, 401);

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
