"""
basewatch/alert.py — alert unico: range (stato) + punteggio 1–6 (posizione nel range) + retest.

Il punteggio sta nel database D1 (caricato dal repo privato dopo ogni screening) e qui si LEGGE
con l'API REST di Cloudflare. Se il database non risponde l'alert parte comunque, senza punteggio:
un guasto del database non deve mai bloccare un avviso di uscita.
Solo informazione: backtest 2016–2026 → nessun vantaggio dimostrato né per l'uscita né per il punteggio
né per il retest (docs/backtest-range.md, docs/backtest-retest.md).
"""
from __future__ import annotations

import datetime as dt
import os

import pandas as pd
import requests

from basewatch import retest as rt

BLOCCO = 90                      # D1: al massimo 100 parametri per query
PUNTEGGIO_VECCHIO_GIORNI = 3     # oltre questa età il punteggio è segnalato come datato
RETEST_GIORNI_MAX = 3            # si avvisa solo di un retest avvenuto negli ultimi 3 giorni
NOTA_RETEST = ("Storico 2016–2026: dopo un'uscita il prezzo ritesta il livello nel 61–66% dei casi entro 30 sedute "
               "(nessun vantaggio dimostrato).")
AVVISO = "Solo informazione sui prezzi: non è un ordine né un consiglio."


def leggi_punteggi(tickers: list[str], env=None, post=requests.post) -> dict[str, dict]:
    """{ticker: {segnale, punti, data}} dall'ultima data di screening presente in D1; {} se non raggiungibile."""
    env = os.environ if env is None else env
    acc, db, tok = env.get("CF_ACCOUNT_ID"), env.get("CF_D1_DATABASE_ID"), env.get("CF_API_TOKEN")
    if not (acc and db and tok) or not tickers:
        return {}
    url = f"https://api.cloudflare.com/client/v4/accounts/{acc}/d1/database/{db}/query"
    out: dict[str, dict] = {}
    lista = sorted(set(tickers))
    try:
        for i in range(0, len(lista), BLOCCO):
            lotto = lista[i:i + BLOCCO]
            sql = ("SELECT ticker, data, segnale, punti FROM punteggi WHERE data = (SELECT MAX(data) FROM punteggi) "
                   f"AND ticker IN ({','.join('?' * len(lotto))})")
            r = post(url, json={"sql": sql, "params": lotto}, timeout=30,
                     headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
            j = r.json()
            if not j.get("success"):
                raise RuntimeError("risposta Cloudflare non riuscita")
            for riga in (j.get("result") or [{}])[0].get("results") or []:
                out[riga["ticker"]] = {"segnale": riga.get("segnale"), "punti": riga.get("punti"), "data": riga.get("data")}
    except Exception as e:           # nessun segreto nel messaggio
        print(f"⚠️ punteggi da D1 non disponibili: {type(e).__name__}")
        return {}
    return out


def riga_punteggio(p: dict | None, oggi: dt.date) -> str:
    if not p or p.get("punti") is None:
        return "Punteggio 1–6: non disponibile (titolo fuori dallo screening o database non raggiungibile)"
    sig = p.get("segnale") or f"{p['punti']}/6"
    txt = f"Punteggio 1–6: {sig} (screening del {p.get('data')})"
    try:
        if (oggi - dt.date.fromisoformat(str(p["data"])[:10])).days > PUNTEGGIO_VECCHIO_GIORNI:
            txt += " ⚠️ dato non recente"
    except Exception:
        pass
    return txt


def messaggio_unificato(e: dict, p: dict | None, oggi: dt.date) -> str:
    """Alert di uscita (o retest) con il punteggio. `e` come gli eventi di engine (+ tipo 'retest_tenuto')."""
    tf = {"1W": "settimanale", "1D": "giornaliero"}.get(e["tf"], e["tf"])
    if e["tipo"] == "retest_tenuto":
        testa = f"🔁 RETEST DEL LIVELLO ROTTO (tenuto)\n{e['ticker']} ({tf}) — chiusura {e['chiusura']} sopra il top {e['top']}, " \
                f"dopo l'uscita del {e['data_uscita']}; minimo del {e['data']} nella zona del top"
    else:
        freccia = {"uscita_sopra": "⬆️ USCITA DAL RANGE verso l'alto", "uscita_sotto": "⬇️ USCITA DAL RANGE verso il basso",
                   "nuova_base": "🧱 Nuova base riconosciuta", "rientro": "↩️ Rientro nel range"}[e["tipo"]]
        testa = f"{freccia}\n{e['ticker']} ({tf}) — chiusura {e['chiusura']} · range {e['bottom']} – {e['top']}"
    righe = [testa, riga_punteggio(p, oggi)]
    if e["tipo"] == "uscita_sopra":
        righe.append(NOTA_RETEST)
    righe.append(AVVISO)
    return "\n".join(righe)


def retest_nuovi(stato: dict, giornalieri: dict[str, pd.DataFrame], oggi: dt.date) -> list[dict]:
    """Retest tenuti NUOVI delle uscite verso l'alto osservate da noi (definizione pre-registrata, basewatch/retest.py).
    Segna `retest_notificato` (= data dell'uscita) per non avvisare due volte lo stesso retest."""
    out = []
    for k, b in stato.items():
        if b.get("stato") != "uscito_sopra" or b.get("prima_vista") or not b.get("uscito_il"):
            continue
        if b.get("retest_notificato") == b["uscito_il"]:
            continue
        t, tf = k.split("|")
        df = giornalieri.get(t)
        if df is None or df.empty:
            continue
        c = rt.classifica_ritorno(df, float(b["top"]), b["uscito_il"])
        if c["esito"] != "retest_tenuto" or c["data"] is None:
            continue
        if (oggi - c["data"].date()).days > RETEST_GIORNI_MAX:
            continue
        b["retest_notificato"] = b["uscito_il"]
        out.append({"ticker": t, "tf": tf, "tipo": "retest_tenuto", "top": b["top"], "bottom": b["bottom"],
                    "chiusura": round(float(df["Close"].loc[c["data"]]), 4), "data": str(c["data"])[:10],
                    "data_uscita": b["uscito_il"], "inizio": b.get("inizio")})
    return out
