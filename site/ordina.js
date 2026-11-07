// Ordinamento delle tabelle cliccando sull'intestazione (qualsiasi <table> dentro .tabella-wrap con una sola riga di intestazioni).
// Numeri (anche «1,88 M$», «454 k$», «4/10», «+2,1%»), date gg/mm/aa e testo. I vuoti vanno sempre in fondo.
// Se la pagina ridisegna la tabella, l'ordinamento scelto viene riapplicato.
(() => {
  const stato = new WeakMap();                                   // table → {col, dir}
  const MOLT = { k: 1e3, K: 1e3, M: 1e6, B: 1e9 };
  const vuoto = (t) => /^(–|—|-|n\/d|n\.d\.|)$/i.test(t);
  function valore(cella) {
    let t = (cella ? cella.textContent : "").trim();
    t = t.replace(/^[^0-9A-Za-zÀ-ÿ+\-−.,]+/, "").trim();           // emoji / simboli iniziali
    if (vuoto(t)) return null;
    const d = /^(\d{2})\/(\d{2})\/(\d{2,4})\b/.exec(t);
    if (d) return { n: Number((d[3].length === 2 ? "20" + d[3] : d[3]) + d[2] + d[1]) };
    const m = /^([+\-−]?)(\d[\d.,]*)\s*([kKMB])?\$?/.exec(t);
    if (m) {
      let x = m[2];
      if (x.includes(",")) x = x.replace(/\./g, "").replace(",", ".");
      else if (/^\d{1,3}(\.\d{3})+$/.test(x)) x = x.replace(/\./g, "");
      let n = Number(x); if (Number.isFinite(n)) { if (m[1] === "-" || m[1] === "−") n = -n; return { n: n * (MOLT[m[3]] || 1) }; }
    }
    return { s: t.toLowerCase() };
  }
  function ordina(tab, col, dir) {
    const tb = tab.tBodies[0]; if (!tb) return;
    const nCol = tab.tHead.rows[0].cells.length;
    const righe = [...tb.rows].filter((r) => r.cells.length === nCol);
    if (righe.length < 2) return;
    const chiavi = new Map(righe.map((r) => [r, valore(r.cells[col])]));
    const num = righe.filter((r) => chiavi.get(r) && chiavi.get(r).n !== undefined).length >= righe.filter((r) => chiavi.get(r)).length / 2;
    righe.sort((a, b) => {
      const x = chiavi.get(a), y = chiavi.get(b);
      if (!x || !y) return (x ? 0 : 1) - (y ? 0 : 1);                      // vuoti in fondo, qualunque sia la direzione
      let c;
      if (num) c = (x.n ?? -Infinity) - (y.n ?? -Infinity) || 0; else c = String(x.s ?? x.n).localeCompare(String(y.s ?? y.n), "it", { numeric: true });
      return dir * c;
    });
    const fine = [...tb.rows].filter((r) => r.cells.length !== nCol);
    tab._ord = true; obs.disconnect();
    for (const r of righe) tb.append(r);
    for (const r of fine) tb.append(r);
    freccia(tab, col, dir);
    osserva();
  }
  function freccia(tab, col, dir) {
    [...tab.tHead.rows[0].cells].forEach((th, i) => { th.querySelector(".ord")?.remove();
      if (i === col) { const s = document.createElement("span"); s.className = "ord"; s.textContent = dir > 0 ? " ▲" : " ▼"; th.append(s); } });
  }
  const obs = new MutationObserver((muts) => {
    const viste = new Set(muts.map((m) => m.target.closest && m.target.closest("table")).filter(Boolean));
    for (const t of viste) { const s = stato.get(t); if (s && t.tHead && t.tHead.rows[0]) ordina(t, s.col, s.dir); }
  });
  const osserva = () => document.querySelectorAll(".tabella-wrap table").forEach((t) => obs.observe(t, { childList: true, subtree: true }));
  document.addEventListener("click", (e) => {
    const th = e.target.closest(".tabella-wrap table > thead th"); if (!th) return;
    const tab = th.closest("table"); if (tab.tHead.rows.length !== 1 || tab.tHead.rows[0].cells.length < 2) return;
    const col = [...th.parentNode.cells].indexOf(th), s = stato.get(tab);
    let dir;
    if (s && s.col === col) dir = -s.dir;
    else { const prova = [...tab.tBodies[0].rows].slice(0, 6).map((r) => valore(r.cells[col])).filter(Boolean); dir = prova.length && prova.every((v) => v.n !== undefined) ? -1 : 1; }
    stato.set(tab, { col, dir }); ordina(tab, col, dir);
  });
  document.addEventListener("DOMContentLoaded", osserva); osserva();
  const st = document.createElement("style");
  st.textContent = ".tabella-wrap table > thead th{cursor:pointer;user-select:none;white-space:nowrap}.tabella-wrap table > thead th:hover{color:var(--accento)}.ord{font-size:10px}";
  document.head.append(st);
})();
