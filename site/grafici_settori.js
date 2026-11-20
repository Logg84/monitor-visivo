// Grafici a linee per la pagina Settori (SVG, nessuna libreria): rapporto EW/CW dei settori GICS e gambe CW/EW dei sotto-settori.
// `costruisci` è pura (provata da tests/verifica_grafici_settori.mjs); `attacca` aggiunge il cursore con i valori al passaggio.
(function (radice) {
  const W = 900, H = 340, L = 46, R = 12, T = 12, B = 28;
  const PALETTE = ["#4c8dff", "#2ea66f", "#e0524d", "#d9a23b", "#a371f7", "#2dd4bf", "#f778ba", "#8b98a9", "#ff9f43", "#79c0ff", "#7ee787"];
  const ok = (v) => typeof v === "number" && Number.isFinite(v);
  const dmy = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || "")); return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : ""; };
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /** cfg = { date: [...], serie: [{nome, valori: [num|null], colore, tratteggio?}], base?: 100 }. Ritorna { svg, n, vuoto }. */
  function costruisci(cfg) {
    const date = (cfg && cfg.date) || [], serie = ((cfg && cfg.serie) || []).filter((s) => Array.isArray(s.valori) && s.valori.some(ok));
    const n = date.length;
    if (n < 2 || !serie.length) return { svg: "", n, vuoto: true };
    const tutti = serie.flatMap((s) => s.valori.filter(ok));
    if (ok(cfg.base)) tutti.push(cfg.base);
    let lo = Math.min(...tutti), hi = Math.max(...tutti);
    if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
    const pad = (hi - lo) * 0.05; lo -= pad; hi += pad;
    const x = (i) => L + (i / (n - 1)) * (W - L - R), y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    const p = [`<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" style="display:block;max-width:100%;height:auto;touch-action:pan-y">`];
    for (let k = 0; k <= 4; k++) {
      const v = lo + ((hi - lo) * k) / 4, yy = y(v).toFixed(1);
      p.push(`<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="var(--griglia-chart)" stroke-width="1"/><text x="${L - 6}" y="${(+yy + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="var(--muto)">${v.toFixed(1)}</text>`);
    }
    if (ok(cfg.base) && cfg.base > lo && cfg.base < hi) p.push(`<line x1="${L}" x2="${W - R}" y1="${y(cfg.base).toFixed(1)}" y2="${y(cfg.base).toFixed(1)}" stroke="var(--muto)" stroke-width="1" stroke-dasharray="2 4"/>`);
    for (const i of [0, Math.floor((n - 1) / 2), n - 1]) p.push(`<text x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="${i === 0 ? "start" : i === n - 1 ? "end" : "middle"}" font-size="11" fill="var(--muto)">${esc(dmy(date[i]))}</text>`);
    serie.forEach((s, j) => {
      let d = "", giu = false;
      s.valori.forEach((v, i) => { if (!ok(v)) { giu = false; return; } d += `${giu ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`; giu = true; });
      p.push(`<path d="${d}" fill="none" stroke="${esc(s.colore || PALETTE[j % PALETTE.length])}" stroke-width="2"${s.tratteggio ? ' stroke-dasharray="6 4"' : ""} stroke-linejoin="round"/>`);
    });
    p.push(`<line class="cur" x1="0" x2="0" y1="${T}" y2="${H - B}" stroke="var(--muto)" stroke-width="1" visibility="hidden"/></svg>`);
    return { svg: p.join(""), n, vuoto: false };
  }

  /** Mette il grafico in `el` e, al passaggio del dito/mouse, scrive data e valori in `tip`. */
  function attacca(el, tip, cfg) {
    const r = costruisci(cfg);
    el.innerHTML = r.svg || '<p class="muted">Serie non disponibile (n/d).</p>';
    if (r.vuoto || !tip) { if (tip) tip.textContent = ""; return r; }
    const svg = el.querySelector("svg"), cur = svg.querySelector(".cur");
    const mostra = (ev) => {
      const b = svg.getBoundingClientRect(), px = ((ev.clientX - b.left) / b.width) * W;
      const i = Math.max(0, Math.min(r.n - 1, Math.round(((px - L) / (W - L - R)) * (r.n - 1))));
      const xx = L + (i / (r.n - 1)) * (W - L - R);
      cur.setAttribute("x1", xx); cur.setAttribute("x2", xx); cur.setAttribute("visibility", "visible");
      tip.innerHTML = `<b>${esc(dmy(cfg.date[i]))}</b> · ` + cfg.serie.filter((s) => ok((s.valori || [])[i]))
        .map((s, j) => `<span style="color:${esc(s.colore || PALETTE[j % PALETTE.length])}">${esc(s.nome)} ${s.valori[i].toFixed(1)}</span>`).join(" · ");
    };
    svg.addEventListener("pointermove", mostra);
    svg.addEventListener("pointerleave", () => { cur.setAttribute("visibility", "hidden"); tip.textContent = ""; });
    return r;
  }
  const api = { costruisci, attacca, PALETTE, dmy };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else radice.GraficiSettori = api;
})(typeof window !== "undefined" ? window : globalThis);
