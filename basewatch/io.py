"""basewatch/io.py — candidati dal vecchio portale, prezzi, Telegram, grafici."""
from __future__ import annotations

import base64
import json
import os
import time

import pandas as pd
import requests


def candidati_dal_vecchio_portale(repo: str, token: str, path: str = "data/watchlist.json") -> list[str]:
    """Ticker della watchlist del vecchio portale (già filtrati: discesa,
    fondamentali, zona POC/VWAP). Lettura via API GitHub con token read-only."""
    r = requests.get(f"https://api.github.com/repos/{repo}/contents/{path}",
                     headers={"Authorization": f"Bearer {token}",
                              "Accept": "application/vnd.github+json"}, timeout=30)
    r.raise_for_status()
    d = json.loads(base64.b64decode(r.json()["content"]))
    out = [str(e["ticker"]).strip().upper() for e in d.get("entries", []) if e.get("ticker")]
    return sorted(dict.fromkeys(out))


def scarica_giornalieri(tickers: list[str], anni: int = 20, blocco: int = 60) -> dict[str, pd.DataFrame]:
    """{ticker: DataFrame OHLC giornaliero rettificato}. Un titolo che fallisce
    viene saltato (non ferma gli altri)."""
    import yfinance as yf
    out: dict[str, pd.DataFrame] = {}
    for i in range(0, len(tickers), blocco):
        lotto = tickers[i:i + blocco]
        try:
            raw = yf.download(lotto, period=f"{anni}y", interval="1d", auto_adjust=True,
                              group_by="ticker", threads=True, progress=False)
        except Exception as e:
            print(f"⚠️ blocco {i}-{i + blocco} non scaricato: {type(e).__name__}: {e}")
            continue
        for t in lotto:
            try:
                df = raw[t] if len(lotto) > 1 else raw
                df = df[["Open", "High", "Low", "Close"]].dropna(how="all")
                if len(df) > 100:
                    df.index = pd.to_datetime(df.index).tz_localize(None)
                    out[t] = df
            except Exception:
                continue
        time.sleep(1)
    return out


def invia_telegram(testo: str) -> bool:
    token, chat = os.environ.get("TELEGRAM_BOT_TOKEN"), os.environ.get("TELEGRAM_CHAT_ID")
    if not token or not chat:
        return False
    for chat_id in [c.strip() for c in chat.split(",") if c.strip()]:
        try:
            r = requests.post(f"https://api.telegram.org/bot{token}/sendMessage",
                              json={"chat_id": chat_id, "text": testo,
                                    "disable_web_page_preview": True}, timeout=15)
            if not r.ok:
                print(f"⚠️ Telegram {r.status_code}: {r.text[:200]}")
                return False
        except Exception as e:
            print(f"⚠️ Telegram: {type(e).__name__}: {e}")
            return False
    return True


def serie_grafico(df: pd.DataFrame, n: int) -> list[dict]:
    """Ultime n barre in formato per il grafico del sito."""
    d = df.tail(n)
    return [{"t": str(i)[:10], "o": round(float(r.Open), 4), "h": round(float(r.High), 4),
             "l": round(float(r.Low), 4), "c": round(float(r.Close), 4)}
            for i, r in d.iterrows()]


def nome_file(ticker: str) -> str:
    """Nome file sicuro per un ticker (stesso schema usato da site/app.js)."""
    return "".join(ch if ch.isalnum() or ch in "-_." else "_" for ch in ticker)


CHIAVI_FOND = ["longName", "sector", "industry", "currency", "financialCurrency", "ebitda", "marketCap", "trailingPE", "forwardPE",
               "priceToBook", "enterpriseToEbitda", "profitMargins", "operatingMargins", "grossMargins",
               "returnOnEquity", "returnOnAssets", "revenueGrowth", "earningsGrowth", "debtToEquity",
               "currentRatio", "quickRatio", "totalDebt", "totalCash", "freeCashflow", "operatingCashflow",
               "dividendYield", "payoutRatio", "beta", "fiftyTwoWeekHigh", "fiftyTwoWeekLow",
               "targetMeanPrice", "recommendationKey", "numberOfAnalystOpinions"]


def fondamentali(ticker: str) -> dict:
    """Dati fondamentali essenziali da Yahoo Finance (info + bilancio annuale).
    Ritorna {} se non disponibili: l'AI lo dichiara e non inventa."""
    import yfinance as yf
    out: dict = {}
    try:
        tk = yf.Ticker(ticker)
        info = tk.info or {}
        for k in CHIAVI_FOND:
            v = info.get(k)
            if v is not None and v == v:          # esclude None e NaN
                out[k] = round(v, 4) if isinstance(v, float) else v
        if out.get("totalDebt") is not None and out.get("totalCash") is not None:
            out["debito_netto"] = round(out["totalDebt"] - out["totalCash"], 0)
            if out.get("ebitda"):
                out["debito_netto_su_ebitda"] = round(out["debito_netto"] / out["ebitda"], 2)
        fin = tk.financials
        righe = {}
        for nome, chiave in (("Total Revenue", "ricavi"), ("Operating Income", "utile_operativo"),
                             ("Net Income", "utile_netto")):
            if fin is not None and nome in fin.index:
                righe[chiave] = {str(c)[:4]: float(v) for c, v in fin.loc[nome].items() if v == v}
        if righe:
            out["bilancio_annuale"] = righe
    except Exception as e:
        print(f"⚠️ fondamentali {ticker}: {type(e).__name__}: {e}")
    return out


def invia_email(oggetto: str, testo: str) -> bool:
    """Email via SMTP (Gmail con password per app). Secrets: SMTP_USER, SMTP_PASSWORD,
    EMAIL_TO (indirizzi separati da virgola); opzionali SMTP_HOST, SMTP_PORT.
    Mai eccezioni: False se non configurata o se l'invio fallisce."""
    import smtplib
    import ssl
    from email.message import EmailMessage
    user, pw = os.environ.get("SMTP_USER"), os.environ.get("SMTP_PASSWORD")
    dest = [x.strip() for x in os.environ.get("EMAIL_TO", "").split(",") if x.strip()]
    if not (user and pw and dest):
        return False
    msg = EmailMessage()
    msg["Subject"], msg["From"], msg["To"] = oggetto, user, ", ".join(dest)
    msg.set_content(testo)
    try:
        with smtplib.SMTP(os.environ.get("SMTP_HOST", "smtp.gmail.com"),
                          int(os.environ.get("SMTP_PORT", "587")), timeout=30) as srv:
            srv.starttls(context=ssl.create_default_context())
            srv.login(user, pw)
            srv.send_message(msg)
        return True
    except Exception as e:
        print(f"⚠️ Email: {type(e).__name__}: {e}")
        return False
