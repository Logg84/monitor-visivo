(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const n = (v) => typeof v === "number" && Number.isFinite(v);
  const px = (v) => (!n(v) ? "—" : Math.abs(v) < 10 ? v.toFixed(4) : v.toFixed(2));
  const sg = (v, d = 1) => (n(v) ? (v > 0 ? "+" : "") + v.toFixed(d) : "n/d");
  const TONO = new Set(["verde", "giallo", "rosso", "arancio", "grigio"]);
  const BREVI = [["Zona Z1 (POC)", "POC"], ["Zona Z2", "Z2"], ["Zona Z3", "Z3"], ["VWAP 60 giorni", "VWAP60"], ["Media mobile 50 giorni", "MA50"], ["Media mobile 200 giorni", "MA200"]];
  let D, sel = "";
  const breve = (d) => { if (!d) return "—"; let t = String(d.Livello).split(" (ancorato")[0]; for (const [a, b] of BREVI) t = t.replace(a, b); return `${t} ${px(d.Prezzo)}`; };

  const tassi = () => {
    if (!D.tassi.length) return `<div class="box muted">Dati FRED non disponibili al momento.</div>`;
    const I = { verde: "🟢", giallo: "🟡", rosso: "🔴", grigio: "⚪" };
    return `<div class="tabella-wrap"><table><thead><tr><th></th><th>Indicatore</th><th>Valore</th><th>Data</th><th>Var. 1 mese</th><th>Var. 3 mesi</th><th>Percentile 3 anni</th><th>Stato</th></tr></thead><tbody>` +
      D.tassi.map((r) => `<tr><td>${I[r.tono] || "⚪"}</td><td>${esc(r.nome)}</td><td>${n(r.valore) ? r.valore.toFixed(2) : "n/d"}</td><td>${esc(r.data)}${r.fermo ? " ⏸ fermo" : ""}</td><td>${sg(r.var1m, 2)}</td><td>${sg(r.var3m, 2)}</td><td>${n(r.percentile) ? Math.round(r.percentile) : "n/d"}</td><td>${esc(r.stato)}</td></tr>`).join("") + "</tbody></table></div>" +
      `<p class="muted">Valori in % (rendimenti, tassi reali), punti percentuali (curve, spread), indice (dollaro, NFCI). Il colore è solo presentazione: contesto, non un segnale operativo.</p>`;
  };

  const card = (x) => {
    if (!x.riga) return `<div class="card grigio"><div class="h"><b>${esc(x.nome)}</b><span>n/d</span></div><span class="b">⚪ dati non disponibili</span>${x.errore ? `<span class="foot">${esc(x.errore)}</span>` : ""}</div>`;
    const b = x.badge, r = x.riga, tono = TONO.has(b.tono) ? b.tono : "grigio", pr = x.posizione;
    let ruler = "";
    if (pr) {
      if (n(pr.pos)) ruler = `<div><div class="ruler"><i style="left:${Math.max(2, Math.min(98, pr.pos))}%"></i></div><div class="rl"><span>↓ ${esc(breve(pr.sotto))}</span><span>${esc(breve(pr.sopra))} ↑</span></div></div>`;
      else ruler = `<div><div class="ruler"></div><div class="rl">${pr.sopra ? `<span>${esc(breve(pr.sopra))} ↑</span>` : `<span>↓ ${esc(breve(pr.sotto))}</span>`}</div></div>`;
    }
    const iz = r["In zona"];
    return `<div class="card ${tono}"><div class="h"><b>${esc(x.nome)}</b><span>${esc(x.simbolo)}</span></div><span class="b">${esc(b.icona)} ${esc(b.etichetta)}</span><div class="p">${px(r.Prezzo)}</div>` +
      x.distanze.map((d) => `<div class="r"><span>${esc(d.nome)}</span><b>${n(d.dist) ? sg(d.dist) + "%" : "n/d"}</b></div>`).join("") + ruler +
      `<div class="foot">DD 5a ${sg(r["DD 5a %"])}% · Bottom ${esc(r.Bottom)}${n(r.Confluenza) ? " · Confluenza " + esc(r.Confluenza) : ""}${iz && iz !== "—" ? " · in zona " + esc(iz) : ""}</div></div>`;
  };

  const sintesi = () => {
    const bar = (v, mx) => n(v) ? `<span class="sc"><i style="width:${Math.max(0, Math.min(100, v / mx * 100))}%"></i></span>${Math.round(v)}` : "n/d";
    return `<div class="tabella-wrap"><table><thead><tr><th>Strumento</th><th>Simbolo</th><th>Prezzo</th><th>Stato</th><th>Quadro</th><th>Livello sotto</th><th>Livello sopra</th><th>DD 5a (|%|)</th><th>Bottom</th><th>Confluenza</th><th>Punti tecnici</th></tr></thead><tbody>` +
      D.sintesi.map((r) => `<tr><td><b>${esc(r.Strumento)}</b></td><td>${esc(r.Simbolo)}</td><td>${px(r.Prezzo)}</td><td>${esc(r.Stato)}</td><td>${esc(r.Quadro)}</td><td>${esc(r["Livello sotto"])}</td><td>${esc(r["Livello sopra"])}</td><td>${bar(r["DD 5a"], 100)}</td><td>${bar(r.Bottom, 100)}</td><td>${bar(r.Confluenza, 100)}</td><td>${bar(r.Punti, 5)}</td></tr>`).join("") + "</tbody></table></div>";
  };

  const tecnica = () => {
    const cols = ["Strumento", "Volume", "Simbolo", "Prezzo", "DD 5a %", "Bottom", "RSI", "ATR20 %", "POC (Z1)", "Dist. POC %", "In zona", "VWAP 60", "Dist. VWAP60 %", "VWA1", "Confluenza", "Wyckoff", "B", "C", "G", "D", "Punti tecnici (max 5)"];
    const v = (c, x) => typeof x === "boolean" ? (x ? "✓" : "·") : n(x) ? (Number.isInteger(x) ? x : x.toFixed(c.includes("%") || c === "RSI" ? 1 : 2)) : x === null || x === undefined ? "—" : esc(x);
    return ["Indici", "Coppie e materie prime"].map((g) => { const r = D.tabella.filter((x) => x.Gruppo === g); if (!r.length) return "";
      return `<h3 style="font-size:15px;margin:12px 0 4px">${esc(g)}</h3><div class="tabella-wrap"><table><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>` +
        r.map((x) => "<tr>" + cols.map((c) => `<td>${v(c, x[c])}</td>`).join("") + "</tr>").join("") + "</tbody></table></div>"; }).join("");
  };

  const scala = (lv) => {
    const v = [...lv].filter((r) => n(r.Prezzo)).sort((a, b) => a.Prezzo - b.Prezzo); if (v.length < 2) return "";
    const lo = v[0].Prezzo, hi = v[v.length - 1].Prezzo, W = 760, H = 30 * v.length + 20, X = (p) => 10 + (hi === lo ? 0.5 : (p - lo) / (hi - lo)) * (W - 360);
    let s = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:${W}px;color:var(--testo)" role="img" aria-label="Scala dei livelli">`;
    v.forEach((r, i) => { const y = 20 + 30 * i, pr = String(r.Livello).startsWith("▶");
      s += `<line x1="10" x2="${W - 350}" y1="${y}" y2="${y}" stroke="var(--bordo)"/><${pr ? "rect" : "circle"} ${pr ? `x="${X(r.Prezzo) - 7}" y="${y - 7}" width="14" height="14" transform="rotate(45 ${X(r.Prezzo)} ${y})"` : `cx="${X(r.Prezzo)}" cy="${y}" r="5"`} fill="${pr ? "var(--accento)" : "#888"}"><title>${esc(r.Livello)}: ${px(r.Prezzo)} (${sg(r["Dist. %"])}% · ${sg(r["Dist. in ATR"])} ATR)</title></${pr ? "rect" : "circle"}>` +
        `<text x="${W - 340}" y="${y + 4}" ${pr ? 'style="font-weight:700"' : ""}>${esc(px(r.Prezzo))}  ${esc(String(r.Livello).slice(0, 38))}</text>`; });
    return s + "</svg>";
  };

  function dettaglio() {
    const ok = D.strumenti.filter((x) => x.riga), x = ok.find((s) => s.nome === sel) || ok[0], r = x.riga, L = x.lettura;
    return `<h2>Dettaglio strumento</h2><section class="controlli"><label>Strumento<select id="sel">${ok.map((s) => `<option ${s.nome === x.nome ? "selected" : ""}>${esc(s.nome)}</option>`).join("")}</select></label></section>` +
      `<div class="box"><b>${esc(x.nome)} (${esc(x.simbolo)}) — ${esc(L.quadro)}</b></div>` +
      `<div class="kpis"><div><span>Prezzo</span><b>${px(r.Prezzo)}</b></div><div><span>DD 5 anni</span><b>${sg(r["DD 5a %"])}%</b></div><div><span>RSI</span><b>${esc(r.RSI)}</b></div><div><span>Bottom</span><b>${esc(r.Bottom)}</b></div><div><span>Wyckoff</span><b>${esc(r.Wyckoff)}</b></div></div>` +
      `<h2 style="font-size:16px">Scala dei livelli</h2><div class="box">${scala(x.livelli)}<p class="muted" style="margin:6px 0 0">Ogni punto è un livello nostro (POC/zone, VWAP 60, VWAP ancorati, medie 50 e 200); il rombo è il prezzo attuale. Passa il mouse per distanza % e in ATR.</p></div>` +
      (L.sezioni || []).map(([t, txt]) => `<div class="box"><b>${esc(t)}</b><p style="margin:6px 0 0">${esc(txt)}</p></div>`).join("") +
      `<details class="storiche"><summary>Glossario</summary>${Object.entries(L.glossari || {}).map(([k, v]) => `<p><b>${esc(k)}</b>: ${esc(v)}</p>`).join("")}</details>`;
  }

  function disegna() {
    $("main").innerHTML = `<details open class="storiche"><summary>📉 Tassi e credito USA (FRED)</summary>${tassi()}</details>` +
      D.strumenti.filter((x) => x.errore).map((x) => `<p class="muted">⚠️ <b>${esc(x.nome)}</b> — ${esc(x.errore)} (provati: ${esc(x.tentati.join(", "))})</p>`).join("") +
      `<h2>Cruscotto</h2><div class="grid">${D.strumenti.map(card).join("")}</div>` +
      `<p class="muted">Semaforo (solo lettura): 🔴 vicino ai massimi a 5 anni, senza sconto · 🟠 sconto ma nessun segnale di ripresa · 🟡 ripresa parziale · 🟢 sconto profondo con ripresa in corso (≥3 punti tecnici su 5) · ⚪ volume n/d, non valutabile. La barra segna dove sta il prezzo tra il livello più vicino sotto e quello sopra. Nessuna etichetta è un ordine.</p>` +
      `<h2>Sintesi</h2>${sintesi()}<details class="storiche"><summary>Tutti gli indicatori (tabella tecnica)</summary>${tecnica()}</details>` + dettaglio();
    const s = $("sel"); if (s) s.onchange = (e) => { sel = e.target.value; disegna(); };
  }

  async function avvia() {
    try {
      const r = await fetch("/api/pagina/strumenti", { cache: "no-store" });
      if (r.status === 401) { $("sottotitolo").textContent = "Accesso richiesto: effettua il login."; return; }
      const j = await r.json();
      if (!r.ok) { $("sottotitolo").textContent = r.status === 404 ? "Dati non ancora caricati: lancia il workflow «esporta-pagine-d1» (pagina strumenti) nel repo privato." : (j.errore || "Errore nel caricamento."); return; }
      D = j.dati; $("sottotitolo").textContent = `${D.strumenti.length} strumenti · aggiornato il ${String(j.aggiornato).slice(0, 16).replace("T", " ")} UTC`;
    } catch (e) { $("sottotitolo").textContent = "Errore di rete."; return; }
    disegna();
  }
  avvia();
})();
