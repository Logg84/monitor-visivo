"""Verifica su dati SINTETICI (nessuna rete) del riconoscimento di basi."""
import datetime as dt
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from basewatch import detect, engine  # noqa: E402


def check(nome, ok):
    print(("✓ " if ok else "✗ ") + nome)
    if not ok:
        raise SystemExit("CHECK FALLITO: " + nome)


def idx(n, start="2021-01-01", freq="W-FRI"):
    return pd.date_range(start, periods=n, freq=freq)


def lineare(da, a, n):
    return list(np.linspace(da, a, n))


def range_oscillante(centro, ampiezza, n, cicli=3, deriva=0.0):
    """Range con oscillazioni regolari (swing veri) e deriva opzionale (wedge/flag)."""
    t = np.arange(n)
    return list(centro + deriva * t + ampiezza * np.sin(2 * np.pi * cicli * t / n - np.pi / 2))


def costruisci(tratti, freq="W-FRI"):
    v = [x for t in tratti for x in t]
    return pd.Series(v, index=idx(len(v), freq=freq))


sali = lineare(60, 120, 60)
cala = lineare(120, 50, 60)

# 1) Base classica: calo −58% poi range oscillante con 3 cicli → in_range
s = costruisci([sali, cala, range_oscillante(54, 6, 30)])
r = detect.rileva(s, "1W")
check("calo + range oscillante (3 cicli) → in_range", r and r["stato"] == "in_range")
check("4 swing: ≥2 minimi nella zona di bottom e ≥2 massimi sopra",
      r["swing_minimi"] >= 2 and r["swing_massimi"] >= 2)

# 2) Range con pendenza (wedge/flag) accettato
s2 = costruisci([sali, cala, range_oscillante(52, 5, 30, deriva=0.12)])
r2 = detect.rileva(s2, "1W")
check("range con pendenza (wedge/flag) → riconosciuto lo stesso", r2 and r2["stato"] in ("in_range", "rallenta"))

# 3) Troppo pochi swing: una sola oscillazione → resta 'rallenta', non in_range
s3 = costruisci([sali, cala, range_oscillante(54, 6, 30, cicli=1)])
r3 = detect.rileva(s3, "1W")
check("un solo ciclo (meno di 4 swing) → non in_range", r3 is None or r3["stato"] != "in_range")

# 4) Rallentamento: minimo di 5 barre fa → rallenta
s4 = costruisci([sali, cala, [49, 51, 50, 52, 51, 52]])
r4 = detect.rileva(s4, "1W")
check("minimo di 5 barre fa → rallenta", r4 and r4["stato"] == "rallenta")

# 5) Discesa che continua, rimbalzo a V, nessun calo → nessuna base
check("discesa che continua → nessuna base",
      detect.rileva(costruisci([sali, lineare(120, 40, 80)]), "1W") is None)
check("rimbalzo a V (ampiezza > 100%) → nessuna base",
      detect.rileva(costruisci([sali, cala, lineare(50, 130, 20)]), "1W") is None)
check("nessun calo ≥ 25% prima → nessuna base",
      detect.rileva(costruisci([range_oscillante(100, 4, 120, cicli=6)]), "1W") is None)

# 6) WKL-like: range piatto poi SALTO netto → il range NON include le barre di rottura
rng = range_oscillante(60, 6, 30)
s6 = costruisci([sali, cala, rng, [78, 84, 88]])
r6 = detect.rileva(s6, "1W")
check("range + salto netto → uscito_sopra", r6 and r6["stato"] == "uscito_sopra")
check("top = massimo del range PRIMA del salto (le barre di rottura non lo allargano)",
      r6["top"] <= max(rng) + 1e-9 and r6["top"] < 70)

# 7) ADBE-like: risalita graduale dal minimo = parte della base (nessuna uscita)
s7 = costruisci([sali, cala, lineare(50, 80, 20), range_oscillante(72, 8, 24, cicli=3)])
r7 = detect.rileva(s7, "1W")
check("risalita graduale + oscillazione → ancora base, non uscita", r7 and r7["stato"] in ("in_range", "rallenta"))
check("il range comprende la risalita (top ≥ 78)", r7["top"] >= 78)

# 8) TYL-like: ultima chiusura appena oltre il top → uscito_sopra fresco
s8 = costruisci([sali, cala, rng]).copy()
s8.iloc[-1] = float(max(rng)) * 1.01
r8 = detect.rileva(s8, "1W")
check("chiusura appena oltre il top → uscito_sopra", r8 and r8["stato"] == "uscito_sopra")

# ── Motore ───────────────────────────────────────────────────────────────
oggi = dt.date(2026, 11, 2)
base_ok = costruisci([sali, cala, rng])
stato = {}
ev = engine.aggiorna(stato, "AAA", "1W", base_ok, oggi)
check("primo giro: evento nuova_base e stato in_range congelato",
      [e["tipo"] for e in ev] == ["nuova_base"] and stato["AAA|1W"]["stato"] == "in_range"
      and stato["AAA|1W"]["congelato_il"] == str(oggi))
top0, bot0 = stato["AAA|1W"]["top"], stato["AAA|1W"]["bottom"]


def aggiungi(serie_, *valori):
    n0 = len(serie_)
    return pd.concat([serie_, pd.Series(valori, index=idx(n0 + len(valori))[n0:])])


dentro = aggiungi(base_ok, (top0 + bot0) / 2)
ev = engine.aggiorna(stato, "AAA", "1W", dentro, oggi)
check("barra dentro il range: nessun evento, range congelato invariato",
      ev == [] and stato["AAA|1W"]["top"] == top0 and stato["AAA|1W"]["bottom"] == bot0)

su = aggiungi(dentro, top0 * 1.05)
ev = engine.aggiorna(stato, "AAA", "1W", su, oggi)
check("chiusura sopra il top → UNA sola uscita_sopra", [e["tipo"] for e in ev] == ["uscita_sopra"])
check("rielaborando lo stesso dato: nessun secondo alert", engine.aggiorna(stato, "AAA", "1W", su, oggi) == [])
piu_su = aggiungi(su, top0 * 1.2)
check("barre successive più alte: nessun nuovo alert, stato resta uscito_sopra",
      engine.aggiorna(stato, "AAA", "1W", piu_su, oggi) == [] and stato["AAA|1W"]["stato"] == "uscito_sopra")

# l'uscito NON sparisce col tempo (WKL: resta segnalato come uscito)
stato["AAA|1W"]["uscito_il"] = "2026-01-01"
engine.aggiorna(stato, "AAA", "1W", piu_su, oggi)
check("uscito_sopra resta finché non c'è rientro o ripresa di discesa", "AAA|1W" in stato)

# rientro nel range → di nuovo in_range, evento informativo
rientro = aggiungi(piu_su, (top0 + bot0) / 2)
ev = engine.aggiorna(stato, "AAA", "1W", rientro, oggi)
check("rientro nel range: torna in_range con evento 'rientro' (non è un alert)",
      [e["tipo"] for e in ev] == ["rientro"] and stato["AAA|1W"]["stato"] == "in_range"
      and stato["AAA|1W"]["top"] == top0)

# ripresa di discesa dopo uscito_sopra → si riparte da zero
st_r = {}
engine.aggiorna(st_r, "RRR", "1W", base_ok, oggi)
engine.aggiorna(st_r, "RRR", "1W", aggiungi(base_ok, top0 * 1.05), oggi)
engine.aggiorna(st_r, "RRR", "1W", aggiungi(aggiungi(base_ok, top0 * 1.05), bot0 * 0.9), oggi)
check("uscito_sopra poi chiusura sotto il bottom (ripresa di discesa) → stato azzerato",
      "RRR|1W" not in st_r)

# uscita sotto e rientro (spring)
st2 = {}
engine.aggiorna(st2, "BBB", "1W", base_ok, oggi)
giu = aggiungi(base_ok, bot0 * 0.95)
ev = engine.aggiorna(st2, "BBB", "1W", giu, oggi)
check("chiusura sotto il bottom → UNA uscita_sotto",
      [e["tipo"] for e in ev] == ["uscita_sotto"] and st2["BBB|1W"]["stato"] == "uscito_sotto")
check("stesso dato rielaborato: nessun secondo alert", engine.aggiorna(st2, "BBB", "1W", giu, oggi) == [])
ev = engine.aggiorna(st2, "BBB", "1W", aggiungi(giu, (top0 + bot0) / 2), oggi)
check("uscito sotto e poi rientro nel range (spring) → in_range, evento 'rientro'",
      [e["tipo"] for e in ev] == ["rientro"] and st2["BBB|1W"]["stato"] == "in_range")
st2["BBB|1W"].update(stato="uscito_sotto", uscito_il="2026-06-01")
engine.aggiorna(st2, "BBB", "1W", giu, oggi)
check("uscito_sotto senza nuova base da oltre 90 giorni → sparisce", "BBB|1W" not in st2)

# settimanale e giornaliero indipendenti: l'uscita dal giornaliero avvisa anche
# se il settimanale è ancora in range
st3 = {}
w = base_ok
d = pd.Series(base_ok.values, index=idx(len(base_ok), freq="B"))
ev = engine.aggiorna_titolo(st3, "CCC", {"1W": w, "1D": d}, oggi)
check("stessa base su settimanale e giornaliero → entrambi tracciati",
      sorted(k.split("|")[1] for k in st3 if k.startswith("CCC|")) == ["1D", "1W"])
check("due eventi nuova_base (uno per timeframe)", [e["tipo"] for e in ev].count("nuova_base") == 2)
top_d = st3["CCC|1D"]["top"]
d_su = pd.concat([d, pd.Series([top_d * 1.05], index=[d.index[-1] + pd.offsets.BDay(1)])])
ev = engine.aggiorna_titolo(st3, "CCC", {"1W": w, "1D": d_su}, oggi)
check("uscita dal range giornaliero con il settimanale ancora in range → alert uscita_sopra 1D",
      [(e["tipo"], e["tf"]) for e in ev] == [("uscita_sopra", "1D")] and st3["CCC|1W"]["stato"] == "in_range")

# range modificato a mano
w_o = w.copy()
ult = float(w_o.iloc[-1])
st_o = {}
engine.aggiorna_titolo(st_o, "OVR", {"1W": w_o}, oggi)
ov = {"OVR|1W": {"top": ult * 1.10, "bottom": ult * 0.90}}
ev = engine.aggiorna_titolo(st_o, "OVR", {"1W": w_o}, oggi, ov)
check("override: range sostituito, stato in_range, nessun alert",
      ev == [] and st_o["OVR|1W"]["stato"] == "in_range" and abs(st_o["OVR|1W"]["top"] - ult * 1.10) < 1e-3
      and st_o["OVR|1W"]["manuale"])
w_fuori = pd.concat([w_o, pd.Series([ult * 1.2], index=[w_o.index[-1] + pd.offsets.Week(weekday=4)])])
ev = engine.aggiorna_titolo(st_o, "OVR", {"1W": w_fuori}, oggi, ov)
check("override: chiusura fuori dal range manuale → alert uscita_sopra",
      [e["tipo"] for e in ev] == ["uscita_sopra"] and st_o["OVR|1W"]["stato"] == "uscito_sopra")
ov2 = {"OVR|1W": {"top": ult * 1.5, "bottom": ult * 0.9}}
ev = engine.aggiorna_titolo(st_o, "OVR", {"1W": w_fuori}, oggi, ov2)
check("override cambiato dopo l'uscita: si riallinea senza alert e torna in_range",
      ev == [] and st_o["OVR|1W"]["stato"] == "in_range")
st_z = {}
engine.aggiorna_titolo(st_z, "ZZZ", {"1W": w_o}, oggi, {"ZZZ|1W": {"top": 1, "bottom": 5}})
check("override non valido (top<bottom) ignorato: resta il calcolo automatico",
      "ZZZ|1W" in st_z and "manuale" not in st_z["ZZZ|1W"])

# salvataggio/ricarico
with tempfile.TemporaryDirectory() as tmp:
    p = Path(tmp) / "bases.json"
    engine.salva_stato(stato, p)
    check("stato salvato e ricaricato identico", engine.carica_stato(p) == stato)
    check("file assente → stato vuoto", engine.carica_stato(Path(tmp) / "x.json") == {})
    p.write_text("{rotto")
    check("JSON corrotto → stato vuoto, nessun crash", engine.carica_stato(p) == {})

# ── Barre chiuse ─────────────────────────────────────────────────────────
gg = pd.bdate_range("2026-10-26", "2026-10-30")
dd = pd.DataFrame({"Open": 1, "High": 1, "Low": 1, "Close": np.arange(len(gg), dtype=float) + 1}, index=gg)
check("settimana in corso (mercoledì): barra settimanale NON chiusa",
      len(detect.settimanali_chiuse(dd.iloc[:3], pd.Timestamp("2026-10-28 23:00", tz="UTC"))) == 0)
w5 = detect.settimanali_chiuse(dd, pd.Timestamp("2026-10-30 23:00", tz="UTC"))
check("venerdì a mercato chiuso: settimana chiusa", len(w5) == 1 and float(w5["Close"].iloc[-1]) == 5.0)
d2 = pd.concat([dd, dd.iloc[:1].set_index(pd.DatetimeIndex(["2026-11-02"]))])
check("lunedì dopo: settimana precedente chiusa, la nuova no",
      len(detect.settimanali_chiuse(d2, pd.Timestamp("2026-11-02 12:00", tz="UTC"))) == 1)
check("oggi alle 15:00 UTC: barra giornaliera di oggi scartata (parziale)",
      len(detect.barre_chiuse_giornaliere(dd, pd.Timestamp("2026-10-30 15:00", tz="UTC"))) == len(dd) - 1)
check("oggi alle 22:30 UTC: barra giornaliera valida",
      len(detect.barre_chiuse_giornaliere(dd, pd.Timestamp("2026-10-30 22:30", tz="UTC"))) == len(dd))

# ── Email ────────────────────────────────────────────────────────────────
import os  # noqa: E402
from unittest import mock  # noqa: E402

from basewatch import io as bio  # noqa: E402

exs = [{"ticker": "AAA", "tf": "1D", "tipo": "uscita_sopra", "bottom": 10, "top": 12, "chiusura": 13, "data": "2026-11-02"},
       {"ticker": "BBB", "tf": "1W", "tipo": "uscita_sotto", "bottom": 20, "top": 25, "chiusura": 19, "data": "2026-11-02"}]
ogg, corpo = engine.email_uscite(exs, "https://sito.test")
check("email: un solo messaggio riepilogativo con tutte le uscite e il link",
      "2 uscite" in ogg and "AAA" in corpo and "BBB" in corpo and "https://sito.test" in corpo)
check("email: oggetto singolare con 1 uscita", "1 uscita" in engine.email_uscite(exs[:1])[0])
os.environ.pop("SMTP_USER", None)
check("email non configurata → False, nessuna eccezione", bio.invia_email("o", "t") is False)
os.environ.update(SMTP_USER="m@x.it", SMTP_PASSWORD="pw", EMAIL_TO="a@x.it, b@x.it")
with mock.patch("smtplib.SMTP") as smtp:
    check("email configurata → True", bio.invia_email("ogg", "testo") is True)
    srv = smtp.return_value.__enter__.return_value
    inviato = srv.send_message.call_args[0][0]
    check("email: STARTTLS, login e due destinatari",
          srv.starttls.called and srv.login.called and inviato["To"] == "a@x.it, b@x.it" and inviato["Subject"] == "ogg")
with mock.patch("smtplib.SMTP", side_effect=OSError("rete giù")):
    check("email con errore di rete → False, nessuna eccezione", bio.invia_email("o", "t") is False)
for k in ("SMTP_USER", "SMTP_PASSWORD", "EMAIL_TO"):
    os.environ.pop(k, None)


# ── riallineo dopo rettifica retroattiva dei prezzi (split/dividendi, auto_adjust) ──
base_r = costruisci([lineare(100, 60, 30), range_oscillante(60, 6, 60, cicli=4)])
st_r = {}
engine.aggiorna(st_r, "SPL", "1W", base_r, dt.date(2026, 11, 6))
b0 = dict(st_r["SPL|1W"])
check("riallineo: base congelata in_range", b0["stato"] == "in_range")
dimezzata = base_r / 2          # frazionamento 2:1: tutta la storia rettificata
ev_r = engine.aggiorna(st_r, "SPL", "1W", dimezzata, dt.date(2026, 11, 9))
b1 = st_r["SPL|1W"]
check("riallineo: split 2:1 → nessuna uscita falsa, stato resta in_range", ev_r == [] and b1["stato"] == "in_range")
check("riallineo: top/bottom riscalati (÷2) e fattore registrato",
      abs(b1["top"] - b0["top"] / 2) < 1e-3 and abs(b1["bottom"] - b0["bottom"] / 2) < 1e-3 and abs(b1["fattore"] - 0.5) < 1e-6)
engine.aggiorna(st_r, "SPL", "1W", dimezzata, dt.date(2026, 11, 10))
check("riallineo: secondo giro con gli stessi dati non cambia più nulla", st_r["SPL|1W"]["riallineato_il"] == "2026-11-09")
rett = base_r * 0.99            # dividendo: storico -1%
engine.aggiorna(st_r, "DIV", "1W", base_r, dt.date(2026, 11, 6))
d0 = dict(st_r["DIV|1W"]); engine.aggiorna(st_r, "DIV", "1W", rett, dt.date(2026, 11, 9))
check("riallineo: rettifica dividendo (-1%) riscala i livelli", abs(st_r["DIV|1W"]["top"] - d0["top"] * 0.99) < 1e-3)
engine.aggiorna(st_r, "NOP", "1W", base_r, dt.date(2026, 11, 6)); n0 = dict(st_r["NOP|1W"])
engine.aggiorna(st_r, "NOP", "1W", base_r, dt.date(2026, 11, 9))
check("riallineo: dati identici → nessun riallineo", "riallineato_il" not in st_r["NOP|1W"] and st_r["NOP|1W"]["top"] == n0["top"])
print("\nTUTTI I CHECK PASSATI (verifica_basi)")
