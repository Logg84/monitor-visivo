(() => {
  "use strict";
  const { $, esc, num, fmt, dmy, msg, api, erroreDi } = window.C;
  let W = null, sha = null, scr = {}, sel = null, dataScr = null;
  const MESI4 = 4 * 30.5 * 864e5;
  const rivedere = (e) => { const t = Date.parse(e.last_reviewed || e.created); return Number.isFinite(t) && Date.now() - t > MESI4; };
  const nomeSett = (e) => e.sector || "n/d";
  // «Qualità dati» dello screening: «—» = nessun problema; altrimenti l'etichetta (es. «dato fermo da 2 sedute», «2 barre da fonte di backup»).
  function badgeDati(ex) {
    const q = String((ex && ex.Qualita_Dati) || "").replace(/^⚠️\s*/, "").trim();
    if (!q || q === "—") return "";
    return `<span class="bq" title="${esc(q)}">⚠️ ${esc(q.split(";")[0].replace(/\s*\(.*$/, ""))}</span>`;
  }
  const lv = (e) => ["L1", "L2", "L3"].map((k) => (e.levels && num(e.levels[k]) !== null ? `${k} ${fmt(e.levels[k])}` : "")).filter(Boolean).join(" · ");
  // Testo lungo in cella: ellipsis + tooltip col testo completo (title).
  const taglia = (s) => { const t = String(s ?? ""); return t.length > 24 ? `<span class="taglia" title="${esc(t)}">${esc(t)}</span>` : esc(t); };

  function filtrate() {
    const q = $("f-q").value.trim().toLowerCase(), o = $("f-or").value, s = $("f-se").value, st = $("f-st").checked;
    return W.entries.filter((e) => (!q || e.ticker.toLowerCase().includes(q)) && (!o || e.origin === o) && (!s || nomeSett(e) === s) && (!st || rivedere(e)))
      .sort((a, b) => (a.origin === b.origin ? a.ticker.localeCompare(b.ticker) : a.origin === "manual" ? -1 : 1));
  }
  function disegna() {
    const d = filtrate(), tot = W.entries;
    $("conteggio").textContent = `${d.length} su ${tot.length}`;
    $("kpi").innerHTML = [["Titoli", tot.length], ["👤 manuali", tot.filter((e) => e.origin === "manual").length], ["🤖 auto", tot.filter((e) => e.origin !== "manual").length],
      ["Da rivedere", tot.filter(rivedere).length], ["Con data target", tot.filter((e) => e.target_date).length]].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join("");
    const testa = ["Ticker", "Orig.", "Settore", "Livelli personali", "Data target", "Rivisto", "Segnale", "Punti", "Prezzo", "DD%", "RSI", "Wyckoff", "Dati", ""];
    $("tab").innerHTML = `<thead><tr>${testa.map((t) => `<th>${t}</th>`).join("")}</tr></thead><tbody>` + (d.length ? d.map((e) => {
      const x = scr[e.ticker] || {}, ex = x.extra || {};
      return `<tr class="cl${e.ticker === sel ? " sel" : ""}" data-t="${esc(e.ticker)}"><td><b class="tk" data-scheda="${esc(e.ticker)}">${esc(e.ticker)}</b></td><td>${e.origin === "manual" ? "👤" : "🤖"}</td><td>${taglia(nomeSett(e))}</td><td>${taglia(lv(e)) || "–"}</td>
        <td>${esc(dmy(e.target_date))}</td><td>${esc(dmy(e.last_reviewed))}${rivedere(e) ? " ⏳" : ""}</td><td>${taglia(x.segnale || "–")}</td><td>${x.punti ?? "–"}</td>
        <td>${fmt(ex.Prezzo)}</td><td>${num(ex["DD%"]) === null ? "–" : fmt(ex["DD%"], 1) + "%"}</td><td>${num(ex.RSI) === null ? "–" : fmt(ex.RSI, 0)}</td><td>${taglia(ex.Wyckoff || "–")}</td><td>${badgeDati(ex)}</td><td><button type="button" class="az del" data-del="${esc(e.ticker)}" title="Rimuovi ${esc(e.ticker)} dalla watchlist" aria-label="Rimuovi ${esc(e.ticker)}">🗑️</button></td></tr>`;
    }).join("") : `<tr><td colspan="${testa.length}" class="vuoto">Nessun titolo con questi filtri.</td></tr>`) + "</tbody>";
    dettaglio();
  }
  function dettaglio() {
    const e = W.entries.find((x) => x.ticker === sel);
    if (!e) { $("det").innerHTML = ""; return; }
    const l = e.levels || {};
    $("det").innerHTML = `<div class="box"><h3>✏️ ${esc(e.ticker)} — livelli, data target e azioni</h3>
      <p class="muted">${e.origin === "manual" ? "👤 inserito a mano" : "🤖 gestito dal sistema (esce solo con la regola delle 5 chiusure)"} · creato ${esc(dmy(e.created))} · settore ${esc(nomeSett(e))}${e.sub ? " / " + esc(e.sub) : ""} · POC ${fmt(e.poc)} · VWAP ${fmt(e.vwap)}</p>
      <form id="f-ed"><label>L1 (supporto forte)<input id="e-l1" type="number" step="any" min="0" value="${l.L1 ?? ""}"></label><label>L2 (supporto medio)<input id="e-l2" type="number" step="any" min="0" value="${l.L2 ?? ""}"></label><label>L3 (resistenza)<input id="e-l3" type="number" step="any" min="0" value="${l.L3 ?? ""}"></label>
      <label>Data target (alert Telegram)<input id="e-td" type="date" value="${esc(e.target_date || "")}"></label><button class="az pri" type="submit">Salva</button>
      <button class="az" type="button" id="b-rev">✅ Segna come rivisto</button><button class="az" type="button" id="b-del">🗑️ Rimuovi dalla watchlist</button></form>
      <p class="muted">Vuoto o 0 = nessun livello. Un titolo 🤖 rimosso non rientra più da solo nella tua lista (puoi riaggiungerlo a mano).</p></div>`;
    $("f-ed").addEventListener("submit", (ev) => { ev.preventDefault(); op({ op: "edit", ticker: e.ticker, levels: { L1: $("e-l1").value, L2: $("e-l2").value, L3: $("e-l3").value }, target_date: $("e-td").value || null }, "Livelli e data salvati"); });
    $("b-rev").addEventListener("click", () => op({ op: "review", ticker: e.ticker }, "Segnato come rivisto"));
    $("b-del").addEventListener("click", () => { if (confirm(`Rimuovere ${e.ticker} dalla watchlist?`)) op({ op: "remove", ticker: e.ticker }, e.ticker + " rimosso"); });
  }
  async function op(corpo, ok) {
    msg("Salvataggio…");
    const r = await api("/api/watchlist", corpo);
    if (!r.ok) { msg(erroreDi(r), "err"); return; }
    if (corpo.op === "remove") sel = null;
    msg(ok + " (commit nel repo privato)"); await carica(false);
  }
  async function carica(prima = true) {
    const r = await api("/api/dati/watchlist");
    if (!r.ok) { $("sottotitolo").textContent = erroreDi(r); return; }
    W = r.dati.dati; sha = r.dati.sha;
    if (prima) {
      const s = await api("/api/screening");
      if (s.ok && s.dati) { dataScr = s.dati.data; for (const x of s.dati.righe || []) scr[x.ticker] = x; }
      $("f-se").innerHTML = '<option value="">tutti</option>' + [...new Set(W.entries.map(nomeSett))].sort().map((x) => `<option>${esc(x)}</option>`).join("");
      try { const o = localStorage.getItem("wl-origine"); if (o !== null && ["", "manual", "auto"].includes(o)) $("f-or").value = o; } catch (e) { /* facoltativo */ }
      $("f-or").addEventListener("input", () => { try { localStorage.setItem("wl-origine", $("f-or").value); } catch (e) { /* facoltativo */ } });
      for (const id of ["f-q", "f-or", "f-se", "f-st"]) $(id).addEventListener("input", disegna);
      $("tab").addEventListener("click", (ev) => { const bd = ev.target.closest("button.del"); if (bd) { ev.stopPropagation(); const t = bd.dataset.del; if (confirm(`Rimuovere ${t} dalla tua watchlist?`)) op({ op: "remove", ticker: t }, t + " rimosso"); return; }
        const tr = ev.target.closest("tr[data-t]"); if (tr) { sel = tr.dataset.t; disegna(); $("det").scrollIntoView({ behavior: "smooth", block: "nearest" }); } });
      $("f-add").addEventListener("submit", (ev) => { ev.preventDefault();
        op({ op: "add", ticker: $("a-t").value, levels: { L1: $("a-l1").value, L2: $("a-l2").value, L3: $("a-l3").value }, target_date: $("a-td").value || null }, "Titolo aggiunto").then(() => $("f-add").reset()); });
    }
    $("sottotitolo").textContent = `${W.entries.length} titoli · file aggiornato ${String(W.updated || "").slice(0, 16).replace("T", " ")} UTC${dataScr ? " · screening del " + dataScr : ""}`;
    disegna();
  }
  carica();
})();
