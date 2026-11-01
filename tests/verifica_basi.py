"""Verifica su dati SINTETICI (nessuna rete) del riconoscimento di basi."""
import datetime as dt
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from basewatch import detect, engine  # noqa: E402


def check(nome, ok):
    print(("✓ " if ok else "✗ ") + nome)
    if not ok:
        raise SystemExit("CHECK FALLITO: " + nome)


def serie(tratti, freq="W-FRI", start="2021-01-01", seed=1):
    """tratti = [(n_barre, da, a, rumore%)]: tratti lineari con rumore."""
    rng = np.random.default_rng(seed)
    v = []
    for n, a, b, r in tratti:
        base = np.linspace(a, b, n)
        v += list(base * (1 + rng.normal(0, r / 100, n)))
    idx = pd.date_range(start, periods=len(v), freq=freq)
    return pd.Series(v, index=idx)


# decina di barre di salita, calo forte, poi range piatto
sali = (60, 60, 120, 1.0)
cala = (60, 120, 50, 1.0)

# 1) WKL-like: calo −58% e range piatto 20 barre → in_range
s = serie([sali, cala, (20, 50, 53, 3.0)])
r = detect.rileva(s, "1W")
check("calo forte + 20 barre di range → in_range", r and r["stato"] == "in_range")
check("bottom = chiusura minima del range, top = massima", r["bottom"] <= 53 and r["top"] >= 49)
check("barre dal minimo ≥ 8 e calo ≥ 25%", r["barre"] >= 8 and r["calo"] >= 0.25)

# 2) RBLX-like: minimo di 5 barre fa, poi oscillazione → rallenta (non ancora range)
s2 = serie([sali, cala])
minimo = float(s2.min()) * 0.97
idx = pd.date_range(s2.index[-1] + pd.Timedelta(weeks=1), periods=5, freq="W-FRI")
s2.iloc[-1] = minimo
s2 = pd.concat([s2, pd.Series([minimo * 1.03, minimo * 1.05, minimo * 1.02, minimo * 1.06, minimo * 1.04], index=idx)])
r2 = detect.rileva(s2, "1W")
check("minimo di 5 barre fa → rallenta", r2 and r2["stato"] == "rallenta")

# 3) discesa che continua: nessun rallentamento
s3 = serie([sali, (80, 120, 40, 0.5)])
check("discesa che continua → nessuna base", detect.rileva(s3, "1W") is None)

# 4) rimbalzo a V (range troppo largo)
s4 = serie([sali, cala, (20, 50, 130, 1.0)])
check("rimbalzo a V (ampiezza > 100%) → nessuna base", detect.rileva(s4, "1W") is None)

# 5) niente calo precedente: andamento piatto da sempre
s5 = serie([(120, 100, 105, 3.0)])
check("nessun calo ≥ 25% prima → nessuna base", detect.rileva(s5, "1W") is None)

# 6) uscita sopra: ultima chiusura oltre il top
s6 = s.copy()
s6.iloc[-1] = float(s.iloc[:-1].iloc[-20:].max()) * 1.08
r6 = detect.rileva(s6, "1W")
check("chiusura oltre il top → uscito_sopra", r6 and r6["stato"] == "uscito_sopra")

# 7) nessun look-ahead: l'ultima barra non allarga il range
check("top = massimo delle chiusure dal minimo a IERI (l'ultima barra non lo allarga)",
      r6["top"] == round(float(s6.loc[r6["inizio"]:].iloc[:-1].max()), 4)
      and float(s6.iloc[-1]) > r6["top"])

# ── Motore: stato congelato ed eventi ────────────────────────────────────
oggi = dt.date(2026, 11, 2)
stato = {}
ev = engine.aggiorna(stato, "AAA", "1W", s, oggi)
check("primo giro: evento nuova_base e stato in_range congelato",
      [e["tipo"] for e in ev] == ["nuova_base"] and stato["AAA|1W"]["stato"] == "in_range"
      and stato["AAA|1W"]["congelato_il"] == str(oggi))
top0, bot0 = stato["AAA|1W"]["top"], stato["AAA|1W"]["bottom"]

# barra nuova dentro il range: nessun evento, top/bottom invariati
s_dentro = pd.concat([s, pd.Series([(top0 + bot0) / 2], index=[s.index[-1] + pd.Timedelta(weeks=1)])])
ev = engine.aggiorna(stato, "AAA", "1W", s_dentro, oggi)
check("barra dentro il range: nessun evento, range congelato invariato",
      ev == [] and stato["AAA|1W"]["top"] == top0 and stato["AAA|1W"]["bottom"] == bot0)

# uscita sopra: UN evento, poi non si ripete
s_su = pd.concat([s_dentro, pd.Series([top0 * 1.05], index=[s_dentro.index[-1] + pd.Timedelta(weeks=1)])])
ev = engine.aggiorna(stato, "AAA", "1W", s_su, oggi)
check("chiusura sopra il top → evento uscita_sopra", [e["tipo"] for e in ev] == ["uscita_sopra"])
ev2 = engine.aggiorna(stato, "AAA", "1W", s_su, oggi)
check("stesso dato rielaborato: nessun secondo alert", ev2 == [])
ev3 = engine.aggiorna(stato, "AAA", "1W",
                      pd.concat([s_su, pd.Series([top0 * 1.2], index=[s_su.index[-1] + pd.Timedelta(weeks=1)])]), oggi)
check("anche con barre successive: nessun nuovo alert", ev3 == [])

# uscita sotto
st2 = {}
engine.aggiorna(st2, "BBB", "1W", s, oggi)
s_giu = pd.concat([s, pd.Series([st2["BBB|1W"]["bottom"] * 0.95], index=[s.index[-1] + pd.Timedelta(weeks=1)])])
ev = engine.aggiorna(st2, "BBB", "1W", s_giu, oggi)
check("chiusura sotto il bottom → evento uscita_sotto",
      [e["tipo"] for e in ev] == ["uscita_sotto"] and st2["BBB|1W"]["stato"] == "uscito_sotto")

# pulizia dopo 20 giorni
st2["BBB|1W"]["uscito_il"] = "2026-09-01"
engine.aggiorna(st2, "BBB", "1W", s_giu, oggi)
check("uscito da oltre 20 giorni: lo stato si pulisce", "BBB|1W" not in st2 or st2["BBB|1W"]["stato"] != "uscito_sotto")

# salvataggio/ricarico
with tempfile.TemporaryDirectory() as tmp:
    p = Path(tmp) / "bases.json"
    engine.salva_stato(stato, p)
    check("stato salvato e ricaricato identico", engine.carica_stato(p) == stato)
    check("file assente o corrotto → stato vuoto", engine.carica_stato(Path(tmp) / "x.json") == {})
    p.write_text("{rotto")
    check("JSON corrotto → stato vuoto, nessun crash", engine.carica_stato(p) == {})

# ── Barre chiuse ─────────────────────────────────────────────────────────
gg = pd.bdate_range("2026-10-26", "2026-10-30")          # lun–ven
d = pd.DataFrame({"Open": 1, "High": 1, "Low": 1, "Close": np.arange(len(gg), dtype=float) + 1}, index=gg)
mer = pd.Timestamp("2026-10-28 23:00", tz="UTC")
w = detect.settimanali_chiuse(d.iloc[:3], mer)
check("settimana in corso (mercoledì): barra settimanale NON ancora chiusa", len(w) == 0)
w = detect.settimanali_chiuse(d, pd.Timestamp("2026-10-30 23:00", tz="UTC"))
check("venerdì a mercato chiuso: settimana chiusa", len(w) == 1 and float(w["Close"].iloc[-1]) == 5.0)
d2 = pd.concat([d, d.iloc[:1].set_index(pd.DatetimeIndex(["2026-11-02"]))])
w = detect.settimanali_chiuse(d2, pd.Timestamp("2026-11-02 12:00", tz="UTC"))
check("lunedì dopo: la settimana precedente è chiusa, la nuova no", len(w) == 1)
g = detect.barre_chiuse_giornaliere(d, pd.Timestamp("2026-10-30 15:00", tz="UTC"))
check("oggi alle 15:00 UTC: barra giornaliera di oggi scartata (parziale)", len(g) == len(d) - 1)
g = detect.barre_chiuse_giornaliere(d, pd.Timestamp("2026-10-30 22:30", tz="UTC"))
check("oggi alle 22:30 UTC: barra giornaliera valida", len(g) == len(d))

print("\nTUTTI I CHECK PASSATI (verifica_basi)")
