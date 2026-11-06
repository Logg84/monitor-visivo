(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const n = (v) => typeof v === "number" && Number.isFinite(v);
  const f1 = (v, segno = true) => (n(v) ? (segno && v > 0 ? "+" : "") + v.toFixed(1) : "n/d");
  let D, scr = null, tab = "gics", st = { win: "Δ 3m", ord: "Δ 3m", asc: false, cest: true, gics: "", sel: "", cand: { k: "Priorità", asc: false } };

  const NUM = new Set(["CW 1m", "CW 3m", "CW 6m", "EW 1m", "EW 3m", "EW 6m", "Δ 1m", "Δ 3m", "Δ 6m", "RS 3m", "Range Δ", "Pos 52"]);
  const cella = (r, c) => {
    const v = r[c];
    if (c === "Score") return `<td>${n(v) ? `<span class="sc"><i style="width:${Math.max(0, Math.min(100, v))}%"></i></span>${Math.round(v)}` : "n/d"}</td>`;
    if (NUM.has(c)) return `<td class="${n(v) ? (v < 0 ? "neg" : v > 0 && c.startsWith("Δ") ? "pos" : "") : "muted"}">${f1(v, c !== "Pos 52" && c !== "Range Δ")}</td>`;
    if (c === "Streak") return `<td>${n(v) ? (v > 0 ? "+" : "") + Math.round(v) : "n/d"}</td>`;
    if (c === "Consistenza") return `<td>${n(v) ? Math.round(v) : "n/d"}</td>`;
    return `<td>${esc(v ?? "") || '<span class="muted">—</span>'}</td>`;
  };
  const tabella = (righe, cols, id = "") => `<div class="tabella-wrap"><table ${id ? `id="${id}"` : ""}><thead><tr>${cols.map((c) => `<th data-c="${esc(c)}">${esc(c)}</th>`).join("")}</tr></thead><tbody>` +
    (righe.length ? righe.map((r) => "<tr>" + cols.map((c) => cella(r, c)).join("") + "</tr>").join("") : `<tr><td colspan="${cols.length}" class="vuoto">Nessuna riga.</td></tr>`) + "</tbody></table></div>";
  const ordina = (arr, k, asc) => [...arr].sort((a, b) => {
    const x = a[k], y = b[k]; if (!n(x) && !n(y)) return String(x ?? "").localeCompare(String(y ?? "")); if (!n(x)) return 1; if (!n(y)) return -1; return asc ? x - y : y - x; });

  const heat = (righe, cols, nomi) => {
    const mx = Math.max(...righe.flatMap((r) => cols.map((c) => Math.abs(r[c] ?? 0))), 1);
    const bg = (v) => !n(v) ? "" : `background:${v > 0 ? "rgba(63,185,80," : "rgba(248,81,73,"}${(0.1 + 0.55 * Math.abs(v) / mx).toFixed(2)})`;
    return `<div class="tabella-wrap"><table class="heat"><thead><tr><th>Settore</th>${nomi.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>` +
      righe.map((r) => `<tr><td>${esc(r.Settore)}</td>${cols.map((c) => `<td style="${bg(r[c])}">${n(r[c]) ? f1(r[c]) : "—"}</td>`).join("")}</tr>`).join("") + "</tbody></table></div>";
  };
  const barre = (righe, col, titolo) => {
    const v = ordina(righe.filter((r) => n(r[col])), col, true), mx = Math.max(...v.map((r) => Math.abs(r[col])), 1);
    return `<h2>${titolo}</h2><div class="box" style="padding:8px 14px">` + v.map((r) => { const w = Math.abs(r[col]) / mx * 50, p = r[col] > 0;
      return `<div class="bar"><span>${esc(r.Settore)}</span><div class="t"><i style="${p ? "left:50%" : `left:${50 - w}%`};width:${w}%;background:${p ? "#3FB950" : "#F85149"}"></i></div><span>${f1(r[col])}</span></div>`; }).join("") + "</div>";
  };
  const kpi = (e, v) => `<div><span>${esc(e)}</span><b>${esc(v)}</b></div>`;
  const gambe = (chiavi) => { const g = D.gambe.filter((r) => chiavi.includes(r.chiave)); if (!g.length) return `<p class="muted">Nessuna gamba disponibile.</p>`;
    const rr = g.map((r) => ({ Settore: r.label, Gamba: r.gamba, ETF: r.etf, "1m %": r.mom21, "3m %": r.mom63, "6m %": r.mom126, "RS 3m": r.rs63, "Pos 52s.": r.pos52 }));
    const cols = ["Settore", "Gamba", "ETF", "1m %", "3m %", "6m %", "RS 3m", "Pos 52s."];
    return `<div class="tabella-wrap"><table><thead><tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>` + rr.map((r) => "<tr>" + cols.map((c) => ["Settore", "Gamba", "ETF"].includes(c) ? `<td>${esc(r[c])}</td>` : `<td class="${n(r[c]) && r[c] < 0 ? "neg" : ""}">${f1(r[c], c !== "Pos 52s.")}</td>`).join("") + "</tr>").join("") + "</tbody></table></div>"; };

  function vistaGics() {
    $("ctl").innerHTML = `<section class="controlli"><label>Finestra del Δ<select id="w"><option>Δ 1m</option><option selected>Δ 3m</option><option>Δ 6m</option></select></label>
      <label>Ordina per<select id="o"><option value="win">Δ</option><option value="Score">Score</option><option value="CW 3m">Momentum 3m</option><option value="Settore">Settore</option></select></label></section>`;
    $("w").value = st.win; $("o").value = st.ord === st.win ? "win" : st.ord;
    const g = D.gics, gn = g.filter((r) => n(r["Δ 3m"])), k = st.ord === "Settore" ? "Settore" : st.ord === "win" ? st.win : st.ord;
    const v = k === "Settore" ? [...g].sort((a, b) => a.Settore.localeCompare(b.Settore, "it")) : ordina(g, k, false);
    const cols = ["Settore", "Etichetta CW", "Etichetta EW", "Stato", "Score", "CW 1m", "CW 3m", "CW 6m", "EW 1m", "EW 3m", "EW 6m", "Δ 1m", "Δ 3m", "Δ 6m", "RS 3m", "Consistenza", "Streak", "Range Δ", "Pos 52", "Guida"];
    const top = ordina(gn, "Δ 3m", false), sopra = g.filter((r) => r["Δ 3m"] > 0).length, sotto = g.filter((r) => r["Δ 3m"] < 0).length;
    const media = gn.length ? gn.reduce((s, r) => s + r["Δ 3m"], 0) / gn.length : null;
    $("out").innerHTML = tabella(v, cols) + `<div class="kpis">${kpi("Settori con EW sopra CW (3m)", `${sopra} (${sotto} sotto)`)}${kpi("Δ 3m medio", media === null ? "n/d" : f1(media) + " pt")}` +
      (top.length ? kpi("Vantaggio EW massimo", `${top[0].Settore} ${f1(top[0]["Δ 3m"])} pt`) + kpi("Vantaggio CW massimo", `${top[top.length - 1].Settore} ${f1(top[top.length - 1]["Δ 3m"])} pt`) : "") + "</div>" +
      (gn.length >= 2 ? `<h2>Δ per finestra</h2>` + heat(top, ["Δ 1m", "Δ 3m", "Δ 6m"], ["1 mese", "3 mesi", "6 mesi"]) + `<h2>Gambe a confronto (3 mesi)</h2>` + heat(ordina(g, "CW 3m", false), ["CW 3m", "EW 3m", "Δ 3m", "RS 3m"], ["CW 3m %", "EW 3m %", "Δ 3m pt", "RS pt"]) + barre(g, "Δ 3m", "Δ EW−CW a 3 mesi (pt)") : "") +
      `<details class="storiche"><summary>🧾 Gamba per gamba (singoli ETF)</summary>${gambe(g.map((r) => r.key))}</details>`;
    $("w").onchange = (e) => { st.win = e.target.value; if (st.ord !== "Score" && st.ord !== "CW 3m" && st.ord !== "Settore") st.ord = st.win; render(); };
    $("o").onchange = (e) => { st.ord = e.target.value === "win" ? st.win : e.target.value; render(); };
  }

  function vistaSotto() {
    const gs = [...new Set(D.sotto.map((r) => r.GICS))].sort();
    $("ctl").innerHTML = `<section class="controlli"><label>Mostra<select id="c"><option value="1">Solo con paniere quotato</option><option value="0">Tutti</option></select></label>
      <label>Settore GICS<select id="g"><option value="">Tutti</option>${gs.map((x) => `<option ${st.gics === x ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></label>
      <label>Ordina per<select id="o"><option value="Δ 3m">Δ</option><option value="Score">Score</option><option value="Settore">Settore</option></select></label></section>`;
    $("c").value = st.cest ? "1" : "0"; $("o").value = ["Δ 3m", "Score", "Settore"].includes(st.ord) ? st.ord : "Δ 3m";
    let v = D.sotto.filter((r) => (!st.cest || r["Etichetta CW"] !== "—" || r["Etichetta EW"] !== "—") && (!st.gics || r.GICS === st.gics));
    v = st.ord === "Settore" ? v.sort((a, b) => a.Settore.localeCompare(b.Settore, "it")) : ordina(v, st.ord, false);
    const cols = ["Settore", "GICS", "Stato", "Score", "CW 1m", "CW 3m", "CW 6m", "EW 1m", "EW 3m", "EW 6m", "Δ 1m", "Δ 3m", "Δ 6m", "RS 3m", "Consistenza", "Streak", "Range Δ", "Pos 52", "Guida", "Lettura"];
    const sn = ordina(D.sotto.filter((r) => n(r["Δ 3m"])), "Δ 3m", false);
    const sel = D.sotto.find((r) => r.key === st.sel) || D.sotto[0];
    $("out").innerHTML = tabella(v, cols) + `<p class="muted">${D.sotto.filter((r) => r["Etichetta CW"] !== "—" || r["Etichetta EW"] !== "—").length} sotto-settori su ${D.sotto.length} hanno un paniere quotato; gli altri sono solo etichette (nessun ETF = nessun numero, non «neutro»).</p>` +
      (sn.length >= 2 ? `<h2>Δ per sotto-settore</h2>` + heat(sn, ["Δ 1m", "Δ 3m", "Δ 6m"], ["1 mese", "3 mesi", "6 mesi"]) + barre(D.sotto, "Δ 3m", "Δ EW−CW a 3 mesi (pt)") : `<p class="muted">Pochi sotto-settori con gemello EW: Δ non confrontabile.</p>`) +
      `<h2>Dettaglio sotto-settore</h2><section class="controlli"><label>Sotto-settore<select id="d">${D.sotto.map((r) => `<option value="${esc(r.key)}" ${r.key === sel.key ? "selected" : ""}>${esc(r.Settore)} · ${esc(r.GICS)}</option>`).join("")}</select></label></section>` +
      `<div class="kpis">${kpi("Stato", `${sel.Stato}${n(sel.Score) ? ` · ${Math.round(sel.Score)}/100` : ""}`)}${kpi("Momentum 3m", `CW ${f1(sel["CW 3m"])}% · EW ${f1(sel["EW 3m"])}%`)}${kpi("Δ EW−CW 3m", n(sel["Δ 3m"]) ? f1(sel["Δ 3m"]) + " pt" : "n/d")}` +
      `${kpi("Consistenza · fila", `${n(sel.Consistenza) ? Math.round(sel.Consistenza) + "%" : "n/d"} · ${n(sel.Streak) ? Math.round(sel.Streak) + " sedute" : "n/d"}`)}${kpi("Rapporto EW/CW", `${n(sel["Range Δ"]) ? Math.round(sel["Range Δ"]) + "% range" : "n/d"} · ${sel.Guida}`)}</div>` +
      (sel.Note ? `<p class="muted">${esc(sel.Note)}</p>` : "") + `<p class="muted">Vento: ${({ favore: "a favore (guida l'equal-weighted)", contro: "contro (guida la capitalizzazione)", misto: "misto/laterale" })[D.vento[sel.key]] || "non calcolabile (n/d)"}.</p>` + gambe([sel.key]);
    $("c").onchange = (e) => { st.cest = e.target.value === "1"; render(); };
    $("g").onchange = (e) => { st.gics = e.target.value; render(); };
    $("o").onchange = (e) => { st.ord = e.target.value; render(); };
    $("d").onchange = (e) => { st.sel = e.target.value; render(); };
  }

  function vistaTemi() {
    $("ctl").innerHTML = "";
    const v = ordina(D.temi, "Score", false), nEw = D.temi.filter((r) => n(r["Δ 3m"])).length;
    $("out").innerHTML = `<p class="muted">Oro, uranio, solare, energia pulita, robotica/IA, agribusiness, rame, retail: <b>non sono categorie GICS</b>, sono panieri tematici, spesso senza gemello equal-weighted. Nessun Δ significa: nessun confronto possibile, non «nessun vantaggio».</p>` +
      tabella(v, ["Settore", "Etichetta CW", "Etichetta EW", "Stato", "Score", "CW 1m", "CW 3m", "CW 6m", "EW 3m", "Δ 3m", "RS 3m", "Pos 52", "Lettura"]) + `<p class="muted">${nEw} temi su ${D.temi.length} hanno un confronto EW↔CW; gli altri si leggono solo in momentum e forza relativa.</p>`;
  }

  function vistaCand() {
    $("ctl").innerHTML = "";
    if (!scr) { $("out").innerHTML = `<p class="muted">Screening non disponibile.</p>`; return; }
    const righe = scr.righe.filter((r) => String(r.segnale || "").startsWith("🟡") || String(r.segnale || "").startsWith("🟢")).map((r) => ({ Ticker: r.ticker, Segnale: r.segnale, ...(r.extra || {}), Priorità: r.priorita }));
    if (!righe.length) { $("out").innerHTML = `<p class="muted">Nessun candidato 🟡/🟢 nell'ultimo screening.</p>`; return; }
    const cols = ["Ticker", "Settore", "Sotto-settore", "Sector", "Vento", "Δ EW−CW", "SottoΔ", "Segnale", "Bottom", "Priorità", "DD%", "Wyckoff"].filter((c) => righe.some((r) => r[c] !== undefined));
    const k = st.cand.k, v = [...righe].sort((a, b) => { const x = a[k], y = b[k]; if (x == null) return 1; if (y == null) return -1; return (typeof x === "number" ? y - x : String(x).localeCompare(String(y), "it")) * (st.cand.asc ? -1 : 1); });
    const vv = righe.reduce((m, r) => (m[r.Vento || "nd"] = (m[r.Vento || "nd"] || 0) + 1, m), {});
    $("out").innerHTML = `<p class="muted">Candidati 🟡/🟢 dello screening del ${esc(scr.data)} con il contesto di settore. Priorità = Bottom + bonus: ordina, non decide.</p>` +
      `<div class="kpis">${kpi("Con vento a favore", vv.favore || 0)}${kpi("Con vento contro", vv.contro || 0)}${kpi("Senza lettura / laterali", (vv.nd || 0) + (vv.misto || 0))}</div>` +
      `<div class="tabella-wrap"><table><thead><tr>${cols.map((c) => `<th data-k="${esc(c)}">${esc(c)}</th>`).join("")}</tr></thead><tbody>` +
      v.map((r) => "<tr>" + cols.map((c) => { const x = r[c]; return `<td>${x === undefined || x === null ? '<span class="muted">–</span>' : typeof x === "number" ? (c.startsWith("Δ") || c === "SottoΔ" ? f1(x) : Number.isInteger(x) ? x : x.toFixed(1)) : esc(x)}</td>`; }).join("") + "</tr>").join("") + "</tbody></table></div>" +
      ((vv.contro || 0) ? `<p class="muted">⚠️ I candidati su settore in calo restano VALIDI: il contesto suggerisce size più piccola, attesa di conferma o priorità più bassa. Nessuna regola cambia.</p>` : "");
    for (const th of $("out").querySelectorAll("th[data-k]")) th.onclick = () => { st.cand = { k: th.dataset.k, asc: st.cand.k === th.dataset.k ? !st.cand.asc : false }; render(); };
  }

  function render() { ({ gics: vistaGics, sotto: vistaSotto, temi: vistaTemi, cand: vistaCand })[tab](); }

  async function avvia() {
    try {
      const [r, rs] = await Promise.all([fetch("/api/pagina/settori", { cache: "no-store" }), fetch("/api/screening", { cache: "no-store" }).catch(() => null)]);
      if (r.status === 401) { $("sottotitolo").textContent = "Accesso richiesto: effettua il login."; return; }
      const j = await r.json();
      if (!r.ok) { $("sottotitolo").textContent = r.status === 404 ? "Dati non ancora caricati: lancia il workflow «esporta-pagine-d1» (pagina settori) nel repo privato." : (j.errore || "Errore nel caricamento."); return; }
      D = j.dati; try { scr = rs && rs.ok ? await rs.json() : null; } catch (e) { scr = null; }
      $("sottotitolo").textContent = `${D.meta.freschezza} · ${D.meta.n_settori} settori GICS, ${D.meta.n_sotto} sotto-settori, ${D.meta.n_temi} temi · mercato ${D.meta.benchmark}${n(D.meta.bench_mom63) ? " 3m " + f1(D.meta.bench_mom63) + "%" : ""}`;
    } catch (e) { $("sottotitolo").textContent = "Errore di rete."; return; }
    for (const b of document.querySelectorAll("#tabs button")) b.addEventListener("click", () => { tab = b.dataset.t; document.querySelectorAll("#tabs button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); render(); });
    render();
  }
  avvia();
})();
