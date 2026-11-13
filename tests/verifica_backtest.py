"""Verifica su dati SINTETICI (nessuna rete) dei calcoli del backtest."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from basewatch import backtest as bt  # noqa: E402


def check(nome, ok):
    print(("✓ " if ok else "✗ ") + nome)
    if not ok:
        raise SystemExit("CHECK FALLITO: " + nome)


# 1) prime_uscite: solo dopo nuova_base, solo la prima, per base
ev = pd.DataFrame([
    # base 1: nuova_base, uscita, rientro, seconda uscita → conta solo la prima
    ("A", "1D", "nuova_base", "2020-01-10", "2020-01-10", "b1"),
    ("A", "1D", "uscita_sopra", "2020-02-03", "2020-02-03", "b1"),
    ("A", "1D", "rientro", "2020-02-10", "2020-02-10", "b1"),
    ("A", "1D", "uscita_sopra", "2020-03-02", "2020-03-02", "b1"),
    # base 2: uscita senza nuova_base osservata → esclusa
    ("B", "1D", "rientro", "2020-02-01", "2020-02-01", "b2"),
    ("B", "1D", "uscita_sopra", "2020-02-20", "2020-02-20", "b2"),
    # base 3: prima esce dal basso, poi rientra ed esce dall'alto → sopra conta, sotto conta
    ("C", "1W", "nuova_base", "2020-01-03", "2020-01-03", "b3"),
    ("C", "1W", "uscita_sotto", "2020-02-07", "2020-02-07", "b3"),
    ("C", "1W", "rientro", "2020-02-14", "2020-02-14", "b3"),
    ("C", "1W", "uscita_sopra", "2020-04-03", "2020-04-03", "b3"),
], columns=["ticker", "tf", "tipo", "data", "data_alert", "inizio"])
s = bt.prime_uscite(ev, "sopra")
check("prima uscita dall'alto per base (A e C, non B)", list(s.ticker) == ["A", "C"])
check("è la PRIMA uscita (A: 3/2, non 2/3)", s.loc[s.ticker == "A", "data_alert"].iloc[0] == "2020-02-03")
check("uscite dal basso: solo C", list(bt.prime_uscite(ev, "sotto").ticker) == ["C"])

# 2) rendimento esatto su un pannello costruito a mano
idx = pd.bdate_range("2020-01-01", periods=300)
rng = np.random.default_rng(7)
tick = [f"T{i:02d}" for i in range(40)]
base = 100 * np.exp(np.cumsum(rng.normal(0, 0.01, (300, 40)), axis=0))
close = pd.DataFrame(base, index=idx, columns=tick)
open_ = close.shift(1).fillna(close.iloc[0]) * 1.0005
low = pd.concat([open_, close]).groupby(level=0).min() * 0.995
prezzi = {t: pd.DataFrame({"Open": open_[t], "Low": low[t], "Close": close[t]}) for t in tick}
pan = bt.pannelli(prezzi)

giorno = idx[100]
evx = pd.DataFrame({"ticker": ["T03"], "tf": ["1D"], "data_alert": [str(giorno.date())]})
r = bt.ritorni(evx, pan, orizzonti=(20, 60))
atteso = close["T03"].iloc[100 + 60] / open_["T03"].iloc[101] - 1
check("rendimento a 60 sedute = chiusura(t+60)/apertura(t+1) − 1", abs(r.r60.iloc[0] - atteso) < 1e-12)
bench = (close.iloc[160] / open_.iloc[101] - 1).mean()
check("benchmark = media equal-weight dell'universo", abs(r.ecc60.iloc[0] - (atteso - bench)) < 1e-12)
mae_att = low["T03"].iloc[101:161].min() / open_["T03"].iloc[101] - 1
check("MAE = minimo intraday dopo l'ingresso / apertura − 1", abs(r.mae60.iloc[0] - mae_att) < 1e-12)
check("MAE non positivo", r.mae60.iloc[0] <= 0)

# 3) nessun look-ahead: cambiare i prezzi fino al giorno t compreso non cambia il rendimento
close2, open2 = close.copy(), open_.copy()
close2.iloc[:101] *= 3.0
open2.iloc[:101] *= 3.0
low2 = low.copy(); low2.iloc[:101] *= 3.0
pan2 = bt.pannelli({t: pd.DataFrame({"Open": open2[t], "Low": low2[t], "Close": close2[t]}) for t in tick})
r2 = bt.ritorni(evx, pan2, orizzonti=(20, 60))
check("rendimento indipendente dai prezzi fino al giorno dell'alert", abs(r2.r60.iloc[0] - r.r60.iloc[0]) < 1e-12)

# 4) eventi senza storico sufficiente → NaN, non errore
fine = pd.DataFrame({"ticker": ["T03"], "tf": ["1D"], "data_alert": [str(idx[-5].date())]})
rf = bt.ritorni(fine, pan, orizzonti=(20,))
check("evento a fine serie → NaN", np.isnan(rf.r20.iloc[0]) and np.isnan(rf.mae20.iloc[0]))
fuori = pd.DataFrame({"ticker": ["T03"], "tf": ["1D"], "data_alert": ["1999-01-01"]})
check("data fuori calendario → NaN", np.isnan(bt.ritorni(fuori, pan, orizzonti=(20,)).r20.iloc[0]))

# 5) statistica: con effetto NULLO il criterio non scatta, con effetto vero sì
def eventi_sintetici(effetto, n=240, seed=3):
    g = np.random.default_rng(seed)
    date = pd.bdate_range("2012-01-02", periods=2400)
    sc = sorted(g.choice(len(date) - 130, n, replace=False))
    rows = []
    for k, i in enumerate(sc):
        d = date[i]
        rows.append({"ticker": f"X{k}", "tf": "1D", "data_alert": str(d.date()),
                     "ecc60": effetto + g.normal(0, 0.15)})
    return pd.DataFrame(rows)

nullo = bt.criterio(eventi_sintetici(0.0))
check("effetto nullo → criterio NON soddisfatto", not nullo["soddisfatto"])
vero = bt.criterio(eventi_sintetici(0.06))
check("effetto +6% → criterio soddisfatto", vero["soddisfatto"] and vero["tot"]["t"] > 2)
check("hit rate coerente con l'effetto", vero["tot"]["hit"] > 0.6)

# 6) il criterio richiede ENTRAMBE le metà: effetto solo nella prima metà → non soddisfatto
mix = eventi_sintetici(0.0)
mix.loc[: len(mix) // 2 - 1, "ecc60"] += 0.15
check("effetto solo nella prima metà → NON soddisfatto", not bt.criterio(mix)["soddisfatto"])

# 7) cluster per mese: con shock COMUNE al mese il t raggruppato è più basso di quello ingenuo;
#    con dati indipendenti e molti mesi i due coincidono (circa)
g = np.random.default_rng(5)
mesi = pd.Series([f"{2000 + k // 12}-{k % 12 + 1:02d}" for k in range(120) for _ in range(5)])   # 120 mesi × 5 eventi
shock = pd.Series(g.normal(0, 0.08, 120)).repeat(5).reset_index(drop=True)
corr = 0.02 + shock + pd.Series(g.normal(0, 0.03, 600))
ing = corr.mean() / (corr.std(ddof=1) / np.sqrt(len(corr)))
check("shock comune al mese → t raggruppato < t ingenuo", bt.stat(corr, mesi)["t"] < 0.8 * ing)
iid = pd.Series(g.normal(0.02, 0.1, 600))
ing2 = iid.mean() / (iid.std(ddof=1) / np.sqrt(len(iid)))
check("dati indipendenti, molti mesi → t raggruppato ≈ ingenuo", abs(bt.stat(iid, mesi)["t"] / ing2 - 1) < 0.25)
check("un solo cluster → t NaN (non inventa significatività)",
      np.isnan(bt.stat(pd.Series(g.normal(0.1, 0.1, 30)), pd.Series(["2020-01"] * 30))["t"]))
check("campione minuscolo → n riportato, niente crash", bt.stat(pd.Series([0.1, 0.2]), pd.Series(["a", "b"]))["n"] == 2)


# 8) metriche aggiuntive: profit factor, expectancy in R, drawdown massimo (valori fatti a mano)
ev = pd.DataFrame({"data_alert": ["2020-01-01", "2020-02-01", "2020-03-01", "2020-04-01"], "ticker": list("ABCD"), "tf": "1D",
                   "r60": [0.10, -0.05, 0.20, -0.10], "apertura_succ": [100.0] * 4, "bottom": [90.0, 95.0, 80.0, 99.5]})
m = bt.metriche(ev)
check("profit factor = 0,30 / 0,15 = 2", abs(m["pf"] - 2.0) < 1e-9)
check("hit rate 50% e media +3,75%", abs(m["hit"] - 0.5) < 1e-9 and abs(m["media"] - 0.0375) < 1e-9)
# R = (100-bottom)/100: 0,10 · 0,05 · 0,20 · max(0,005; 1%)=0,01 → 1,0 · -1,0 · 1,0 · -10,0 → media -2,25, mediana 0
check("expectancy in R con rischio minimo dell'1% (evento D)", abs(m["exp_r"] - (-2.25)) < 1e-9 and abs(m["exp_r_med"] - 0.0) < 1e-9)
# curva: 0 → .10 → .05 → .25 → .15 ; picco .25 poi .15 ⇒ drawdown -0,10
check("drawdown massimo dalla curva cumulata = -0,10", abs(m["dd_max"] - (-0.10)) < 1e-9)
check("ordine d'ingresso nel file irrilevante (si ordina per data)", abs(bt.metriche(ev.iloc[::-1])["dd_max"] - m["dd_max"]) < 1e-9)
check("senza perdite → profit factor infinito", bt.metriche(ev.assign(r60=[0.1, 0.2, 0.3, 0.4]))["pf"] == float("inf"))
check("senza guadagni né perdite → NaN, non un numero inventato", np.isnan(bt.metriche(ev.assign(r60=[0.0] * 4))["pf"]))
check("con_r=False (uscite dal basso): nessuna expectancy in R", np.isnan(bt.metriche(ev, con_r=False)["exp_r"]))
check("sotto 3 eventi: solo n, tutto il resto NaN", bt.metriche(ev.iloc[:2])["n"] == 2 and np.isnan(bt.metriche(ev.iloc[:2])["pf"]))
check("eventi senza rendimento (NaN) esclusi dal conteggio", bt.metriche(ev.assign(r60=[0.1, np.nan, 0.2, -0.1]))["n"] == 3)

# 9) regime di mercato: indice equal-weight sopra/sotto la media a 200 sedute, senza look-ahead
idx = pd.bdate_range("2018-01-01", periods=500)
su = pd.DataFrame({t: 100 * np.exp(np.linspace(0, 0.8, 500)) for t in "ABC"}, index=idx)
giu = pd.DataFrame({t: 100 * np.exp(np.linspace(0, -0.8, 500)) for t in "ABC"}, index=idx)
rg_su, rg_giu = bt.regime_mercato({"Close": su}), bt.regime_mercato({"Close": giu})
check("storico < 200 sedute → regime NaN (non si inventa)", rg_su.iloc[:199].isna().all() and rg_su.iloc[199:].notna().all())
check("mercato in salita costante → rialzista", (rg_su.dropna() == "rialzista").all())
check("mercato in discesa costante → ribassista", (rg_giu.dropna() == "ribassista").all())
cambia = su.copy(); cambia.iloc[400:] *= 0.5            # crollo al giorno 400: i giorni PRIMA non cambiano
check("nessun look-ahead: cambiare il futuro non cambia il regime passato",
      (bt.regime_mercato({"Close": cambia}).iloc[:400].dropna() == rg_su.iloc[:400].dropna()).all())

print("OK: verifica_backtest")
