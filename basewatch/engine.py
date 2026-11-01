"""
basewatch/engine.py — stato per titolo/timeframe, range congelato, eventi.

Stato in data/bases.json: chiave "TICKER|TF" → {stato, bottom, top, inizio,
congelato_il, ultimo, aggiornato}. Regole:
  - 'rallenta': ricalcolata a ogni giro (il range ancora si muove);
  - 'in_range': appena riconosciuta si CONGELA (top/bottom non cambiano più);
  - chiusura sopra top → evento 'uscita_sopra'; sotto bottom → 'uscita_sotto'
    (UNA sola volta: lo stato passa a uscito_* e non si ripete l'alert);
  - uscito_sopra RESTA finché il prezzo non rientra nel range (→ in_range, evento
    informativo 'rientro') o non riprende a scendere sotto il bottom (→ si riparte
    da zero); uscito_sotto: rientro → in_range, oppure sparisce quando nasce una
    base nuova o dopo 90 giorni;
  - un solo timeframe per titolo (vedi aggiorna_titolo).
Gli alert sono solo le USCITE (richiesta di Marco): chiusura giornaliera
fuori dal range, mai il semplice tocco.
"""
from __future__ import annotations

import datetime as dt
import json
from pathlib import Path

import pandas as pd

from basewatch import detect

GIORNI_USCITO_SOTTO = 90   # un'uscita verso il basso senza nuova base sparisce dopo 90 giorni
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

    def aggiorna_prezzo(b: dict) -> None:
        b.update(ultimo=round(ultimo, 4), aggiornato=str(oggi), data_ultimo=data_ult)

    stato_prec = prec.get("stato") if prec else None

    # 1) Range congelato: si controlla solo l'uscita, mai si ricalcola.
    if stato_prec == "in_range":
        if ultimo > prec["top"]:
            prec.update(stato="uscito_sopra", uscito_il=str(oggi))
            aggiorna_prezzo(prec)
            ev.append(evento("uscita_sopra", prec))
        elif ultimo < prec["bottom"]:
            prec.update(stato="uscito_sotto", uscito_il=str(oggi))
            aggiorna_prezzo(prec)
            ev.append(evento("uscita_sotto", prec))
        else:
            aggiorna_prezzo(prec)
        return ev

    # 2) Già uscito: si rivaluta SOLO in caso di rientro nel range o di
    #    ripresa della discesa (decisione di Marco, 1/11/2026).
    if stato_prec == "uscito_sopra":
        if ultimo < prec["bottom"]:
            stato.pop(k, None)                    # ripresa di discesa: si riparte da zero
        elif ultimo <= prec["top"]:
            prec.update(stato="in_range", rientro_il=str(oggi))
            aggiorna_prezzo(prec)
            ev.append(evento("rientro", prec))    # informativo: nessun alert
            return ev
        else:
            aggiorna_prezzo(prec)
            return ev
    elif stato_prec == "uscito_sotto":
        if ultimo >= prec["bottom"]:
            prec.update(stato="in_range", rientro_il=str(oggi))
            aggiorna_prezzo(prec)
            ev.append(evento("rientro", prec))
            return ev
        nuova = detect.rileva(close, tf)          # discesa che continua: forse nasce una base nuova
        if not (nuova and nuova["inizio"] != prec.get("inizio")
                and nuova["stato"] in ("rallenta", "in_range")):
            giorni = (oggi - dt.date.fromisoformat(prec.get("uscito_il", str(oggi)))).days
            if giorni > GIORNI_USCITO_SOTTO:
                stato.pop(k, None)
            else:
                aggiorna_prezzo(prec)
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
        r["uscito_il"] = str(oggi)                # già uscito alla prima vista: nessun alert
    stato[k] = r
    return ev


_ORDINE = {"in_range": 3, "uscito_sopra": 2, "uscito_sotto": 2, "rallenta": 1}


def aggiorna_titolo(stato: dict, ticker: str, serie: dict[str, pd.Series],
                    oggi: dt.date) -> list[dict]:
    """Un SOLO timeframe per titolo (richiesta di Marco): si valutano settimanale
    e giornaliero e si tiene quello con lo stato più avanzato (in_range >
    uscito > rallenta); a parità, il settimanale. Gli eventi del timeframe
    scartato non vengono emessi."""
    per_tf: dict[str, list[dict]] = {}
    for tf in TF_LISTA:
        if tf in serie:
            per_tf[tf] = aggiorna(stato, ticker, tf, serie[tf], oggi)
    presenti = [tf for tf in TF_LISTA if _chiavi(ticker, tf) in stato]
    if len(presenti) <= 1:
        return [e for tf in presenti for e in per_tf.get(tf, [])]
    tieni = max(presenti, key=lambda tf: (_ORDINE.get(stato[_chiavi(ticker, tf)]["stato"], 0),
                                          -TF_LISTA.index(tf)))
    for tf in presenti:
        if tf != tieni:
            stato.pop(_chiavi(ticker, tf), None)
    return per_tf.get(tieni, [])


def messaggio(e: dict) -> str:
    freccia = {"uscita_sopra": "⬆️ USCITA DAL RANGE verso l'alto",
               "uscita_sotto": "⬇️ USCITA DAL RANGE verso il basso",
               "nuova_base": "🧱 Nuova base riconosciuta",
               "rientro": "↩️ Rientro nel range"}[e["tipo"]]
    tf = {"1W": "settimanale", "1D": "giornaliero"}.get(e["tf"], e["tf"])
    return (f"{freccia}\n{e['ticker']} ({tf}) — chiusura {e['chiusura']} · "
            f"range {e['bottom']} – {e['top']}\n"
            "Solo informazione sui prezzi: non è un ordine né un consiglio.")
