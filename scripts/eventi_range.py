"""Esporta gli eventi storici del range (nuova base, uscite, rientri) in un CSV
pubblico, per il backtest. Uso:

  python scripts/eventi_range.py --vecchio-portale            # titoli della watchlist (OLD_REPO, OLD_REPO_TOKEN)
  python scripts/eventi_range.py --tickers-file universo.txt  # un ticker per riga, # per i commenti
  opzioni: --anni 20  --da 2012-01-01  --jobs 4  --out data/eventi_range.csv
"""
import argparse
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from basewatch import io as bio, storico  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--vecchio-portale", action="store_true")
    ap.add_argument("--tickers-file")
    ap.add_argument("--anni", type=int, default=20)
    ap.add_argument("--da", help="tiene solo gli eventi da questa data (il replay parte comunque dall'inizio)")
    ap.add_argument("--jobs", type=int, default=os.cpu_count() or 1)
    ap.add_argument("--out", default=str(ROOT / "data" / "eventi_range.csv"))
    a = ap.parse_args()

    tickers: list[str] = []
    if a.tickers_file:
        righe = Path(a.tickers_file).read_text().splitlines()
        tickers += [r.split("#")[0].strip().upper() for r in righe]
    if a.vecchio_portale:
        repo, token = os.environ.get("OLD_REPO"), os.environ.get("OLD_REPO_TOKEN")
        if not repo or not token:
            print("::error::Mancano OLD_REPO / OLD_REPO_TOKEN")
            return 1
        tickers += bio.candidati_dal_vecchio_portale(repo, token)
    tickers = sorted({t for t in tickers if t})
    if not tickers:
        print("::error::Nessun ticker: usa --tickers-file o --vecchio-portale")
        return 1

    print(f"Titoli: {len(tickers)} · anni: {a.anni}")
    prezzi = bio.scarica_giornalieri(tickers, anni=a.anni)
    print(f"Prezzi scaricati: {len(prezzi)}/{len(tickers)}")
    if len(prezzi) < max(1, len(tickers) // 2):
        print("::error::Meno della metà dei titoli scaricata: esportazione annullata")
        return 1

    ev = storico.replay_universo(prezzi, da=a.da, jobs=a.jobs)
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    ev.to_csv(out, index=False)
    print(f"Eventi: {len(ev)} → {out}")
    print(ev.groupby(["tf", "tipo"]).size().to_string())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
