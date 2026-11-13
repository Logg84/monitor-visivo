"""Backtest delle uscite dal range sui prezzi reali. Uso (da Actions → backtest-range):

  python scripts/backtest_range.py [--eventi data/eventi_range.csv] [--anni 20]

Scrive data/backtest_range_report.md e data/backtest_range_eventi.csv.
"""
import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import pandas as pd  # noqa: E402

from basewatch import backtest as bt, io as bio  # noqa: E402


def fmt(s: dict) -> str:
    if not s or s.get("n", 0) < 3:
        return "n<3"
    return f"n={s['n']} · media {s['media'] * 100:+.2f}% · t={s['t']:.2f} · hit {s['hit'] * 100:.0f}%"


def sezione(titolo: str, tab: pd.DataFrame) -> list[str]:
    righe = [f"### {titolo}", ""]
    if tab.empty:
        return righe + ["Nessun evento.", ""]
    mesi = tab["data_alert"].str[:7]
    righe += ["| orizzonte | rendimento medio | eccesso (equal-weight) | MAE mediana |", "|---|---|---|---|"]
    for h in bt.ORIZZONTI:
        r = bt.stat(tab[f"r{h}"], mesi)
        e = bt.stat(tab[f"ecc{h}"], mesi)
        m = tab[f"mae{h}"].median()
        righe.append(f"| {h} sedute | {r['media'] * 100:+.2f}% (n={r['n']}) | {fmt(e)} | {m * 100:.1f}% |"
                     if r["n"] >= 3 else f"| {h} sedute | n<3 | | |")
    return righe + [""]


def fmt_m(m: dict) -> str:
    if not m or m.get("n", 0) < 3:
        return "n<3"
    pf = "∞" if m["pf"] == float("inf") else f"{m['pf']:.2f}"
    r = "" if m["exp_r"] != m["exp_r"] else f" · exp {m['exp_r']:+.2f}R (mediana {m['exp_r_med']:+.2f}R)"
    return f"n={m['n']} · media {m['media'] * 100:+.2f}% · hit {m['hit'] * 100:.0f}% · PF {pf}{r} · DD max {m['dd_max'] * 100:.0f} pt cumulati"


def sezione_metriche(titolo: str, tab: pd.DataFrame, con_r: bool) -> list[str]:
    """Profit factor, expectancy in R, drawdown massimo e N per regime di mercato (a 60 sedute)."""
    righe = [f"### {titolo}", ""]
    if tab.empty:
        return righe + ["Nessun evento.", ""]
    righe.append(f"- tutti: {fmt_m(bt.metriche(tab, con_r=con_r))}")
    if "regime" in tab.columns:
        for reg in ("rialzista", "ribassista"):
            righe.append(f"- mercato {reg}: {fmt_m(bt.metriche(tab[tab['regime'] == reg], con_r=con_r))}")
        righe.append(f"- regime non calcolabile (storico < {bt.SMA_REGIME} sedute): n={int(tab['regime'].isna().sum())}")
    return righe + [""]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--eventi", default=str(ROOT / "data" / "eventi_range.csv"))
    ap.add_argument("--anni", type=int, default=20)
    ap.add_argument("--out", default=str(ROOT / "data"))
    a = ap.parse_args()

    ev = pd.read_csv(a.eventi)
    sopra, sotto = bt.prime_uscite(ev, "sopra"), bt.prime_uscite(ev, "sotto")
    print(f"Eventi nel CSV: {len(ev)} · prime uscite dall'alto: {len(sopra)} · dal basso: {len(sotto)}")
    tickers = sorted(ev["ticker"].unique())
    prezzi = bio.scarica_giornalieri(tickers, anni=a.anni)
    print(f"Prezzi scaricati: {len(prezzi)}/{len(tickers)}")
    if len(prezzi) < max(1, len(tickers) // 2):
        print("::error::Meno della metà dei titoli scaricata: backtest annullato")
        return 1
    pan = bt.pannelli(prezzi)

    risultati = {}
    for nome, tab in (("sopra", sopra), ("sotto", sotto)):
        tab = tab[tab["ticker"].isin(prezzi)]
        risultati[nome] = bt.ritorni(tab, pan)
    reg = bt.regime_mercato(pan)
    for nome in risultati:                       # regime di mercato al giorno dell'alert (solo prezzi, nessun look-ahead)
        risultati[nome]["regime"] = risultati[nome]["data_alert"].map(lambda d: reg.get(pd.Timestamp(d)))
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    pd.concat([risultati["sopra"].assign(direzione="sopra"), risultati["sotto"].assign(direzione="sotto")]) \
        .to_csv(out / "backtest_range_eventi.csv", index=False)

    r = ["# Backtest: prima uscita dal range", "",
         f"Eventi: prima uscita dopo una base riconosciuta · universo {len(prezzi)} titoli · "
         f"orizzonti {bt.ORIZZONTI} sedute · ingresso = apertura della seduta dopo l'alert.", "",
         "Limiti: composizione attuale degli indici (survivorship bias), prezzi rettificati Yahoo, "
         "nessun costo, solo parte tecnica. t con errore standard raggruppato per mese.", ""]
    verdetti = []
    for tf in ("1D", "1W"):
        tab = risultati["sopra"][risultati["sopra"]["tf"] == tf]
        r += sezione(f"Uscita dall'alto — {tf}", tab)
        c = bt.criterio(tab)
        verdetti.append((tf, c))
        if "tot" in c:
            r += [f"Criterio a {bt.ORIZZONTE_CRITERIO} sedute — taglio metà al {c['taglio']}:",
                  f"- totale: {fmt(c['tot'])}", f"- prima metà: {fmt(c['meta1'])}",
                  f"- seconda metà: {fmt(c['meta2'])}",
                  f"- **{'SODDISFATTO' if c['soddisfatto'] else 'NON soddisfatto'}**", ""]
        else:
            r += [f"Criterio: {c['motivo']} (n={c['n']})", ""]
    for tf in ("1D", "1W"):
        r += sezione(f"Uscita dal basso — {tf} (controllo)", risultati["sotto"][risultati["sotto"]["tf"] == tf])
    r += ["## Metriche aggiuntive (a 60 sedute, descrittive: non entrano nel criterio)", "",
          "PF = profit factor (somma dei guadagni / somma delle perdite). Exp = expectancy in multipli di R, con R = distanza "
          f"ingresso → minimo del range (minimo {bt.R_MIN * 100:.0f}%), solo uscite dall'alto. DD max = massimo calo dal picco "
          "della curva che somma i rendimenti degli eventi per data d'alert: indicativo, gli eventi si sovrappongono. "
          f"Regime = indice equal-weight dell'universo sopra/sotto la media a {bt.SMA_REGIME} sedute.", ""]
    for tf in ("1D", "1W"):
        r += sezione_metriche(f"Uscita dall'alto — {tf}", risultati["sopra"][risultati["sopra"]["tf"] == tf], True)
    for tf in ("1D", "1W"):
        r += sezione_metriche(f"Uscita dal basso — {tf} (controllo)", risultati["sotto"][risultati["sotto"]["tf"] == tf], False)
    (out / "backtest_range_report.md").write_text("\n".join(r) + "\n", encoding="utf-8")
    print("\n".join(r))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
