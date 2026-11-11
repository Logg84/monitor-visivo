# Collegamento automatico del Chat ID Telegram

Il collaboratore apre **Profilo**, preme **Genera codice di collegamento** e scrive `/start CODICE` al bot degli alert.
Il Worker (webhook `/api/telegram/webhook`) collega la chat al suo profilo: niente @userinfobot, niente Chat ID a mano.
Comandi del bot (solo chat private): `/start CODICE`, `/stato`, `/scollega`. Qualsiasi altro messaggio viene ignorato in silenzio.

Finché `TELEGRAM_WEBHOOK_SECRET` non è impostato il pulsante risponde «non ancora attivo» e resta valido l'inserimento manuale del Chat ID.

## Sicurezza (in breve)
- Codice di 8 caratteri casuali, valido 15 minuti, monouso (aggiornamento atomico), uno solo attivo per email.
- Il webhook risponde 403 senza l'header segreto, prima di qualunque lettura del database.
- Il furto di un codice causa al massimo alert deviati sulla chat di chi lo usa; non espone dati. Se un collegamento sostituisce una chat esistente, la vecchia chat riceve un avviso.

## Attivazione (3 passi manuali, una tantum)
1. **Secret nel Worker**: Cloudflare → Workers & Pages → `monitor-visivo` → Settings → Variables and Secrets → Add → tipo **Secret**, nome `TELEGRAM_WEBHOOK_SECRET`, valore = una stringa casuale di 32+ caratteri (solo lettere, numeri, `_` o `-`). Salva e distribuisci.
2. **Access, eccezione sul solo percorso**: Zero Trust → Access → Applications → Add application → Self-hosted, destinazione `monitor-visivo.lorenzetti1984.workers.dev` con percorso `api/telegram/webhook`, policy con azione **Bypass** per *Everyone*. Il percorso più specifico ha la precedenza sull'applicazione che protegge il sito.
   Prova: aprendo nel browser `https://monitor-visivo.lorenzetti1984.workers.dev/api/telegram/webhook` deve comparire `{"errore":"metodo non consentito"}` (risposta del Worker), non la pagina di login.
3. **Registrazione del webhook** (apri questo indirizzo nel browser, sostituendo i due valori; poi svuota la cronologia):
   `https://api.telegram.org/bot<TOKEN_BOT>/setWebhook?url=https://monitor-visivo.lorenzetti1984.workers.dev/api/telegram/webhook&secret_token=<IL_SECRET_DEL_PASSO_1>&drop_pending_updates=true`
   Risposta attesa: `{"ok":true,"result":true,...}`. Verifica con `.../getWebhookInfo`.

Per disattivare: `.../deleteWebhook`.
