# Scheduler del Worker (workflow lanciati con precisione)

Il Worker Cloudflare lancia i workflow dei due repo con `workflow_dispatch`, all'ora UTC prevista, invece di aspettare i
cron di GitHub (che possono ritardare anche di ore). Stato: **15/11/2026 — pilota** (canary del lunedì); tutto il resto è
definito ma spento.

## Come funziona
- `wrangler.jsonc`: **un solo cron, ogni 5 minuti** (`*/5 * * * *`; il piano Free ammette al massimo 5 espressioni).
- `src/dati.js`, tabella `PIANO`: per ogni lavoro repo, workflow, token, ora UTC (`"HH:MM"`, multiplo di 5), giorni
  (`getUTCDay`: 0 = domenica), eventuale `giornoMese`, e il flag `attivo`.
- A ogni tick il Worker lancia i lavori **attivi** la cui ora cade in `[ora, ora + 10 minuti)`. Se un tick salta o fallisce,
  il successivo lo recupera; `scheduler_log` (esito `ok` nella stessa finestra) impedisce il doppio lancio.
- Nel log (ultime 400 righe, visibile all'amministratore) finiscono solo i lanci riusciti e gli errori, non i tick a vuoto.
- Token: `GITHUB_TOKEN` (repo pubblico) e `PRIVATE_REPO_TOKEN` (repo privato): serve «Actions: Read and write».

## Migrare un lavoro (uno alla volta)
1. Nel repo privato togliere lo `schedule:` dal workflow (resta `workflow_dispatch:`) e caricarlo. **Prima** di questo
   passo il Worker e GitHub lanciano entrambi: va bene solo per la prova.
2. In `PIANO` mettere `attivo: true` e pubblicare. Il test `verifica_dati.mjs` fallisce se due lavori attivi dello stesso
   repo sono a meno di 30 minuti (il gruppo di concurrency `monitor-trading-repo-state` scarta il lavoro in coda
   quando ne arriva un altro).
3. Il giorno dopo controllare `scheduler_log` e l'orario di partenza in Actions.

## Da sistemare prima di accendere tutto
Coppie a meno di 30 minuti nel repo privato (da sfalsare): alerts 07:00 + salute 07:10 + events 07:30 (+ consumo 07:30 il
lunedì); alerts 21:30 + screening 21:45 + settori 22:00; il primo del mese anche indici 06:30 + screening 06:30 e
macro-calendar 07:00 + alerts 07:00. Con i cron di GitHub il ritardo casuale le nasconde; con orari precisi no.
Controllare anche che gli script trattino allo stesso modo l'input assente (cron) e il valore predefinito (dispatch):
`settori.yml` (`notifica`), `insiders.yml` (`force`), `report_quindicinale.yml` (`force`).
