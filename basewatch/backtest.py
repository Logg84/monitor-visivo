"""
basewatch/backtest.py — calcoli del backtest «uscita dal range» (nessuna rete).

Definizioni (fissate PRIMA di vedere i numeri, vedi docs/backtest-range.md):
  - evento = PRIMA uscita dall'alto (o dal basso) dopo una base riconosciuta dal
    vivo (nuova_base), per ogni (ticker, tf, inizio). Le uscite successive (dopo
    rientri) e le basi viste solo a uscita già avvenuta non contano;
  - ingresso = apertura della seduta successiva al giorno dell'alert;
  - rendimento a h sedute = chiusura della h-esima seduta dopo il giorno
    dell'alert / apertura d'ingresso − 1;
  - eccesso = rendimento − media equal-weight dell'universo sulla stessa finestra;
  - t = media / errore standard con cluster per mese di alert;
  - criterio (uscite dall'alto, a 60 sedute, per ciascun timeframe): eccesso medio
    > 0 con t > 2 in ENTRAMBE le metà temporali e hit rate > 50%.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

ORIZZONTI = (20, 60, 120)
ORIZZONTE_CRITERIO = 60
T_MIN = 2.0
HIT_MIN = 0.5
FFILL_MAX = 5          # sedute di ffill massimo (festività diverse tra borse)
R_MIN = 0.01           # rischio minimo (1% dell'ingresso) per i multipli di R: evita rischi quasi nulli
SMA_REGIME = 200       # sedute della media mobile che separa mercato rialzista e ribassista


def prime_uscite(ev: pd.DataFrame, direzione: str = "sopra") -> pd.DataFrame:
    """Prima uscita (`sopra`|`sotto`) dopo la prima nuova_base di ogni (ticker, tf, inizio)."""
    chiavi = ["ticker", "tf", "inizio"]
    nb = (ev[ev.tipo == "nuova_base"].groupby(chiavi)["data_alert"].min().rename("data_base"))
    us = ev[ev.tipo == f"uscita_{direzione}"].merge(nb, on=chiavi, how="inner")
    us = us[us.data_alert > us.data_base]
    us = us.sort_values("data_alert", kind="stable").groupby(chiavi, as_index=False).first()
    return us.sort_values(["data_alert", "ticker", "tf"], kind="stable").reset_index(drop=True)


def pannelli(prezzi: dict[str, pd.DataFrame]) -> dict[str, pd.DataFrame]:
    """Open/High/Low/Close (data × ticker) su un calendario unico."""
    idx = sorted(set().union(*[set(d.index) for d in prezzi.values()]))
    out = {}
    for campo in ("Open", "Low", "Close"):
        out[campo] = pd.DataFrame({t: d[campo] for t, d in prezzi.items() if campo in d}).reindex(idx)
    return out


def ritorni(ev: pd.DataFrame, pan: dict[str, pd.DataFrame], orizzonti=ORIZZONTI) -> pd.DataFrame:
    """Aggiunge a `ev` rendimento, benchmark, eccesso e MAE per ogni orizzonte.
    Gli eventi senza seduta d'ingresso o senza storico sufficiente restano con NaN."""
    op, lo, cl = pan["Open"], pan["Low"], pan["Close"]
    cl_ff = cl.ffill(limit=FFILL_MAX)
    op_in = op.shift(-1)                                   # apertura della seduta dopo il giorno t
    out = ev.copy()
    pos = pd.Index(cl.index)
    righe = [pos.get_loc(pd.Timestamp(d)) if pd.Timestamp(d) in pos else -1 for d in ev["data_alert"]]
    for h in orizzonti:
        r_h = cl_ff.shift(-h) / op_in - 1                  # data × ticker: uscita a h sedute
        bench = r_h.mean(axis=1, skipna=True)
        rend, ecc, mae = [], [], []
        for i, (t, r) in enumerate(zip(ev["ticker"], righe)):
            x = r_h.iat[r, r_h.columns.get_loc(t)] if r >= 0 and t in r_h.columns else np.nan
            e = op_in.iat[r, op_in.columns.get_loc(t)] if r >= 0 and t in op_in.columns else np.nan
            rend.append(x)
            ecc.append(x - bench.iat[r] if r >= 0 and not np.isnan(x) else np.nan)
            if r >= 0 and not np.isnan(e) and r + h < len(pos):
                bassi = lo[t].iloc[r + 1:r + h + 1].min()  # minimo intraday nelle h sedute dopo l'ingresso
                mae.append(bassi / e - 1)
            else:
                mae.append(np.nan)
        out[f"r{h}"], out[f"ecc{h}"], out[f"mae{h}"] = rend, ecc, mae
    return out


def stat(x: pd.Series, mesi: pd.Series) -> dict:
    """media, t con errore standard raggruppato per `mesi`, hit rate (x > 0), n."""
    d = pd.DataFrame({"x": x, "m": mesi}).dropna()
    n = len(d)
    if n < 3:
        return {"n": n, "media": np.nan, "t": np.nan, "hit": np.nan}
    m = d.x.mean()
    res = (d.x - m).groupby(d.m).sum()
    g = len(res)
    if g < 2:
        return {"n": n, "media": float(m), "t": np.nan, "hit": float((d.x > 0).mean())}
    se = np.sqrt((res ** 2).sum() * g / (g - 1)) / n         # correzione per pochi cluster
    return {"n": n, "media": float(m), "t": float(m / se) if se > 0 else np.nan, "hit": float((d.x > 0).mean())}


def criterio(tab: pd.DataFrame, h: int = ORIZZONTE_CRITERIO) -> dict:
    """Verdetto sul criterio pre-registrato per un insieme di eventi (un timeframe)."""
    d = tab.dropna(subset=[f"ecc{h}"]).sort_values("data_alert")
    if len(d) < 6:
        return {"n": len(d), "soddisfatto": False, "motivo": "campione troppo piccolo"}
    mesi = d["data_alert"].str[:7]
    meta = d["data_alert"].iloc[len(d) // 2]            # data di taglio: metà degli eventi
    a, b = d[d.data_alert < meta], d[d.data_alert >= meta]
    tot, s1, s2 = stat(d[f"ecc{h}"], mesi), stat(a[f"ecc{h}"], a["data_alert"].str[:7]), stat(b[f"ecc{h}"], b["data_alert"].str[:7])
    ok = (tot["media"] > 0 and tot["hit"] > HIT_MIN
          and s1["media"] > 0 and s1["t"] > T_MIN and s2["media"] > 0 and s2["t"] > T_MIN)
    return {"n": len(d), "tot": tot, "meta1": s1, "meta2": s2, "taglio": meta, "soddisfatto": bool(ok)}


def prima_uscita_per_base(ev: pd.DataFrame, da: str, direzione: str = "sopra") -> pd.DataFrame:
    """Prima uscita (in assoluto) di ogni base (ticker, tf, inizio), tenuta se l'alert è ≥ `da`.
    A differenza di `prime_uscite` NON richiede che la base sia stata riconosciuta prima: è ciò
    che il live avviserebbe (campione «B» del confronto range/punteggi)."""
    chiavi = ["ticker", "tf", "inizio"]
    us = ev[ev.tipo == f"uscita_{direzione}"].sort_values("data_alert", kind="stable")
    b = us.groupby(chiavi, as_index=False).first()
    b = b[b.data_alert >= da]
    return b.sort_values(["data_alert", "ticker", "tf"], kind="stable").reset_index(drop=True)


def metriche(tab: pd.DataFrame, h: int = ORIZZONTE_CRITERIO, con_r: bool = True) -> dict:
    """Metriche descrittive a h sedute su un insieme di eventi. NON entrano nel criterio pre-registrato.

      - n: eventi con rendimento disponibile;
      - profit factor = somma dei rendimenti positivi / somma dei rendimenti negativi in valore assoluto
        (∞ se non ci sono perdite);
      - expectancy in R = media di rendimento / rischio, con rischio = distanza in % tra ingresso
        (apertura della seduta dopo l'alert) e minimo del range (il livello che invalida la lettura),
        con un minimo di R_MIN. Solo per le uscite dall'alto (`con_r`): dal basso il minimo del range
        è sopra l'ingresso e il rischio non ha senso;
      - drawdown massimo = massimo calo dal picco della curva che somma i rendimenti degli eventi in
        ordine di data d'alert (un'unità per evento, nessun dimensionamento). È indicativo: gli
        eventi si sovrappongono nel tempo, quindi non è il drawdown di un portafoglio reale.
    """
    d = tab.dropna(subset=[f"r{h}"]).sort_values(["data_alert", "ticker", "tf"], kind="stable")
    n = len(d)
    vuoto = {"n": n, "media": np.nan, "hit": np.nan, "pf": np.nan, "exp_r": np.nan, "exp_r_med": np.nan, "dd_max": np.nan}
    if n < 3:
        return vuoto
    r = d[f"r{h}"].astype(float)
    guadagni, perdite = r[r > 0].sum(), -r[r < 0].sum()
    pf = guadagni / perdite if perdite > 0 else (np.inf if guadagni > 0 else np.nan)
    curva = np.concatenate([[0.0], r.cumsum().to_numpy()])
    out = {"n": n, "media": float(r.mean()), "hit": float((r > 0).mean()), "pf": float(pf),
           "exp_r": np.nan, "exp_r_med": np.nan, "dd_max": float((curva - np.maximum.accumulate(curva)).min())}
    if con_r and {"apertura_succ", "bottom"} <= set(d.columns):
        entry = d["apertura_succ"].astype(float)
        rischio = ((entry - d["bottom"].astype(float)) / entry).clip(lower=R_MIN)
        rr = (r / rischio).replace([np.inf, -np.inf], np.nan).dropna()
        if len(rr):
            out["exp_r"], out["exp_r_med"] = float(rr.mean()), float(rr.median())
    return out


def regime_mercato(pan: dict[str, pd.DataFrame], sma: int = SMA_REGIME) -> pd.Series:
    """Regime di mercato per data, solo dai prezzi: indice equal-weight dell'universo sopra (`rialzista`)
    o sotto (`ribassista`) la sua media mobile a `sma` sedute. NaN finché la media non è calcolabile.
    Usa solo dati fino al giorno stesso (nessun look-ahead)."""
    cl = pan["Close"].ffill(limit=FFILL_MAX)
    rend = cl.pct_change(fill_method=None).mean(axis=1, skipna=True).fillna(0.0)
    indice = (1.0 + rend).cumprod()
    media = indice.rolling(sma, min_periods=sma).mean()
    return pd.Series(np.where(indice > media, "rialzista", "ribassista"), index=indice.index).where(media.notna())

