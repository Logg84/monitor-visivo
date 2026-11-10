(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const num = (v, d = 1, suf = "") => (v === null || v === undefined || !Number.isFinite(Number(v)) ? "—" : Number(v).toFixed(d).replace(".", ",") + suf);
  const segno = (v) => (v === null || v === undefined ? "" : Number(v) > 0 ? "pos" : Number(v) < 0 ? "neg" : "");

  const COL_REG = { Espansione: "#15803d", Reflazione: "#d97706", Rallentamento: "#2563eb", Stagflazione: "#be123c" };
  const PAL = ["#2563eb", "#0d9488", "#d97706", "#7c3aed", "#db2777", "#0891b2", "#65a30d", "#dc2626"];
  const hex = (n) => (/^#[0-9a-f]{6}$/i.test(n) ? n : "#64748b");

  function disegna(R) {
    const c = R.cambio || {}, u = R.ultime_settimane || {}, g = R.regime || {};
    const fav = R.settori_favoriti || [], col = {}; fav.forEach((s, i) => { col[s] = PAL[i % PAL.length]; });
    const cs = (s) => hex(col[s] || "#64748b");
    $("hero").hidden = false;
    $("hero").innerHTML = `<div><h2>📰 Report quindicinale</h2><p>Report del ${esc(R.data)} · dati di screening del ${esc(R.dati_screening || "n/d")}</p></div>
      <div class="badge-reg" style="background:${hex(COL_REG[g.nome])}">${esc(g.nome || "Regime n/d")}</div>`;
    const html = [];
    html.push(`<section class="rep-sez s1"><h2><span class="num">1</span> Regime in breve</h2>
      <div class="rep-kpi"><div><span>Regime</span><b style="color:${hex(COL_REG[g.nome])}">${esc(g.nome || "n/d")}</b></div><div><span>Indice crescita</span><b>${num(g.G, 2)}</b></div><div><span>Indice inflazione</span><b>${num(g.I, 2)}</b></div><div><span>Mese</span><b>${esc(g.mese || "n/d")}</b></div></div>
      <p>${esc((R.in_breve || {}).testo || "")}</p>
      <p class="muted">${(R.in_breve || {}).origine === "llm" ? "Testo riscritto da un'AI (numeri verificati sui dati)" : "Testo automatico"}</p></section>`);
    html.push(`<section class="rep-sez s2"><h2><span class="num">2</span> Settori favoriti dal regime</h2>
      ${fav.length ? `<div class="chips">${fav.map((s) => `<span class="sch" style="background:${cs(s)}">${esc(s)}</span>`).join("")}</div>` : '<p class="muted">Nessun settore con storico favorevole (o lettura macro non disponibile).</p>'}
      <div class="avv">⚠️ ${esc(R.limite || "")}</div></section>`);
    const cand = R.candidati || [];
    let righe = "", ultimo = null;
    for (const x of cand) {
      if (x.settore !== ultimo) { ultimo = x.settore; righe += `<tr class="gr"><td colspan="6" style="background:${cs(x.settore)}">${esc(x.settore)} · ${cand.filter((y) => y.settore === x.settore).length} titoli</td></tr>`; }
      const w = Math.min(60, Math.abs(Number(x.dd) || 0));
      righe += `<tr><td><b>${esc(x.ticker)}</b></td><td><span class="pt p${Number(x.punti) >= 6 ? 6 : Number(x.punti) === 5 ? 5 : 4}">${esc(x.punti)}/6</span></td><td>${num(x.prezzo, 2)}</td><td>${num(x.dd, 1)}<span class="dd" style="width:${w}px"></span></td><td>${num(x.rsi, 0)}</td><td>${x.in_zona ? "✅ sì" : "no"}</td></tr>`;
    }
    html.push(`<section class="rep-sez s3"><h2><span class="num">3</span> Candidati settori caldi</h2>
      <p class="muted">Titoli dei settori favoriti con segnale del portale da 4/6 in su, ordinati per settore e poi per punteggio (${cand.length} titoli; dati screening del ${esc(R.dati_screening || "n/d")}).</p>
      ${cand.length ? `<div class="tabella-wrap"><table class="rt"><thead><tr><th>Titolo</th><th>Punti</th><th>Prezzo</th><th>Dal massimo %</th><th>RSI</th><th>In zona</th></tr></thead><tbody>${righe}</tbody></table></div>` : '<p class="muted">Nessun titolo soddisfa oggi i criteri.</p>'}</section>`);
    html.push(`<section class="rep-sez s4"><h2><span class="num">4</span> Cambio di stato</h2>` + (c.primo_report
      ? '<p class="muted">Primo report: il confronto parte dal prossimo.</p>'
      : `<p>${c.regime_cambiato ? `Il regime è cambiato: da <b>${esc(c.regime_prima)}</b> a <b>${esc(g.nome)}</b>.` : "✅ Regime invariato."}</p>
         <p>Settori entrati fra i favoriti: <b>${esc((c.entrati || []).join(", ") || "nessuno")}</b> · usciti: <b>${esc((c.usciti || []).join(", ") || "nessuno")}</b>.</p>`) +
      (c.transizione ? '<div class="avv">⚠️ Il regime è in transizione: la conferma del cambio è in corso.</div>' : "") + "</section>");
    html.push(`<section class="rep-sez s5"><h2><span class="num">5</span> Nelle ultime settimane</h2>` + (!u.disponibile
      ? '<p class="muted">Nessun report precedente da confrontare: il primo confronto sarà nel prossimo report.</p>'
      : `<p class="muted">Titoli segnalati nel report del ${esc(u.data_precedente)}: variazione del prezzo da allora (non include dividendi né costi).</p>
         <div class="tabella-wrap"><table class="rt"><thead><tr><th>Titolo</th><th>Settore</th><th>Prezzo allora</th><th>Prezzo oggi</th><th>Variazione %</th></tr></thead><tbody>` +
        (u.righe || []).map((x) => `<tr><td><b>${esc(x.ticker)}</b></td><td><span class="sch" style="background:${cs(x.settore)};font-size:12px;padding:2px 10px">${esc(x.settore || "")}</span></td><td>${num(x.prezzo_allora, 2)}</td><td>${num(x.prezzo_oggi, 2)}</td><td class="${segno(x.var)}">${num(x.var, 2)}</td></tr>`).join("") +
        `</tbody></table></div><p class="muted">${u.n ? `${esc(u.positivi)} su ${esc(u.n)} in rialzo, variazione media ${num(u.media, 2, "%")}. Campione piccolo: non è una conclusione.` : "Prezzi non disponibili."}</p>`) + "</section>");
    html.push(`<section class="rep-sez s6"><h2><span class="num">6</span> Nota</h2><p class="nota-fin">${esc(R.nota || "")}</p></section>`);
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
      $("sottotitolo").textContent = "Esportato " + String(j.aggiornato || "").slice(0, 16).replace("T", " ") + " UTC";
      disegna(R);
    } catch (e) { $("sottotitolo").textContent = "Dati non disponibili: " + e.message; }
  }
  avvia();
})();
