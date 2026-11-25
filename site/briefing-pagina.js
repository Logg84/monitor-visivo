// Pagina «Briefing per LLM»: scarica le fonti già usate dalle altre pagine, le passa a Briefing.costruisci e offre Scarica/Copia.
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const j = async (u) => { try { const r = await fetch(u, { cache: "no-store" }); return r.ok ? await r.json() : null; } catch (e) { return null; } };
  let ctx = null;

  function ricostruisci() {
    if (!ctx) return;
    const md = window.Briefing.costruisci(ctx, { istruzioni: $("o-ist").checked, watchlist: $("o-wl").checked, portafoglio: $("o-pf").checked });
    $("anteprima").value = md;
    $("info").textContent = `${(md.length / 1024).toFixed(0)} KB · ~${Math.round(md.length / 3.5 / 1000)}k token`;
    for (const id of ["scarica", "copia", "ai"]) $(id).disabled = false;
    for (const b of document.querySelectorAll("[data-chat]")) b.disabled = false;
    return md;
  }

  async function avvia() {
    const [macro, settori, strumenti, insider, calendario, screening, indice, wl, pf] = await Promise.all([
      j("/api/pagina/macro"), j("/api/pagina/settori"), j("/api/pagina/strumenti"), j("/api/pagina/insider"), j("/api/pagina/calendario"),
      j("/api/screening"), j("data/index.json"), j("/api/dati/watchlist"), j("/api/dati/portafoglio")]);
    const errori = [];
    for (const [nome, v] of [["regime macro", macro], ["settori", settori], ["indici/materie prime", strumenti], ["insider", insider], ["calendario", calendario], ["screening", screening && screening.data ? screening : null], ["range (basi)", indice]]) if (!v) errori.push(nome);
    ctx = { ora: new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC", macro, settori, strumenti, insider, calendario, screening, indice,
      watchlist: wl && wl.dati ? wl.dati : null, portafoglio: pf && Array.isArray(pf.righe) ? pf : null, errori };
    if (errori.length) { $("avviso").hidden = false; $("avviso").textContent = "Non disponibili in questo momento (sezioni segnate «non disponibile» nel file): " + errori.join(", ") + "."; }
    $("sottotitolo").textContent = "Pronto: " + (screening && screening.data ? `screening del ${screening.data}` : "screening non disponibile");
    ricostruisci();
  }

  $("o-ist").addEventListener("change", ricostruisci); $("o-wl").addEventListener("change", ricostruisci); $("o-pf").addEventListener("change", ricostruisci);
  $("scarica").addEventListener("click", () => {
    const md = ricostruisci(); if (!md) return;
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([md], { type: "text/markdown;charset=utf-8" }));
    a.download = `briefing-${new Date().toISOString().slice(0, 10)}.md`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  $("copia").addEventListener("click", async () => {
    const md = ricostruisci(); if (!md) return;
    try { await navigator.clipboard.writeText(md); $("info").textContent = "Copiato negli appunti."; }
    catch (e) { $("anteprima").select(); $("info").textContent = "Copia non consentita dal browser: il testo è selezionato, premi Ctrl+C."; }
  });
  // Chat esterne (DeepSeek, Qwen, GLM): copia il briefing completo e apre la chat in una nuova scheda (incolla a mano).
  for (const b of document.querySelectorAll("[data-chat]")) b.addEventListener("click", async () => {
    const md = ricostruisci(); if (!md) return;
    const nome = b.textContent.trim();
    window.open(b.dataset.chat, "_blank", "noopener");   // subito, nel gesto dell'utente: dopo l'await il browser potrebbe bloccarlo
    try { await navigator.clipboard.writeText(md); $("info").textContent = `Briefing copiato: incollalo nella chat di ${nome}.`; }
    catch (e) { $("anteprima").select(); $("info").textContent = `Copia non consentita dal browser: il testo è selezionato qui sotto, premi Ctrl+C e poi incolla nella chat di ${nome}.`; }
  });
  // Analisi AI: stesso briefing, senza le istruzioni per l'LLM esterno, letto dal motore del portale (/api/analisi-briefing).
  $("ai").addEventListener("click", async () => {
    if (!ctx) return;
    const box = $("esito-ai"), btn = $("ai");
    const md = window.Briefing.costruisci(ctx, { istruzioni: false, watchlist: $("o-wl").checked, portafoglio: $("o-pf").checked });
    btn.disabled = true; box.hidden = false; box.textContent = "Analisi in corso… (di solito 10-30 secondi)";
    try {
      const r = await fetch("/api/analisi-briefing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ testo: md }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.errore || `errore ${r.status}`);
      box.textContent = "";
      for (const par of String(j.testo).split(/\n+/).map((x) => x.trim()).filter(Boolean)) {
        const e = document.createElement(/^[A-ZÀ-Ü' ,]{6,}:?$/.test(par) ? "h4" : "p");
        e.textContent = par.replace(/:$/, ""); box.append(e);
      }
      const nota = document.createElement("p"); nota.className = "avviso";
      nota.textContent = "Sintesi automatica dei soli dati del briefing, senza notizie dal web e senza indicazioni operative." + (j.troncato ? " Il briefing era molto lungo: le sezioni finali non sono state lette." : "")
        + (typeof j.analisi_restanti === "number" ? ` Analisi rimaste oggi: ${j.analisi_restanti}.` : "");
      box.append(nota);
    } catch (e) { box.textContent = "Analisi non riuscita: " + e.message; }
    btn.disabled = false;
  });
  avvia();
})();
