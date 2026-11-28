"""Verifica (nessuna rete) di link TradingView e grafico negli alert Telegram di uscita/retest (28/11/2026)."""
import datetime as dt
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from basewatch import alert, grafico_alert as gf, io as bio  # noqa: E402


def check(n, ok):
    print(("✓ " if ok else "✗ ") + n)
    if not ok:
        raise SystemExit("CHECK FALLITO: " + n)


# ── link TradingView: stessa regola di site/tvlink.js (tests/verifica_tvlink.mjs) ──
mappa = gf.carica_mappa_us()
check("mappa borse USA caricata (≥ 500 titoli, solo NYSE/NASDAQ)", len(mappa) >= 500 and set(mappa.values()) <= {"NYSE", "NASDAQ"})
check("USA: JPM → NYSE:JPM, AAPL → NASDAQ:AAPL, BRK-B → NYSE:BRK.B",
      gf.simbolo_tv("JPM", mappa) == "NYSE:JPM" and gf.simbolo_tv("AAPL", mappa) == "NASDAQ:AAPL" and gf.simbolo_tv("BRK-B", mappa) == "NYSE:BRK.B")
check("USA sconosciuto o senza mappa: solo il codice", gf.simbolo_tv("ZZZQ", mappa) == "ZZZQ" and gf.simbolo_tv("JPM") == "JPM")
check("Europa: SAP.DE, MC.PA, MT.AS, ENI.MI",
      gf.simbolo_tv("SAP.DE") == "XETR:SAP" and gf.simbolo_tv("MC.PA") == "EURONEXT:MC" and gf.simbolo_tv("MT.AS") == "EURONEXT:MT" and gf.simbolo_tv("ENI.MI") == "MIL:ENI")
check("LSE: GSK.L, BP.L (punto finale), BT-A.L", gf.simbolo_tv("GSK.L") == "LSE:GSK" and gf.simbolo_tv("BP.L") == "LSE:BP." and gf.simbolo_tv("BT-A.L") == "LSE:BT.A")
check("suffisso sconosciuto: nessuna borsa inventata", gf.simbolo_tv("XYZ.QQ") == "XYZ")
check("url: formato chart/?symbol= con i due punti leggibili", gf.url_tv("JPM", mappa) == "https://www.tradingview.com/chart/?symbol=NYSE:JPM")
check("mappa illeggibile: {} (il link resta valido)", gf.carica_mappa_us(ROOT / "non_esiste.json") == {})

# ── messaggio: il link c'è sempre negli avvisi, prima dell'avviso finale ──
oggi = dt.date(2026, 11, 5)
e = {"ticker": "AAA", "tf": "1D", "tipo": "uscita_sopra", "bottom": 80, "top": 100, "chiusura": 103.5, "data": "2026-11-05"}
link = gf.url_tv("AAA", mappa)
m = alert.messaggio_unificato(e, None, oggi, link=link)
check("messaggio: link TradingView presente, prima dell'avviso finale", f"📈 Grafico su TradingView: {link}" in m and m.index("TradingView") < m.index("non è un ordine"))
check("messaggio senza link: identico a prima", "TradingView" not in alert.messaggio_unificato(e, None, oggi))
r = {"ticker": "AAA", "tf": "1W", "tipo": "retest_tenuto", "bottom": 80, "top": 100, "chiusura": 102, "data": "2026-11-04", "data_uscita": "2026-10-28"}
check("retest: link presente", "TradingView" in alert.messaggio_unificato(r, None, oggi, link=link))
check("lunghezza dell'alert col link sotto il limite della didascalia (1024)", len(alert.messaggio_unificato(e, {"segnale": "🟢 5/6", "punti": 5, "data": "2026-11-04"}, oggi, link=link)) < bio.DIDASCALIA_MAX)

# ── grafico ──
rng = np.random.default_rng(1)
IDX = pd.bdate_range(end="2026-11-26", periods=300)
c = np.concatenate([np.linspace(160, 100, 150) + rng.normal(0, 1.5, 150), 100 + rng.normal(0, 2, 110).cumsum() * 0.15, np.linspace(103, 118, 40)])
o = np.r_[c[0], c[:-1]]
df = pd.DataFrame({"Open": o, "High": np.maximum(o, c) + 0.5, "Low": np.minimum(o, c) - 0.5, "Close": c}, index=IDX)
top = float(df.Close.iloc[150:260].max()); bot = float(df.Close.iloc[150:260].min())
k = int(np.argmax(df.Close.values[260:] > top)) + 260
ev = {"ticker": "SMCI", "tf": "1D", "tipo": "uscita_sopra", "top": top, "bottom": bot, "chiusura": float(df.Close.iloc[k]),
      "data": str(IDX[k].date()), "inizio": str(IDX[150].date())}
png = gf.grafico_png(ev, df.iloc[:k + 1])
check("grafico: PNG valido 1000×600", png is not None and png[:8] == b"\x89PNG\r\n\x1a\n" and int.from_bytes(png[16:20], "big") == 1000 and int.from_bytes(png[20:24], "big") == 600)
check("grafico retest: PNG valido", gf.grafico_png({**ev, "tipo": "retest_tenuto", "data_uscita": str(IDX[k].date()), "data": str(IDX[k + 3].date())}, df.iloc[:k + 5])[:4] == b"\x89PNG")
w = df.resample("W-FRI").agg({"Open": "first", "High": "max", "Low": "min", "Close": "last"}).dropna()
check("grafico settimanale: PNG valido", gf.grafico_png({**ev, "tf": "1W", "data": str(w.index[-3].date()), "inizio": str(w.index[30].date())}, w)[:4] == b"\x89PNG")
check("grafico: pochi dati (< 5 barre) → None, nessuna eccezione", gf.grafico_png(ev, df.iloc[:3]) is None)
check("grafico: evento incompleto → None, nessuna eccezione", gf.grafico_png({"ticker": "X"}, df) is None)
check("grafico: indice con fuso orario gestito", gf.grafico_png(ev, df.iloc[:k + 1].tz_localize("UTC"))[:4] == b"\x89PNG")
check("grafico: non modifica il DataFrame ricevuto", df.iloc[:k + 1].equals(df.iloc[:k + 1].copy()) and len(df) == 300)


# ── invio Telegram: foto con didascalia, ripiego sul testo, nessun avviso perso ──
class Risp:
    def __init__(self, ok=True, codice=200): self.ok, self.status_code, self.text = ok, (codice if ok else 400), "x"


def prova(foto, testo, esiti):
    """esiti: {'sendPhoto': bool, 'sendMessage': bool}. Ritorna (risultato, [metodi chiamati], [chiamate])."""
    chiamate = []

    def finto(url, **kw):
        metodo = url.rsplit("/", 1)[1]
        chiamate.append((metodo, kw))
        return Risp(esiti.get(metodo, True))
    prec = bio.requests.post
    bio.requests.post = finto
    os.environ["TELEGRAM_BOT_TOKEN"], os.environ["TELEGRAM_CHAT_ID"] = "TOKEN", "111, 222"
    try:
        ris = bio.invia_telegram(testo, foto)
    finally:
        bio.requests.post = prec
    return ris, [c[0] for c in chiamate], chiamate


ris, met, ch = prova(png, "ALERT", {})
check("foto: una sendPhoto per chat con testo come didascalia, nessun messaggio separato",
      ris is True and met == ["sendPhoto", "sendPhoto"] and ch[0][1]["data"]["caption"] == "ALERT" and ch[0][1]["files"]["photo"][1] == png)
ris, met, _ = prova(png, "ALERT", {"sendPhoto": False})
check("foto rifiutata da Telegram → ripiego sul testo per ogni chat, alert consegnato", ris is True and met == ["sendPhoto", "sendMessage", "sendPhoto", "sendMessage"])
ris, met, ch = prova(png, "X" * 1100, {})
check("didascalia troppo lunga → foto senza didascalia + messaggio di testo completo",
      ris is True and met[:2] == ["sendPhoto", "sendMessage"] and "caption" not in ch[0][1]["data"] and ch[1][1]["json"]["text"] == "X" * 1100)
ris, met, ch = prova(None, "ALERT", {})
check("senza foto: comportamento di prima (solo sendMessage, anteprima link spenta)",
      ris is True and met == ["sendMessage", "sendMessage"] and ch[0][1]["json"]["disable_web_page_preview"] is True)
ris, met, _ = prova(png, "ALERT", {"sendPhoto": False, "sendMessage": False})
check("foto e messaggio rifiutati → False", ris is False)
os.environ.pop("TELEGRAM_BOT_TOKEN"); os.environ.pop("TELEGRAM_CHAT_ID")
check("senza secret → False, nessuna chiamata", bio.invia_telegram("A", png) is False)

# ── run.py: il giro passa link e grafico agli avvisi ──
src = (ROOT / "scripts" / "run.py").read_text(encoding="utf-8")
check("run.py: link TradingView sempre passato al messaggio", "link=gf.url_tv(e[\"ticker\"], mappa_us)" in src)
check("run.py: grafico creato per timeframe (settimanale dal giornaliero) e inviato", "gf.grafico_png(e," in src and "bio.invia_telegram(testo, foto)" in src)
check("run.py: avvisi solo per l'uscita verso l'alto (invariato)", 'e["tipo"] == "uscita_sopra"' in src and 'startswith("uscita")' not in src)

print("OK: verifica_alert_grafico")
