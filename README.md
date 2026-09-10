# Campo Asta · Fantacalcio 2026/27

Piattaforma HTML per gestire l’asta a partire dal foglio Excel `Asta_Fantacalcio_2026_barratura_automatica.xlsx`.

## Avvio

Dalla cartella del progetto:

```bash
python3 -m http.server 8765
```

Poi apri [http://localhost:8765](http://localhost:8765).

## Funzioni

- **Asta live**: cerca giocatore, assegna a un fantallenatore con prezzo, barratura automatica
- **Listone**: filtri per ruolo / liberi-presi, ordinamento FVM / PMA / quotazione
- **PMA**: prezzo medio asta Classic ~10 (fonte Fantacalcio-Online), affiancato alla FVM
- **Rose**: rosa per fantallenatore con speso, rimasti e spendibili*
- **Guide**: schede Serie A (modulo, titolari, ballottaggi, consigli)
- **Riepilogo**: confronto budget di tutte le squadre
- **Persistenza**: salvataggio in `localStorage` + Esporta/Importa JSON

## Aggiornare il listone

```bash
python3 scripts/refresh_listone.py
```

Scarica le quotazioni aggiornate da Fantacalcio.it (squadre, QA, FVM).
