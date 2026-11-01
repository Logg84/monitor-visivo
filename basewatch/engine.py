"""
basewatch/engine.py — stato per titolo/timeframe, range congelato, eventi.

Stato in data/bases.json: chiave "TICKER|TF" → {stato, bottom, top, inizio,
congelato_il, ultimo, aggiornato}. Regole:
  - 'rallenta': ricalcolata a ogni giro (il range ancora si muove);
  - 'in_range': appena riconosciuta si CONGELA (top/bottom non cambiano più);
  - chiusura sopra top → evento 'uscita_sopra'; sotto bottom → 'uscita_sotto'
    (UNA sola volta: lo stato passa a uscito_* e non si ripete l'alert);
  - uscito_* resta visibile `GIORNI_UCCITO` giorni, poi sparisce.
Gli alert sono solo le USCITE (richiesta di Marco): chiusura giornaliera
fuori dal range, mai il semplice tocco.
"""
from __future__ import annotations

import datetime as dt
import json
from pathlib import Path

import pandas as pd

from basewatch import detect

GIORNI_USCITO = 20
TF_LISTA = ("1W", "1D")


def carica_stato(path: Path) -> dict:
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except Exception:
        return {}


def salva_stato(stato: dict, path: Path) -> None:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(stato, indent=1, sort_keys=True, ensure_ascii=False), encoding="utf-8")
    tmp.replace(p)


def _chiavi(ticker: str, tf: str) -> str:
    return f"{ticker}|{tf}"


def aggiorna(stato: dict, ticker: str, tf: str, close: pd.Series,
             oggi: dt.date) -> list[dict]:
    """Aggiorna lo stato di (ticker, tf) con le chiusure di barre CHIUSE.
    Ritorna la lista di eventi nuovi (dict) generati in questo giro."""
    k = _chiavi(ticker, tf)
    prec = stato.get(k)
    c = close.dropna()
    if c.empty:
        return []
    ultimo = float(c.iloc[-1])
    data_ult = str(c.index[-1])[:10]
    ev: list[dict] = []

    def evento(tipo: str, b: dict) -> dict:
        return {"ticker": ticker, "tf": tf, "tipo": tipo, "bottom": b["bottom"],
                "top": b["top"], "chiusura": round(ultimo, 4), "data": data_ult,
                "inizio": b.get("inizio")}

    # 1) Range già congelato: si controlla solo l'uscita, mai si ricalcola.
    if prec and prec.get("stato") == "in_range":
        if ultimo > prec["top"]:
            prec.update(stato="uscito_sopra", uscito_il=str(oggi), ultimo=round(ultimo, 4))
            ev.append(evento("uscita_sopra", prec))
        elif ultimo < prec["bottom"]:
            prec.update(stato="uscito_sotto", uscito_il=str(oggi), ultimo=round(ultimo, 4))
            ev.append(evento("uscita_sotto", prec))
        else:
            prec.update(ultimo=round(ultimo, 4), aggiornato=str(oggi), data_ultimo=data_ult)
        return ev

    # 2) Uscito: resta visibile per un po', poi si pulisce e si può ricominciare.
    if prec and prec.get("stato", "").startswith("uscito"):
        giorni = (oggi - dt.date.fromisoformat(prec.get("uscito_il", str(oggi)))).days
        if giorni <= GIORNI_USCITO:
            prec.update(ultimo=round(ultimo, 4), aggiornato=str(oggi), data_ultimo=data_ult)
            return ev
        stato.pop(k, None)

    # 3) Nessun range congelato: riconoscimento sui dati.
    r = detect.rileva(close, tf)
    if r is None:
        stato.pop(k, None)
        return ev
    r.update(aggiornato=str(oggi), data_ultimo=data_ult)
    if r["stato"] == "in_range":
        r["congelato_il"] = str(oggi)             # da qui top/bottom non si toccano
        ev.append(evento("nuova_base", r))
    elif r["stato"] == "uscito_sopra":
        # uscito prima ancora di essere congelato: si mostra, senza alert.
        r["uscito_il"] = str(oggi)
    stato[k] = r
    return ev


def messaggio(e: dict) -> str:
    freccia = {"uscita_sopra": "⬆️ USCITA DAL RANGE verso l'alto",
               "uscita_sotto": "⬇️ USCITA DAL RANGE verso il basso",
               "nuova_base": "🧱 Nuova base riconosciuta"}[e["tipo"]]
    tf = {"1W": "settimanale", "1D": "giornaliero"}.get(e["tf"], e["tf"])
    return (f"{freccia}\n{e['ticker']} ({tf}) — chiusura {e['chiusura']} · "
            f"range {e['bottom']} – {e['top']}\n"
            "Solo informazione sui prezzi: non è un ordine né un consiglio.")
