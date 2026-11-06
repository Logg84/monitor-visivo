"""Avvisi Telegram del portafoglio condiviso dopo una modifica fatta dal sito (Worker → commit → questo workflow).

Confronta la versione più recente di data/portafoglio_condiviso.csv con la precedente nella storia git
(l'ultimo commit che l'ha toccato) e invia gli stessi messaggi del vecchio portale
(core.portafoglio_condiviso.eventi + invia_alert): nuovo trade, trade chiuso, SL/TP cambiati.
Mai eccezioni non gestite: un avviso mancato non deve far fallire il workflow.
"""
from __future__ import annotations

import io
import subprocess
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from core import portafoglio_condiviso as C  # noqa: E402

REL = C.REL_TRADES


def _git(*args: str) -> str:
    return subprocess.run(["git", *args], check=True, capture_output=True, text=True).stdout


def versione(commit: str) -> pd.DataFrame:
    """Tabella del file in un dato commit (vuota se il file non esisteva ancora)."""
    try:
        return C.normalizza(pd.read_csv(io.StringIO(_git("show", f"{commit}:{REL}"))))
    except Exception:
        return C.vuoto()


def messaggi_da_git() -> list[str]:
    storia = _git("log", "-2", "--format=%H", "--", REL).split()
    if not storia:
        print("Nessuna storia per", REL)
        return []
    nuovo = versione(storia[0])
    vecchio = versione(storia[1]) if len(storia) > 1 else C.vuoto()
    return C.eventi(vecchio, nuovo)


def main() -> int:
    try:
        msgs = messaggi_da_git()
    except Exception as e:  # pragma: no cover - difesa
        print(f"::warning::confronto non riuscito ({type(e).__name__}: {e})")
        return 0
    if not msgs:
        print("Nessuna variazione da notificare.")
        return 0
    inviati = C.invia_alert(msgs)
    print(f"Avvisi: {len(msgs)} da inviare, {inviati} inviati.")
    if inviati == 0:
        print("::warning::avvisi non inviati (controlla TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
