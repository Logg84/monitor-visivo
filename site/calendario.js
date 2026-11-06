(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  let D, scr = null, vis = [], sel = -1;
  const okLink = (u) => /^https?:\/\//i.test(String(u || ""));

  function disegna() {
    const set = $("f-set").value, soloScr = $("f-scr").checked && scr, rec = $("f-rec").checked;
    const tickers = scr ? new Set(scr.righe.map((r) => r.ticker)) : null;
    const inizio = new Date().toISOString().slice(0, 8) + "01";
    vis = D.eventi.filter((e) => (!set || e.settore === set) && (!soloScr || tickers.has(e.ticker)) && (!rec || e.data_attesa >= inizio))
      .sort((a, b) => String(a.data_attesa).localeCompare(String(b.data_attesa)));
    sel = -1; $("det").innerHTML = "";
    const per = {}; vis.forEach((e) => { per[e.settore || "Altro"] = (per[e.settore || "Altro"] || 0) + 1; });
    $("kpi").innerHTML = Object.entries(per).sort().map(([s, c]) => `<div><span>${esc(s)}</span><b>${c}</b></div>`).join("");
    $("conteggio").textContent = `${vis.length} eventi · orizzonte: ${rec ? "da " + inizio : "tutti"}`;
    const wy = {}; if (scr) scr.righe.forEach((r) => { if (r.extra && r.extra.Wyckoff) wy[r.ticker] = r.extra.Wyckoff; });
    $("tab").innerHTML = "<thead><tr><th>Data</th><th>Ticker</th><th>Nome</th><th>Settore</th><th>Tipo</th><th>Descrizione</th><th>Fonte</th><th>Stato data</th><th></th><th>Link</th><th>Verif.</th></tr></thead><tbody>" +
      (vis.length ? vis.map((e, i) => `<tr data-i="${i}"><td>${esc(e.data_attesa)}</td><td><b>${esc(e.ticker || "—")}</b></td><td>${esc(e.nome)}</td><td>${esc(e.settore)}</td><td>${esc(e.tipo)}</td><td>${esc(String(e.descrizione || "").slice(0, 80))}</td><td>${esc(e.fonte)}</td><td>${esc(e.stato_data || "—")}</td><td>${e.orientamento === "passato" ? "🕓 passato" : "🔮 futuro"}</td><td>${okLink(e.link_ufficiale) ? `<a href="${esc(e.link_ufficiale)}" target="_blank" rel="noopener noreferrer">🔗</a>` : "—"}</td><td>${e.verified ? "✅" : "❌"}</td></tr>`).join("")
        : `<tr><td colspan="11" class="vuoto">Nessun evento corrisponde ai filtri selezionati.</td></tr>`) + "</tbody>";
    $("tab").dataset.wy = JSON.stringify(wy);
  }

  function dettaglio(i) {
    const e = vis[i]; if (!e) return;
    document.querySelectorAll("#tab tbody tr").forEach((r) => r.classList.toggle("sel", Number(r.dataset.i) === i));
    const wy = JSON.parse($("tab").dataset.wy || "{}")[e.ticker];
    $("det").innerHTML = `<div class="det"><h3>${esc(e.tipo)} — ${esc(e.nome)}</h3>${e.ticker ? `<div class="muted">Ticker: <code>${esc(e.ticker)}</code></div>` : ""}<dl>
      <dt>Data attesa</dt><dd>${esc(e.data_attesa)}</dd><dt>Settore</dt><dd>${esc(e.settore)}</dd><dt>Fonte</dt><dd>${esc(e.fonte)}</dd>
      <dt>Descrizione</dt><dd>${esc(e.descrizione)}</dd><dt>Link ufficiale</dt><dd>${okLink(e.link_ufficiale) ? `<a href="${esc(e.link_ufficiale)}" target="_blank" rel="noopener noreferrer">${esc(e.link_ufficiale)}</a>` : "—"}</dd>
      <dt>Ultimo controllo</dt><dd>${esc(e.ultimo_controllo || "—")}</dd><dt>Stato data</dt><dd>${esc(e.stato_data || "—")} · verificato: ${e.verified ? "✅" : "❌"}</dd>
      ${wy ? `<dt>Wyckoff (screening)</dt><dd>${esc(wy)}</dd>` : ""}</dl></div>`;
  }

  async function avvia() {
    try {
      const [r, rs] = await Promise.all([fetch("/api/pagina/calendario", { cache: "no-store" }), fetch("/api/screening", { cache: "no-store" }).catch(() => null)]);
      if (r.status === 401) { $("sottotitolo").textContent = "Accesso richiesto: effettua il login."; return; }
      const j = await r.json();
      if (!r.ok) { $("sottotitolo").textContent = r.status === 404 ? "Dati non ancora caricati: lancia il workflow «esporta-pagine-d1» (pagina calendario) nel repo privato." : (j.errore || "Errore nel caricamento."); return; }
      D = j.dati; try { scr = rs && rs.ok ? await rs.json() : null; } catch (e) { scr = null; }
      $("sottotitolo").textContent = `${D.eventi.length} eventi salvati · aggiornato il ${String(j.aggiornato).slice(0, 16).replace("T", " ")} UTC`;
    } catch (e) { $("sottotitolo").textContent = "Errore di rete."; return; }
    $("f-set").innerHTML += D.settori.map((s) => `<option>${esc(s)}</option>`).join("");
    if (!scr) { $("f-scr").checked = false; $("f-scr").disabled = true; }
    $("log").innerHTML = D.log.length ? [...D.log].reverse().map((l) => `<div>${esc(String(l.ts || l.time || "—").slice(0, 19))} — ${esc(l.event || "—")}</div>`).join("") : "Nessun log disponibile.";
    for (const id of ["f-set", "f-scr", "f-rec"]) $(id).addEventListener("change", disegna);
    $("tab").addEventListener("click", (e) => { const tr = e.target.closest("tbody tr[data-i]"); if (tr && !e.target.closest("a")) dettaglio(Number(tr.dataset.i)); });
    disegna();
  }
  avvia();
})();
