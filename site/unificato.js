(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const ETI = { in_range: "in range", rallenta: "rallenta", uscito_sopra: "uscito sopra", uscito_sotto: "uscito sotto" };
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  let righe = [];

  const celle = (r, tf) => {
    const b = r.basi[tf];
    if (!b) return `<td class="muted">–</td><td></td>`;
    const pos = b.pos === null || b.pos === undefined ? "" : `${Math.round(b.pos * 100)}%`;
    const quando = b.uscito_il ? ` <span class="muted">${esc(b.uscito_il)}</span>` : "";
    return `<td><span class="badge b-${esc(b.stato)}">${esc(ETI[b.stato] || b.stato)}</span>${quando}</td><td>${pos}</td>`;
  };
  const uscita = (r) => Object.values(r.basi).some((b) => b.stato === "uscito_sopra" || b.stato === "uscito_sotto");
  const attiva = (r) => Object.values(r.basi).some((b) => b.stato === "in_range" || b.stato === "rallenta");

  function disegna() {
    const m = $("f-mostra").value, tf = $("f-tf").value, min = Number($("f-min").value), q = $("f-cerca").value.trim().toUpperCase();
    const tfs = tf ? [tf] : ["1D", "1W"];
    const v = righe.filter((r) => {
      const bs = tfs.map((t) => r.basi[t]).filter(Boolean);
      if (q && !r.ticker.includes(q)) return false;
      if (min && !(r.punteggio && r.punteggio.punti >= min)) return false;
      if (m === "uscite") return bs.some((b) => b.stato === "uscito_sopra" || b.stato === "uscito_sotto");
      if (m === "attive") return bs.some((b) => b.stato === "in_range" || b.stato === "rallenta");
      if (m === "punteggio") return Boolean(r.punteggio);
      return true;
    }).sort((a, b) => ((b.punteggio?.punti ?? -1) - (a.punteggio?.punti ?? -1)) || (a.ticker < b.ticker ? -1 : 1));
    $("conteggio").textContent = `${v.length} titoli`;
    $("tab").innerHTML = `<thead><tr><th>Ticker</th><th>Da ATH</th><th>1D</th><th>Pos. 1D</th><th>1W</th><th>Pos. 1W</th><th>Punteggio</th><th>Segnale</th></tr></thead><tbody>` +
      (v.length ? v.map((r) => `<tr><td><b>${esc(r.ticker)}</b></td><td>${r.dist_ath === null ? "" : (r.dist_ath * 100).toFixed(0) + "%"}</td>${celle(r, "1D")}${celle(r, "1W")}` +
        `<td>${r.punteggio && r.punteggio.punti !== null ? `<b>${r.punteggio.punti}/6</b>` : '<span class="muted">–</span>'}</td><td>${esc(r.punteggio?.segnale || "")}</td></tr>`).join("")
        : `<tr><td colspan="8" class="vuoto">Nessun titolo con questi filtri.</td></tr>`) + "</tbody>";
  }

  async function avvia() {
    let j;
    try {
      const r = await fetch("/api/unificato", { cache: "no-store" });
      if (r.status === 401) { $("sottotitolo").textContent = "Accesso richiesto: effettua il login."; return; }
      j = await r.json();
      if (!r.ok) { $("sottotitolo").textContent = j.errore || "Errore nel caricamento."; return; }
    } catch (e) { $("sottotitolo").textContent = "Errore di rete."; return; }
    righe = j.righe;
    $("sottotitolo").textContent = `Range aggiornati: ${(j.aggiornato || "").slice(0, 16).replace("T", " ")} UTC · Punteggi del ${j.punteggi_data || "n/d"}`;
    const chip = (t, n) => `<span class="chip">${t} <b>${n}</b></span>`;
    $("riepilogo").innerHTML = chip("Uscite", righe.filter(uscita).length) + chip("Basi attive", righe.filter(attiva).length) + chip("Con punteggio", righe.filter((r) => r.punteggio).length);
    if (!j.db) { $("avviso").hidden = false; $("avviso").textContent = "Database dei punteggi non ancora collegato: si vedono solo i range."; }
    else if (!j.punteggi_data) { $("avviso").hidden = false; $("avviso").textContent = "Database collegato ma ancora vuoto: i punteggi arrivano dopo il prossimo screening del repo privato."; }
    if (j.scheduler) {
      $("sched").hidden = false;
      $("tab-sched").innerHTML = "<thead><tr><th>Quando (UTC)</th><th>Lavoro</th><th>Esito</th><th>Dettaglio</th></tr></thead><tbody>" +
        (j.scheduler.length ? j.scheduler.map((s) => `<tr><td>${esc(s.quando.slice(0, 16).replace("T", " "))}</td><td>${esc(s.job)}</td><td>${esc(s.esito)}</td><td>${esc(s.dettaglio)}</td></tr>`).join("")
          : '<tr><td colspan="4" class="muted">Nessun lancio registrato.</td></tr>') + "</tbody>";
    }
    for (const id of ["f-mostra", "f-tf", "f-min"]) $(id).addEventListener("change", disegna);
    $("f-cerca").addEventListener("input", disegna);
    disegna();
  }
  avvia();
})();
