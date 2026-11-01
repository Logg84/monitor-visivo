# basewatch — basi di accumulo (portale separato)

Legge i titoli già filtrati dal vecchio portale (monitor-trading-marco), riconosce
dal solo prezzo la fine della discesa e il range laterale (weekly e daily),
**congela top e bottom** e avvisa su Telegram quando una chiusura esce dal range.
Il sito (grafici con il range disegnato) è il passo successivo.

## Passi di messa in funzione
1. Crea un repo **privato** (es. `basewatch`) e carica questi file, mantenendo le cartelle.
2. Nel vecchio repo: Settings → Developer settings → Fine-grained token, accesso **solo lettura
   a Contents** su quel repo. Copia il token.
3. Nel NUOVO repo: Settings → Secrets and variables → Actions → New secret:
   `OLD_REPO` (es. `Logg84/monitor-trading-marco`), `OLD_REPO_TOKEN` (il token),
   `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (gli stessi del vecchio portale; più chat separate da virgola).
4. Settings → Actions → General → Workflow permissions → **Read and write**.
5. Actions → bases → Run workflow. Il primo giro riconosce le basi esistenti e NON manda alert
   (gli alert partono solo per le uscite successive).

## Regole
- Solo prezzi di chiusura di barre CHIUSE; l'alert scatta alla chiusura giornaliera (o settimanale) fuori dal range.
- Range congelato appena riconosciuto: non si sposta più finché non esce.
- Nessun punteggio, nessun ordine: informazione sui prezzi.
- Parametri (barre minime, ampiezza massima, calo minimo) in `basewatch/detect.py`, da tarare sui casi reali.
