"""
basewatch/grafico_alert.py — link TradingView e immagine del grafico per gli alert Telegram (28/11/2026).

Il link segue la STESSA regola del sito (site/tvlink.js) e del repo privato (core/data_engine.py::tradingview_simbolo):
borsa USA dalla mappa site/borse_us.json, nessuna borsa inventata per i simboli sconosciuti, classi «BRK-B» → «BRK.B»,
LSE a 1-2 lettere col punto finale («BP.L» → «LSE:BP.»).
L'immagine è un grafico a candele con il range (top/bottom) e la barra dell'uscita (o del retest). Se matplotlib manca o
il disegno fallisce restituisce None: l'alert parte comunque, solo testo + link. Solo informazione, nessun consiglio.
"""
from __future__ import annotations

import io
import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
BORSE = {".MI": "MIL", ".PA": "EURONEXT", ".DE": "XETR", ".MC": "BMAD", ".AS": "EURONEXT",
         ".L": "LSE", ".SW": "SIX", ".ST": "OMX", ".BR": "EURONEXT"}
BARRE_MIN = {"1D": 90, "1W": 60}      # barre minime mostrate
BARRE_MAX = 260
MARGINE_PRIMA = 12                    # barre mostrate prima dell'inizio della base
TITOLI_TIPO = {"uscita_sopra": "uscita dal range verso l'alto", "uscita_sotto": "uscita dal range verso il basso",
               "retest_tenuto": "retest del livello rotto (tenuto)", "nuova_base": "nuova base",
               "rientro": "rientro nel range"}
TF_IT = {"1W": "settimanale", "1D": "giornaliero"}


def carica_mappa_us(path: Path | None = None) -> dict:
    """{ticker USA: borsa} da site/borse_us.json; {} se illeggibile (il link resta valido, senza prefisso di borsa)."""
    try:
        return json.loads((path or ROOT / "site" / "borse_us.json").read_text(encoding="utf-8"))
    except Exception:
        return {}


def simbolo_tv(ticker: str, mappa_us: dict | None = None) -> str:
    t = str(ticker or "").strip().upper()
    i = t.rfind(".")
    base, suffisso = (t[:i], t[i:]) if i > 0 else (t, "")
    base = base.replace("-", ".")
    if suffisso == "":
        ex = (mappa_us or {}).get(t)
    else:
        ex = BORSE.get(suffisso)
        if suffisso == ".L" and "." not in base and len(base) <= 2:
            base += "."
    return f"{ex}:{base}" if ex else base


def url_tv(ticker: str, mappa_us: dict | None = None) -> str:
    return "https://www.tradingview.com/chart/?symbol=" + simbolo_tv(ticker, mappa_us)


def _pos(indice: pd.DatetimeIndex, data) -> int | None:
    """Posizione della barra alla data indicata (la prima barra ≥ data); None se data assente o fuori dal grafico."""
    try:
        ts = pd.Timestamp(str(data)[:10])
    except Exception:
        return None
    p = int(indice.searchsorted(ts))
    return p if 0 <= p < len(indice) else None


def grafico_png(e: dict, df: pd.DataFrame, titolo_extra: str = "") -> bytes | None:
    """PNG (1000×600) a candele del titolo con range e barra dell'uscita/retest. `e` = evento di engine/alert (+ retest_tenuto);
    `df` = barre CHIUSE del timeframe dell'evento (colonne Open/High/Low/Close, indice data). None se non disegnabile."""
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        from matplotlib.patches import Rectangle
    except Exception as x:
        print(f"⚠️ grafico non disponibile (matplotlib): {type(x).__name__}")
        return None
    try:
        d = df[["Open", "High", "Low", "Close"]].astype(float).dropna()
        if len(d) < 5:
            return None
        d.index = pd.DatetimeIndex(d.index).tz_localize(None) if pd.DatetimeIndex(d.index).tz is not None else pd.DatetimeIndex(d.index)
        tf = e.get("tf", "1D")
        top, bottom = float(e["top"]), float(e["bottom"])
        p_ini = _pos(d.index, e.get("inizio")) if e.get("inizio") else None
        n = len(d) - p_ini + MARGINE_PRIMA if p_ini is not None else BARRE_MIN.get(tf, 90)
        d = d.tail(max(BARRE_MIN.get(tf, 90), min(BARRE_MAX, n)))
        x_ini = _pos(d.index, e.get("inizio")) if e.get("inizio") else None
        x_ini = 0 if x_ini is None else x_ini

        sfondo, testo, griglia, su, giu, zona, evid = "#0f1115", "#d6dae1", "#232834", "#26a69a", "#ef5350", "#3b82f6", "#f5b942"
        fig, ax = plt.subplots(figsize=(10, 6), dpi=100, facecolor=sfondo)
        ax.set_facecolor(sfondo)
        n_b = len(d)
        ax.add_patch(Rectangle((x_ini - 0.5, bottom), n_b + 3 - x_ini, top - bottom, facecolor=zona, alpha=0.14, edgecolor="none", zorder=1))
        ax.hlines(top, x_ini - 0.5, n_b + 2.5, colors=zona, linestyles="-", linewidth=1.2, zorder=2)
        ax.hlines(bottom, x_ini - 0.5, n_b + 2.5, colors=zona, linestyles="--", linewidth=1.0, zorder=2)
        for i, (o, h, l, c) in enumerate(d[["Open", "High", "Low", "Close"]].itertuples(index=False, name=None)):
            col = su if c >= o else giu
            ax.vlines(i, l, h, colors=col, linewidth=1.0, zorder=3)
            ax.add_patch(Rectangle((i - 0.35, min(o, c)), 0.7, max(abs(c - o), (h - l) * 0.02, 1e-9), facecolor=col, edgecolor=col, zorder=4))
        ultimo = float(d["Close"].iloc[-1])
        ax.hlines(ultimo, n_b - 1, n_b + 2.5, colors=testo, linestyles=":", linewidth=0.9, zorder=2)
        ax.text(n_b + 2.7, ultimo, f"{ultimo:g}", color=testo, fontsize=9, va="center")
        ax.text(n_b + 2.7, top, f"top {top:g}", color=zona, fontsize=9, va="center")
        ax.text(n_b + 2.7, bottom, f"bottom {bottom:g}", color=zona, fontsize=9, va="center")
        # barre da evidenziare: uscita (e retest)
        marche = []
        if e.get("tipo") == "retest_tenuto":
            marche = [(e.get("data_uscita"), "uscita"), (e.get("data"), "retest")]
        else:
            marche = [(e.get("data"), {"uscita_sopra": "uscita", "uscita_sotto": "uscita"}.get(e.get("tipo"), ""))]
        for data, etich in marche:
            p = _pos(d.index, data)
            if p is not None:
                ax.axvline(p, color=evid, linestyle=":", linewidth=1.1, zorder=2)
                if etich:
                    ax.text(p, 1.0, etich, color=evid, fontsize=9, ha="center", va="bottom", transform=ax.get_xaxis_transform())
        lo, hi = min(float(d["Low"].min()), bottom), max(float(d["High"].max()), top)
        pad = (hi - lo) * 0.06 or hi * 0.02
        ax.set_ylim(lo - pad, hi + pad)
        ax.set_xlim(-1, n_b + 9)
        passi = sorted({int(round(k)) for k in [i * (n_b - 1) / 6 for i in range(7)]})
        ax.set_xticks(passi)
        ax.set_xticklabels([d.index[k].strftime("%d/%m/%y") for k in passi], color=testo, fontsize=9)
        ax.tick_params(axis="y", colors=testo, labelsize=9)
        ax.grid(True, color=griglia, linewidth=0.6)
        for lato in ax.spines.values():
            lato.set_color(griglia)
        ax.set_title(f"{e['ticker']} · {TF_IT.get(tf, tf)} · {TITOLI_TIPO.get(e.get('tipo'), e.get('tipo', ''))}" + (f" · {titolo_extra}" if titolo_extra else ""),
                     color=testo, fontsize=13, loc="left", pad=22)
        fig.text(0.01, 0.01, "Solo informazione sui prezzi: non è un consiglio.", color="#8b93a1", fontsize=8)
        fig.tight_layout(rect=(0, 0.03, 1, 1))
        buf = io.BytesIO()
        fig.savefig(buf, format="png", facecolor=sfondo)
        plt.close(fig)
        return buf.getvalue()
    except Exception as x:       # il disegno non deve mai bloccare un avviso
        print(f"⚠️ grafico non creato per {e.get('ticker')}: {type(x).__name__}: {x}")
        try:
            plt.close("all")
        except Exception:
            pass
        return None
