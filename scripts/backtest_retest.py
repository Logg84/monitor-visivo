"""Test del retest dopo l'uscita sui prezzi reali (definizione in docs/backtest-retest.md).
Uso (Actions → backtest-retest):

  python scripts/backtest_retest.py [--eventi data/eventi_range.csv] [--da 2016-11-04] [--anni 11]

Scrive data/backtest_retest_report.md e data/backtest_retest_eventi.csv.
"""
import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import pandas as pd  # noqa: E402

from basewatch import backtest as bt, io as bio, retest as rt  # noqa: E402

DA_DEFAULT = "2016-11-04"
SENS_TOL = (0.01, 0.02, 0.03)
SENS_FINESTRA = (20, 30, 60)


def fmt(s: dict) -> str:
    if not s or s.get("n", 0) < 3 or s["media"] != s["media"]:
        return f"n={s.get('n', 0) if s else 0}"
    t = "n/d" if s["t"] != s["t"] else f"{s['t']:.2f}"
    return f"n={s['n']} · media {s['media'] * 100:+.2f}% · t={t} · hit {s['hit'] * 100:.0f}%"


def righe_report(a: dict, ev: pd.DataFrame, prezzi: dict, da: str) -> list[str]:
    cl = a["classificati"]
    r = ["# Retest del range dopo l'uscita", "",
         f"Definizione pre-registrata: docs/backtest-retest.md (tolleranza {rt.TOL:.0%}, finestra {rt.FINESTRA} sedute). "
         f"Eventi: prima uscita dall'alto di ogni base con alert dal {da} · {len(ev)} uscite · universo {len(prezzi)} titoli.",
         "Ingresso = apertura della seduta dopo il retest tenuto; eccesso = rendimento − media equal-weight dell'universo; "
         "t con errore standard raggruppato per mese.", "",
         "## T3 · cosa fa il prezzo dopo l'uscita (30 sedute)", "", "```",
         rt.quote(cl).to_string(), "```", ""]
    q = rt.quote(cl)
    valid = q[["retest_tenuto", "rientro", "nessuno"]]
    quota = valid.div(valid.sum(axis=1), axis=0) * 100
    r += ["Quota sulle uscite con finestra completa:", "", "```", quota.round(0).astype(int).astype(str).add("%").to_string(), "```", ""]
    r += ["## Eccesso medio dopo il retest tenuto (ingresso all'apertura successiva)", ""]
    if a["retest"].empty:
        r += ["Nessun retest tenuto.", ""]
    else:
        r += ["| timeframe | orizzonte | eccesso |", "|---|---|---|"]
        for nome, sub in (("1D", a["retest"][a["retest"]["tf"] == "1D"]), ("1W", a["retest"][a["retest"]["tf"] == "1W"]),
                          ("tutti", a["retest"])):
            for h in bt.ORIZZONTI:
                r.append(f"| {nome} | {h} sedute | {fmt(bt.stat(sub[f'ecc{h}'], rt.mese(sub)))} |")
        r += ["", "## Confronto con l'ingresso all'uscita (stesse basi, appaiati)", ""]
        for h in bt.ORIZZONTI:
            p = a["appaiati"]
            r.append(f"- {h} sedute: differenza (retest − uscita) " + fmt(bt.stat(p[f"diff{h}"], rt.mese(p))))
        r += [""]
    r += ["## VERDETTI (criteri fissati in anticipo; a 60 sedute)", ""]
    for v in rt.verdetti(a):
        t = "n/d" if v["t"] != v["t"] else f"{v['t']:+.2f}"
        val = "n/d" if v["media"] != v["media"] else f"{v['media'] * 100:+.2f}%"
        r.append(f"- **{v['id']}** {v['testo']}: {val} (t={t}, n={v['n']}) → **{v['esito']}**")
    r += ["", "## Sensibilità (ESPLORATIVA: non entra nei verdetti)", "",
          "| tolleranza | finestra | retest tenuti | quota | eccesso a 60 sedute |", "|---|---|---|---|---|"]
    for tol in SENS_TOL:
        for fin in SENS_FINESTRA:
            b = rt.esiti(ev, prezzi, tol, fin)
            n_ok = int((b["esito"].isin(["retest_tenuto", "rientro", "nessuno"])).sum())
            held = b[b["esito"] == "retest_tenuto"].copy()
            held["data_alert"] = held["data_retest"].dt.strftime("%Y-%m-%d")
            rr = bt.ritorni(held, bt.pannelli(prezzi), (60,)) if len(held) else held.assign(ecc60=float("nan"))
            marca = " ← parametri dei verdetti" if (tol == rt.TOL and fin == rt.FINESTRA) else ""
            r.append(f"| {tol:.0%} | {fin} | {len(held)} | {len(held) / max(n_ok, 1) * 100:.0f}% | "
                     f"{fmt(bt.stat(rr['ecc60'], rt.mese(rr))) if len(held) else 'n=0'}{marca} |")
    r += ["", "Limiti: pochi eventi (potenza bassa: NON VALUTABILE non significa «nessun effetto»); indici attuali "
          "(survivorship); nessun costo; eccesso non corretto per beta."]
    return r


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--eventi", default=str(ROOT / "data" / "eventi_range.csv"))
    ap.add_argument("--da", default=DA_DEFAULT)
    ap.add_argument("--anni", type=int, default=11)
    ap.add_argument("--universo", default=str(ROOT / "data" / "universo_indici.txt"),
                    help="ticker dell'universo per il benchmark equal-weight (come negli altri backtest)")
    ap.add_argument("--out", default=str(ROOT / "data"))
    a = ap.parse_args()

    ev = bt.prima_uscita_per_base(pd.read_csv(a.eventi), a.da)
    print(f"Uscite (prima per base) dal {a.da}: {len(ev)} · 1D {int((ev.tf == '1D').sum())} · 1W {int((ev.tf == '1W').sum())}")
    if not Path(a.universo).exists():
        print(f"::error::File dell'universo non trovato ({a.universo}): senza, il benchmark non sarebbe quello pre-registrato")
        return 1
    tickers = sorted(set(rt.leggi_universo(a.universo)) | set(ev["ticker"].unique()))
    prezzi = bio.scarica_giornalieri(tickers, anni=a.anni)       # benchmark = TUTTO l'universo scaricato
    print(f"Prezzi scaricati: {len(prezzi)}/{len(tickers)} (universo per il benchmark)")
    if len(prezzi) < max(1, len(tickers) // 2):
        print("::error::Meno della metà dei titoli scaricata: test annullato")
        return 1
    ev = ev[ev["ticker"].isin(prezzi)].reset_index(drop=True)
    an = rt.analisi(ev, prezzi)
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    an["classificati"].to_csv(out / "backtest_retest_eventi.csv", index=False)
    testo = "\n".join(righe_report(an, ev, prezzi, a.da)) + "\n"
    (out / "backtest_retest_report.md").write_text(testo, encoding="utf-8")
    print(testo)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
