#!/usr/bin/env python3
"""verifica_pulizia.py — controllo dei riferimenti residui dopo la pulizia finale (11/2026).

Cerca, in un repo (monitor-visivo o monitor-trading-marco), i riferimenti alle funzionalità
rimosse con le patch della pulizia finale:
  - la vecchia modalità di accesso a CODICE (secret ACCESS_CODE, header x-codice, bw_codice);
  - la gestione automatica della regola di Cloudflare Access via API
    (CF_ACCESS_TOKEN, ACCESS_POLICY_ID, ACCESS_APP_ID e le funzioni/endpoint che la usano).

NON cerca CF_ACCOUNT_ID / CF_API_TOKEN / CF_D1_DATABASE_ID: quei nomi restano in uso per
l'accesso al database D1 (basewatch/alert.py, carica_punteggi_d1.py, esporta_pagine_d1.py)
e non vanno tolti.

Uso:   python3 scripts/verifica_pulizia.py [percorso_del_repo]   (default: la repo corrente)
Esce 0 (PULITO) se non trova nulla, 1 con l'elenco dei residui. Questo file non esamina
sé stesso (contiene i nomi da cercare).
"""
from __future__ import annotations

import sys
from pathlib import Path

# Nome → perché è residuo (stampato se trovato)
CERCA = {
    "ACCESS_CODE": "secret della vecchia modalità a codice, rimosso",
    "CF_ACCESS_TOKEN": "secret dell'API di Cloudflare Access, rimosso",
    "ACCESS_POLICY_ID": "override dell'API Access, rimosso",
    "ACCESS_APP_ID": "override dell'API Access, rimosso",
    "x-codice": "header della vecchia modalità a codice",
    "bw_codice": "chiave localStorage del vecchio codice di accesso",
    "accessAggiungi": "funzione dell'API Access rimossa (src/utenti.js)",
    "accessRimuovi": "funzione dell'API Access rimossa (src/utenti.js)",
    "accessConfigurato": "funzione dell'API Access rimossa (src/utenti.js)",
    "trovaPolicy": "funzione dell'API Access rimossa (src/utenti.js)",
    "verificaAccess": "funzione dell'API Access rimossa (src/utenti.js)",
    "tokenValido": "funzione dell'API Access rimossa (src/utenti.js)",
    "leggiPolicy": "funzione dell'API Access rimossa (src/utenti.js)",
    "modificaPolicy": "funzione dell'API Access rimossa (src/utenti.js)",
    "access-test": "endpoint /api/utenti/access-test rimosso",
    "prova-access": "bottone della pagina Utenti rimosso",
    "modalità a codice": "vecchia modalità di accesso rimossa",
}
ESTENSIONI = {".py", ".js", ".mjs", ".html", ".jsonc", ".json", ".md", ".txt", ".yml", ".yaml"}
ESCLUDI_DIR = {"vendor", "node_modules", ".git", "__pycache__", "site" + "/vendor"}


def main() -> int:
    radice = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
    io_stesso = Path(__file__).resolve()
    residui: list[str] = []
    if not radice.is_dir():
        print(f"ERRORE: {radice} non è una directory")
        return 1
    for p in sorted(radice.rglob("*")):
        if not p.is_file():
            continue
        if p.resolve() == io_stesso:
            continue                     # questo script contiene i nomi da cercare
        if p.suffix.lower() not in ESTENSIONI:
            continue
        rel = p.relative_to(radice)
        if any(part in ESCLUDI_DIR for part in rel.parts):
            continue                     # librerie vendor e dati
        try:
            testo = p.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        for nome, perche in CERCA.items():
            if nome in testo:
                riga = next(i for i, l in enumerate(testo.splitlines(), 1) if nome in l)
                residui.append(f"{rel}:{riga}  «{nome}» — {perche}")
    if residui:
        print(f"NON PULITO: {len(residui)} riferimenti residui su {radice.name}\n")
        for r in residui:
            print("  " + r)
        print("\nApplicare le patch di consegna/patch/ (o rimuovere i riferimenti) e rilanciare.")
        return 1
    print(f"PULITO: nessun riferimento residuo alle funzionalità rimosse ({radice.name}).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
