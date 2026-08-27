# Visualizzatore mappe ECU

Legge i dump del firmware Magneti Marelli **IAW 5AM** (Ducati / Moto Morini) attraverso le
loro definizioni TunerPro `.xdf` e disegna le mappe di calibrazione — accensione,
carburante e ogni altra tabella contenuta nella definizione — come superfici 3-D. Più
firmware stanno nella stessa scena, e si vede subito dove le calibrazioni divergono: un
gradino dove tutto dovrebbe essere liscio, una giunzione non raccordata tra i punti della
griglia, una forma diversa su un'altra piattaforma.

È una pagina statica: niente build, niente dipendenze, niente rete. Gira da una cartella,
da un container o dalla scheda che trasmette il proprio punto di accesso.

[English](../README.md) ·
[Čeština](README.cs.md) ·
[Deutsch](README.de.md) ·
[Español](README.es.md) ·
[Français](README.fr.md) ·
[Italiano](README.it.md) ·
[Nederlands](README.nl.md) ·
[Polski](README.pl.md) ·
[Suomi](README.fi.md) ·
[Svenska](README.sv.md) ·
[Ελληνικά](README.el.md) ·
[Български](README.bg.md) ·
[Русский](README.ru.md)

## Avvio

### Con Docker

```bash
docker build -t ecu-map-viewer .
docker run --rm -p 8123:8123 ecu-map-viewer
```

Oppure con Compose:

```bash
docker compose up --build
```

Poi apri <http://127.0.0.1:8123/>. Il container serve gli stessi file, tramite lo stesso
`serve.py`, dell'avvio locale; il programma non va in internet in nessun momento. Per
un'altra porta cambia la mappatura: `docker run --rm -p 9000:8123 ecu-map-viewer`.

### Senza Docker

Basta Python 3 — c'è in macOS e in ogni distribuzione Linux:

```bash
python3 serve.py          # http://127.0.0.1:8123/
python3 serve.py 9000     # altra porta
```

Aprire `index.html` direttamente dal disco funziona, ma con un server locale è più sicuro:
alcuni browser limitano ciò che una pagina caricata via `file://` può leggere.

`serve.py` manda `Cache-Control: no-store`. Dopo un aggiornamento conta: `python3 -m
http.server` non manda alcuna intestazione di cache, e il browser può tenersi un vecchio
`index.html` accanto a un `js/app.js` appena aggiornato.

## Caricare un firmware

Trascina un `.bin` e il suo `.xdf` nel pannello di sinistra, oppure premi **Scegli i
file**. **I due file devono avere lo stesso nome** — `granpasso.bin` + `granpasso.xdf`.
Puoi lasciare quante coppie vuoi: ognuna diventa una scheda nell'elenco, con il suo colore.

Il nome sulla scheda si modifica sul posto. Quello che scrivi finisce nel suggerimento
sotto il puntatore, nella legenda e sulla curva della sezione.

### Un .bin senza il suo .xdf

La scheda offre allora un preset di piattaforma: l'indirizzo integrato della mappa di
accensione principale e gli assi comuni a questa famiglia di centraline.

| Piattaforma | Indirizzo |
|---|---|
| Moto Morini Granpasso (23EC) | `0x4856E` |
| Ducati Multistrada 1100 DP | `0x484DE` |
| Ducati 1198 Stock | `0x48634` |
| Ducati Hypermotard 1100 | `0x4856E` |

Il preset è un ripiego. Il tuo XDF è sempre meglio: porta gli assi veri, le vere formule di
conversione e tutte le altre tabelle.

## Scegliere una mappa

Un XDF contiene decine di tabelle, perciò il selettore **Mappa** è raggruppato:

- **La stessa mappa su tutte le piattaforme** — i ruoli. La stessa tabella ha un nome
  diverso in ogni definizione (`Ignition Main advance`, `Ignition - Main`, `Ignition map`);
  un ruolo le mette insieme, e una sola scelta disegna tutti i firmware.
- **Superfici (3D)** — i titoli esatti della definizione.
- **Curve (1D)** — le tabelle monodimensionali, disegnate come un normale grafico a linee.

Il contatore accanto (`2/3`) dice in quanti firmware caricati c'è quella tabella. Quello a
cui manca viene segnalato in rosso sulla sua scheda.

## Confrontare

- Rotazione trascinando, zoom con la rotellina; passando sopra si leggono giri, farfalla e
  valore della cella.
- La casella sulla scheda mostra e nasconde la superficie. **L'asse z e le scale di colore
  seguono solo i firmware visibili**: nasconderne uno riscala la scena su ciò che resta.
  Una gobba su una mappa non può quindi essere appiattita da una mappa che non stai
  guardando.
- Ogni superficie tiene la propria scala di colore, quindi accenderne una non ricolora le
  altre.
- Le isolinee sono disegnate sulla superficie e proiettate su tutti e tre i piani: il
  pavimento (giri × farfalla), la parete di fondo (farfalla × valore) e quella laterale
  (giri × valore).

**Differenza** prende la base scelta come riferimento e mostra le altre come scarto
rispetto a essa. I punti degli assi cambiano tra piattaforme (2,4° contro 2,2° al primo
punto di farfalla), perciò una mappa viene ricampionata in modo bilineare sugli assi della
base, non accoppiata cella per cella.

**Sezione** taglia la mappa a giri fissi o ad angolo di farfalla fisso. Il taglio compare
due volte: come linea disegnata sulle superfici stesse, ciascuna nel colore del suo
firmware, e come grafico 2-D sotto la scena. Il cursore muove entrambi.

**PNG** salva la vista corrente. Il pulsante **i**, in alto a destra, ha una breve
descrizione e il link a questo repository.

## Lingua e aspetto

Tredici lingue, si scelgono nell'intestazione: English, Čeština, Deutsch, Español,
Français, Italiano, Nederlands, Polski, Suomi, Svenska, Ελληνικά, Български, Русский.
Finché non scegli, decide la lingua del browser, altrimenti l'inglese. Tema chiaro e tema
scuro; entrambe le scelte restano memorizzate nel browser.

## Cosa viene letto dall'XDF

- `<XDFTABLE>` → titolo, categorie, tre assi;
- `EMBEDDEDDATA`: indirizzo, dimensione della cella, passi di riga e colonna, flag di tipo
  (`0x01` con segno, `0x02` little-endian, `0x04` virgola mobile) e, in assenza di flag,
  `<DEFAULTS>` dall'intestazione;
- `<MATH equation="X/10">` è valutato da un parser shunting-yard e non da `eval` — un XDF
  di provenienza altrui non deve eseguire codice nella pagina;
- i valori degli assi arrivano da una tabella-legenda collegata (`<embedinfo
  linkobjid=...>`, così i file 5AM conservano i punti di giri e farfalla), dall'indirizzo
  proprio dell'asse, da voci `<LABEL>` statiche oppure, se non c'è nulla di tutto ciò,
  dall'indice della cella.

In questa famiglia la mappa di accensione principale è 32 punti di giri × 20 punti di
farfalla, `uint16 LE`, anticipo = `raw / 10`.

## Test

```bash
node tests/run.js        # suite offline: XML, formule, lettura binaria, XDF, griglia, lingue
```

Le verifiche nel browser richiedono playwright e i firmware in `testdata/` (ignorato da
git):

```bash
python3 serve.py &
npm i playwright && npx playwright install chromium
node tests/browser.mjs   # isolinee, intervalli degli assi, sezione, differenza, PNG
```
