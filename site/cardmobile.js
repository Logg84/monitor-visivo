// Tabelle → card verticali su schermi stretti (≤ 640px). Solo markup e CSS: i dati non cambiano.
// Ogni cella riceve data-label = intestazione della sua colonna; il CSS (style.css, @media) mostra ogni riga come una card.
// Se la pagina ridisegna la tabella (innerHTML) le etichette si rimettono da sole. Si carica da nav.js su tutte le pagine.
(() => {
  const testoTh = (th) => th.textContent.replace(/\s*[▲▼]\s*$/, "").trim();
  function etichetta(tab) {
    const th = tab.tHead && tab.tHead.rows.length === 1 ? [...tab.tHead.rows[0].cells] : null;
    if (!th || th.length < 3) return;                                   // tabelle strette restano tabelle
    tab.classList.add("cm");
    const nomi = th.map(testoTh);
    for (const tr of tab.tBodies[0] ? tab.tBodies[0].rows : []) {
      if (tr.cells.length !== nomi.length) continue;                    // righe di servizio (colspan, «nessun risultato»)
      [...tr.cells].forEach((td, i) => { if (td.getAttribute("data-label") !== nomi[i]) td.setAttribute("data-label", nomi[i]); });
    }
  }
  const obs = new MutationObserver((muts) => {
    const viste = new Set(muts.map((m) => m.target.closest && m.target.closest("table")).filter(Boolean));
    obs.disconnect(); viste.forEach(etichetta); osserva();
  });
  function osserva() { document.querySelectorAll(".tabella-wrap table").forEach((t) => { etichetta(t); obs.observe(t, { childList: true, subtree: true }); }); }
  document.addEventListener("DOMContentLoaded", osserva); osserva();
})();
