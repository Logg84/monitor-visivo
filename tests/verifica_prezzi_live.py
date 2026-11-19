"""Verifica su dati SINTETICI (nessuna rete) del giro «prezzi live»: barra di oggi, fusi, soglie, file di uscita."""
import datetime as dt
import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

import pandas as pd  # noqa: E402

from basewatch import live  # noqa: E402
import prezzi_live  # noqa: E402


def check(nome, ok):
    print(("✓ " if ok else "✗ ") + nome)
    if not ok:
        raise SystemExit("CHECK FALLITO: " + nome)


def serie(date, valori):
    return pd.Series(valori, index=pd.to_datetime(date), dtype=float)


UTC = dt.timezone.utc
# giovedì 19/11/2026 15:00 UTC = seduta USA aperta (10:00 NY) ed europea aperta
ADESSO = dt.datetime(2026, 11, 19, 15, 0, tzinfo=UTC)

r = live.estrai("AAPL", serie(["2026-11-18", "2026-11-19"], [200.0, 204.0]), ADESSO)
check("USA con barra di oggi: prezzo e variazione", r == {"p": 204.0, "v": 2.0})
check("USA senza barra di oggi (ultima = ieri): escluso", live.estrai("AAPL", serie(["2026-11-17", "2026-11-18"], [200.0, 204.0]), ADESSO) is None)
r = live.estrai("BP.L", serie(["2026-11-18", "2026-11-19"], [400.0, 396.0]), ADESSO)
check("Londra con barra di oggi: variazione negativa", r == {"p": 396.0, "v": -1.0})
check("una sola barra: escluso", live.estrai("AAPL", serie(["2026-11-19"], [204.0]), ADESSO) is None)
check("variazione oltre il 50%: escluso (dato sospetto)", live.estrai("AAPL", serie(["2026-11-18", "2026-11-19"], [200.0, 500.0]), ADESSO) is None)
check("prezzo non positivo: escluso", live.estrai("AAPL", serie(["2026-11-18", "2026-11-19"], [200.0, 0.0]), ADESSO) is None)
check("indice e cambio non entrano", live.esclusi_dal_live("^GSPC") and live.esclusi_dal_live("EURUSD=X") and live.esclusi_dal_live("GC=F") and not live.esclusi_dal_live("AAPL"))

# fusi: alle 23:30 UTC di giovedì Wall Street ha ancora la data di giovedì, Tokyo-like non mappato → USA; Londra è già a venerdì? (23:30 UTC = 23:30 GMT: no)
tardi = dt.datetime(2026, 11, 19, 23, 30, tzinfo=UTC)
check("a fine serata UTC il titolo USA ha ancora la data di oggi", live.data_locale("AAPL", tardi) == dt.date(2026, 11, 19))
check("Parigi alle 23:30 UTC è già venerdì (CET)", live.data_locale("MC.PA", tardi) == dt.date(2026, 11, 20))
check("estate: Londra ha UTC+1", live.data_locale("BP.L", dt.datetime(2026, 7, 1, 23, 30, tzinfo=UTC)) == dt.date(2026, 7, 2))

frames = {
    "AAPL": serie(["2026-11-18", "2026-11-19"], [200.0, 204.0]),
    "MSFT": serie(["2026-11-17", "2026-11-18"], [400.0, 402.0]),      # niente barra di oggi
    "BP.L": serie(["2026-11-18", "2026-11-19"], [400.0, 396.0]),
}
c = live.costruisci(frames, 5, ADESSO)
check("corpo: conteggi e titoli", c["richiesti"] == 5 and c["scaricati"] == 3 and c["in_seduta"] == 2 and c["fuori_seduta"] == 1 and list(c["titoli"]) == ["AAPL", "BP.L"])
check("corpo: data in UTC con offset", c["aggiornato"] == "2026-11-19T15:00:00+00:00")

# script: file scritto; < metà scaricati → codice 1 e file precedente intatto
with tempfile.TemporaryDirectory() as d:
    prezzi_live.USCITA = Path(d) / "site" / "data" / "prezzi_live.json"
    prezzi_live.universo = lambda: ["AAPL", "MSFT", "BP.L", "X1", "X2"]
    rc = prezzi_live.main(scarica=lambda tk: dict(frames), adesso=ADESSO)
    f = json.loads(prezzi_live.USCITA.read_text())
    check("main: file scritto, codice 0", rc == 0 and f["in_seduta"] == 2 and f["titoli"]["AAPL"]["p"] == 204.0)
    prima = prezzi_live.USCITA.read_text()
    rc = prezzi_live.main(scarica=lambda tk: {"AAPL": frames["AAPL"]}, adesso=ADESSO)
    check("main: meno della metà scaricata → codice 1 e file precedente invariato", rc == 1 and prezzi_live.USCITA.read_text() == prima)
    check("main: nessun file temporaneo rimasto", not list(prezzi_live.USCITA.parent.glob("*.tmp")))

print("OK: verifica_prezzi_live")
