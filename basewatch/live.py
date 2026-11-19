"""basewatch/live.py — prezzi di giornata «abbastanza aggiornati» (solo informativi, mai nei segnali).

Un lotto di barre giornaliere di Yahoo contiene, a seduta in corso, la barra odierna PARZIALE: il suo Close è l'ultimo prezzo.
Qui si tiene un titolo solo se l'ultima barra porta la data di OGGI nel fuso della sua borsa (seduta in corso o chiusa oggi);
prima dell'apertura o in un giorno di festa la barra di oggi non c'è e il titolo non compare (il sito mostra la chiusura).
"""
from __future__ import annotations

import datetime as dt
from zoneinfo import ZoneInfo

import pandas as pd

FUSI = {".L": "Europe/London", ".PA": "Europe/Paris", ".AS": "Europe/Amsterdam", ".DE": "Europe/Berlin", ".MI": "Europe/Rome",
        ".MC": "Europe/Madrid", ".BR": "Europe/Brussels", ".SW": "Europe/Zurich", ".ST": "Europe/Stockholm", ".CO": "Europe/Copenhagen",
        ".HE": "Europe/Helsinki", ".OL": "Europe/Oslo", ".LS": "Europe/Lisbon", ".VI": "Europe/Vienna", ".IR": "Europe/Dublin"}
VAR_MAX = 50.0   # |variazione| oltre questa soglia = dato sospetto (split non rettificato, errore di fonte): il titolo non compare


def esclusi_dal_live(ticker: str) -> bool:
    """Indici (^…), cambi e materie prime (=X, =F): nessuna «seduta» ben definita per questo uso."""
    return ticker.startswith("^") or "=" in ticker


def fuso_di(ticker: str) -> ZoneInfo:
    for suf, tz in FUSI.items():
        if ticker.endswith(suf):
            return ZoneInfo(tz)
    return ZoneInfo("America/New_York")      # senza suffisso: titoli USA


def data_locale(ticker: str, adesso: dt.datetime) -> dt.date:
    return adesso.astimezone(fuso_di(ticker)).date()


def estrai(ticker: str, close: pd.Series, adesso: dt.datetime) -> dict | None:
    """{'p': ultimo prezzo, 'v': variazione % sulla chiusura precedente} o None se non c'è una barra di oggi valida."""
    s = pd.to_numeric(close, errors="coerce").dropna()
    if len(s) < 2 or esclusi_dal_live(ticker):
        return None
    if pd.Timestamp(s.index[-1]).date() != data_locale(ticker, adesso):
        return None
    p, prec = float(s.iloc[-1]), float(s.iloc[-2])
    if not (p > 0 and prec > 0):
        return None
    v = (p / prec - 1) * 100
    if abs(v) > VAR_MAX:
        return None
    return {"p": round(p, 4), "v": round(v, 2)}


def costruisci(frames: dict[str, pd.Series], richiesti: int, adesso: dt.datetime) -> dict:
    """Corpo del file pubblico site/data/prezzi_live.json."""
    titoli, fuori = {}, 0
    for t, close in frames.items():
        r = estrai(t, close, adesso)
        if r:
            titoli[t] = r
        else:
            fuori += 1
    return {"aggiornato": adesso.astimezone(dt.timezone.utc).isoformat(timespec="seconds"),
            "richiesti": richiesti, "scaricati": len(frames), "in_seduta": len(titoli), "fuori_seduta": fuori,
            "titoli": dict(sorted(titoli.items()))}
