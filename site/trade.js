// Motore comune di Portafoglio e Portafoglio condiviso: tabella dei trade, P&L, livelli, modifica con salvataggio.
window.Trade = (cfg) => {
  const { $, esc, num, fmt, dmy, msg, api, erroreDi, prezzi } = window.C;
  let righe = [], sha = null, puo = false, px = {}, dataPx = null, sel = null;
  const COMM = 1.0;
  const comm = (v) => (num(v) === null ? COMM : num(v));
  const LIV = { sl: "🔴 Stop loss raggiunto", tp3: "🟢 TP3 raggiunto", tp2: "🟢 TP2 raggiunto", tp1: "🟢 TP1 raggiunto", gain: "In guadagno", loss: "In perdita (sopra lo stop)", chiuso: "Chiuso", nd: "Prezzo non disponibile" };
  const lung = (r) => r.Direzione !== "Short";
  const pnlPct = (r, p) => { const pe = num(r.Prezzo_Ingresso); return pe && p !== null ? ((p - pe) / pe) * 100 * (lung(r) ? 1 : -1) : null; };
  function livello(r, p) {
    if (r.Stato === "Chiuso") return "chiuso";
    if (p === null) return "nd";
    const sl = num(r.SL); if (sl !== null && (lung(r) ? p <= sl : p >= sl)) return "sl";
    for (const [k, c] of [["TP3", "tp3"], ["TP2", "tp2"], ["TP1", "tp1"]]) { const t = num(r[k]); if (t !== null && (lung(r) ? p >= t : p <= t)) return c; }
    const q = pnlPct(r, p); return q === null ? "nd" : q >= 0 ? "gain" : "loss";
  }
  /** Come core/portafoglio_condiviso.pnl: netto = lordo − (comm. ingresso + comm. uscita + extra). */
  function pnl(r, p) {
    const pe = num(r.Prezzo_Ingresso), q = num(r.Quantita), u = r.Stato === "Chiuso" ? num(r.Prezzo_Uscita) : p;
    if (!pe || pe <= 0 || !q || q <= 0 || u === null || u === undefined) return null;
    const lordo = (u - pe) * q * (lung(r) ? 1 : -1), costi = comm(r.Comm_Ingresso) + comm(r.Comm_Uscita) + (num(r.Costi_Extra) || 0);
    return { lordo, costi, netto: lordo - costi, pct: ((lordo - costi) / (pe * q)) * 100 };
  }
  const cl = (v) => (v > 0 ? "pos" : v < 0 ? "neg" : "");
  const euro = (v) => (v === null ? "–" : `<span class="${cl(v)}">${v > 0 ? "+" : ""}${fmt(v)} €</span>`);
  // Testo lungo in cella (note e motivazioni): ellipsis + tooltip col testo completo (title).
  const taglia = (s) => { const t = String(s ?? ""); return t.length > 24 ? `<span class="taglia" title="${esc(t)}">${esc(t)}</span>` : esc(t); };

  function disegna() {
    const aperti = righe.filter((r) => r.Stato !== "Chiuso"), chiusi = righe.filter((r) => r.Stato === "Chiuso");
    let tot = null, vin = 0, per = 0;
    for (const r of chiusi) { const p = pnl(r); if (p) { tot = (tot || 0) + (cfg.condiviso ? p.netto : p.lordo); p.netto > 0 ? vin++ : per++; } }
    $("kpi").innerHTML = [["Trade aperti", aperti.length], ["Trade chiusi", chiusi.length], ["Vincenti / perdenti", chiusi.length ? `${vin} / ${per}` : "n/d"],
      [cfg.condiviso ? "Risultato chiusi (netto)" : "Risultato chiusi (lordo)", tot === null ? "n/d" : `${tot > 0 ? "+" : ""}${fmt(tot)} €`]].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join("");
    const th = (a) => `<thead><tr>${a.map((t) => `<th>${t}</th>`).join("")}</tr></thead>`;
    const ap = ["Ticker", "Dir.", "Data", "Ingresso", "Attuale", "Qtà", "SL", "TP1", "TP2", "TP3", cfg.condiviso ? "Netto € (se chiuso ora)" : "Rend. %", cfg.condiviso ? "Rend. netto %" : "", "Andamento", cfg.condiviso ? "Motivazione" : "Note"].filter(Boolean);
    const rowA = (r) => { const p = num(px[r.Ticker]), l = livello(r, p), n = cfg.condiviso ? pnl(r, p) : null, pc = pnlPct(r, p);
      return `<tr class="cl${r.ID === sel ? " sel" : ""}" data-i="${esc(r.ID)}"><td><b>${esc(r.Ticker)}</b></td><td>${esc(r.Direzione)}</td><td>${dmy(r.Data_Ingresso)}</td><td>${fmt(r.Prezzo_Ingresso)}</td><td>${fmt(p)}</td><td>${fmt(r.Quantita, 0)}</td>
        <td>${fmt(r.SL)}</td><td>${fmt(r.TP1)}</td><td>${fmt(r.TP2)}</td><td>${fmt(r.TP3)}</td>${cfg.condiviso ? `<td>${euro(n && n.netto)}</td><td>${n ? `<span class="${cl(n.pct)}">${fmt(n.pct)}%</span>` : "–"}</td>` : `<td>${pc === null ? "–" : `<span class="${cl(pc)}">${fmt(pc)}%</span>`}</td>`}
        <td>${LIV[l]}</td><td>${taglia((cfg.condiviso ? r.Motivazione : r.Note) || "")}</td></tr>`; };
    const ch = ["Ticker", "Dir.", "Ingresso il", "Uscita il", "Ingresso", "Uscita", "Qtà", cfg.condiviso ? "Costi €" : "", cfg.condiviso ? "Guadagno/perdita € (netto)" : "Rend. %", cfg.condiviso ? "Rend. netto %" : "", cfg.condiviso ? "Motivo uscita" : "Note"].filter(Boolean);
    const rowC = (r) => { const n = pnl(r), pc = pnlPct(r, num(r.Prezzo_Uscita));
      return `<tr class="cl${r.ID === sel ? " sel" : ""}" data-i="${esc(r.ID)}"><td><b>${esc(r.Ticker)}</b></td><td>${esc(r.Direzione)}</td><td>${dmy(r.Data_Ingresso)}</td><td>${dmy(r.Data_Uscita)}</td><td>${fmt(r.Prezzo_Ingresso)}</td><td>${fmt(r.Prezzo_Uscita)}</td><td>${fmt(r.Quantita, 0)}</td>
        ${cfg.condiviso ? `<td>${n ? fmt(n.costi) : "–"}</td><td>${euro(n && n.netto)}</td><td>${n ? `<span class="${cl(n.pct)}">${fmt(n.pct)}%</span>` : "–"}</td><td>${taglia(r.Motivo_Uscita || "")}</td>` : `<td>${pc === null ? "–" : `<span class="${cl(pc)}">${fmt(pc)}%</span>`}</td><td>${taglia(r.Note || "")}</td>`}</tr>`; };
    $("tab").innerHTML = (aperti.length ? `<caption style="text-align:left;font-weight:600;padding:6px 0">Trade aperti</caption>${th(ap)}<tbody>${aperti.map(rowA).join("")}</tbody>` : "")
      + (chiusi.length ? `<tbody><tr><td colspan="${ch.length}" style="font-weight:600;padding-top:14px">Trade chiusi</td></tr></tbody>${th(ch)}<tbody>${chiusi.map(rowC).join("")}</tbody>` : "")
      + (!righe.length ? `<tbody><tr><td class="vuoto">Nessun trade registrato.</td></tr></tbody>` : "");
    dettaglio();
  }
  function dettaglio() {
    const r = righe.find((x) => x.ID === sel);
    if (!r || !puo) { $("det").innerHTML = ""; return; }
    const c = r.Stato === "Chiuso", v = (k) => esc(r[k] ?? "");
    $("det").innerHTML = `<div class="box"><h3>✏️ ${esc(r.Ticker)} — ${c ? "trade chiuso" : "gestisci trade"}</h3><form id="f-ed">
      <label>Prezzo ingresso<input id="e-p" type="number" step="any" min="0" value="${v("Prezzo_Ingresso")}"></label><label>Quantità<input id="e-q" type="number" step="any" min="0" value="${v("Quantita")}"></label>
      <label>Stop loss<input id="e-sl" type="number" step="any" min="0" value="${v("SL")}"></label><label>TP1<input id="e-tp1" type="number" step="any" min="0" value="${v("TP1")}"></label><label>TP2<input id="e-tp2" type="number" step="any" min="0" value="${v("TP2")}"></label><label>TP3<input id="e-tp3" type="number" step="any" min="0" value="${v("TP3")}"></label>
      ${cfg.condiviso ? `<label>Comm. ingresso €<input id="e-ci" type="number" step="any" min="0" value="${v("Comm_Ingresso")}"></label><label>Comm. uscita €<input id="e-cu" type="number" step="any" min="0" value="${v("Comm_Uscita")}"></label><label>Costi extra €<input id="e-ce" type="number" step="any" min="0" value="${v("Costi_Extra")}"></label><label>Motivazione<input id="e-m" class="largo" value="${v("Motivazione")}"></label>` : `<label>Note<input id="e-n" class="largo" value="${v("Note")}"></label>`}
      <button class="az pri" type="submit">Salva correzioni</button></form>
      <form id="f-ch" style="margin-top:12px"><label>${c ? "Prezzo uscita" : "Chiudi: prezzo uscita"}<input id="c-p" type="number" step="any" min="0" value="${v("Prezzo_Uscita")}" required></label><label>Data uscita<input id="c-d" type="date" value="${esc(r.Data_Uscita || new Date().toISOString().slice(0, 10))}" required></label>
      ${cfg.condiviso ? `<label>Motivo uscita<input id="c-m" class="largo" value="${v("Motivo_Uscita")}"></label>` : ""}<button class="az" type="submit">${c ? "Aggiorna chiusura" : "Chiudi il trade"}</button>
      ${c ? '<button class="az" type="button" id="b-ria">↩︎ Riapri</button>' : ""}<button class="az" type="button" id="b-del">🗑️ Elimina</button></form></div>`;
    const salva = (mod, ok) => { righe = righe.map((x) => (x.ID === r.ID ? { ...x, ...mod } : x)); return invia(ok); };
    $("f-ed").addEventListener("submit", (e) => { e.preventDefault(); const g = (i) => ($(i).value === "" ? null : $(i).value);
      salva({ Prezzo_Ingresso: g("e-p"), Quantita: g("e-q"), SL: g("e-sl"), TP1: g("e-tp1"), TP2: g("e-tp2"), TP3: g("e-tp3"),
        ...(cfg.condiviso ? { Comm_Ingresso: g("e-ci"), Comm_Uscita: g("e-cu"), Costi_Extra: g("e-ce"), Motivazione: g("e-m") } : { Note: g("e-n") }) }, "Correzioni salvate"); });
    $("f-ch").addEventListener("submit", (e) => { e.preventDefault(); salva({ Stato: "Chiuso", Prezzo_Uscita: $("c-p").value, Data_Uscita: $("c-d").value, ...(cfg.condiviso ? { Motivo_Uscita: $("c-m").value || null } : {}) }, "Trade chiuso"); });
    if ($("b-ria")) $("b-ria").addEventListener("click", () => salva({ Stato: "Aperto", Prezzo_Uscita: null, Data_Uscita: null, ...(cfg.condiviso ? { Motivo_Uscita: null } : {}) }, "Trade riaperto"));
    $("b-del").addEventListener("click", () => { if (confirm(`Eliminare il trade ${r.Ticker}?`)) { righe = righe.filter((x) => x.ID !== r.ID); sel = null; invia("Trade eliminato"); } });
  }
  async function invia(ok) {
    msg("Salvataggio…");
    const r = await api(cfg.api, { sha, righe });
    if (!r.ok) { msg(erroreDi(r) + (r.stato === 409 ? "" : ""), "err"); if (r.stato === 409) setTimeout(() => carica(false), 1200); else await carica(false); return false; }
    msg(ok + (cfg.condiviso ? (r.dati.alert === "avviato" ? " · avviso Telegram in invio" : " · avviso Telegram NON avviato") : "") + " (commit nel repo privato)");
    await carica(false); return true;
  }
  const nuovo = (g) => ({ Ticker: g("a-t"), Direzione: g("a-d"), Data_Ingresso: g("a-dt"), Prezzo_Ingresso: g("a-p"), Quantita: g("a-q"), SL: g("a-sl"), TP1: g("a-tp1"), TP2: g("a-tp2"), TP3: g("a-tp3"), Stato: "Aperto",
    ...(cfg.condiviso ? { Comm_Ingresso: g("a-ci"), Costi_Extra: g("a-ce"), Motivazione: g("a-m") } : { Note: g("a-n") }) });
  async function carica(prima) {
    const r = await api("/api/dati/" + cfg.dato);
    if (!r.ok) { $("sottotitolo").textContent = erroreDi(r); return; }
    righe = r.dati.righe || []; sha = r.dati.sha; puo = !!r.dati.puo_modificare;
    if (prima) {
      const p = await prezzi(); px = p.p; dataPx = p.data;
      $("tab").addEventListener("click", (e) => { const tr = e.target.closest("tr[data-i]"); if (tr) { sel = tr.dataset.i; disegna(); } });
      const blocco = $("blocco-add") || $("f-add").closest(".box"); blocco.hidden = !puo;
      $("f-add").addEventListener("submit", async (e) => { e.preventDefault(); const g = (i) => ($(i).value === "" ? null : $(i).value);
        righe = [...righe, nuovo(g)]; if (await invia("Trade aggiunto")) $("f-add").reset(); });
    }
    $("sottotitolo").textContent = `${righe.length} trade${puo ? "" : " · sola lettura"} · prezzi: ultima chiusura dello screening${dataPx ? " del " + dataPx : " (non disponibile)"}`;
    disegna();
  }
  carica(true);
};
