"""
basewatch/retest.py — retest del livello rotto dopo l'uscita dal range (nessuna rete).

Definizione PRE-REGISTRATA in docs/backtest-retest.md (non cambiare i parametri dopo
aver visto i risultati). Dopo la prima uscita dall'alto di una base, partendo dalla
seduta successiva al giorno dell'alert e per al massimo FINESTRA sedute, alla prima
seduta in cui:
  1. chiusura ≤ top            → «rientro» (uscita fallita; ha la precedenza);
  2. minimo ≤ top × (1 + TOL)
     e chiusura > top          → «retest_tenuto».
Niente entro FINESTRA sedute → «nessuno»; dati finiti prima → «incompleto».
Ogni decisione usa solo barre fino al giorno t compreso.
"""
from __future__ import annotations

from pathlib import Path

import pandas as pd

from basewatch import backtest as bt

TOL = 0.02
FINESTRA = 30
MAX_GAP_GIORNI = 4          # la barra del giorno dell'alert può mancare di qualche giorno (festività/borse diverse)


def classifica_ritorno(df: pd.DataFrame, top: float, data_alert,
                       tol: float = TOL, finestra: int = FINESTRA) -> dict:
    """Esito del ritorno al livello `top` dopo l'uscita del giorno `data_alert`.
    `df` = OHLC giornaliero (colonne Low e Close). Ritorna {esito, data}."""
    idx = df.index
    d = pd.Timestamp(data_alert)
    i0 = int(idx.searchsorted(d, side="right")) - 1
    if i0 < 0 or (d - idx[i0]).days > MAX_GAP_GIORNI:
        return {"esito": "incompleto", "data": None}
    close, low = df["Close"].to_numpy(), df["Low"].to_numpy()
    fine = min(i0 + finestra, len(df) - 1)
    for k in range(i0 + 1, fine + 1):
        if close[k] <= top:
            return {"esito": "rientro", "data": idx[k]}
        if low[k] <= top * (1 + tol):
            return {"esito": "retest_tenuto", "data": idx[k]}
    return {"esito": "nessuno" if i0 + finestra <= len(df) - 1 else "incompleto", "data": None}


def esiti(ev: pd.DataFrame, prezzi: dict, tol: float = TOL, finestra: int = FINESTRA) -> pd.DataFrame:
    """Aggiunge `esito` e `data_retest` a ogni uscita (ticker, tf, inizio, top, data_alert)."""
    out = ev.copy()
    es, dt = [], []
    for r in ev.itertuples(index=False):
        df = prezzi.get(r.ticker)
        if df is None:
            es.append("senza_prezzi")
            dt.append(pd.NaT)
            continue
        c = classifica_ritorno(df, float(r.top), r.data_alert, tol, finestra)
        es.append(c["esito"])
        dt.append(c["data"] if c["data"] is not None else pd.NaT)
    out["esito"], out["data_retest"] = es, dt
    return out


def analisi(ev: pd.DataFrame, prezzi: dict, tol: float = TOL, finestra: int = FINESTRA,
            orizzonti=bt.ORIZZONTI) -> dict:
    """Tabelle del test: `uscite` (rendimenti a ingresso all'uscita), `retest` (rendimenti a ingresso
    al retest tenuto) e `appaiati` (stessa base: retest meno uscita)."""
    pan = bt.pannelli(prezzi)
    cl = esiti(ev, prezzi, tol, finestra)
    uscite = bt.ritorni(cl, pan, orizzonti)
    held = cl[cl["esito"] == "retest_tenuto"].copy()
    held["data_alert_uscita"] = held["data_alert"]
    held["data_alert"] = held["data_retest"].dt.strftime("%Y-%m-%d")        # l'ingresso parte dal retest
    retest = bt.ritorni(held, pan, orizzonti)
    chiavi = ["ticker", "tf", "inizio"]
    colonne = [f"ecc{h}" for h in orizzonti]
    m = retest.merge(uscite[chiavi + colonne], on=chiavi, suffixes=("", "_uscita"))
    for c in colonne:
        m[f"diff{c[3:]}"] = m[c] - m[f"{c}_uscita"]
    return {"classificati": cl, "uscite": uscite, "retest": retest, "appaiati": m}


def esito_verdetto(valore: float, t: float, n: int, mesi: int,
                   n_min: int = 30, mesi_min: int = 24, t_min: float = 2.0) -> str:
    if n < n_min or mesi < mesi_min or valore != valore or t != t:
        return "NON VALUTABILE"
    return "SUPPORTATO" if valore > 0 and t > t_min else "NON DIMOSTRATO"


def mese(df: pd.DataFrame, col: str = "data_alert") -> pd.Series:
    return df[col].astype(str).str[:7]


def verdetti(a: dict, h: int = bt.ORIZZONTE_CRITERIO) -> list[dict]:
    out = []
    r = a["retest"].dropna(subset=[f"ecc{h}"])
    s = bt.stat(r[f"ecc{h}"], mese(r))
    out.append({"id": "T1", "testo": f"Retest tenuto: eccesso a {h} sedute > 0, t > 2", **s,
                "esito": esito_verdetto(s["media"], s["t"], s["n"], r["data_alert"].astype(str).str[:7].nunique())})
    p = a["appaiati"].dropna(subset=[f"diff{h}"])
    s2 = bt.stat(p[f"diff{h}"], mese(p))
    out.append({"id": "T2", "testo": f"Retest tenuto − uscita (stesse basi): differenza a {h} sedute > 0, t > 2", **s2,
                "esito": esito_verdetto(s2["media"], s2["t"], s2["n"], p["data_alert"].astype(str).str[:7].nunique())})
    return out


def quote(classificati: pd.DataFrame) -> pd.DataFrame:
    """T3: quota di uscite per esito e timeframe."""
    t = classificati.groupby(["tf", "esito"]).size().unstack(fill_value=0)
    for c in ("retest_tenuto", "rientro", "nessuno", "incompleto", "senza_prezzi"):
        if c not in t:
            t[c] = 0
    t = t[["retest_tenuto", "rientro", "nessuno", "incompleto", "senza_prezzi"]]
    t["totale"] = t.sum(axis=1)
    return t


def leggi_universo(path) -> list[str]:
    """Ticker del file dell'universo (uno per riga, # per i commenti, righe vuote ignorate)."""
    righe = Path(path).read_text(encoding="utf-8").splitlines()
    return sorted({r.split("#")[0].strip().upper() for r in righe if r.split("#")[0].strip()})
