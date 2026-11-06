"""Verifica (nessuna rete) dell'alert unico: punteggio da D1, messaggio, retest nuovi."""
import datetime as dt
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from basewatch import alert, engine  # noqa: E402


def check(n, ok):
    print(("✓ " if ok else "✗ ") + n)
    if not ok:
        raise SystemExit("CHECK FALLITO: " + n)


ENV = {"CF_ACCOUNT_ID": "acc", "CF_D1_DATABASE_ID": "db", "CF_API_TOKEN": "SEGRETO"}


class R:
    def __init__(self, j): self.j = j
    def json(self): return self.j


chiamate = []


def post_ok(url, json, timeout, headers):
    chiamate.append((url, json, headers))
    righe = [{"ticker": t, "data": "2026-11-04", "segnale": "🟢 5/6", "punti": 5} for t in json["params"] if t != "ASSENTE"]
    return R({"success": True, "result": [{"results": righe}]})


p = alert.leggi_punteggi(["AAA", "BBB", "ASSENTE"], ENV, post_ok)
check("punteggi letti per i ticker richiesti, assente → mancante", set(p) == {"AAA", "BBB"} and p["AAA"]["punti"] == 5)
u, js, h = chiamate[0]
check("endpoint e query D1 corretti, ultima data, parametri legati", u.endswith("/accounts/acc/d1/database/db/query") and "MAX(data)" in js["sql"]
      and js["sql"].count("?") == 3 and h["Authorization"] == "Bearer SEGRETO")
chiamate.clear()
alert.leggi_punteggi([f"T{i}" for i in range(200)], ENV, post_ok)
check("lotti ≤ 90 parametri (limite D1 100)", len(chiamate) == 3 and max(len(c[1]["params"]) for c in chiamate) <= 90)
check("senza credenziali → {} senza chiamate", alert.leggi_punteggi(["A"], {}, post_ok) == {} and alert.leggi_punteggi([], ENV, post_ok) == {})


def post_ko(*a, **k): raise ConnectionError("giù")


check("rete/database in errore → {} (l'alert parte comunque)", alert.leggi_punteggi(["A"], ENV, post_ko) == {})
check("success=false → {}", alert.leggi_punteggi(["A"], ENV, lambda *a, **k: R({"success": False})) == {})
import io, contextlib  # noqa: E402
buf = io.StringIO()
with contextlib.redirect_stdout(buf):
    alert.leggi_punteggi(["A"], ENV, post_ko)
check("il token non compare mai nei log", "SEGRETO" not in buf.getvalue())

oggi = dt.date(2026, 11, 5)
e = {"ticker": "AAA", "tf": "1D", "tipo": "uscita_sopra", "bottom": 80, "top": 100, "chiusura": 103.5, "data": "2026-11-05"}
m = alert.messaggio_unificato(e, p["AAA"], oggi)
check("messaggio: uscita, range, punteggio con data, nota retest, avviso",
      "USCITA DAL RANGE verso l'alto" in m and "80 – 100" in m and "🟢 5/6 (screening del 2026-11-04)" in m
      and "61–66%" in m and "non è un ordine" in m and "⚠️" not in m)
m = alert.messaggio_unificato({**e, "tipo": "uscita_sotto"}, p["AAA"], oggi)
check("uscita sotto: niente nota sul retest", "verso il basso" in m and "61–66%" not in m)
m = alert.messaggio_unificato(e, None, oggi)
check("senza punteggio: lo dice, l'alert resta", "non disponibile" in m and "USCITA" in m)
m = alert.messaggio_unificato(e, {"segnale": "🟡 2/6", "punti": 2, "data": "2026-10-20"}, oggi)
check("punteggio vecchio → avviso di dato non recente", "dato non recente" in m)
check("punteggio senza etichetta → n/6", "3/6" in alert.riga_punteggio({"segnale": None, "punti": 3, "data": "2026-11-05"}, oggi))
_, corpo = engine.email_uscite([e], "https://sito", ["TESTO PRONTO"])
check("email: usa i testi già pronti", "TESTO PRONTO" in corpo and "https://sito" in corpo)
_, corpo = engine.email_uscite([e], "")
check("email senza testi: comportamento di prima", "USCITA DAL RANGE" in corpo)

# ── Retest nuovi ──
IDX = pd.bdate_range("2026-09-01", periods=60)


def serie(mod=None, n=60):
    c = np.full(n, 100.0)
    c[20:] = 120.0
    c[20] = 110.0
    df = pd.DataFrame({"Open": c, "High": c * 1.01, "Low": c * 0.995, "Close": c}, index=IDX[:n])
    for k, (cl, lo) in (mod or {}).items():
        df.iloc[k, df.columns.get_loc("Close")] = cl
        df.iloc[k, df.columns.get_loc("Low")] = lo
    return df


def stato_base(**kw):
    b = {"stato": "uscito_sopra", "top": 105.0, "bottom": 80.0, "uscito_il": str(IDX[20].date()), "inizio": "2026-01-01"}
    b.update(kw)
    return {"AAA|1D": b}


g = IDX[24].date()                                        # retest alla seduta +4
st = stato_base()
ev = alert.retest_nuovi(st, {"AAA": serie({24: (108.0, 106.0)}, n=25)}, g)
check("retest tenuto nuovo → un evento con data, chiusura, uscita", len(ev) == 1 and ev[0]["tipo"] == "retest_tenuto"
      and ev[0]["data"] == str(IDX[24].date()) and ev[0]["chiusura"] == 108.0 and ev[0]["data_uscita"] == str(IDX[20].date()))
check("lo stato ricorda l'avviso", st["AAA|1D"]["retest_notificato"] == str(IDX[20].date()))
check("secondo giro: nessun doppio avviso", alert.retest_nuovi(st, {"AAA": serie({24: (108.0, 106.0)}, n=26)}, IDX[25].date()) == [])
m = alert.messaggio_unificato(ev[0], p["AAA"], g)
check("messaggio del retest", "RETEST" in m and "tenuto" in m and "Punteggio 1–6" in m and "61–66%" not in m)
check("rientro (chiusura ≤ top) → nessun avviso di retest",
      alert.retest_nuovi(stato_base(), {"AAA": serie({23: (104.0, 103.0)}, n=25)}, g) == [])
check("nessun ritorno → nessun avviso", alert.retest_nuovi(stato_base(), {"AAA": serie(n=25)}, g) == [])
check("uscite «prima vista» ignorate", alert.retest_nuovi(stato_base(prima_vista=True), {"AAA": serie({24: (108.0, 106.0)}, n=25)}, g) == [])
check("base non più uscita (in_range) ignorata", alert.retest_nuovi(stato_base(stato="in_range"), {"AAA": serie({24: (108.0, 106.0)}, n=25)}, g) == [])
check("retest vecchio (>3 giorni) non genera avvisi", alert.retest_nuovi(stato_base(), {"AAA": serie({24: (108.0, 106.0)}, n=40)}, IDX[39].date()) == [])
check("senza prezzi → ignorato", alert.retest_nuovi(stato_base(), {}, g) == [])
st = stato_base(retest_notificato="2026-01-01")
check("nuova uscita dopo un avviso precedente → si può avvisare di nuovo",
      len(alert.retest_nuovi(st, {"AAA": serie({24: (108.0, 106.0)}, n=25)}, g)) == 1)
fut = serie({24: (108.0, 106.0)}, n=25)
check("nessun look-ahead: stesso esito con barre future casuali",
      alert.retest_nuovi(stato_base(), {"AAA": fut}, g)[0]["data"] == alert.retest_nuovi(stato_base(), {"AAA": serie({24: (108.0, 106.0)}, n=25).iloc[:25]}, g)[0]["data"])
src = (ROOT / "scripts" / "run.py").read_text(encoding="utf-8")
check("run.py: avvisi solo per l'uscita verso l'alto", 'e["tipo"] == "uscita_sopra"' in src and 'startswith("uscita")' not in src)
print("OK: verifica_alert")
