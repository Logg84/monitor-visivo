// Menu unico e fisso: stesso ordine su tutte le pagine; la pagina corrente è evidenziata (non nascosta).
(() => {
  // Banner giallo per i guasti dell'API (rete, 5xx): prima l'errore compariva solo come testo piccolo in una pagina.
  // 401/403/404 sono risposte normali (accesso, dato non ancora caricato) e non lo attivano.
  const _fetch = window.fetch.bind(window);
  function banner(msg) {
    let b = document.getElementById("banner-api");
    if (!b) { b = document.createElement("div"); b.id = "banner-api"; b.setAttribute("role", "alert"); b.className = "banner-api"; document.body.prepend(b); }
    b.textContent = "⚠️ " + msg;
  }
  window.fetch = async (...a) => {
    const u = String(a[0] && a[0].url ? a[0].url : a[0]);
    try {
      const r = await _fetch(...a);
      if (u.includes("/api/") && r.status >= 500) banner(`Alcuni dati non sono disponibili (errore ${r.status} del servizio). Riprova fra poco: i numeri che vedi potrebbero essere incompleti.`);
      return r;
    } catch (e) {
      if (u.includes("/api/")) banner("Alcuni dati non sono disponibili (connessione al servizio non riuscita). Riprova fra poco.");
      throw e;
    }
  };
  { const s = document.createElement("script"); s.src = "cardmobile.js"; s.defer = true; document.head.append(s); }   // tabelle → card su mobile
  const VOCI = [["./", "Basi di accumulo"], ["unificato.html", "Vista unificata"], ["screening.html", "Screening"], ["watchlist.html", "Watchlist"],
    ["portafoglio.html", "Portafoglio"], ["condiviso.html", "Condiviso"], ["insider.html", "Insider"], ["macro.html", "Regimi macro"],
    ["settori.html", "Settori"], ["calendario.html", "Calendario"], ["strumenti.html", "Indici / Materie prime"], ["report.html", "Report"], ["briefing.html", "Briefing LLM"], ["backtest.html", "Backtest"], ["profilo.html", "Profilo"]];
  const corrente = (location.pathname.split("/").pop() || "").replace(/\.html$/, "") || "index";
  const nav = document.getElementById("menu"); if (!nav) return;
  for (const [href, nome] of VOCI) {
    const a = document.createElement("a"), nomeFile = href === "./" ? "index" : href.replace(/\.html$/, "");
    a.href = href; a.textContent = nome; a.className = "btn" + (nomeFile === corrente ? "" : " sec");
    if (nomeFile === corrente) a.setAttribute("aria-current", "page");
    nav.append(a);
  }
  // Solo l'amministratore vede «Utenti» (richieste di accesso); per gli altri la voce non esiste.
  fetch("/api/utenti/me", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((m) => {
    if (m && m.abilitato === false) { location.replace("richiedi.html"); return; }     // verificato da Access ma non ancora abilitato
    if (!m || !m.admin) return;
    const a = document.createElement("a"); a.href = "utenti.html"; a.textContent = "Utenti"; a.className = "btn" + (corrente === "utenti" ? "" : " sec");
    if (corrente === "utenti") a.setAttribute("aria-current", "page");
    nav.append(a);
  }).catch(() => {});
})();
