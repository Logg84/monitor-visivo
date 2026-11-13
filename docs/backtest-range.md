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

## Risultato del 4/11/2026 (universo: 678 titoli, indici attuali; prime uscite dall'alto)
Verdetto pre-registrato (60 sedute, per timeframe): **NON soddisfatto** né per 1D né per 1W.
- 1D: n=323, eccesso medio −0,25%, t=−0,15, hit 41%.
- 1W: n=110, eccesso medio −4,68%, t=−3,46, hit 31%.
Dettaglio completo: `data/backtest_range_report.md`.

Analisi ESPLORATIVA (non entra nel verdetto; fatta dopo aver visto i numeri):
- Il 69% degli eventi cade nel 2007-2009 (1D: 242 su 323; 1W: 60 su 110): il campione è in gran parte uno studio della crisi.
- 2007-2009: 1D eccesso −2,23% (t=−2,13); 1W −7,23% (t=−5,44). Uscite dall'alto durante i rimbalzi di un mercato orso: in prevalenza fallite.
- 2010-2026: 1D n=83, eccesso +5,48% (t=0,95); 1W n=50, eccesso −1,61% (t=−0,69). Nessuno distinguibile da zero.
- Limiti: ~5 eventi l'anno dopo il 2009 (potenza bassa); eccesso non corretto per beta (i titoli dopo un calo ≥25% sono più volatili dell'universo); survivorship bias.
- Cosa NON si può dire: né che il range funzioni né che non funzioni fuori dalla crisi: il campione non basta.

## Confronto range vs punteggi 1–6, ultimi 10 anni (5/11/2026; report nel repo privato, data/backtest/range_punteggi.txt)
Finestra: eventi dal 2016-11-04. Prime uscite dall'alto: B = 289 (269 con punteggio calcolato; 20 senza storia sufficiente), A = 53 con punteggio. 2020 pesa il 31% degli eventi.
- **R1 (range, 60 sedute, campione A):** 1D n=27, eccesso +0,11% (t=0,02); 1W n=26, eccesso −6,48% (t=−2,08, hit 27%). Verdetto NON VALUTABILE (meno di 30 eventi e 20 mesi), ma il segno del 1W conferma il risultato a 20 anni (−4,68%, t=−3,46).
- **S1 (punteggio ≥4 contro <4 dentro le uscite, B, n=96/172):** −1,60 p.p. a 60 sedute (t=−0,33) → NON DIMOSTRATO. Nessuna monotonia per punti.
- **Q3:** uscite B a 20 sedute −0,25% (A: −1,68%) contro il segnale S del backtest core +0,28%: tutti compatibili con zero.
- Conclusione: né il range né il punteggio mostrano un vantaggio dimostrato, e il punteggio non aggiunge informazione dentro le uscite. Non si può dire che il range sia più performante dei punteggi; non si può nemmeno dire il contrario (potenza bassa, survivorship, eccesso non corretto per beta).
- Esplorativo, da non leggere come risultato: uscite fuori zona sconto a 20 sedute −2,68% (t=−2,45, n=45).

## Alert unico (5/11/2026)
L'alert di uscita include ora il punteggio 1–6 dell'ultimo screening (letto da D1) e, per le uscite verso l'alto, la frequenza storica del retest (61–66% entro 30 sedute). Un avviso separato segnala il primo retest tenuto di un'uscita osservata. Sono informazioni di lettura: nessun vantaggio dimostrato (vedi sopra e docs/backtest-retest.md).

## Metriche aggiuntive (13/11/2026, descrittive)

Il report del backtest (`data/backtest_range_report.md`) riporta anche, a 60 sedute e per ogni timeframe: **profit factor**
(somma dei guadagni / somma delle perdite), **expectancy in R** (rendimento / rischio, con rischio = distanza in % tra ingresso e
minimo del range, minimo 1%, solo uscite dall'alto), **drawdown massimo** (calo massimo dal picco della curva che somma i
rendimenti degli eventi per data d'alert: indicativo, gli eventi si sovrappongono) e il **numero di eventi per regime di mercato**
(indice equal-weight dell'universo sopra/sotto la media a 200 sedute, calcolato solo dai prezzi). **Non entrano nel criterio
pre-registrato** del 4/11 e non cambiano nessun segnale: servono a leggere meglio gli stessi eventi.
