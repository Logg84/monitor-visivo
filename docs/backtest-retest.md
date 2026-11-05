# Retest del range dopo l'uscita — definizione PRE-REGISTRATA (5/11/2026)

Scritta e pubblicata PRIMA di calcolare qualsiasi numero. Nasce da un'osservazione di Marco:
dopo l'uscita il prezzo spesso torna a provare il livello rotto. L'uscita da sola non ha mostrato
un vantaggio dimostrato (docs/backtest-range.md): si verifica se lo ha il retest tenuto.

## Eventi
Prima uscita dall'alto di ogni base (ticker, tf, inizio), con alert dal 2016-11-04 (ultimi 10 anni,
scelta di Marco): campione «B» del confronto range/punteggi. Il livello rotto è il `top` del range
congelato. Si usano le chiusure e i minimi GIORNALIERI per entrambi i timeframe.

## Classificazione (sequenziale, senza look-ahead)
Partendo dalla seduta DOPO il giorno dell'alert e per al massimo 30 sedute, alla prima seduta t in cui:
1. **rientro**: chiusura ≤ top (l'uscita è fallita);
2. altrimenti **retest tenuto**: minimo ≤ top × 1,02 (il prezzo ha toccato la zona del livello rotto)
   e chiusura > top (ha tenuto).
La condizione 1 ha la precedenza nello stesso giorno. Se non succede nulla entro 30 sedute: **nessun
ritorno**. Se i dati finiscono prima di 30 sedute senza evento: **incompleto** (escluso).
Il retest NON usa mai informazioni successive al giorno t.

## Misure
- Ingresso = apertura della seduta successiva al giorno t del retest tenuto. Eccesso a 20 e 60 sedute
  rispetto alla media equal-weight dell'universo sulla stessa finestra (stesso metodo del backtest range).
- t con errore standard raggruppato per mese (correzione G/(G−1)).

## Verdetti (a 60 sedute, 1D e 1W insieme; per timeframe solo informativo)
- **T1** Retest tenuto: eccesso medio > 0 con t > 2.
- **T2** Retest tenuto meno uscita (stesse basi, appaiati): differenza media > 0 con t > 2.
- «NON VALUTABILE» se meno di 30 eventi o meno di 24 mesi di copertura.
- **T3** (descrittivo): quota di uscite con retest tenuto / rientro / nessun ritorno / incompleto, per timeframe.

## Sensibilità (ESPLORATIVA, non entra nei verdetti)
Tolleranza 1%, 2%, 3% × finestra 20, 30, 60 sedute: numero di eventi, quota e eccesso a 60 sedute.
I parametri dei verdetti sono quelli sopra (2% e 30 sedute) e NON si cambiano dopo aver visto i numeri.

## Limiti
Pochi eventi (potenza bassa, un esito NON VALUTABILE è plausibile); universo = indici attuali (survivorship);
nessun costo; eccesso non corretto per beta; il retest tenuto è per costruzione un sottoinsieme che
«non è tornato sotto il top», ma l'ingresso è dopo la conferma, quindi i rendimenti successivi sono puliti.

## Nota del 5/11/2026 (dopo il primo run)
Il primo run ha usato come «universo» per il benchmark i soli 118 titoli con basi, e non l'universo
completo degli indici (698) previsto da questa definizione: errore di implementazione, corretto nello
script (ora legge `data/universo_indici.txt` e fallisce se manca). I numeri del primo run (T1 −2,62%, t=−1,36;
T2 +0,46%, t=+1,05; 289 uscite) sono SUPERATI: i verdetti validi sono quelli del secondo run. Parametri,
eventi e criteri sono rimasti identici.

## Risultato del secondo run (5/11/2026, benchmark corretto: 693 titoli, 289 uscite)
- T3: retest tenuto 61% (1D) e 66% (1W); rientro 31% / 21%; nessun ritorno 8% / 13%.
- **T1 NON DIMOSTRATO**: eccesso a 60 sedute −1,90% (t=−0,96, n=182).
- **T2 NON DIMOSTRATO**: retest − uscita +0,55% (t=+1,45, n=168).
- Fuori criterio (esplorativo): differenza appaiata a 120 sedute +1,57% (t=2,39); non entra nei verdetti (orizzonte non pre-registrato, più orizzonti provati).
Conclusione: il retest è frequente e va tenuto sotto osservazione come informazione, ma non ha mostrato un vantaggio dimostrato.
