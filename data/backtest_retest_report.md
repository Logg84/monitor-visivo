# Retest del range dopo l'uscita

Definizione pre-registrata: docs/backtest-retest.md (tolleranza 2%, finestra 30 sedute). Eventi: prima uscita dall'alto di ogni base con alert dal 2016-11-04 · 289 uscite · universo 693 titoli.
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
| 1D | 20 sedute | n=93 · media -1.84% · t=-1.23 · hit 47% |
| 1D | 60 sedute | n=93 · media -2.04% · t=-0.71 · hit 43% |
| 1D | 120 sedute | n=92 · media -1.67% · t=-0.53 · hit 42% |
| 1W | 20 sedute | n=89 · media +0.47% · t=0.42 · hit 43% |
| 1W | 60 sedute | n=89 · media -1.74% · t=-0.83 · hit 39% |
| 1W | 120 sedute | n=88 · media +6.35% · t=1.28 · hit 47% |
| tutti | 20 sedute | n=182 · media -0.71% · t=-0.69 · hit 45% |
| tutti | 60 sedute | n=182 · media -1.90% · t=-0.96 · hit 41% |
| tutti | 120 sedute | n=180 · media +2.25% · t=0.68 · hit 44% |

## Confronto con l'ingresso all'uscita (stesse basi, appaiati)

- 20 sedute: differenza (retest − uscita) n=168 · media +0.80% · t=1.59 · hit 54%
- 60 sedute: differenza (retest − uscita) n=168 · media +0.55% · t=1.45 · hit 52%
- 120 sedute: differenza (retest − uscita) n=167 · media +1.57% · t=2.39 · hit 54%

## VERDETTI (criteri fissati in anticipo; a 60 sedute)

- **T1** Retest tenuto: eccesso a 60 sedute > 0, t > 2: -1.90% (t=-0.96, n=182) → **NON DIMOSTRATO**
- **T2** Retest tenuto − uscita (stesse basi): differenza a 60 sedute > 0, t > 2: +0.55% (t=+1.45, n=168) → **NON DIMOSTRATO**

## Sensibilità (ESPLORATIVA: non entra nei verdetti)

| tolleranza | finestra | retest tenuti | quota | eccesso a 60 sedute |
|---|---|---|---|---|
| 1% | 20 | 155 | 54% | n=154 · media -3.17% · t=-1.91 · hit 38% |
| 1% | 30 | 159 | 55% | n=157 · media -3.45% · t=-2.07 · hit 38% |
| 1% | 60 | 162 | 56% | n=160 · media -3.01% · t=-1.76 · hit 39% |
| 2% | 20 | 179 | 62% | n=178 · media -1.49% · t=-0.76 · hit 42% |
| 2% | 30 | 183 | 63% | n=182 · media -1.90% · t=-0.96 · hit 41% ← parametri dei verdetti |
| 2% | 60 | 185 | 64% | n=184 · media -1.64% · t=-0.84 · hit 42% |
| 3% | 20 | 196 | 68% | n=194 · media +0.00% · t=0.00 · hit 42% |
| 3% | 30 | 199 | 69% | n=197 · media -0.36% · t=-0.15 · hit 42% |
| 3% | 60 | 201 | 70% | n=199 · media -0.18% · t=-0.08 · hit 42% |

Limiti: pochi eventi (potenza bassa: NON VALUTABILE non significa «nessun effetto»); indici attuali (survivorship); nessun costo; eccesso non corretto per beta.
