// Menu unico e fisso: stesso ordine su tutte le pagine; la pagina corrente è evidenziata (non nascosta).
(() => {
  const VOCI = [["./", "Basi di accumulo"], ["unificato.html", "Vista unificata"], ["screening.html", "Screening"], ["watchlist.html", "Watchlist"],
    ["portafoglio.html", "Portafoglio"], ["condiviso.html", "Condiviso"], ["insider.html", "Insider"], ["macro.html", "Regimi macro"],
    ["settori.html", "Settori"], ["calendario.html", "Calendario"], ["strumenti.html", "Strumenti"], ["backtest.html", "Backtest"]];
  const corrente = (location.pathname.split("/").pop() || "").replace(/\.html$/, "") || "index";
  const nav = document.getElementById("menu"); if (!nav) return;
  for (const [href, nome] of VOCI) {
    const a = document.createElement("a"), nomeFile = href === "./" ? "index" : href.replace(/\.html$/, "");
    a.href = href; a.textContent = nome; a.className = "btn" + (nomeFile === corrente ? "" : " sec");
    if (nomeFile === corrente) a.setAttribute("aria-current", "page");
    nav.append(a);
  }
})();
