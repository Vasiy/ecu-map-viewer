# ECU-mapviewer

Leest firmwaredumps van Magneti Marelli **IAW 5AM** (Ducati / Moto Morini) via hun
TunerPro-definities `.xdf` en tekent de kalibratietabellen — ontsteking, brandstof en elke
andere tabel die de definitie bevat — als 3D-vlakken. Meerdere firmwares liggen in één
scène over elkaar, en je ziet meteen waar de kalibraties uit elkaar lopen: een trap waar
alles vloeiend hoort te zijn, een niet-verlopen naad tussen rasterpunten, een andere vorm
op een ander platform.

Het is een statische pagina: geen build, geen afhankelijkheden, geen netwerk. Hij draait
vanuit een map, vanuit een container of vanaf het bordje dat zijn eigen accesspoint uitzendt.

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

## Starten

### Met Docker

```bash
docker build -t ecu-map-viewer .
docker run --rm -p 8123:8123 ecu-map-viewer
```

Of met Compose:

```bash
docker compose up --build
```

Open daarna <http://127.0.0.1:8123/>. De container serveert dezelfde bestanden, via
dezelfde `serve.py`, als de lokale start; het programma gaat op geen enkel moment het
internet op. Een andere poort stel je in bij het mappen:
`docker run --rm -p 9000:8123 ecu-map-viewer`.

### Zonder Docker

Python 3 volstaat — het zit in macOS en in elke Linux-distributie:

```bash
python3 serve.py          # http://127.0.0.1:8123/
python3 serve.py 9000     # andere poort
```

`index.html` rechtstreeks van schijf openen werkt ook, maar met een lokale server is het
veiliger: sommige browsers beperken wat een pagina die via `file://` is geladen mag lezen.

`serve.py` stuurt `Cache-Control: no-store`. Na een update telt dat: `python3 -m
http.server` stuurt helemaal geen cache-headers, en de browser kan een oude `index.html`
naast een verse `js/app.js` houden.

## Firmware laden

Sleep een `.bin` met de bijbehorende `.xdf` naar het linkerpaneel, of klik op **Bestanden
kiezen**. **Beide bestanden moeten dezelfde naam hebben** — `firmware.bin` +
`firmware.xdf`. Je mag zoveel paren neerzetten als je wilt; elk paar wordt een kaart in de
lijst met een eigen kleur.

De naam op de kaart pas je ter plekke aan. Wat je typt, staat ook in de tooltip, in de
legenda en bij de doorsnedecurve.

### Een .bin zonder .xdf

De kaart biedt dan een platformvoorinstelling aan: het ingebouwde adres van de
hoofdontstekingsmap en de assen die deze ECU-familie deelt.

| Platform | Adres |
|---|---|
| Moto Morini Granpasso (23EC) | `0x4856E` |
| Ducati Multistrada 1100 DP | `0x484DE` |
| Ducati 1198 Stock | `0x48634` |
| Ducati Hypermotard 1100 | `0x4856E` |

De voorinstelling is de noodoplossing. Je eigen XDF is altijd beter: die bevat de echte
assen, de echte omrekenformules en alle andere tabellen.

## Een map kiezen

Een XDF bevat tientallen tabellen, dus de keuzelijst **Map** is gegroepeerd:

- **Dezelfde map op alle platforms** — rollen. Dezelfde tabel heet in elke definitie anders
  (`Ignition Main advance`, `Ignition - Main`, `Ignition map`); een rol brengt ze samen, en
  één keuze tekent alle firmwares.
- **Vlakken (3D)** — de exacte titels uit de definitie.
- **Curven (1D)** — eendimensionale tabellen, getekend als gewone lijngrafiek.

Rollen dekken de hoofdmaps en de gebruikelijke correcties — delta, lucht- en motortemperatuur, opwarmen, fase, maximumkoppel. Exacte titels worden vergeleken zonder leestekens en zonder markeringen als `[corsaro]`, zodat `Fuel - Main` en `Fuel Main` in één regel belanden.

De teller ernaast (`2/3`) zegt in hoeveel geladen firmwares die tabel zit. De firmware die
hem mist, krijgt een rode melding op zijn kaart.

## Vergelijken

- Draaien door te slepen, zoomen met het wiel; bij aanwijzen lees je toerental, gasklep en
  celwaarde.
- Het vinkje op een kaart toont en verbergt dat vlak. **De z-as en de kleurschalen volgen
  alleen de zichtbare firmwares** — er één verbergen schaalt de scène naar wat overblijft.
  Een bult op één map kan dus niet worden platgedrukt door een map waar je niet naar kijkt.
- Elk vlak houdt zijn eigen kleurschaal, dus één aan- of uitzetten verkleurt de andere niet.
- Contourlijnen liggen op het vlak zelf en worden op alle drie de vlakken geprojecteerd: de
  vloer (toerental × gasklep), de achterwand (gasklep × waarde) en de zijwand
  (toerental × waarde).

**Verschil** maakt de gekozen basis tot referentie en toont de andere als afwijking
daarvan. De rasterpunten verschillen per platform (2,4° tegen 2,2° op het eerste
gaskleppunt), dus een map wordt bilineair op de assen van de basis herbemonsterd in plaats
van cel voor cel gekoppeld.

**Doorsnede** snijdt de map bij een vast toerental of een vaste gasklephoek. De snede
verschijnt twee keer: als lijn op de vlakken zelf, elk in de kleur van zijn firmware, en
als 2D-grafiek onder de scène. De schuif verplaatst beide.

**PNG** bewaart het huidige beeld. De knop **i** rechtsboven geeft een korte beschrijving
en een link naar deze repository.

## Taal en uiterlijk

Dertien talen, te kiezen in de kop: English, Čeština, Deutsch, Español, Français, Italiano,
Nederlands, Polski, Suomi, Svenska, Ελληνικά, Български, Русский. Zolang je niets kiest,
beslist de taal van de browser, anders Engels. Licht en donker thema; beide keuzes onthoudt
de browser.

## Wat er uit de XDF wordt gelezen

- `<XDFTABLE>` → titel, categorieën, drie assen;
- `EMBEDDEDDATA`: adres, celgrootte, rij- en kolomstappen, typevlaggen (`0x01` met teken,
  `0x02` little-endian, `0x04` drijvende komma), en bij ontbrekende vlaggen `<DEFAULTS>` uit
  de kop;
- `<MATH equation="X/10">` wordt door een eigen shunting-yard-parser berekend en niet door
  `eval` — een XDF van elders mag geen code in de pagina uitvoeren;
- aswaarden komen uit een gekoppelde legendatabel (`<embedinfo linkobjid=...>`, zo bewaren
  de 5AM-bestanden de toerental- en gaskleppunten), uit het eigen adres van de as, uit
  statische `<LABEL>`-regels, of anders uit de celindex.

De hoofdontstekingsmap in deze familie is 32 toerentalpunten × 20 gaskleppunten, `uint16
LE`, vervroeging = `raw / 10`.

## Tests

```bash
node tests/run.js        # offline-suite: XML, formules, binair lezen, XDF, raster, talen
```

De browsercontroles hebben playwright nodig en firmware in `testdata/` (staat niet in git):

```bash
python3 serve.py &
npm i playwright && npx playwright install chromium
node tests/browser.mjs   # contourlijnen, asbereiken, doorsnede, verschil, PNG
```
