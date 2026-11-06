"""Test di scripts/alert_condiviso.py su un repo git temporaneo (nessuna rete, Telegram simulato)."""
import io
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import pandas as pd

RADICE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RADICE)); sys.path.insert(0, str(RADICE / "scripts"))
import alert_condiviso as A  # noqa: E402
from core import portafoglio_condiviso as C  # noqa: E402


def ok(n, c):
    print(("✓ " if c else "✗ ") + n)
    if not c:
        raise SystemExit(1)


def commit(d, df, msg):
    p = Path(d) / C.REL_TRADES; p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(C.normalizza(df).to_csv(index=False), encoding="utf-8")
    subprocess.run(["git", "add", "-A"], cwd=d, check=True)
    subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", msg], cwd=d, check=True)


riga = {"ID": "a1", "Ticker": "MU", "Direzione": "Long", "Data_Ingresso": "2026-11-06", "Prezzo_Ingresso": 90.0, "Quantita": 2.0, "SL": 80.0, "Stato": "Aperto"}
with tempfile.TemporaryDirectory() as d:
    subprocess.run(["git", "init", "-q"], cwd=d, check=True)
    cwd = os.getcwd(); os.chdir(d)
    try:
        commit(d, pd.DataFrame([riga]), "nuovo")
        m = A.messaggi_da_git()
        ok("primo commit → avviso di nuovo trade", len(m) == 1 and "MU" in m[0])
        commit(d, pd.DataFrame([{**riga, "SL": 85.0}]), "sl")
        m = A.messaggi_da_git()
        ok("SL cambiato → avviso livelli", len(m) == 1 and "MU" in m[0])
        commit(d, pd.DataFrame([{**riga, "SL": 85.0, "Stato": "Chiuso", "Prezzo_Uscita": 99.0, "Data_Uscita": "2026-11-07"}]), "chiuso")
        m = A.messaggi_da_git()
        ok("chiusura → avviso di chiusura", len(m) == 1 and "MU" in m[0])
        commit(d, pd.DataFrame([{**riga, "SL": 85.0, "Stato": "Chiuso", "Prezzo_Uscita": 99.0, "Data_Uscita": "2026-11-07", "Motivazione": "x"}]), "nota")
        ok("solo nota cambiata → nessun avviso", A.messaggi_da_git() == [])
    finally:
        os.chdir(cwd)
print("OK: verifica_alert_condiviso")
