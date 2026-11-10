(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const num = (v, d = 1, suf = "") => (v === null || v === undefined || !Number.isFinite(Number(v)) ? "—" : Number(v).toFixed(d).replace(".", ",") + suf);
  const segno = (v) => (v === null || v === undefined ? "" : Number(v) > 0 ? "pos" : Number(v) < 0 ? "neg" : "");

  function disegna(R) {
    const c = R.cambio || {}, u = R.ultime_settimane || {}, g = R.regime || {};
    const html = [];
    html.push(`<section class="rep-sez"><h2>1 · Regime in breve</h2>
      <div class="rep-kpi"><div><span>Regime</span><b>${esc(g.nome || "n/d")}</b></div><div><span>Crescita</span><b>${num(g.G, 2)}</b></div><div><span>Inflazione</span><b>${num(g.I, 2)}</b></div><div><span>Mese</span><b>${esc(g.mese || "n/d")}</b></div></div>
      <p>${esc((R.in_breve || {}).testo || "")}</p>
      <p class="muted">${(R.in_breve || {}).origine === "llm" ? "Testo riscritto da un'AI (numeri verificati sui dati)" : "Testo automatico"}</p></section>`);
    html.push(`<section class="rep-sez"><h2>2 · Settori favoriti dal regime</h2>
      <p>${(R.settori_favoriti || []).length ? (R.settori_favoriti).map((s) => `<b>${esc(s)}</b>`).join(" · ") : '<span class="muted">Nessun settore con storico favorevole (o lettura macro non disponibile).</span>'}</p>
      <p class="muted">${esc(R.limite || "")}</p></section>`);
    const cand = R.candidati || [];
    html.push(`<section class="rep-sez"><h2>3 · Candidati per un primo acquisto</h2>
      <p class="muted">Titoli dei settori favoriti con segnale del portale da 4/6 in su (dati screening del ${esc(R.dati_screening || "n/d")}), ordinati per priorità.</p>
      ${cand.length ? `<div class="tabella-wrap"><table><thead><tr><th>Titolo</th><th>Settore</th><th>Punti</th><th>Prezzo</th><th>Dal massimo %</th><th>RSI</th><th>In zona</th></tr></thead><tbody>` +
        cand.map((x) => `<tr><td><b>${esc(x.ticker)}</b></td><td>${esc(x.settore)}</td><td>${esc(x.punti)}/6</td><td>${num(x.prezzo, 2)}</td><td>${num(x.dd, 1)}</td><td>${num(x.rsi, 0)}</td><td>${x.in_zona ? "sì" : "no"}</td></tr>`).join("") + "</tbody></table></div>"
        : '<p class="muted">Nessun titolo soddisfa oggi i criteri.</p>'}</section>`);
    html.push(`<section class="rep-sez"><h2>4 · Cambio di stato</h2>` + (c.primo_report
      ? '<p class="muted">Primo report: il confronto parte dal prossimo.</p>'
      : `<p>${c.regime_cambiato ? `Il regime è cambiato: da <b>${esc(c.regime_prima)}</b> a <b>${esc(g.nome)}</b>.` : "Regime invariato."}</p>
         <p>Settori entrati fra i favoriti: ${esc((c.entrati || []).join(", ") || "nessuno")} · usciti: ${esc((c.usciti || []).join(", ") || "nessuno")}.</p>`) +
      (c.transizione ? '<p>⚠️ Il regime è in transizione: la conferma del cambio è in corso.</p>' : "") + "</section>");
    html.push(`<section class="rep-sez"><h2>5 · Nelle ultime settimane</h2>` + (!u.disponibile
      ? '<p class="muted">Nessun report precedente da confrontare.</p>'
      : `<p class="muted">Titoli segnalati nel report del ${esc(u.data_precedente)}: variazione del prezzo da allora (non include dividendi né costi).</p>
         <div class="tabella-wrap"><table><thead><tr><th>Titolo</th><th>Settore</th><th>Prezzo allora</th><th>Prezzo oggi</th><th>Variazione %</th></tr></thead><tbody>` +
        (u.righe || []).map((x) => `<tr><td><b>${esc(x.ticker)}</b></td><td>${esc(x.settore || "")}</td><td>${num(x.prezzo_allora, 2)}</td><td>${num(x.prezzo_oggi, 2)}</td><td class="${segno(x.var)}">${num(x.var, 2)}</td></tr>`).join("") +
        `</tbody></table></div><p class="muted">${u.n ? `${esc(u.positivi)} su ${esc(u.n)} in rialzo, variazione media ${num(u.media, 2, "%")}. Campione piccolo: non è una conclusione.` : "Prezzi non disponibili."}</p>`) + "</section>");
    html.push(`<section class="rep-sez"><h2>6 · Nota</h2><p class="nota-fin">${esc(R.nota || "")}</p></section>`);
    $("rep").innerHTML = html.join("");
  }

  async function avvia() {
    $("stampa").addEventListener("click", () => window.print());
    try {
      const r = await fetch("/api/pagina/report", { cache: "no-store" });
      if (r.status === 401) { $("sottotitolo").textContent = "Accesso richiesto: effettua il login."; return; }
      if (r.status === 404) { $("sottotitolo").textContent = "Nessun report ancora: il primo esce il prossimo 1° o 3° lunedì del mese (o lancia «report-quindicinale» con force)."; return; }
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json(), R = (j.dati || {}).report;
      if (!R) throw new Error("dati vuoti");
      $("sottotitolo").textContent = "Report del " + R.data + " · esportato " + String(j.aggiornato || "").slice(0, 16).replace("T", " ") + " UTC";
      disegna(R);
    } catch (e) { $("sottotitolo").textContent = "Dati non disponibili: " + e.message; }
  }
  avvia();
})();
