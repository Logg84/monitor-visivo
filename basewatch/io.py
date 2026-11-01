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


def scarica_giornalieri(tickers: list[str], anni: int = 6, blocco: int = 60) -> dict[str, pd.DataFrame]:
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
