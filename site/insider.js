(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const okLink = (u) => /^https?:\/\//i.test(String(u || ""));
  const num = (x) => { const n = Number(x); return x === null || x === undefined || x === "" || !Number.isFinite(n) ? null : n; };
  const usd = (v) => { v = num(v); if (v === null) return "n/d"; const a = Math.abs(v);
    return a >= 1e9 ? (v / 1e9).toFixed(2) + " B$" : a >= 1e6 ? (v / 1e6).toFixed(2) + " M$" : a >= 1e3 ? Math.round(v / 1e3) + " k$" : Math.round(v) + " $"; };
  const cap = (v) => { v = num(v); return v === null ? "n/d" : v >= 1e9 ? (v / 1e9).toFixed(1) + " B$" : Math.round(v / 1e6) + " M$"; };
  const dmy = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ""); return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : "–"; };
  const OGGI = Date.now();
  const giorniFa = (d) => { const t = Date.parse(d); return Number.isFinite(t) ? Math.max(0, Math.floor((OGGI - t) / 864e5)) : null; };
  const linkA = (u, t) => (okLink(u) ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${t}</a>` : "");
  const tab = (colonne, righe) => righe.map((r) => Object.fromEntries(colonne.map((c, i) => [c, r[i]])));

  let P, acq = [], resto = [], vista = "cl", titoli = [], selT = null;

  const FASCE = ["Nano", "Micro", "Small", "Mid", "n/d"];
  const sel = (id) => [...$(id).selectedOptions].map((o) => o.value);

  function filtrate() {
    const gg = Number($("f-gg").value) || 60, k = (Number($("f-k").value) || 0) * 1000, fa = sel("f-fa"), ru = sel("f-ru"), cl = $("f-cl").checked;
    return acq.filter((r) => r.gf !== null && r.gf <= gg && (num(r["Importo_$"]) ?? 0) >= k && fa.includes(r.Fascia || "n/d")
      && (!ru.length || ru.includes(r.Classe)) && (!cl || r.Cluster === true))
      .sort((a, b) => (b.Cluster === true) - (a.Cluster === true) || (num(b.Rilevanza) ?? 0) - (num(a.Rilevanza) ?? 0) || String(b.Data).localeCompare(String(a.Data)));
  }

  function perTitolo(d) {
    const m = new Map();
    for (const r of d) { if (!m.has(r.Ticker)) m.set(r.Ticker, []); m.get(r.Ticker).push(r); }
    const out = [];
    for (const [t, g] of m) {
      g.sort((a, b) => String(b.Data).localeCompare(String(a.Data)));
      const ids = new Set(g.map((x) => x.Insider_id || x.Insider));
      const cl = g.filter((x) => x.Cluster === true);
      const clu = !cl.length ? "" : Math.min(...cl.map((x) => x.gf)) <= (P.parametri.cluster_giorni || 30) ? "✅" : "🕰️";
      const big = g.reduce((a, b) => ((num(b["Importo_$"]) ?? 0) > (num(a["Importo_$"]) ?? 0) ? b : a));
      out.push({ ...g[0], Chi: chi(big) + (ids.size > 1 ? ` +${ids.size - 1}` : ""), Ins: ids.size, Acq: g.length,
        Totale: g.reduce((s, x) => s + (num(x["Importo_$"]) ?? 0), 0), Clu: clu, Cluster: cl.length > 0,
        Rilevanza: Math.max(...g.map((x) => num(x.Rilevanza) ?? 0)), gf: Math.min(...g.map((x) => x.gf)), Wl: g.some((x) => x.In_watchlist === true) });
    }
    return out.sort((a, b) => b.Rilevanza - a.Rilevanza || a.gf - b.gf);
  }
  const chi = (r) => `${r.Insider ?? ""}${r.Classe ? " · " + r.Classe : ""}`;
  const dd = (r) => { const v = num(r["DD%"]); return v === null ? "n/d" : (v > 0 ? "+" : "") + v.toFixed(1) + "%"; };

  function disegna() {
    const d = filtrate(), dt = perTitolo(d); titoli = dt;
    $("conteggio").textContent = `${d.length} acquisti · ${dt.length} titoli`;
    $("kpi").innerHTML = [["Acquisti P (filtrati)", d.length], ["Titoli", dt.length], ["Righe in cluster", d.filter((r) => r.Cluster === true).length],
      ["Capitale degli insider", usd(d.reduce((s, r) => s + (num(r["Importo_$"]) ?? 0), 0))], ["Su titoli in watchlist", d.filter((r) => r.In_watchlist === true).length],
      ["Sconto ≥20% dal massimo", d.filter((r) => (num(r["DD%"]) ?? 0) <= -20).length]].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join("");
    const V = { cl: dt.filter((r) => r.Cluster), wl: dt.filter((r) => r.Wl), dd: dt.filter((r) => (num(r["DD%"]) ?? 0) <= -20), all: dt, tx: d };
    const NOMI = { cl: "🎯 Cluster", wl: "👀 Watchlist", dd: "📉 Sconto ≥20%", all: "🏷️ Tutti i titoli", tx: "📋 Acquisti" };
    $("tabs").innerHTML = Object.keys(NOMI).map((k) => `<button type="button" data-v="${k}" aria-pressed="${k === vista}">${NOMI[k]} (${V[k].length})</button>`).join("");
    const righe = V[vista];
    document.querySelectorAll("#tronca").forEach((e) => e.remove());
    const tx = vista === "tx";
    const testa = tx ? ["Ticker", "Nome", "Data", "fa", "Insider · ruolo", "Importo", "Op.", "10b5", "Clu", "N.👔", "Cap", "Mkt cap", "Eseg $", "DD max 5a", "RSI", "Wyckoff", "Segnale", "Rilev.", "SEC"]
      : ["Ticker", "Nome", "Ultimo", "fa", "Insider principale", "N.👔", "Acq.", "Totale", "Clu", "Cap", "Mkt cap", "Prezzo", "DD max 5a", "RSI", "Wyckoff", "Segnale", "Rilev.", "👀", "SEC"];
    const cella = (r) => tx
      ? [r.Ticker, r.Nome, dmy(r.Data), r.gf + " g", chi(r), usd(r["Importo_$"]), (num(r.Operazioni) ?? 1) > 1 ? "×" + r.Operazioni : "", (num(r.Pianificato_10b5) ?? 0) > 0 ? "📋" : "",
        r.Cluster ? "✅" : "", r.Insider_distinti ?? "", r.Fascia, cap(r["MarketCap_$"]), num(r.Prezzo_exec) === null ? "n/d" : num(r.Prezzo_exec).toFixed(2), dd(r), r.RSI ?? "", r.Wyckoff, r.Segnale, r.Rilevanza ?? "", linkA(r.Link_EDGAR, "🔗")]
      : [r.Ticker, r.Nome, dmy(r.Data), r.gf + " g", r.Chi, r.Ins, r.Acq, usd(r.Totale), r.Clu, r.Fascia, cap(r["MarketCap_$"]), num(r.Prezzo) === null ? "n/d" : num(r.Prezzo).toFixed(2), dd(r), r.RSI ?? "", r.Wyckoff, r.Segnale, r.Rilevanza ?? "", r.Wl ? "👀" : "", linkA(r.Link_EDGAR, "🔗")];
    const html = (v, i) => (i === 0 ? `<td><b>${esc(v)}</b></td>` : i === testa.length - 1 ? `<td>${v}</td>` : `<td>${esc(v)}</td>`);
    $("tab").innerHTML = `<thead><tr>${testa.map((t) => `<th>${t}</th>`).join("")}</tr></thead><tbody>` +
      (righe.length ? righe.slice(0, 600).map((r, i) => `<tr class="cl" data-t="${esc(r.Ticker)}">${cella(r).map(html).join("")}</tr>`).join("")
        : `<tr><td colspan="${testa.length}" class="vuoto">Nessuna riga con questi filtri: allarga la finestra o abbassa la soglia.</td></tr>`) + "</tbody>";
    if (righe.length > 600) $("tab").insertAdjacentHTML("afterend", `<p class="muted" id="tronca">Mostrate le prime 600 righe su ${righe.length}: restringi i filtri.</p>`);
    dettaglio(selT && righe.some((r) => r.Ticker === selT) ? selT : (righe[0] && righe[0].Ticker));
  }

  function dettaglio(t) {
    selT = t || null;
    document.querySelectorAll("#tab tbody tr").forEach((r) => r.classList.toggle("sel", r.dataset.t === t));
    if (!t) { $("det").innerHTML = ""; return; }
    const g = acq.filter((r) => r.Ticker === t).sort((a, b) => String(b.Data).localeCompare(String(a.Data)));
    const r0 = g[0];
    $("det").innerHTML = `<div class="det"><h3>Dettaglio — ${esc(r0.Nome || t)} (<code>${esc(t)}</code>)</h3>
      <div class="muted">${g.length} acquisti in cache · ${usd(g.reduce((s, x) => s + (num(x["Importo_$"]) ?? 0), 0))} · Drawdown dal max 5 anni: ${dd(r0)} · Wyckoff: ${esc(r0.Wyckoff || "—")} · Mkt cap: ${cap(r0["MarketCap_$"])} (${esc(r0.Fascia || "n/d")})</div>
      <p>${linkA(r0.Link_EDGAR, "🔗 Form 4 su SEC EDGAR (fonte primaria)")} ${okLink(r0.Link_TV) ? " · " + linkA(r0.Link_TV, "📈 Grafico su TradingView") : ""}</p>
      <div class="tabella-wrap"><table><thead><tr><th>Data</th><th>Insider · ruolo</th><th>Importo</th><th>Op.</th><th>10b5</th><th>Azioni</th><th>Eseg $</th><th>Intest.</th><th>Clu</th><th>N.👔</th><th>Operazione (codice EDGAR)</th></tr></thead><tbody>` +
      g.map((r) => `<tr><td>${dmy(r.Data)}</td><td>${esc(chi(r))}</td><td>${usd(r["Importo_$"])}</td><td>${(num(r.Operazioni) ?? 1) > 1 ? "×" + r.Operazioni : ""}</td><td>${(num(r.Pianificato_10b5) ?? 0) > 0 ? "📋" : ""}</td>
        <td>${num(r.Share) === null ? "n/d" : Math.round(num(r.Share)).toLocaleString("it-IT")}</td><td>${num(r.Prezzo_exec) === null ? "n/d" : num(r.Prezzo_exec).toFixed(2)}</td><td>${esc(r.Ownership || "")}</td><td>${r.Cluster ? "✅" : ""}</td><td>${r.Insider_distinti ?? ""}</td><td>${esc(r.Azione || "")}</td></tr>`).join("") +
      `</tbody></table></div><p class="muted">📋 = il Form 4 cita un piano 10b5-1 (acquisto pianificato, non discrezionale). Vendite e altri codici: vedi la pratica su EDGAR.</p></div>`;
  }

  function disegnaResto() {
    const m = P.meta_resto || {}, p = P.parametri || {};
    $("resto-nota").textContent = `Stesso motore dei cluster applicato a tutto il file SEC dei filer, fuori dall'universo screening, con microcap (< ${(p.mcap_min / 1e9).toFixed(0)} B$) e colossi (> ${(p.mcap_max / 1e9).toFixed(0)} B$) esclusi. Misura = flottante dichiarato in copertina 10-K. La spazzata è a rotazione: ogni giro copre una fetta del file.`;
    $("kpi-resto").innerHTML = [["Cluster in tabella", resto.length], ["Spazzate complete", m.spazzate_complete ?? 0], ["File dei filer (ticker)", m.universo ?? "—"], ["Rivisti nell'ultimo giro", m.lavorati ?? "—"]]
      .map(([k, v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`).join("");
    const testa = ["Ticker", "Nome", "Ultimo acquisto", "fa", "Clu", "N.👔", "Tot 30g", "Acq.", "Finestra", "Insider principale", "Ruolo top", "Ruoli", "10b5-1", "Cap", "Float", "Rilev.", "👀", "SEC"];
    $("tab-resto").innerHTML = `<thead><tr>${testa.map((t) => `<th>${t}</th>`).join("")}</tr></thead><tbody>` + (resto.length ? resto.map((r) => {
      const c = [r.Ticker, r.Nome, dmy(r.Data), (giorniFa(r.Data) ?? "–") + " g", r.Fresco ? "✅" : "🕰️", r.Insider_distinti, usd(r["Importo_30g_$"]), r.Acquisti, usd(r["Importo_finestra_$"]), r.Chi, r.Classe_top, r.Ruoli, r.Pianificati_10b5, r.Fascia, cap(r["Float_$"]), r.Rilevanza, r.In_watchlist ? "👀" : ""];
      return `<tr><td><b>${esc(c[0])}</b></td>${c.slice(1).map((v) => `<td>${esc(v ?? "")}</td>`).join("")}<td>${linkA(r.Link_EDGAR, "🔗")}</td></tr>`;
    }).join("") : `<tr><td colspan="${testa.length}" class="vuoto">Nessun cluster trovato finora nel resto del file.</td></tr>`) + "</tbody>";
  }

  async function avvia() {
    try {
      const r = await fetch("/api/pagina/insider", { cache: "no-store" });
      if (r.status === 401) { $("sottotitolo").textContent = "Accesso richiesto: effettua il login."; return; }
      if (r.status === 404) { $("sottotitolo").textContent = "Dati non ancora caricati: lancia «esporta-pagine-d1» (pagina insider) nel repo privato."; return; }
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json(); P = j.dati;
      acq = tab(P.acquisti.colonne, P.acquisti.righe).map((r) => ({ ...r, gf: giorniFa(r.Data) }));
      resto = tab(P.resto.colonne, P.resto.righe).sort((a, b) => (num(b.Rilevanza) ?? 0) - (num(a.Rilevanza) ?? 0));
      const gen = String((P.meta || {}).generated_at || j.aggiornato || "").slice(0, 16).replace("T", " ");
      $("sottotitolo").textContent = `Ultimo aggiornamento dati: ${gen || "n/d"} · finestra massima ${P.parametri.lookback} giorni · soglia alert ${Math.round(P.parametri.alert_min_usd / 1000)} k$ o cluster ≥2 insider in ${P.parametri.cluster_giorni} giorni`;
      $("f-gg").max = P.parametri.lookback;
      $("f-fa").innerHTML = FASCE.map((f) => `<option selected>${f}</option>`).join("");
      $("f-ru").innerHTML = [...new Set(acq.map((r) => r.Classe).filter(Boolean))].sort().map((c) => `<option>${esc(c)}</option>`).join("");
      for (const id of ["f-gg", "f-k", "f-fa", "f-ru", "f-cl"]) $(id).addEventListener("input", disegna);
      $("tabs").addEventListener("click", (e) => { const b = e.target.closest("button[data-v]"); if (b) { vista = b.dataset.v; disegna(); } });
      $("tab").addEventListener("click", (e) => { const tr = e.target.closest("tr[data-t]"); if (tr && !e.target.closest("a")) dettaglio(tr.dataset.t); });
      disegna(); disegnaResto();
    } catch (e) { $("sottotitolo").textContent = "Dati non disponibili: " + e.message; }
  }
  avvia();
})();
