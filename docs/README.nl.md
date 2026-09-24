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
kiezen**. **Gelijke namen koppelen zichzelf** — `firmware.bin` + `firmware.xdf`. Je mag
zoveel paren neerzetten als je wilt; elk paar wordt een kaart in de lijst met een eigen
kleur.

De naam op de kaart pas je ter plekke aan. Wat je typt, staat ook in de tooltip, in de
legenda en bij de doorsnedecurve.

### Eén definitie voor meerdere firmwares

Gelijke namen zijn gemak, geen regel. Elke kaart heeft een **definitiekeuze** met alle
`.xdf` die deze sessie zijn geladen en de ingebouwde presets; willekeurig veel kaarten
mogen naar dezelfde wijzen.

Zo vergelijk je het snelst versies van één kalibratie: zet de images neer samen met één
`.xdf` waarvan de naam bij geen enkele hoort, en die gaat in één keer naar allemaal — geen
kopie van de definitie per image meer, en geen hernoemen. Zet je twee of meer definities
neer, dan wordt niets aangenomen; kies per kaart.

Je keuzes worden per bestandsnaam onthouden, dus dezelfde firmware vindt zijn definitie de
volgende keer terug.

### Bestanden die op het apparaat blijven

Met een datamap — `python3 serve.py --data ~/firmware` — toont de viewer ook wat erin staat
en laadt een bestand met één klik; dezelfde bestanden hoeven er niet elke keer in gesleept
te worden. Een met de hand neergezette `.xdf` wordt daar bewaard, firmware-images niet: een
image erin slepen is meestal kijken, geen afgeven.

De container koppelt `./data` voor hetzelfde doel. Hij luistert op alle interfaces, dus
schrijven wordt daar geweigerd tenzij `ALLOW_REMOTE_WRITES=1` staat — wat
`docker-compose.yml` open en bloot doet. Zonder datamap is er helemaal geen bibliotheek en
gedraagt de pagina zich precies als voorheen.

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

## Een rit-log afspelen

Sleep een gedecodeerd logbestand van **onboard-logger** (`.csv`: `time` plus de kanalen die
die rit vastlegde) naast een geladen firmware, of kies er — als add-on draaiend — een uit
**Opgeslagen ritten** in het zijpaneel. Wijs twee van de kanalen toe aan de assen van de
huidige map — toerental en gasklep worden geraden voor de hoofdmaps van ontsteking en
brandstof wanneer de log beide bevat; elke andere tabel vraagt een handmatige keuze, want
niets in een XDF zegt welke as wat betekent — en de log speelt zich af door de eigen
opzoeking van de tabel, cel voor cel.

Drie weergaven onder de scène:

- **Afspelen** — de door de tabel voorspelde waarde in de tijd, naast wat de log er
  werkelijk voor heeft gemeten (voorontsteking, inspuittijd…). Het verschil tussen beide is
  elke correctie die de basismap niet toont; een nauwe overeenkomst bij rustig cruisen
  bevestigt dat de toewijzing en de eenheden kloppen.
- **Verblijftijd** — een heatmap in de vorm van de map, gekleurd naar hoe lang de rit in elke
  cel doorbracht.
- Een **pad** op het vlak zelf: elke meting als een klein punt, een gekleurd spoor dat alles
  tot nu toe gereden verbindt, en een rode verticale markering op het huidige punt — alles
  samen aan- en uit te zetten met één vinkje.

Een gedeelde schuifbalk onder de scène stuurt alle drie de weergaven tegelijk aan, met
afspelen/pauzeren en vier snelheden — **:1** speelt de hele rit af in ongeveer vijftien
seconden, ongeacht de duur ervan; **:10**/**:100**/**:1k** vertragen dat tempo om een snelle
overgang in detail te bekijken. De kleur van het spoor is een keuze uit vijf — rood,
groen, blauw, geel of wit — via de ronde knop naast "Weergave resetten"; het huidige punt
blijft altijd rood, ongeacht die keuze, zodat het nooit met het spoor versmelt.

Dit is eerlijk over stabiele maps en hun gebruikelijke correcties. Het toont geen tijdelijke
verrijking bij een plotselinge gasstoot — die correctie draait in de echte firmware op de
veranderingssnelheid en de toestand van de wandfilm, niet op een opzoeking, en een log die
eens per seconde bemonstert kan sowieso geen paar honderd milliseconden oplossen.

Afspelen loopt tegelijk tegen elke zichtbare firmware, zodat één rit kan tonen hoe twee
kalibraties er elk op zouden hebben gereageerd.

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
node tests/run.js            # offline-suite: XML, formules, binair lezen, XDF, raster, talen
node tests/ui_links.js       # app.js op een DOM-stub: koppelen en verwijzingen
node tests/ui_library.js     # het bibliotheekpaneel
python3 tests/serve_test.py  # de bibliotheek-API van serve.py
```

De browsercontroles hebben playwright nodig en firmware in `testdata/` (staat niet in git):

```bash
python3 serve.py &
npm i playwright && npx playwright install chromium
node tests/browser.mjs   # contourlijnen, asbereiken, doorsnede, verschil, PNG
```

## Als onboard-logger-add-on

Geen afhankelijkheden, geen buildstap en Plotly in `vendor/`, dus de pagina draait op een board
zonder route naar internet. `./release-addon.sh` verpakt hem als add-on:

```bash
./release-addon.sh    # dist/ecu-map-viewer-addon-<versie>-<sha>.tar.gz
```

Dat archief installeer je in onboard-logger via **Config → System → Add-ons**. Het board serveert
de pagina en houdt er een opslag naast voor de definities — het draait geen regel van deze code, en
het verwijderen van de add-on neemt zijn bestanden mee.

Het tabblad Firmware toont dan **Map tonen** naast *Diff 2 .bin*: vink een of meer images aan en ze
openen hier, in een tabblad dat hergebruikt wordt in plaats van gedupliceerd. Sleep één keer een
`.xdf` erin en die blijft op het board, zodat de volgende druk meteen tekent.
