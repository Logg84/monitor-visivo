(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const COL = { Espansione: "#3FB950", Reflazione: "#F0883E", Stagflazione: "#F85149", Rallentamento: "#58A6FF" };
  const f = (v, d = 1, segno = true) => (v === null || v === undefined ? "n/d" : (segno && v > 0 ? "+" : "") + Number(v).toFixed(d));
  let D, misura = "media", gruppo = "G";

  function card() {
    const c = D.corrente, col = COL[c.regime] || "#888", note = [];
    note.push(c.precedente && c.precedente !== c.regime ? `⚠️ Cambio di regime: il mese scorso era <b>${esc(c.precedente)}</b>.` : `Regime in corso da <b>${c.mesi_nel_regime}</b> mesi (storico ricostruito).`);
    if (c.sahm) note.push("🚨 <b>Regola di Sahm attiva</b>: la disoccupazione è salita di almeno 0,5 punti sul minimo dell'ultimo anno (storicamente associata alle recessioni).");
    if (c.tassi_reali) note.push(`Tasso reale a 10 anni (TIPS): ${f(c.tassi_reali.valore, 2, false)}% al ${esc(c.tassi_reali.data)}.`);
    for (const a of c.avvertenze || []) note.push("ℹ️ " + esc(a));
    return `<div class="box regime" style="--c:${col};border-color:${col}"><div class="muted" style="font-size:12px">REGIME ATTUALE · dati di ${esc(c.mese)}</div>
      <div class="g">${esc(c.icona)} ${esc(c.regime)}</div><div class="muted">${esc(c.descrizione)}</div>
      <div class="kpi"><div><span>Crescita (ΔG)</span><b>${f(c.G, 2)}</b></div><div><span>Inflazione (ΔI)</span><b>${f(c.I, 2)}</b></div></div>
      <div style="margin-top:10px;display:grid;gap:4px">${note.map((n) => `<div>${n}</div>`).join("")}</div></div>`;
  }

  function settori() {
    const c = D.corrente, reg = c.regime, mm = D.parametri.min_mesi;
    const cs = D.studio.filter((r) => r.regime === reg && r[misura] !== null && r[misura] !== undefined).map((r) => ({ ...r, valido: r.mesi >= mm }));
    let h = `<h2>💹 Settori e regime «${esc(reg)}»</h2><p class="muted">Cosa è successo storicamente ai settori americani (ETF SPDR) nel mese <b>successivo</b> ai mesi trascorsi in questo regime.</p>
      <div class="seg" role="group"><button data-m="media" aria-pressed="${misura === "media"}">Rispetto all'S&amp;P 500</button><button data-m="assoluto" aria-pressed="${misura === "assoluto"}">Rendimento assoluto</button></div>`;
    if (!cs.length) return h + `<div class="box muted">Studio non disponibile per questo regime.</div>`;
    const ok = cs.filter((r) => r.valido).sort((a, b) => b[misura] - a[misura]);
    const su = ok.filter((r) => r[misura] > 0).slice(0, 4), giu = ok.filter((r) => r[misura] < 0).slice(-4).reverse();
    const li = (a) => a.map((r) => `${esc(r.settore)} (${esc(r.etf)}) <b>${f(r[misura])}%</b>`).join("<br>") || "Nessuno.";
    h += `<div class="lista"><div class="box su"><b>🟢 Storicamente avanti</b><br>${li(su)}</div><div class="box giu"><b>🔴 Storicamente indietro</b><br>${li(giu)}</div></div>`;
    const v = [...cs].sort((a, b) => a[misura] - b[misura]), mx = Math.max(...v.map((r) => Math.abs(r[misura])), 0.01);
    h += `<div class="box">` + v.map((r) => {
      const w = Math.abs(r[misura]) / mx * 50, pos = r[misura] > 0;
      return `<div class="bar ${r.valido ? "" : "sfum"}"><span>${esc(r.settore)} (${esc(r.etf)})</span><div class="t"><i style="${pos ? "left:50%" : `left:${50 - w}%`};width:${w}%;background:${pos ? "#3FB950" : "#F85149"}"></i></div><span>${f(r[misura])}% · ${r.mesi} mesi</span></div>`;
    }).join("") + `<p class="muted" style="margin:8px 0 0">Barre sbiadite = campione sotto i ${mm} mesi (poco affidabile). Unità: % al mese${misura === "media" ? " rispetto all'S&P 500" : ""}.</p></div>`;
    const forza = D.forza || {};
    h += `<div class="tabella-wrap"><table><thead><tr><th>Settore</th><th>ETF</th><th>Rend. medio (%/mese)</th><th>vs S&amp;P 500</th><th>Mesi in positivo (%)</th><th>Mesi</th><th>Secondo il modello</th><th>Verifica storica</th><th>Forza 3 mesi vs S&amp;P (%)</th></tr></thead><tbody>` +
      [...cs].sort((a, b) => b[misura] - a[misura]).map((r) => {
        const at = c.settori[r.etf] || 0;
        const es = !r.valido || !at ? "n/d" : ((r.media > 0) === (at > 0) ? "✅ la storia conferma" : "❌ la storia contraddice");
        return `<tr><td>${esc(r.settore)}</td><td>${esc(r.etf)}</td><td>${f(r.assoluto, 2)}</td><td>${f(r.media, 2)}</td><td>${r.positivi === null ? "n/d" : Math.round(r.positivi)}</td><td>${r.mesi}</td><td>${at > 0 ? "Favorito" : at < 0 ? "Sfavorito" : "—"}</td><td>${es}</td><td>${f(forza[r.etf])}</td></tr>`;
      }).join("") + `</tbody></table></div>`;
    const co = D.coerenza && D.coerenza[reg];
    h += `<p class="muted">${co && co[1] ? `Il modello indica ${co[1]} settori valutabili in «${esc(reg)}»: la storia ne conferma <b>${co[0]}</b>. ` : ""}Asset class associate: ${esc(c.asset_class)}.</p>`;
    return h;
  }

  function heat() {
    if (!D.studio.length) return "";
    const regs = D.parametri.regimi, sett = [...new Set(D.studio.map((r) => r.settore))];
    const get = (s, g) => D.studio.find((r) => r.settore === s && r.regime === g);
    const mx = Math.max(...D.studio.map((r) => Math.abs(r[misura] ?? 0)), 0.01);
    const bg = (v) => v === null || v === undefined ? "" : `background:${v > 0 ? "rgba(63,185,80," : "rgba(248,81,73,"}${(0.12 + 0.55 * Math.abs(v) / mx).toFixed(2)})`;
    return `<h2>🔥 Tutti i regimi a confronto</h2><div class="tabella-wrap"><table class="heat"><thead><tr><th>Settore</th>` + regs.map((g) => `<th>${esc(D.parametri.icone[g])} ${esc(g)}</th>`).join("") + `</tr></thead><tbody>` +
      sett.map((s) => `<tr><td>${esc(s)}</td>` + regs.map((g) => { const r = get(s, g); const v = r ? r[misura] : null;
        return `<td class="${g === D.corrente.regime ? "cur" : ""}" style="${bg(v)}">${v === null || v === undefined ? "" : f(v) + `<br><span class="muted">(${r.mesi} m)</span>`}</td>`; }).join("") + `</tr>`).join("") +
      `</tbody></table></div><p class="muted">Celle: % al mese del mese SUCCESSIVO e numero di mesi (m). La colonna con il bordo è il regime di oggi. Controllo sul passato dentro lo stesso campione usato per definire i regimi: indica una tendenza, non una prova.</p>`;
  }

  function mappa() {
    const st = D.storico.filter((r) => r.G !== null && r.I !== null);
    if (!st.length) return "";
    const coda = st.slice(-13), W = 900, S = 380, X = (g) => 30 + (g + 1) / 2 * (W - 60), Y = (i) => S - 24 - (i + 1) / 2 * (S - 48), th = D.parametri.soglia_infl;
    const quad = [["Rallentamento", -1, 0, -1, th], ["Stagflazione", -1, 0, th, 1], ["Espansione", 0, 1, -1, th], ["Reflazione", 0, 1, th, 1]];
    let s = `<svg viewBox="0 0 ${W} ${S}" style="width:100%;height:auto;max-height:480px;color:var(--testo)" role="img" aria-label="Mappa dei quadranti crescita per inflazione">`;
    for (const [n, x0, x1, y0, y1] of quad) s += `<rect x="${X(x0)}" y="${Y(y1)}" width="${X(x1) - X(x0)}" height="${Y(y0) - Y(y1)}" fill="${COL[n]}" opacity=".13"/><text x="${(X(x0) + X(x1)) / 2}" y="${y1 === 1 ? Y(y1) + 16 : Y(y0) - 8}" text-anchor="middle" style="fill:${COL[n]}">${n}</text>`;
    s += `<polyline fill="none" stroke="#888" stroke-width="1" points="${coda.map((r) => `${X(r.G)},${Y(r.I)}`).join(" ")}"/>` + coda.map((r) => `<circle cx="${X(r.G)}" cy="${Y(r.I)}" r="3" fill="#888"><title>${esc(r.index)}</title></circle>`).join("");
    const u = coda[coda.length - 1];
    s += `<circle cx="${X(u.G)}" cy="${Y(u.I)}" r="7" fill="${COL[D.corrente.regime]}" stroke="#fff"><title>oggi</title></circle><text x="${W / 2}" y="${S - 4}" text-anchor="middle">Crescita (ΔG) →</text><text x="8" y="${S / 2}" transform="rotate(-90 8 ${S / 2})" text-anchor="middle">Inflazione (ΔI) →</text></svg>`;
    return `<h2>Mappa dei quadranti</h2><div class="box">${s}<p class="muted" style="margin:6px 0 0">Ultimi 12 mesi; il cerchio colorato è oggi.</p></div>`;
  }

  function indicatori() {
    const F = { "1": "▲ accelera", "0": "● stabile", "-1": "▼ frena" }, FI = { "1": "▲ sale", "0": "● stabile", "-1": "▼ scende" };
    const righe = Object.values(D.corrente.componenti).filter((c) => c.gruppo === gruppo);
    return `<h2>Cosa dicono gli indicatori</h2><div class="seg" role="group"><button data-g="G" aria-pressed="${gruppo === "G"}">📈 Crescita</button><button data-g="I" aria-pressed="${gruppo === "I"}">💲 Inflazione</button></div>
      <div class="tabella-wrap"><table><thead><tr><th>Indicatore</th><th>Segnale</th><th>Valore</th><th>Misura</th><th>Ultimo dato</th></tr></thead><tbody>` +
      righe.map((c) => `<tr><td>${esc(c.etichetta)}</td><td>${(gruppo === "G" ? F : FI)[String(c.segnale)] || "n/d"}</td><td>${f(c.valore, 2, false)}</td><td>${esc(c.unita)}</td><td>${esc(c.ultimo_dato)}</td></tr>`).join("") +
      `</tbody></table></div><p class="muted">Il PMI/ISM non è più pubblicato da FRED: come proxy si usa la produzione industriale. I dati mensili entrano nel calcolo con un mese di ritardo (pubblicazione).</p>`;
  }

  function storico() {
    const h = D.storico.filter((r) => r.regime);
    if (!h.length) return "";
    const q = {}; h.forEach((r) => { q[r.regime] = (q[r.regime] || 0) + 1; });
    return `<h2>🕰️ Storico dei regimi</h2><div class="box"><p>Mesi per regime: ` + D.parametri.regimi.map((r) => `${esc(D.parametri.icone[r])} ${esc(r)}: <b>${q[r] || 0}</b>`).join(" · ") +
      `</p><div class="strip">` + h.slice(-60).map((r) => `<i title="${esc(r.index)} · ${esc(r.regime)}" style="background:${COL[r.regime]}"></i>`).join("") + `</div><p class="muted" style="margin:6px 0 0">Ultimi 60 mesi (passa il mouse per il dettaglio).</p></div>`;
  }

  function disegna() {
    $("main").innerHTML = card() + settori() + heat() + mappa() + indicatori() + storico();
    for (const b of document.querySelectorAll("[data-m]")) b.addEventListener("click", () => { misura = b.dataset.m; disegna(); });
    for (const b of document.querySelectorAll("[data-g]")) b.addEventListener("click", () => { gruppo = b.dataset.g; disegna(); });
  }

  async function avvia() {
    try {
      const r = await fetch("/api/pagina/macro", { cache: "no-store" });
      if (r.status === 401) { $("sottotitolo").textContent = "Accesso richiesto: effettua il login."; return; }
      const j = await r.json();
      if (!r.ok) { $("sottotitolo").textContent = r.status === 404 ? "Dati non ancora caricati: lancia il workflow «esporta-pagine-d1» nel repo privato." : (j.errore || "Errore nel caricamento."); return; }
      D = j.dati; $("sottotitolo").textContent = `Dati di ${D.corrente.mese} · aggiornato il ${String(j.aggiornato).slice(0, 16).replace("T", " ")} UTC`;
    } catch (e) { $("sottotitolo").textContent = "Errore di rete."; return; }
    disegna();
  }
  avvia();
})();
