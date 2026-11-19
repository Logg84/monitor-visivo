# Scheduler del Worker (workflow lanciati con precisione)

Il Worker Cloudflare lancia i workflow dei due repo con `workflow_dispatch`, all'ora UTC prevista, invece di aspettare i
cron di GitHub (che possono ritardare anche di ore). Stato: **16/11/2026** — pilota riuscito (canary lanciato alle 12:30:13 UTC;
quel giorno il cron di GitHub non ha lanciato lo screening delle 06:30 né gli alert delle 07:00 e 11:00, e il report delle
05:00 è partito alle 13:20). **Migrati al Worker**: canary (lun 12:30), report quindicinale (lun 05:00), screening (14:30,
18:30, 22:00; il 06:30 è stato tolto il 19/11: Yahoo non dà le barre europee del giorno prima prima dell'apertura) e alerts (07:00, 11:00, 17:00, 21:30), tutti lun-ven tranne canary e report. Gli altri lavori sono definiti
ma spenti.

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

## Modifiche del 16/11/2026
- **Alerts delle 15:50 spostati alle 17:00 UTC** (id `alerts-1700`): d'inverno le borse europee chiudono alle 16:30 UTC, quindi il run delle 15:50
  lavorava su barre europee ancora aperte; alle 17:00 sono chiuse tutto l'anno.
- **Screening serale spostato da 21:45 a 22:00 UTC** (id `screening-2200`): sta a 30 minuti dagli alert delle 21:30 e resta dopo
  la chiusura USA (21:00 UTC con l'ora solare), quindi il file storico del giorno è a barre complete.
- Dal workflow del repo privato va tolto lo `schedule:` per canary, report quindicinale, screening e alerts (resta
  `workflow_dispatch:`). Gli script non distinguono cron e dispatch (nessun input in screening/alerts; il report ha
  `force` = false di default), quindi il comportamento è identico.
- **Nessun paracadute**: senza lo `schedule:` su GitHub, se il Worker fallisce due volte nella finestra di 10 minuti il lavoro
  salta e non viene recuperato. Controllare il riquadro «scheduler» della Vista unificata (esito `errore`).
- `settori` (22:00) resta spento: quando si migra va spostato dopo lo screening (es. 22:30, con `strumenti` a 23:00).

## Da sistemare prima di accendere tutto il resto
Coppie a meno di 30 minuti nel repo privato (da sfalsare): alerts 07:00 + salute 07:10 + events 07:30 (+ consumo 07:30 il
lunedì); il primo del mese anche indici 06:30 e
macro-calendar 07:00 + alerts 07:00. Con i cron di GitHub il ritardo casuale le nasconde; con orari precisi no.
Controllare anche che gli script trattino allo stesso modo l'input assente (cron) e il valore predefinito (dispatch):
`settori.yml` (`notifica`), `insiders.yml` (`force`), `report_quindicinale.yml` (`force`).
