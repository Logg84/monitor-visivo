"""Giro giornaliero: candidati → prezzi → stato basi → alert di uscita → file per il sito."""
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import pandas as pd  # noqa: E402

from basewatch import detect, engine, io as bio  # noqa: E402

DATA = ROOT / "data"
BARRE_GRAFICO = {"1W": 260, "1D": 400}


def main() -> int:
    adesso = pd.Timestamp.now(tz="UTC")
    oggi = adesso.date()
    repo, token = os.environ.get("OLD_REPO"), os.environ.get("OLD_REPO_TOKEN")
    if not repo or not token:
        print("::error::Mancano OLD_REPO / OLD_REPO_TOKEN (secrets del repo)")
        return 1
    tickers = bio.candidati_dal_vecchio_portale(repo, token)
    print(f"Candidati dal vecchio portale: {len(tickers)}")
    prezzi = bio.scarica_giornalieri(tickers)
    print(f"Prezzi scaricati: {len(prezzi)}/{len(tickers)}")
    if len(prezzi) < max(1, len(tickers) // 2):
        print("::error::Meno della metà dei titoli scaricata: giro annullato, stato NON toccato")
        return 1

    stato = engine.carica_stato(DATA / "bases.json")
    eventi, serie = [], {}
    for t, d in prezzi.items():
        giorn = detect.barre_chiuse_giornaliere(d, adesso)
        sett = detect.settimanali_chiuse(giorn, adesso)
        for tf, df in (("1W", sett), ("1D", giorn)):
            try:
                eventi += engine.aggiorna(stato, t, tf, df["Close"], oggi)
            except Exception as e:
                print(f"⚠️ {t} {tf}: {type(e).__name__}: {e}")
            if f"{t}|{tf}" in stato:
                serie.setdefault(t, {})[tf] = bio.serie_grafico(df, BARRE_GRAFICO[tf])
    # titoli usciti dall'elenco del vecchio portale: si tolgono
    for k in [k for k in stato if k.split("|")[0] not in prezzi]:
        stato.pop(k)

    engine.salva_stato(stato, DATA / "bases.json")
    sito = DATA / "site"
    sito.mkdir(parents=True, exist_ok=True)
    (sito / "index.json").write_text(json.dumps(
        {"aggiornato": adesso.isoformat(timespec="seconds"),
         "basi": [{"chiave": k, **v} for k, v in sorted(stato.items())]},
        ensure_ascii=False), encoding="utf-8")
    (sito / "serie.json").write_text(json.dumps(serie, separators=(",", ":")), encoding="utf-8")

    uscite = [e for e in eventi if e["tipo"].startswith("uscita")]
    for e in uscite:
        ok = bio.invia_telegram(engine.messaggio(e))
        print(f"{e['tipo']} {e['ticker']} {e['tf']}: Telegram {'ok' if ok else 'NON inviato'}")
    print(f"Basi attive: {sum(1 for v in stato.values() if v['stato'] in ('rallenta', 'in_range'))} · "
          f"nuove: {sum(1 for e in eventi if e['tipo'] == 'nuova_base')} · uscite: {len(uscite)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
