# Retest del range dopo l'uscita

Definizione pre-registrata: docs/backtest-retest.md (tolleranza 2%, finestra 30 sedute). Eventi: prima uscita dall'alto di ogni base con alert dal 2016-11-04 · 289 uscite · universo 118 titoli.
Ingresso = apertura della seduta dopo il retest tenuto; eccesso = rendimento − media equal-weight dell'universo; t con errore standard raggruppato per mese.

## T3 · cosa fa il prezzo dopo l'uscita (30 sedute)

```
esito  retest_tenuto  rientro  nessuno  incompleto  senza_prezzi  totale
tf                                                                      
1D                94       48       12           0             0     154
1W                89       28       18           0             0     135
```

Quota sulle uscite con finestra completa:

```
esito retest_tenuto rientro nessuno
tf                                 
1D              61%     31%      8%
1W              66%     21%     13%
```

## Eccesso medio dopo il retest tenuto (ingresso all'apertura successiva)

| timeframe | orizzonte | eccesso |
|---|---|---|
| 1D | 20 sedute | n=93 · media -2.36% · t=-1.76 · hit 47% |
| 1D | 60 sedute | n=93 · media -2.68% · t=-0.97 · hit 41% |
| 1D | 120 sedute | n=92 · media -2.37% · t=-0.77 · hit 41% |
| 1W | 20 sedute | n=89 · media +0.18% · t=0.16 · hit 43% |
| 1W | 60 sedute | n=89 · media -2.56% · t=-1.19 · hit 43% |
| 1W | 120 sedute | n=88 · media +5.53% · t=1.17 · hit 49% |
| tutti | 20 sedute | n=182 · media -1.12% · t=-1.13 · hit 45% |
| tutti | 60 sedute | n=182 · media -2.62% · t=-1.36 · hit 42% |
| tutti | 120 sedute | n=180 · media +1.49% · t=0.48 · hit 45% |

## Confronto con l'ingresso all'uscita (stesse basi, appaiati)

- 20 sedute: differenza (retest − uscita) n=168 · media +0.86% · t=1.58 · hit 55%
- 60 sedute: differenza (retest − uscita) n=168 · media +0.46% · t=1.05 · hit 52%
- 120 sedute: differenza (retest − uscita) n=167 · media +1.62% · t=2.37 · hit 54%

## VERDETTI (criteri fissati in anticipo; a 60 sedute)

- **T1** Retest tenuto: eccesso a 60 sedute > 0, t > 2: -2.62% (t=-1.36, n=182) → **NON DIMOSTRATO**
- **T2** Retest tenuto − uscita (stesse basi): differenza a 60 sedute > 0, t > 2: +0.46% (t=+1.05, n=168) → **NON DIMOSTRATO**

## Sensibilità (ESPLORATIVA: non entra nei verdetti)

| tolleranza | finestra | retest tenuti | quota | eccesso a 60 sedute |
|---|---|---|---|---|
| 1% | 20 | 155 | 54% | n=154 · media -3.87% · t=-2.31 · hit 39% |
| 1% | 30 | 159 | 55% | n=157 · media -4.12% · t=-2.47 · hit 38% |
| 1% | 60 | 162 | 56% | n=160 · media -3.70% · t=-2.16 · hit 39% |
| 2% | 20 | 179 | 62% | n=178 · media -2.19% · t=-1.13 · hit 43% |
| 2% | 30 | 183 | 63% | n=182 · media -2.62% · t=-1.36 · hit 42% ← parametri dei verdetti |
| 2% | 60 | 185 | 64% | n=184 · media -2.32% · t=-1.20 · hit 42% |
| 3% | 20 | 196 | 68% | n=194 · media -0.76% · t=-0.33 · hit 43% |
| 3% | 30 | 199 | 69% | n=197 · media -1.10% · t=-0.47 · hit 43% |
| 3% | 60 | 201 | 70% | n=199 · media -0.86% · t=-0.37 · hit 43% |

Limiti: pochi eventi (potenza bassa: NON VALUTABILE non significa «nessun effetto»); indici attuali (survivorship); nessun costo; eccesso non corretto per beta.
