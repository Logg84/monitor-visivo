"""Giro leggero dei prezzi di giornata: nessuno screening, nessun segnale. Scrive site/data/prezzi_live.json.

Universo = indici dello screening (data/universo_indici.txt) + titoli «solo live» (data/universo_live_extra.txt, es. FTSE MIB) + titoli extra
+ watchlist del vecchio portale (se i secret ci sono).
Se meno della metà dei titoli viene scaricata, il file precedente NON viene toccato e il giro fallisce (si vede in Actions).
"""
import datetime as dt
import json
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from basewatch import io as bio, live  # noqa: E402

USCITA = ROOT / "site" / "data" / "prezzi_live.json"
BLOCCO = 100


def _righe(p: Path) -> list[str]:
    if not p.exists():
        return []
    out = [r.split("#")[0].strip().upper() for r in p.read_text().splitlines()]
    return [t for t in out if t]


def universo() -> list[str]:
    tk = (_righe(ROOT / "data" / "universo_indici.txt") + _righe(ROOT / "data" / "universo_live_extra.txt")
          + _righe(ROOT / "tickers_extra.txt"))
    repo, token = os.environ.get("OLD_REPO"), os.environ.get("OLD_REPO_TOKEN")
    if repo and token:
        try:
            tk += bio.candidati_dal_vecchio_portale(repo, token)
        except Exception as e:           # la watchlist è un in più: il giro non dipende da lei
            print(f"⚠️ watchlist del vecchio portale non letta ({type(e).__name__}): uso solo gli indici")
    return sorted({t for t in tk if not live.esclusi_dal_live(t)})


def scarica_close(tickers: list[str]) -> dict:
    import yfinance as yf
    out = {}
    for i in range(0, len(tickers), BLOCCO):
        lotto = tickers[i:i + BLOCCO]
        try:
            raw = yf.download(lotto, period="5d", interval="1d", auto_adjust=False, group_by="ticker", threads=True, progress=False)
        except Exception as e:
            print(f"⚠️ blocco {i}-{i + BLOCCO} non scaricato: {type(e).__name__}: {e}")
            continue
        for t in lotto:
            try:
                s = (raw[t] if len(lotto) > 1 else raw)["Close"].dropna()
                if len(s) >= 2:
                    out[t] = s
            except Exception:
                continue
        time.sleep(1)
    return out


def main(scarica=scarica_close, adesso=None) -> int:
    adesso = adesso or dt.datetime.now(dt.timezone.utc)
    tickers = universo()
    frames = scarica(tickers)
    corpo = live.costruisci(frames, len(tickers), adesso)
    print(f"Richiesti {corpo['richiesti']}, scaricati {corpo['scaricati']}, in seduta {corpo['in_seduta']}, fuori seduta {corpo['fuori_seduta']}")
    if corpo["scaricati"] < max(1, corpo["richiesti"] // 2):
        print("::error::Meno della metà dei titoli scaricata: file dei prezzi live NON aggiornato")
        return 1
    USCITA.parent.mkdir(parents=True, exist_ok=True)
    tmp = USCITA.with_suffix(".tmp")
    tmp.write_text(json.dumps(corpo, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    tmp.replace(USCITA)
    return 0


if __name__ == "__main__":
    sys.exit(main())
