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
BARRE_GRAFICO = {"1W": 365, "1D": 780}   # ~7 anni di settimanali, ~3 di giornalieri
SITO = ROOT / "site" / "data"      # servito da Cloudflare Pages


def main() -> int:
    adesso = pd.Timestamp.now(tz="UTC")
    oggi = adesso.date()
    repo, token = os.environ.get("OLD_REPO"), os.environ.get("OLD_REPO_TOKEN")
    if not repo or not token:
        print("::error::Mancano OLD_REPO / OLD_REPO_TOKEN (secrets del repo)")
        return 1
    tickers = bio.candidati_dal_vecchio_portale(repo, token)
    print(f"Candidati dal vecchio portale: {len(tickers)}")
    # Titoli extra a mano (una riga per ticker, # per i commenti): servono per
    # provare casi che il vecchio portale non ha in watchlist.
    extra_file = ROOT / "tickers_extra.txt"
    if extra_file.exists():
        extra = [r.split("#")[0].strip().upper() for r in extra_file.read_text().splitlines()]
        extra = [t for t in extra if t]
        tickers = sorted(dict.fromkeys(tickers + extra))
        print(f"Titoli extra a mano: {len(extra)}")
    prezzi = bio.scarica_giornalieri(tickers)
    print(f"Prezzi scaricati: {len(prezzi)}/{len(tickers)}")
    if len(prezzi) < max(1, len(tickers) // 2):
        print("::error::Meno della metà dei titoli scaricata: giro annullato, stato NON toccato")
        return 1

    stato = engine.carica_stato(DATA / "bases.json")
    try:      # range corretti a mano dal sito: {"TICKER|TF": {"top":…, "bottom":…}}
        overrides = json.loads((DATA / "override.json").read_text(encoding="utf-8"))
    except Exception:
        overrides = {}
    eventi, serie, titoli = [], {}, {}
    for t, d in prezzi.items():
        giorn = detect.barre_chiuse_giornaliere(d, adesso)
        sett = detect.settimanali_chiuse(giorn, adesso)
        try:
            eventi += engine.aggiorna_titolo(
                stato, t, {"1W": sett["Close"], "1D": giorn["Close"]}, oggi, overrides)
        except Exception as e:
            print(f"⚠️ {t}: {type(e).__name__}: {e}")
        if not giorn.empty:   # massimo storico sui dati scaricati (rettificati)
            i_ath = giorn["High"].idxmax()
            ath, ult = float(giorn["High"].max()), float(giorn["Close"].iloc[-1])
            titoli[t] = {"ath": round(ath, 4), "ath_data": str(i_ath)[:10],
                         "dist_ath": round(ult / ath - 1, 4), "ultimo": round(ult, 4)}
        for tf, df in (("1W", sett), ("1D", giorn)):
            b = stato.get(f"{t}|{tf}")
            # il grafico serve per le basi attive e per le uscite osservate da noi;
            # le uscite «storiche» (già uscite alla prima vista) restano solo in tabella.
            if b and (b["stato"] in ("rallenta", "in_range") or not b.get("prima_vista")):
                serie.setdefault(t, {})[tf] = bio.serie_grafico(df, BARRE_GRAFICO[tf])
    # titoli usciti dall'elenco del vecchio portale: si tolgono
    for k in [k for k in stato if k.split("|")[0] not in prezzi]:
        stato.pop(k)

    engine.salva_stato(stato, DATA / "bases.json")
    sito = SITO
    sito.mkdir(parents=True, exist_ok=True)
    (sito / "index.json").write_text(json.dumps(
        {"aggiornato": adesso.isoformat(timespec="seconds"),
         "titoli": {t: v for t, v in titoli.items() if any(k.startswith(t + "|") for k in stato)},
         "basi": [{"chiave": k, **v} for k, v in sorted(stato.items())]},
        ensure_ascii=False), encoding="utf-8")
    # Un file per titolo, una barra per riga: i commit giornalieri restano piccoli
    # (git salva solo le righe cambiate) e il sito scarica solo i grafici che apre.
    cartella = sito / "serie"
    cartella.mkdir(exist_ok=True)
    for vecchio in cartella.glob("*.json"):
        vecchio.unlink()
    for t, per_tf in serie.items():
        corpo = ",\n".join(
            f'"{tf}":[\n' + ",\n".join(json.dumps(b, separators=(",", ":")) for b in barre) + "\n]"
            for tf, barre in per_tf.items())
        (cartella / (bio.nome_file(t) + ".json")).write_text("{\n" + corpo + "\n}\n", encoding="utf-8")
    (sito / "serie.json").unlink(missing_ok=True)

    # Fondamentali per il riassunto AI: solo titoli con una card visibile, rinnovati
    # al massimo una volta ogni 7 giorni (Yahoo è lento e i bilanci cambiano di rado).
    fond_dir = sito / "fond"
    fond_dir.mkdir(exist_ok=True)
    visibili = {k.split("|")[0] for k, v in stato.items() if not v.get("prima_vista")}
    for f in fond_dir.glob("*.json"):
        if f.stem not in {bio.nome_file(t) for t in visibili}:
            f.unlink()
    nuovi = 0
    for t in sorted(visibili):
        fp = fond_dir / (bio.nome_file(t) + ".json")
        try:
            vecchio = json.loads(fp.read_text(encoding="utf-8"))
            if (oggi - pd.Timestamp(vecchio["aggiornato"]).date()).days < 7 and vecchio.get("dati") and vecchio.get("v") == 2:
                continue
        except Exception:
            pass
        dati = bio.fondamentali(t)
        fp.write_text(json.dumps({"v": 2, "aggiornato": str(oggi), "dati": dati}, indent=1, ensure_ascii=False, sort_keys=True), encoding="utf-8")
        nuovi += 1
    print(f"Fondamentali aggiornati: {nuovi}/{len(visibili)}")

    uscite = [e for e in eventi if e["tipo"].startswith("uscita")]
    for e in uscite:
        ok = bio.invia_telegram(engine.messaggio(e))
        print(f"{e['tipo']} {e['ticker']} {e['tf']}: Telegram {'ok' if ok else 'NON inviato'}")
    if uscite:
        ogg, corpo = engine.email_uscite(uscite, os.environ.get("SITO_URL", ""))
        print(f"Email uscite: {'ok' if bio.invia_email(ogg, corpo) else 'NON inviata (non configurata o errore)'}")
    print(f"Basi attive: {sum(1 for v in stato.values() if v['stato'] in ('rallenta', 'in_range'))} · "
          f"nuove: {sum(1 for e in eventi if e['tipo'] == 'nuova_base')} · uscite: {len(uscite)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
