"""Verifica su dati SINTETICI (nessuna rete) del replay storico degli eventi."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from basewatch import detect, storico  # noqa: E402


def check(nome, ok):
    print(("✓ " if ok else "✗ ") + nome)
    if not ok:
        raise SystemExit("CHECK FALLITO: " + nome)


def serie_base_e_rottura(seed=1, n_pre=300, esce="sopra"):
    """Discesa 100→60, range 60–70 oscillante (80 barre), poi rottura (o crollo)."""
    rng = np.random.default_rng(seed)
    pre = 100 + rng.normal(0, 0.3, n_pre)
    discesa = np.linspace(100, 60, 150)
    t = np.arange(90)
    rng_ = 65 + 5 * np.sin(2 * np.pi * 4 * t / 90 - np.pi / 2) + rng.normal(0, 0.15, 90)
    fine = np.linspace(66, 80, 25) if esce == "sopra" else np.linspace(64, 52, 25)
    v = np.concatenate([pre, discesa, rng_, fine])
    idx = pd.bdate_range("2018-01-01", periods=len(v))
    opens = np.roll(v, 1) * 1.001
    return pd.DataFrame({"Open": opens, "Close": v}, index=idx)


# 1) Il replay trova nuova base + uscita, ciascuna una sola volta
df = serie_base_e_rottura()
ev = storico.replay_titolo("TEST", df)
tipi = [(e["tf"], e["tipo"]) for e in ev]
check("trova una nuova base giornaliera", ("1D", "nuova_base") in tipi)
check("trova l'uscita dall'alto giornaliera", ("1D", "uscita_sopra") in tipi)
check("l'uscita giornaliera è una sola", tipi.count(("1D", "uscita_sopra")) == 1)
nb = next(e for e in ev if e["tf"] == "1D" and e["tipo"] == "nuova_base")
us = next(e for e in ev if e["tf"] == "1D" and e["tipo"] == "uscita_sopra")
check("la base viene riconosciuta PRIMA dell'uscita", nb["data_alert"] < us["data_alert"])
check("alla prima chiusura fuori range", us["chiusura"] > us["top"])
i = df.index.get_loc(pd.Timestamp(us["data"]))
check("chiusura del segnale = chiusura della barra", abs(us["chiusura"] - df["Close"].iloc[i]) < 1e-3)
check("apertura_succ = apertura della seduta dopo", abs(us["apertura_succ"] - df["Open"].iloc[i + 1]) < 1e-3)
check("ampiezza/calo valorizzati", us["ampiezza"] is not None and us["calo"] is not None and us["calo"] >= 0.25)

# 2) Uscita verso il basso
ev_g = storico.replay_titolo("GIU", serie_base_e_rottura(esce="sotto"))
check("trova l'uscita dal basso", any(e["tf"] == "1D" and e["tipo"] == "uscita_sotto" for e in ev_g))

# 3) NESSUN LOOK-AHEAD: tagliando i dati al giorno k, gli eventi fino a k sono identici
for k in (len(df) - 10, len(df) - 40, len(df) - 80):
    taglio = storico.replay_titolo("TEST", df.iloc[:k])
    completo = [e for e in ev if e["data_alert"] <= str(df.index[k - 1].date())]
    # l'apertura della seduta successiva all'ultimo giorno tagliato non esiste: si confronta il resto
    togli = lambda r: [{x: y for x, y in e.items() if x != "apertura_succ"} for e in r]  # noqa: E731
    check(f"niente look-ahead (dati tagliati a {k})", togli(taglio) == togli(completo))

# 4) Le barre settimanali del replay coincidono con quelle del giro reale
close = df["Close"]
sett_full = close.resample("W-FRI").last().dropna()
ok = True
for i in range(200, len(df), 17):
    t = df.index[i]
    adesso = pd.Timestamp(t.date()).tz_localize("UTC") + pd.Timedelta(hours=23)
    reale = detect.settimanali_chiuse(df.iloc[:i + 1][["Close"]], adesso)["Close"]
    j = sett_full.index.searchsorted(t, side="right")
    mio = sett_full.iloc[:j]
    ok &= list(reale.index) == list(mio.index) and np.allclose(reale.values, mio.values)
check("settimanali del replay = settimanali_chiuse del giro reale", ok)

# 5) La finestra ridotta non cambia il risultato di detect.rileva
ok = True
for i in range(400, len(df), 23):
    s = close.iloc[:i + 1]
    ok &= detect.rileva(s, "1D") == detect.rileva(s.iloc[-storico.FINESTRA["1D"]:], "1D")
check("finestra ridotta ≡ storico completo (rileva 1D)", ok)

# 6) Universo: più titoli, ordinamento e colonne; un titolo difettoso non blocca
prezzi = {"A": serie_base_e_rottura(1), "B": serie_base_e_rottura(2, esce="sotto"),
          "BAD": pd.DataFrame({"Open": [1.0], "Close": [1.0]}, index=pd.bdate_range("2020-01-01", periods=1))}
tab = storico.replay_universo(prezzi, jobs=1)
check("colonne attese", list(tab.columns) == storico.COLONNE)
check("ci sono eventi di A e B", set(tab["ticker"]) == {"A", "B"})
check("ordinato per data_alert", list(tab["data_alert"]) == sorted(tab["data_alert"]))
tab2 = storico.replay_universo(prezzi, jobs=2)
check("parallelo ≡ seriale", tab.equals(tab2))
check("filtro --da sull'output", storico.replay_universo(prezzi, da="2100-01-01").empty)

print("OK: verifica_storico")
