# Backtest del metodo range — piano (BOZZA, da confermare prima di guardare i dati)

Scopo: capire se le uscite dal range hanno contenuto informativo e se battono gli
alert a punteggio 1–6 del vecchio portale. Il criterio si fissa PRIMA di vedere i
numeri e non si ritocca dopo (stessa regola del backtest sul bonus regime).

## Passo 1 — eventi (questo repo, pubblico)
`scripts/eventi_range.py` rigioca il rilevatore giorno per giorno sullo storico
(stesse regole del giro reale: solo barre chiuse, range congelato, alert alla prima
chiusura fuori range, 1W e 1D indipendenti) e scrive `data/eventi_range.csv`.
Test: `tests/verifica_storico.py` (nessun look-ahead, settimanali identici al giro reale).

Colonne: ticker, tf, tipo (nuova_base | uscita_sopra | uscita_sotto | rientro), data
(barra del segnale), data_alert (giorno in cui l'alert sarebbe arrivato), chiusura,
chiusura_giorno, apertura_succ, bottom, top, inizio, ampiezza, calo, barre, swing_*.

## Passo 2 — rendimenti e confronto
- Ingresso di riferimento: **apertura della seduta successiva** a `data_alert`
  (l'alert arriva dopo la chiusura); in alternativa la chiusura del giorno, come controllo.
- Orizzonti: 20, 60, 120 sedute. Misure: rendimento, **eccesso** sull'universo
  equal-weight nella stessa finestra, hit rate dell'eccesso, max adverse excursion.
- Eventi 1W e 1D analizzati separatamente; uscite dall'alto e dal basso separate.
- Errori standard raggruppati per mese (gli eventi dello stesso periodo sono correlati).

## Definizioni FISSATE il 4/11/2026, prima di vedere i risultati (confermate da Marco)
- **Evento** = PRIMA uscita dall'alto dopo una base riconosciuta dal vivo (nuova_base), per
  ogni (ticker, tf, inizio). Le uscite dopo un rientro e le basi viste a uscita già avvenuta
  non contano (nel CSV sono 10.351 uscite dall'alto, ma solo 732 basi riconosciute dal vivo).
- **Ingresso** = apertura della seduta successiva al giorno dell'alert. **Rendimento a h** =
  chiusura della h-esima seduta dopo il giorno dell'alert / apertura d'ingresso − 1.
- **Eccesso** = rendimento − media equal-weight dell'universo sulla stessa finestra.
- **t** = media / errore standard raggruppato per mese di alert (correzione G/(G−1)).
- **Criterio «il range ha contenuto informativo»**, a 60 sedute, **per ciascun timeframe
  separatamente** (1D e 1W si sovrappongono sullo stesso titolo, non si sommano): eccesso medio
  > 0 con t > 2 in ENTRAMBE le metà (divise a metà degli eventi, per data) e hit rate > 50%.
- Le uscite dal basso e gli orizzonti 20/120 sono solo di controllo: non entrano nel verdetto.
- Se il criterio non è soddisfatto, il range resta solo uno strumento di lettura.
- Non si cambiano soglie, orizzonti o definizioni dopo aver visto i numeri; eventuali varianti
  si dichiarano come esplorative.

## Criterio per «il range batte i punteggi» (da definire con Marco)
Confronto a parità di finestra temporale e universo: eccesso a 60 sedute degli
eventi range contro quello degli alert a punteggio (≥ 4/6), differenza con t > 2 in
entrambe le metà. Il punteggio alla data dell'evento si calcola nel repo privato
leggendo `eventi_range.csv`; il codice dei punteggi non entra qui.

## Limiti da dichiarare nel report
- Universo = titoli di oggi (survivorship bias): gli eventi di titoli poi usciti dal
  listino mancano. Se si usa solo la watchlist attuale, c'è anche selezione sullo stato di oggi.
- Prezzi rettificati di Yahoo, nessun costo di transazione né slippage.
- Fondamentali storici non ricostruibili: il confronto riguarda la parte tecnica.
- Parametri del rilevatore tarati su pochi casi reali (RBLX, WKL, TYL, ADBE): il
  backtest è in parte in-sample sulla forma del range; l'ideale è tenere da parte
  l'ultimo periodo come verifica fuori campione.

## Estensione prevista (dopo)
Retest del range dopo l'uscita (ritorno al top/bottom a ridosso del livello rotto,
con tenuta o fallimento): richiesto da Marco, si aggiunge come evento a parte quando
il passo 2 è chiuso. `eventi_range.csv` contiene già uscite e rientri con i livelli,
da cui il retest si ricava dai prezzi.
