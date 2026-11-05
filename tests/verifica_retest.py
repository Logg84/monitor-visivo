"""Verifica su dati SINTETICI (nessuna rete) della classificazione del retest."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from basewatch import backtest as bt, retest as rt  # noqa: E402


def check(nome, ok):
    print(("✓ " if ok else "✗ ") + nome)
    if not ok:
        raise SystemExit("CHECK FALLITO: " + nome)


N, I0, TOP = 260, 100, 105.0
IDX = pd.bdate_range("2019-01-01", periods=N)


def serie(mod=None, n=N):
    """Piatta a 100 fino all'uscita (giorno I0, chiusura 110), poi 120 costante; `mod` modifica barre dopo l'uscita."""
    c = np.full(n, 100.0)
    c[I0:] = 120.0
    c[I0] = 110.0
    lo = c * 0.995
    df = pd.DataFrame({"Open": c, "High": c * 1.01, "Low": lo, "Close": c}, index=IDX[:n])
    for k, (close, low) in (mod or {}).items():
        df.iloc[k, df.columns.get_loc("Close")] = close
        df.iloc[k, df.columns.get_loc("Low")] = low
    return df


alert = IDX[I0]

# ── Classificazione ──
c = rt.classifica_ritorno(serie({I0 + 5: (108.0, 106.0)}), TOP, alert)
check("retest tenuto: minimo nella zona (≤ top×1,02) e chiusura sopra il top", c["esito"] == "retest_tenuto" and c["data"] == IDX[I0 + 5])
c = rt.classifica_ritorno(serie({I0 + 3: (104.0, 103.0)}), TOP, alert)
check("rientro: chiusura ≤ top", c["esito"] == "rientro" and c["data"] == IDX[I0 + 3])
c = rt.classifica_ritorno(serie(), TOP, alert)
check("nessun ritorno: sempre lontano dal top", c["esito"] == "nessuno" and c["data"] is None)
c = rt.classifica_ritorno(serie({I0 + 4: (104.0, 103.0), I0 + 2: (108.0, 106.0)}), TOP, alert)
check("vale il PRIMO evento (retest a +2, rientro a +4 → retest)", c["esito"] == "retest_tenuto" and c["data"] == IDX[I0 + 2])
c = rt.classifica_ritorno(serie({I0 + 6: (104.0, 103.0), I0 + 8: (108.0, 106.0)}), TOP, alert)
check("rientro prima del retest → rientro", c["esito"] == "rientro" and c["data"] == IDX[I0 + 6])
c = rt.classifica_ritorno(serie({I0 + 2: (108.0, 105.0 * 1.02)}), TOP, alert)
check("minimo esattamente top×1,02 → conta", c["esito"] == "retest_tenuto")
c = rt.classifica_ritorno(serie({I0 + 2: (108.0, 105.0 * 1.02 + 0.01)}), TOP, alert)
check("minimo appena sopra la tolleranza → non conta", c["esito"] == "nessuno")
c = rt.classifica_ritorno(serie({I0 + 2: (105.0, 104.0)}), TOP, alert)
check("chiusura esattamente sul top → rientro (≤)", c["esito"] == "rientro")
c = rt.classifica_ritorno(serie({I0 + 2: (104.5, 100.0)}), TOP, alert)
check("stesso giorno: chiusura sotto il top ha la precedenza sul minimo", c["esito"] == "rientro")
df = serie()
df.iloc[I0, df.columns.get_loc("Low")] = 100.0
check("il giorno dell'alert non conta (minimo basso ma si parte dalla seduta dopo)",
      rt.classifica_ritorno(df, TOP, alert)["esito"] == "nessuno")
c = rt.classifica_ritorno(serie({I0 + 30: (108.0, 106.0)}), TOP, alert)
check("la seduta +30 è ancora dentro la finestra", c["esito"] == "retest_tenuto")
c = rt.classifica_ritorno(serie({I0 + 31: (108.0, 106.0)}), TOP, alert)
check("la seduta +31 è fuori dalla finestra → nessuno", c["esito"] == "nessuno")
check("dati finiti prima di 30 sedute senza eventi → incompleto",
      rt.classifica_ritorno(serie(n=I0 + 20), TOP, alert)["esito"] == "incompleto")
check("dati finiti ma evento già avvenuto → classificato",
      rt.classifica_ritorno(serie({I0 + 5: (108.0, 106.0)}, n=I0 + 20), TOP, alert)["esito"] == "retest_tenuto")
check("alert prima dell'inizio dei dati → incompleto",
      rt.classifica_ritorno(serie(), TOP, pd.Timestamp("2010-01-04"))["esito"] == "incompleto")
check("parametri diversi: tolleranza 5% allarga la zona",
      rt.classifica_ritorno(serie({I0 + 2: (115.0, 109.0)}), TOP, alert, tol=0.05)["esito"] == "retest_tenuto"
      and rt.classifica_ritorno(serie({I0 + 2: (115.0, 109.0)}), TOP, alert, tol=0.02)["esito"] == "nessuno")

# ── Nessun look-ahead ──
base = serie({I0 + 5: (108.0, 106.0)})
fut = base.copy()
rng = np.random.default_rng(2)
for col in ("Open", "High", "Low", "Close"):
    fut.iloc[I0 + 6:, fut.columns.get_loc(col)] = rng.uniform(1, 500, N - I0 - 6)
tronc = base.iloc[:I0 + 6]
r1 = rt.classifica_ritorno(base, TOP, alert)
check("nessun look-ahead: stesso esito con il futuro stravolto o troncato",
      r1 == rt.classifica_ritorno(fut, TOP, alert) == rt.classifica_ritorno(tronc, TOP, alert))

# ── Pipeline completa e appaiamento ──
rng = np.random.default_rng(4)
tickers = [f"R{i:02d}" for i in range(40)]
prezzi = {}
for k, t in enumerate(tickers):
    n = 400
    c = 100 * np.exp(np.cumsum(rng.normal(0.0004, 0.012, n)))
    idx = pd.bdate_range("2019-01-01", periods=n)
    df = pd.DataFrame({"Open": c * 1.001, "High": c * 1.01, "Low": c * 0.99, "Close": c}, index=idx)
    prezzi[t] = df
righe = []
for k, t in enumerate(tickers):
    d = prezzi[t]
    i0 = 150 + (k % 10) * 8
    top = float(d["Close"].iloc[i0] * 0.97)
    # esiti deterministici dopo l'uscita (k%3: 0 = retest tenuto, 1 = rientro, 2 = nessun ritorno)
    cc, ll = d.columns.get_loc("Close"), d.columns.get_loc("Low")
    d.iloc[i0 + 1:i0 + 40, cc] = top * 1.20
    d.iloc[i0 + 1:i0 + 40, ll] = top * 1.15
    if k % 3 == 0:        # retest tenuto alla seduta +4
        d.iloc[i0 + 4, ll] = top * 1.01
        d.iloc[i0 + 4, cc] = top * 1.04
    elif k % 3 == 1:      # rientro alla seduta +2
        d.iloc[i0 + 2, cc] = top * 0.99
    righe.append({"ticker": t, "tf": "1D" if k % 2 == 0 else "1W", "tipo": "uscita_sopra",
                  "data": str(d.index[i0].date()), "data_alert": str(d.index[i0].date()),
                  "inizio": f"{t}-b", "top": top, "bottom": top * 0.8})
ev = pd.DataFrame(righe)
sel = bt.prima_uscita_per_base(ev, "2000-01-01")
check("prima_uscita_per_base: una riga per base", len(sel) == 40)
an = rt.analisi(sel, prezzi)
q = rt.quote(an["classificati"])
atteso = {t: ["retest_tenuto", "rientro", "nessuno"][k % 3] for k, t in enumerate(tickers)}
check("pipeline: ogni titolo ha l'esito forzato (retest / rientro / nessuno)",
      dict(zip(an["classificati"]["ticker"], an["classificati"]["esito"])) == atteso)
check("pipeline: 14 retest, 13 rientri, 13 senza ritorno", (q["retest_tenuto"].sum(), q["rientro"].sum(), q["nessuno"].sum()) == (14, 13, 13))
check("quote: la somma per timeframe torna", (q.drop(columns="totale").sum(axis=1) == q["totale"]).all())
held = an["classificati"][an["classificati"]["esito"] == "retest_tenuto"]
check("retest: una riga per retest tenuto", len(an["retest"]) == len(held))
# rendimento a mano per il primo retest tenuto
r0 = an["retest"].iloc[0]
tk, dret = r0["ticker"], pd.Timestamp(r0["data_alert"])
cl = pd.DataFrame({t: d["Close"] for t, d in prezzi.items()})
op = pd.DataFrame({t: d["Open"] for t, d in prezzi.items()})
i = cl.index.get_loc(dret)
fwd = cl.iloc[i + 20] / op.iloc[i + 1] - 1
check("rendimento dal retest: apertura(t+1) → chiusura(t+20) meno la media dell'universo",
      abs(r0["ecc20"] - (fwd[tk] - fwd.mean())) < 1e-9)
# appaiamento: differenza = ecc retest − ecc uscita
m = an["appaiati"].iloc[0]
u = an["uscite"].set_index(["ticker", "tf", "inizio"]).loc[(m["ticker"], m["tf"], m["inizio"])]
check("appaiati: diff60 = ecc60(retest) − ecc60(uscita) della stessa base",
      abs(m["diff60"] - (m["ecc60"] - u["ecc60"])) < 1e-9)
check("senza prezzi: segnato e non fa crollare", rt.esiti(sel.assign(ticker="ZZZ"), prezzi)["esito"].eq("senza_prezzi").all())

# ── Universo del benchmark ──
import tempfile  # noqa: E402
with tempfile.TemporaryDirectory() as tmp:
    f = Path(tmp) / "u.txt"
    f.write_text("# commento\naaa\n\nBBB  # nota\n  ccc  \naaa\n", encoding="utf-8")
    check("leggi_universo: commenti, vuoti, maiuscole e duplicati", rt.leggi_universo(f) == ["AAA", "BBB", "CCC"])
# il benchmark usa TUTTI i titoli scaricati, non solo quelli con eventi
poche = {t: prezzi[t] for t in sel["ticker"].unique()[:5]}
sel5 = sel[sel["ticker"].isin(poche)]
a_all = rt.analisi(sel5, prezzi)
a_few = rt.analisi(sel5, poche)
check("benchmark: cambia se l'universo scaricato è più largo dei soli titoli con eventi",
      not np.allclose(a_all["uscite"]["ecc60"].fillna(0), a_few["uscite"]["ecc60"].fillna(0)))
cl60 = pd.DataFrame({t: d["Close"] for t, d in prezzi.items()})
op60 = pd.DataFrame({t: d["Open"] for t, d in prezzi.items()})
u0 = a_all["uscite"].dropna(subset=["ecc60"]).iloc[0]
i = cl60.index.get_loc(pd.Timestamp(u0["data_alert"]))
f60 = cl60.iloc[i + 60] / op60.iloc[i + 1] - 1
check("benchmark: media equal-weight di tutti i 40 titoli", abs(u0["ecc60"] - (f60[u0["ticker"]] - f60.mean())) < 1e-9)

# ── Verdetti ──
check("verdetto: pochi eventi → NON VALUTABILE", rt.esito_verdetto(0.05, 3.0, 12, 40) == "NON VALUTABILE")
check("verdetto: pochi mesi → NON VALUTABILE", rt.esito_verdetto(0.05, 3.0, 60, 10) == "NON VALUTABILE")
check("verdetto: effetto e t>2 → SUPPORTATO", rt.esito_verdetto(0.05, 3.0, 60, 40) == "SUPPORTATO")
check("verdetto: t basso → NON DIMOSTRATO", rt.esito_verdetto(0.05, 1.0, 60, 40) == "NON DIMOSTRATO")
v = {x["id"]: x for x in rt.verdetti(an)}
check("verdetti T1 e T2 prodotti, campione piccolo → NON VALUTABILE", set(v) == {"T1", "T2"} and v["T1"]["esito"] == "NON VALUTABILE")

print("OK: verifica_retest")
