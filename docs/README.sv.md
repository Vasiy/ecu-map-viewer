# ECU-kartvisare

Läser firmwaredumpar från Magneti Marelli **IAW 5AM** (Ducati / Moto Morini) via deras
`.xdf`-definitioner från TunerPro och ritar kalibreringstabellerna — tändning, bränsle och
varje annan tabell definitionen bär — som 3D-ytor. Flera firmware ligger i samma scen, och
man ser genast var kalibreringarna går isär: ett steg där allt borde vara mjukt, en
oavrundad skarv mellan rutnätspunkter, en annan form på en annan plattform.

Det är en statisk sida: ingen bygge, inga beroenden, inget nät. Den kör från en mapp, från
en container eller från kortet som sänder sin egen accesspunkt.

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

## Starta

### Med Docker

```bash
docker build -t ecu-map-viewer .
docker run --rm -p 8123:8123 ecu-map-viewer
```

Eller med Compose:

```bash
docker compose up --build
```

Öppna sedan <http://127.0.0.1:8123/>. Containern serverar samma filer, genom samma
`serve.py`, som den lokala starten; programmet går aldrig ut på internet. En annan port
sätts vid mappningen: `docker run --rm -p 9000:8123 ecu-map-viewer`.

### Utan Docker

Python 3 räcker — det följer med macOS och varje Linuxdistribution:

```bash
python3 serve.py          # http://127.0.0.1:8123/
python3 serve.py 9000     # annan port
```

Att öppna `index.html` direkt från disken fungerar också, men med en lokal server är det
säkrare: vissa webbläsare begränsar vad en sida laddad via `file://` får läsa.

`serve.py` skickar `Cache-Control: no-store`. Det spelar roll efter en uppdatering:
`python3 -m http.server` skickar inga cache-huvuden alls, och webbläsaren kan behålla en
gammal `index.html` bredvid en färsk `js/app.js`.

## Läsa in firmware

Dra en `.bin` och dess `.xdf` till vänsterpanelen, eller tryck **Välj filer**. **Båda
filerna måste ha samma namn** — `firmware.bin` + `firmware.xdf`. Släpp hur många par du
vill; varje par blir ett kort i listan med egen färg.

Namnet på kortet ändras på plats. Det du skriver är det som står i verktygstipset, i
förklaringen och vid snittkurvan.

### En .bin utan sin .xdf

Kortet erbjuder då en plattformsförinställning: den inbyggda adressen till huvudkartan för
tändning och de axlar som denna styrdonsfamilj delar.

| Plattform | Adress |
|---|---|
| Moto Morini Granpasso (23EC) | `0x4856E` |
| Ducati Multistrada 1100 DP | `0x484DE` |
| Ducati 1198 Stock | `0x48634` |
| Ducati Hypermotard 1100 | `0x4856E` |

Förinställningen är nödlösningen. Din egen XDF är alltid bättre: den bär de riktiga
axlarna, de riktiga omräkningsformlerna och alla övriga tabeller.

## Välja karta

En XDF rymmer dussintals tabeller, så listan **Karta** är grupperad:

- **Samma karta på alla plattformar** — roller. Samma tabell heter olika i varje definition
  (`Ignition Main advance`, `Ignition - Main`, `Ignition map`); en roll för dem samman, och
  ett val ritar alla firmware.
- **Ytor (3D)** — de exakta titlarna ur definitionen.
- **Kurvor (1D)** — endimensionella tabeller, ritade som ett vanligt linjediagram.

Roller täcker huvudkartorna och de vanliga korrigeringarna — delta, luft- och motortemperatur, uppvärmning, fas, maximalt vridmoment. Exakta titlar jämförs utan skiljetecken och utan märken som `[corsaro]`, så `Fuel - Main` och `Fuel Main` hamnar i samma post.

Räknaren intill (`2/3`) säger i hur många inlästa firmware tabellen finns. Den som saknar
den märks med rött på sitt kort.

## Jämföra

- Rotera genom att dra, zooma med hjulet; när du för pekaren över ytan läser du varvtal,
  gasspjäll och cellvärde.
- Kryssrutan på kortet visar och döljer ytan. **Z-axeln och färgskalorna följer bara de
  synliga firmware** — döljer du en skalas scenen om efter det som är kvar. En puckel på en
  karta kan alltså inte plattas till av en karta du inte tittar på.
- Varje yta behåller sin egen färgskala, så att slå på en färgar inte om de andra.
- Nivåkurvor ritas på ytan och projiceras på alla tre planen: golvet (varvtal × gasspjäll),
  bakväggen (gasspjäll × värde) och sidoväggen (varvtal × värde).

**Skillnad** gör den valda basen till referens och visar de övriga som avvikelse mot den.
Brytpunkterna skiljer sig mellan plattformar (2,4° mot 2,2° vid första gasspjällpunkten),
så en karta samplas om bilinjärt på basens axlar i stället för att paras cell för cell.

**Snitt** skär kartan vid ett fast varvtal eller en fast gasspjällvinkel. Snittet syns två
gånger: som en linje på själva ytorna, var och en i sin firmwares färg, och som ett
2D-diagram under scenen. Reglaget flyttar båda.

**PNG** sparar den aktuella vyn. Knappen **i** uppe till höger ger en kort beskrivning och
en länk till detta arkiv.

## Språk och utseende

Tretton språk, valda i sidhuvudet: English, Čeština, Deutsch, Español, Français, Italiano,
Nederlands, Polski, Suomi, Svenska, Ελληνικά, Български, Русский. Tills du väljer avgör
webbläsarens eget språk, annars engelska. Ljust och mörkt tema; båda valen minns
webbläsaren.

## Vad som läses ur XDF-filen

- `<XDFTABLE>` → titel, kategorier, tre axlar;
- `EMBEDDEDDATA`: adress, cellstorlek, rad- och kolumnsteg, typflaggor (`0x01` med tecken,
  `0x02` little endian, `0x04` flyttal), och när flaggorna saknas `<DEFAULTS>` ur huvudet;
- `<MATH equation="X/10">` beräknas av en egen shunting yard-tolk och inte av `eval` — en
  XDF utifrån ska inte köra kod på sidan;
- axelvärden kommer från en länkad förklaringstabell (`<embedinfo linkobjid=...>`, så
  lagrar 5AM-filerna varvtals- och gasspjällpunkterna), från axelns egen adress, från
  statiska `<LABEL>`-rader, eller annars från cellindexet.

Huvudkartan för tändning i den här familjen är 32 varvtalspunkter × 20 gasspjällpunkter,
`uint16 LE`, förtändning = `raw / 10`.

## Tester

```bash
node tests/run.js        # offlinesvit: XML, formler, binärläsning, XDF, rutnät, språk
```

Webbläsarkontrollerna kräver playwright och firmware i `testdata/` (ligger utanför git):

```bash
python3 serve.py &
npm i playwright && npx playwright install chromium
node tests/browser.mjs   # nivåkurvor, axelintervall, snitt, skillnad, PNG
```
