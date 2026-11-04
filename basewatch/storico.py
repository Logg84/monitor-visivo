"""
basewatch/storico.py — replay storico del rilevatore, per il backtest.

Rigioca `engine.aggiorna_titolo` GIORNO PER GIORNO sullo storico, con le stesse
regole del giro reale: solo barre chiuse, range congelato appena riconosciuto,
alert sulla prima chiusura fuori range, settimanale e giornaliero indipendenti.
Nessun look-ahead: alla data t si vedono solo le chiusure fino a t.

Ogni evento (nuova_base, uscita_sopra, uscita_sotto, rientro) diventa una riga
con la barra del segnale, il giorno in cui l'alert sarebbe arrivato e i prezzi
di riferimento per i rendimenti a termine (chiusura del giorno, apertura della
seduta successiva). Il punteggio 1–6 NON è qui: si calcola nel repo privato
alla stessa data.

Limiti noti (da dichiarare nel report del backtest):
  - universo = titoli di oggi (survivorship bias);
  - prezzi rettificati di Yahoo (dividendi/split), nessun costo di transazione;
  - i fondamentali storici non sono ricostruibili: qui c'è solo la parte prezzo.
"""
from __future__ import annotations

import pandas as pd

from basewatch import engine

FINESTRA = {"1D": 900, "1W": 300}   # barre passate sufficienti per detect.rileva (lookback + pre)
PARTENZA = 120                      # barre giornaliere minime prima di iniziare il replay
CAMPI_BASE = ("ampiezza", "calo", "barre", "swing_minimi", "swing_massimi")
COLONNE = ["ticker", "tf", "tipo", "data", "data_alert", "chiusura", "chiusura_giorno",
           "apertura_succ", "bottom", "top", "inizio", *CAMPI_BASE]


def replay_titolo(ticker: str, daily: pd.DataFrame, da: str | None = None) -> list[dict]:
    """Eventi storici di un titolo. `daily` = DataFrame giornaliero con Open e
    Close (indice = date). `da` (ISO) filtra solo l'OUTPUT: il replay parte
    sempre dall'inizio dei dati, perché lo stato (range congelati) dipende dal passato."""
    d = daily[["Open", "Close"]].dropna(subset=["Close"]).sort_index()
    if len(d) <= PARTENZA:
        return []
    close = d["Close"].astype(float)
    aperture_succ = d["Open"].shift(-1)
    sett_full = close.resample("W-FRI").last().dropna()   # come detect.settimanali_chiuse
    da_ts = pd.Timestamp(da) if da else None
    stato: dict = {}
    righe: list[dict] = []
    for i in range(PARTENZA, len(d)):
        t = d.index[i]
        giorn = close.iloc[max(0, i + 1 - FINESTRA["1D"]):i + 1]
        j = sett_full.index.searchsorted(t, side="right")   # settimane con etichetta (venerdì) <= t
        sett = sett_full.iloc[max(0, j - FINESTRA["1W"]):j]
        eventi = engine.aggiorna_titolo(stato, ticker, {"1W": sett, "1D": giorn}, t.date())
        if not eventi or (da_ts is not None and t < da_ts):
            continue
        for e in eventi:
            b = stato.get(f"{ticker}|{e['tf']}", {})
            ap = aperture_succ.iloc[i]
            righe.append({
                "ticker": ticker, "tf": e["tf"], "tipo": e["tipo"],
                "data": e["data"], "data_alert": str(t.date()),
                "chiusura": e["chiusura"], "chiusura_giorno": round(float(close.iloc[i]), 4),
                "apertura_succ": None if pd.isna(ap) else round(float(ap), 4),
                "bottom": e["bottom"], "top": e["top"], "inizio": e["inizio"],
                **{k: b.get(k) for k in CAMPI_BASE},
            })
    return righe


def _job(args: tuple) -> list[dict]:
    ticker, daily, da = args
    try:
        return replay_titolo(ticker, daily, da)
    except Exception as e:                      # un titolo difettoso non ferma gli altri
        print(f"⚠️ {ticker}: {type(e).__name__}: {e}")
        return []


def replay_universo(prezzi: dict[str, pd.DataFrame], da: str | None = None,
                    jobs: int = 1) -> pd.DataFrame:
    """Replay su tutti i titoli (in parallelo se jobs > 1). DataFrame ordinato per
    data_alert, ticker, tf, tipo."""
    lavori = [(t, df, da) for t, df in sorted(prezzi.items())]
    if jobs > 1 and len(lavori) > 1:
        from multiprocessing import Pool
        with Pool(jobs) as p:
            risultati = p.map(_job, lavori, chunksize=4)
    else:
        risultati = [_job(x) for x in lavori]
    righe = [r for lista in risultati for r in lista]
    out = pd.DataFrame(righe, columns=COLONNE)
    return out.sort_values(["data_alert", "ticker", "tf", "tipo"], kind="stable").reset_index(drop=True)
