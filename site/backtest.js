(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const NOMI = { core: "Segnale core (walk-forward 10 anni)", insider: "Bonus insider", range_punteggi: "Range e punteggi", regime_bonus: "Bonus regime ↔ settore" };
  const quando = (iso) => { const t = Date.parse(iso); if (!Number.isFinite(t)) return "n/d"; const h = Math.round((Date.now() - t) / 36e5);
    return h < 48 ? `${h} ore fa` : `${Math.round(h / 24)} giorni fa`; };
  const ic = (v) => (Array.isArray(v) ? `${v[0] > 0 ? "+" : ""}${v[0].toFixed(1)} … ${v[1] > 0 ? "+" : ""}${v[1].toFixed(1)}` : "—");

  function lettura(b) {
    if (!b || !b.sezioni) { $("lettura").innerHTML = '<p class="muted">🧭 Lettura automatica non ancora disponibile (workflow «backtest»: mercoledì e sabato, 08:00 UTC).</p>'; return; }
    const vecchio = Date.now() - Date.parse(b.generato_il) > 5 * 864e5;
    $("lettura").innerHTML = Object.entries(b.sezioni).map(([k, s]) => `<section class="sez"><h3>${esc(s.titolo || k)} ${esc(s.stato || "")}</h3>
      ${s.cosa_fare ? `<p class="cosa">${esc(s.cosa_fare)}</p>` : ""}<p>${esc(s.testo || "")}</p>
      <p class="muted">Aggiornata ${quando(b.generato_il)} · ${s.origine === "llm" ? "trascrizione AI" : "testo automatico (senza AI)"} · campione: ${esc(s.conteggio || "n/d")}${vecchio ? " · ⚠️ dato vecchio: il workflow potrebbe essere fermo" : ""}</p>
      ${s.dettaglio ? `<details><summary>📄 Report completo dell'ultimo calcolo</summary><pre class="rep">${esc(s.dettaglio)}</pre></details>` : ""}</section>`).join("");
  }

  function scorecard(sc) {
    if (!sc || !(sc.tabella || []).length) { $("score").innerHTML = '<tbody><tr><td class="vuoto">Scorecard non ancora disponibile (workflow «scorecard»: domenica, 09:00 UTC).</td></tr></tbody>'; return; }
    const col = ["Tipo", "Sedute dopo", "N", "Rend. medio %", "Mediana %", "Positivi %", "Eccesso vs SPY %", "IC95 eccesso", "Lettura"];
    $("score").innerHTML = `<thead><tr>${col.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>` +
      sc.tabella.map((r) => `<tr>${col.map((c) => `<td>${esc(c === "IC95 eccesso" ? ic(r[c]) : r[c])}</td>`).join("")}</tr>`).join("") + "</tbody>";
    $("score-nota").textContent = `Aggiornata ${quando(sc.generato_il)} · ${sc.n_eventi || 0} alert distinti · «campione piccolo» = meno di 30 casi: non è evidenza. «Indistinguibile dal caso» = l'intervallo di confidenza dell'eccesso include lo zero.`;
  }

  async function avvia() {
    try {
      const r = await fetch("/api/pagina/backtest", { cache: "no-store" });
      if (r.status === 401) { $("sottotitolo").textContent = "Accesso richiesto: effettua il login."; return; }
      if (r.status === 404) { $("sottotitolo").textContent = "Dati non ancora caricati: lancia «esporta-pagine-d1» (pagina backtest) nel repo privato."; return; }
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json(), D = j.dati;
      $("sottotitolo").textContent = "Esportato " + String(j.aggiornato || "").slice(0, 16).replace("T", " ") + " UTC";
      lettura(D.briefing); scorecard(D.scorecard);
      $("report").innerHTML = Object.entries(D.report || {}).map(([k, t]) => `<details><summary>${esc(NOMI[k] || k)}</summary><pre class="rep">${esc(t)}</pre></details>`).join("") || '<p class="muted">Nessun report.</p>';
    } catch (e) { $("sottotitolo").textContent = "Dati non disponibili: " + e.message; }
  }
  avvia();
})();
