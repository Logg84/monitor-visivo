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
  - settimanale e giornaliero sono tracciati in modo INDIPENDENTE (alert per entrambi);
    la galleria mostra un solo timeframe per titolo, scelto in visualizzazione.
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
             oggi: dt.date, ov: dict | None = None) -> list[dict]:
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

    # 0) Range modificato a mano (data/override.json, scritto dal sito): vince sul
    #    calcolo automatico. Quando i valori cambiano, lo stato si riallinea al
    #    prezzo SENZA alert (nessuna uscita «osservata»); da lì valgono le regole normali.
    if ov and ov.get("top") and ov.get("bottom") and float(ov["top"]) > float(ov["bottom"]) > 0:
        top, bottom = round(float(ov["top"]), 4), round(float(ov["bottom"]), 4)
        sig = [top, bottom]
        if not prec or prec.get("manuale") != sig:
            if not prec and not (bottom <= ultimo <= top):
                return ev                          # nessuna base in corso e prezzo già fuori: niente da armare
            b = dict(prec or {})
            inizio = b.get("inizio") or str(c.iloc[-detect.TF_PARAMS[tf]["lookback"]:].idxmin())[:10]
            nuovo = ("in_range" if bottom <= ultimo <= top
                     else "uscito_sopra" if ultimo > top else "uscito_sotto")
            for x in ("uscito_il", "rientro_il", "prima_vista", "uscita_data"):
                b.pop(x, None)
            b.update(stato=nuovo, bottom=bottom, top=top, inizio=inizio, manuale=sig,
                     ampiezza=round(top / bottom - 1, 4), congelato_il=str(oggi),
                     barre=int((c.index >= pd.Timestamp(inizio)).sum()) - 1)
            if nuovo != "in_range":
                b.update(uscito_il=str(oggi), prima_vista=True)
            aggiorna_prezzo(b)
            stato[k] = b
            return ev
        prec = stato.get(k)

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
        r["prima_vista"] = True                   # uscita NON osservata da noi (storica)
    stato[k] = r
    return ev


def aggiorna_titolo(stato: dict, ticker: str, serie: dict[str, pd.Series],
                    oggi: dt.date, overrides: dict | None = None) -> list[dict]:
    """Aggiorna OGNI timeframe in modo indipendente (settimanale e giornaliero):
    un titolo uscito dal range giornaliero può essere ancora nel range
    settimanale e gli alert devono arrivare per entrambi (decisione di Marco,
    1/11/2026). Un solo timeframe per titolo si vede solo nella galleria."""
    eventi: list[dict] = []
    for tf in TF_LISTA:
        if tf in serie:
            eventi += aggiorna(stato, ticker, tf, serie[tf], oggi,
                               (overrides or {}).get(_chiavi(ticker, tf)))
    return eventi


def messaggio(e: dict) -> str:
    freccia = {"uscita_sopra": "⬆️ USCITA DAL RANGE verso l'alto",
               "uscita_sotto": "⬇️ USCITA DAL RANGE verso il basso",
               "nuova_base": "🧱 Nuova base riconosciuta",
               "rientro": "↩️ Rientro nel range"}[e["tipo"]]
    tf = {"1W": "settimanale", "1D": "giornaliero"}.get(e["tf"], e["tf"])
    return (f"{freccia}\n{e['ticker']} ({tf}) — chiusura {e['chiusura']} · "
            f"range {e['bottom']} – {e['top']}\n"
            "Solo informazione sui prezzi: non è un ordine né un consiglio.")


def email_uscite(uscite: list[dict], sito: str = "") -> tuple[str, str]:
    """(oggetto, testo) di UNA email riepilogativa con tutte le uscite del giro."""
    n = len(uscite)
    oggetto = f"Basewatch: {n} uscita dal range" if n == 1 else f"Basewatch: {n} uscite dal range"
    corpo = "\n\n".join(messaggio(e) for e in uscite)
    if sito:
        corpo += f"\n\nGrafici e analisi: {sito}"
    return oggetto, corpo
