# Backtest: prima uscita dal range

Eventi: prima uscita dopo una base riconosciuta · universo 678 titoli · orizzonti (20, 60, 120) sedute · ingresso = apertura della seduta dopo l'alert.

Limiti: composizione attuale degli indici (survivorship bias), prezzi rettificati Yahoo, nessun costo, solo parte tecnica. t con errore standard raggruppato per mese.

### Uscita dall'alto — 1D

| orizzonte | rendimento medio | eccesso (equal-weight) | MAE mediana |
|---|---|---|---|
| 20 sedute | -0.54% (n=323) | n=323 · media -0.21% · t=-0.31 · hit 49% | -7.1% |
| 60 sedute | -0.96% (n=323) | n=323 · media -0.25% · t=-0.15 · hit 41% | -13.2% |
| 120 sedute | +2.99% (n=323) | n=323 · media +0.16% · t=0.04 · hit 37% | -18.8% |

Criterio a 60 sedute — taglio metà al 2009-02-06:
- totale: n=323 · media -0.25% · t=-0.15 · hit 41%
- prima metà: n=158 · media -1.13% · t=-0.98 · hit 46%
- seconda metà: n=165 · media +0.59% · t=0.18 · hit 37%
- **NON soddisfatto**

### Uscita dall'alto — 1W

| orizzonte | rendimento medio | eccesso (equal-weight) | MAE mediana |
|---|---|---|---|
| 20 sedute | -1.95% (n=110) | n=110 · media -1.26% · t=-2.18 · hit 36% | -6.6% |
| 60 sedute | -2.60% (n=110) | n=110 · media -4.68% · t=-3.46 · hit 31% | -11.3% |
| 120 sedute | +3.75% (n=110) | n=110 · media -2.53% · t=-0.90 · hit 42% | -13.5% |

Criterio a 60 sedute — taglio metà al 2009-08-14:
- totale: n=110 · media -4.68% · t=-3.46 · hit 31%
- prima metà: n=55 · media -7.95% · t=-5.17 · hit 22%
- seconda metà: n=55 · media -1.41% · t=-0.66 · hit 40%
- **NON soddisfatto**

### Uscita dal basso — 1D (controllo)

| orizzonte | rendimento medio | eccesso (equal-weight) | MAE mediana |
|---|---|---|---|
| 20 sedute | -3.21% (n=453) | n=453 · media -2.21% · t=-3.52 · hit 42% | -13.7% |
| 60 sedute | +1.58% (n=453) | n=453 · media -1.92% · t=-1.66 · hit 42% | -18.0% |
| 120 sedute | +1.34% (n=453) | n=453 · media -1.04% · t=-0.54 · hit 40% | -25.9% |

### Uscita dal basso — 1W (controllo)

| orizzonte | rendimento medio | eccesso (equal-weight) | MAE mediana |
|---|---|---|---|
| 20 sedute | -0.04% (n=138) | n=138 · media -1.04% · t=-0.73 · hit 42% | -11.3% |
| 60 sedute | +6.72% (n=138) | n=138 · media -0.33% · t=-0.12 · hit 49% | -15.2% |
| 120 sedute | +6.38% (n=138) | n=138 · media -1.57% · t=-0.52 · hit 50% | -20.3% |

