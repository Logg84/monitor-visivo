"""
basewatch/detect.py — riconoscimento di una zona di accumulo SOLO dal prezzo.

Nessun indicatore: lavora sulle CHIUSURE di barre già chiuse. L'ingresso del
titolo nell'elenco (discesa, fondamentali, POC/VWAP) lo decide il vecchio
portale: qui si guarda solo se la discesa si è fermata e il prezzo oscilla in
un range (anche con pendenza: wedge, flag, rounding).

Definizione (parametri per timeframe in TF_PARAMS, da tarare sui casi reali):
  - minimo = chiusura più bassa nella finestra `lookback`;
  - il range parte dal minimo e finisce alla prima barra di RIPARTENZA
    IMPULSIVA: una chiusura oltre il massimo corrente di più di 3 volte la
    variazione tipica (la maggiore tra quella della base e quella delle barre
    PRIMA del minimo: al cambio di trend le oscillazioni sono anomale) e ≥ 4%. Così le barre di rottura non
    allargano il range (caso WKL), mentre una risalita graduale dal minimo
    resta parte della base (caso ADBE);
  - «rallenta»: dal minimo sono passate almeno `min_bars // 2` barre senza un
    nuovo minimo;
  - «in_range»: almeno `min_bars` barre dal minimo, ampiezza (massimo/minimo −1)
    sotto `width_max` e struttura a 4 SWING: almeno 2 minimi locali dentro la
    ZONA DI BOTTOM (il 40% più basso del range, non il minimo esatto) e almeno
    2 massimi locali sopra di essa (regola Casario/Rea dei 4 swing);
  - calo precedente (massimo → minimo) almeno `dd_min`;
  - «uscito_sopra»: l'ultima chiusura è oltre il top.
Range CONGELATO una volta riconosciuto (vedi engine.py).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

TF_PARAMS = {
    "1W": {"min_bars": 8,  "lookback": 78,  "width_max": 1.00, "dd_min": 0.25,
           "pre": 156, "min_range": 4,  "k": 2, "vol_pre": 13},
    "1D": {"min_bars": 30, "lookback": 220, "width_max": 0.80, "dd_min": 0.25,
           "pre": 500, "min_range": 15, "k": 3, "vol_pre": 60},
}
K_IMPULSO = 3.0               # salto = K × variazione tipica della base
VOL_PESO = 0.65              # peso della volatilità pre-minimo (tarato su RBLX/WKL/TYL/ADBE, 2/11/2026)
MIN_SALTO = 0.04              # e comunque almeno +4% oltre il massimo
ZONA_BOTTOM = 0.40            # frazione bassa del range che conta come «zona di bottom»


def _fine_range(v: np.ndarray, low_pos: int, min_range: int, vol_ref: float = 0.0) -> int | None:
    """Indice (in v) della prima barra di RIPARTENZA IMPULSIVA, o None.
    Una barra è impulsiva se chiude oltre il massimo corrente di più di
    K volte la variazione tipica (mediana dei |rendimenti|) del range fin lì,
    e almeno del MIN_SALTO. Una risalita graduale dal minimo (caso ADBE) fa
    parte della base; un salto netto (caso WKL) la chiude."""
    mx = v[low_pos]
    for i in range(low_pos + 1, len(v)):
        n = i - low_pos
        if n >= min_range:
            rend = np.abs(np.diff(v[low_pos:i])) / v[low_pos:i - 1]
            tipico = float(np.median(rend)) if len(rend) else 0.0
            tipico = max(tipico, VOL_PESO * vol_ref)      # al cambio di trend le oscillazioni sono anomale: conta anche la volatilità di prima
            salto = v[i] / mx - 1
            if salto > max(K_IMPULSO * tipico, MIN_SALTO):
                return i
        mx = max(mx, v[i])
    return None


def conta_swing(seg: np.ndarray, k: int) -> tuple[int, int]:
    """(minimi locali nella zona di bottom, massimi locali sopra la zona) sulle
    chiusure del range. Pivot = chiusura estrema entro ±k barre; la prima barra
    (il minimo) conta come minimo."""
    if len(seg) < 3:
        return 0, 0
    lo, hi = float(seg.min()), float(seg.max())
    soglia = lo + ZONA_BOTTOM * (hi - lo)
    minimi = massimi = 0
    for i in range(len(seg)):
        a, b = max(0, i - k), min(len(seg), i + k + 1)
        finestra = seg[a:b]
        if seg[i] == finestra.min() and (i == 0 or i >= k) and seg[i] <= soglia:
            minimi += 1
        if seg[i] == finestra.max() and i >= k and i + k < len(seg) and seg[i] > soglia:
            massimi += 1
    return minimi, massimi


def rileva(close: pd.Series, tf: str) -> dict | None:
    """Stato del titolo su un timeframe, o None se non c'è nessuna base.

    `close` = chiusure di barre CHIUSE, ordinate per data. Ritorna
    {stato: 'rallenta'|'in_range'|'uscito_sopra', bottom, top, inizio, barre,
     ampiezza, calo, ultimo, swing_minimi, swing_massimi[, uscita_data]}.
    """
    p = TF_PARAMS[tf]
    c = close.dropna().astype(float)
    if len(c) < p["lookback"] // 2:
        return None
    win = c.iloc[-p["lookback"]:]
    v = win.values
    low_pos = int(v.argmin())
    since = len(v) - 1 - low_pos
    if since < p["min_bars"] // 2 or since < 2:
        return None                               # il minimo è troppo recente
    low_date = win.index[low_pos]
    ultimo = float(v[-1])

    pre_v = c.loc[:low_date].iloc[-(p["vol_pre"] + 1):].values
    vol_ref = float(np.median(np.abs(np.diff(pre_v)) / pre_v[:-1])) if len(pre_v) > 3 else 0.0
    fine = _fine_range(v, low_pos, p["min_range"], vol_ref)
    uscita_data = str(win.index[fine])[:10] if fine is not None else None
    seg = v[low_pos:(fine if fine is not None else len(v) - 1)]
    if len(seg) < 2:
        return None
    bottom, top = float(seg.min()), float(seg.max())
    if bottom <= 0:
        return None
    ampiezza = top / bottom - 1
    prima = c.loc[:low_date].iloc[-p["pre"]:]
    calo = 1 - bottom / float(prima.max())
    if calo < p["dd_min"] or ampiezza > p["width_max"]:
        return None                               # niente calo, o rimbalzo a V
    if ultimo < bottom:
        return None                               # nuovo minimo: base annullata

    mi, ma = conta_swing(seg, p["k"])
    base = {"bottom": round(bottom, 4), "top": round(top, 4),
            "inizio": str(low_date)[:10], "barre": int(since),
            "ampiezza": round(ampiezza, 4), "calo": round(calo, 4),
            "ultimo": round(ultimo, 4), "swing_minimi": mi, "swing_massimi": ma}
    if ultimo > top:
        return {**base, "stato": "uscito_sopra", "uscita_data": uscita_data}
    if since >= p["min_bars"] and mi >= 2 and ma >= 2:
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
