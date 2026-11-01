"""
basewatch/detect.py — riconoscimento di una zona di accumulo SOLO dal prezzo.

Nessun indicatore: lavora sulle CHIUSURE di barre già chiuse. L'ingresso del
titolo nell'elenco (discesa, fondamentali, POC/VWAP) lo decide il vecchio
portale: qui si guarda solo se la discesa si è fermata e il prezzo oscilla in
un range.

Definizione (parametri per timeframe in TF_PARAMS, da tarare sui casi reali):
  - minimo = chiusura più bassa nella finestra `lookback`;
  - «rallenta»: dal minimo sono passate almeno `min_bars // 2` barre senza un
    nuovo minimo di chiusura;
  - «in range»: almeno `min_bars` barre dal minimo, e l'ampiezza del range
    (massimo / minimo − 1) non supera `width_max`;
  - il calo precedente (massimo → minimo) è almeno `dd_min`;
  - bottom = chiusura minima, top = chiusura massima dal minimo a ieri.
Range CONGELATO una volta riconosciuto (vedi engine.py): top e bottom non si
ricalcolano più, così non si spostano mentre il prezzo li attraversa.
"""
from __future__ import annotations

import pandas as pd

TF_PARAMS = {
    #       barre minime nel range, finestra del minimo, ampiezza max, calo min
    "1W": {"min_bars": 8,  "lookback": 78,  "width_max": 1.00, "dd_min": 0.25, "pre": 156},
    "1D": {"min_bars": 30, "lookback": 220, "width_max": 0.80, "dd_min": 0.25, "pre": 500},
}


def rileva(close: pd.Series, tf: str) -> dict | None:
    """Stato del titolo su un timeframe, o None se non c'è nessuna base.

    `close` = chiusure di barre CHIUSE, ordinate per data. Ritorna
    {stato: 'rallenta'|'in_range'|'uscito_sopra', bottom, top, inizio,
     barre, ampiezza, calo, ultimo}.
    """
    p = TF_PARAMS[tf]
    c = close.dropna().astype(float)
    if len(c) < p["lookback"] // 2:
        return None
    win = c.iloc[-p["lookback"]:]
    low_pos = int(win.values.argmin())            # primo minimo della finestra
    since = len(win) - 1 - low_pos
    if since < p["min_bars"] // 2 or since < 2:
        return None                               # il minimo è troppo recente
    low_date = win.index[low_pos]
    ultimo = float(win.iloc[-1])

    # Range sulle barre CONFERMATE (tutte tranne l'ultima): l'ultima chiusura
    # si confronta col range, non lo allarga.
    seg = win.iloc[low_pos:-1]
    if len(seg) < 2:
        return None
    bottom, top = float(seg.min()), float(seg.max())
    if bottom <= 0:
        return None
    ampiezza = top / bottom - 1

    # Calo che precede il minimo: massimo di chiusura nelle `pre` barre prima.
    prima = c.loc[:low_date].iloc[-p["pre"]:]
    calo = 1 - bottom / float(prima.max())
    if calo < p["dd_min"]:
        return None
    if ampiezza > p["width_max"]:
        return None                               # rimbalzo a V, non una base

    base = {"bottom": round(bottom, 4), "top": round(top, 4),
            "inizio": str(low_date)[:10], "barre": int(since),
            "ampiezza": round(ampiezza, 4), "calo": round(calo, 4),
            "ultimo": round(ultimo, 4)}
    if ultimo > top:
        return {**base, "stato": "uscito_sopra"}
    if ultimo < bottom:
        return None                               # nuovo minimo: base annullata
    if since >= p["min_bars"]:
        return {**base, "stato": "in_range"}
    return {**base, "stato": "rallenta"}


def barre_chiuse_giornaliere(daily: pd.DataFrame, adesso: pd.Timestamp) -> pd.DataFrame:
    """Toglie l'ultima barra giornaliera se è di oggi e il mercato USA non è
    ancora chiuso (prima delle 21:30 UTC il dato può essere parziale)."""
    if daily.empty:
        return daily
    ultima = pd.Timestamp(daily.index[-1]).normalize()
    oggi = pd.Timestamp(adesso).tz_localize(None).normalize() if adesso.tzinfo is None \
        else pd.Timestamp(adesso).tz_convert("UTC").tz_localize(None).normalize()
    ore = adesso.hour + adesso.minute / 60
    if ultima == oggi and ore < 21.5:
        return daily.iloc[:-1]
    return daily


def settimanali_chiuse(daily: pd.DataFrame, adesso: pd.Timestamp) -> pd.DataFrame:
    """Barre settimanali (chiusura = ultima seduta della settimana, venerdì
    come riferimento) ricavate dal giornaliero, SENZA l'ultima se la settimana
    non è finita. Una settimana è finita se l'ultima seduta è un venerdì, o se
    è già iniziata la settimana dopo."""
    if daily.empty:
        return daily
    w = daily.resample("W-FRI").last().dropna(how="all")
    fine_sett = w.index[-1]                       # venerdì della settimana corrente
    ultima_seduta = pd.Timestamp(daily.index[-1]).normalize()
    oggi = pd.Timestamp(adesso).tz_localize(None).normalize() if adesso.tzinfo is None \
        else pd.Timestamp(adesso).tz_convert("UTC").tz_localize(None).normalize()
    finita = (ultima_seduta.weekday() == 4) or (oggi > fine_sett)
    return w if finita else w.iloc[:-1]
