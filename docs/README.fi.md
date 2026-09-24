# ECU-karttojen katselin

Lukee Magneti Marellin **IAW 5AM** -ohjainlaitteiden (Ducati / Moto Morini)
firmwarevedoksia niiden TunerPron `.xdf`-määrittelyjen kautta ja piirtää kalibrointitaulukot
— sytytyksen, polttoaineen ja kaikki muutkin määrittelyn taulukot — 3D-pintoina. Useampi
firmware mahtuu samaan näkymään, ja heti näkee, missä kalibroinnit eroavat: porras siellä
missä pitäisi olla tasaista, häivyttämätön sauma hilapisteiden välissä, toisenlainen muoto
toisella alustalla.

Kyseessä on staattinen sivu: ei käännösvaihetta, ei riippuvuuksia, ei verkkoa. Se toimii
kansiosta, kontista tai siltä piirilevyltä, joka jakaa oman tukiasemansa.

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

## Käynnistys

### Dockerilla

```bash
docker build -t ecu-map-viewer .
docker run --rm -p 8123:8123 ecu-map-viewer
```

Tai Composella:

```bash
docker compose up --build
```

Avaa sitten <http://127.0.0.1:8123/>. Kontti tarjoilee samat tiedostot samalla
`serve.py`-palvelimella kuin paikallinen käynnistys; ohjelma ei missään vaiheessa mene
internetiin. Toinen portti asetetaan kartoituksessa:
`docker run --rm -p 9000:8123 ecu-map-viewer`.

### Ilman Dockeria

Python 3 riittää — se tulee macOS:n ja jokaisen Linux-jakelun mukana:

```bash
python3 serve.py          # http://127.0.0.1:8123/
python3 serve.py 9000     # toinen portti
```

`index.html`:n voi avata suoraan levyltäkin, mutta paikallisen palvelimen kanssa on
turvallisempaa: osa selaimista rajoittaa sitä, mitä `file://`-osoitteesta ladattu sivu saa
lukea.

`serve.py` lähettää `Cache-Control: no-store`. Päivityksen jälkeen sillä on väliä: `python3
-m http.server` ei lähetä välimuistiotsakkeita lainkaan, ja selain voi pitää vanhan
`index.html`:n tuoreen `js/app.js`:n rinnalla.

## Firmwaren lataaminen

Raahaa `.bin` ja sen `.xdf` vasempaan paneeliin tai paina **Valitse tiedostot**. **Samat
nimet parittuvat itsestään** — `firmware.bin` + `firmware.xdf`. Pareja saa pudottaa niin
monta kuin haluaa; jokaisesta tulee listaan kortti omalla värillään.

Kortin nimeä muokataan paikan päällä. Se, minkä kirjoitat, näkyy osoittimen alla olevassa
vihjeessä, selitteessä ja leikkauskäyrän kohdalla.

### Yksi määrittely usealle firmwarelle

Samat nimet ovat mukavuus, eivät sääntö. Jokaisessa kortissa on **määrittelyn valinta**,
jossa ovat kaikki istunnossa ladatut `.xdf` ja sisäänrakennetut esiasetukset; miten monta
korttia tahansa saa osoittaa samaan.

Näin vertaat nopeimmin saman kalibroinnin versioita: pudota vedokset yhdessä yhden
sellaisen `.xdf`:n kanssa, jonka nimi ei vastaa yhtäkään niistä, niin se annetaan kaikille
kerralla — enää ei tarvitse kopioida määrittelyä jokaista vedosta varten ja nimetä kopioita
uudelleen. Jos pudotat kaksi tai useamman määrittelyn, mitään ei oleteta; valitse
korttikohtaisesti.

Valinnat muistetaan tiedostonimen mukaan, joten sama firmware löytää määrittelynsä ensi
kerralla uudestaan.

### Laitteelle jäävät tiedostot

Kun käynnistyksessä annetaan datahakemisto — `python3 serve.py --data ~/firmware` — katselin
näyttää myös sen, mitä siellä jo on, ja lataa tiedoston yhdellä napsautuksella: samoja
tiedostoja ei tarvitse raahata joka kerta. Käsin pudotettu `.xdf` tallennetaan sinne,
firmware-vedokset eivät: vedoksen raahaaminen tarkoittaa yleensä katsomista, ei jättämistä.

Kontti liittää samaan tarkoitukseen `./data`. Se kuuntelee kaikkia rajapintoja, joten
kirjoitus torjutaan siellä, ellei `ALLOW_REMOTE_WRITES=1` ole asetettu — minkä
`docker-compose.yml` tekee avoimesti. Ilman datahakemistoa kirjastoa ei ole lainkaan ja sivu
käyttäytyy täsmälleen kuten ennen.

### .bin ilman .xdf-tiedostoa

Kortti tarjoaa silloin alustan esiasetusta: sisäänrakennetun osoitteen sytytyksen
pääkartalle ja akselit, jotka tämä ohjainlaiteperhe jakaa.

| Alusta | Osoite |
|---|---|
| Moto Morini Granpasso (23EC) | `0x4856E` |
| Ducati Multistrada 1100 DP | `0x484DE` |
| Ducati 1198 Stock | `0x48634` |
| Ducati Hypermotard 1100 | `0x4856E` |

Esiasetus on hätävara. Oma XDF on aina parempi: siinä ovat oikeat akselit, oikeat
muunnoskaavat ja kaikki muut taulukot.

## Kartan valinta

XDF sisältää kymmeniä taulukoita, joten **Kartta**-valikko on ryhmitelty:

- **Sama kartta eri alustoilla** — roolit. Sama taulukko on nimetty jokaisessa
  määrittelyssä eri tavalla (`Ignition Main advance`, `Ignition - Main`, `Ignition map`);
  rooli kokoaa ne yhteen, ja yksi valinta piirtää kaikki firmwaret.
- **Pinnat (3D)** — määrittelyn tarkat otsikot.
- **Käyrät (1D)** — yksiulotteiset taulukot, piirrettynä tavallisena viivakuvaajana.

Roolit kattavat pääkartat ja tavanomaiset korjaukset — deltan, ilman ja moottorin lämpötilan, lämmityksen, vaiheen ja suurimman väännön. Tarkkoja otsikoita verrataan ilman välimerkkejä ja ilman `[corsaro]`-tyylisiä merkintöjä, joten `Fuel - Main` ja `Fuel Main` päätyvät samaan riviin.

Vieressä oleva laskuri (`2/3`) kertoo, kuinka monessa ladatussa firmwaressa taulukko on. Se,
josta se puuttuu, merkitään punaisella omaan korttiinsa.

## Vertailu

- Kierrä raahaamalla, zoomaa rullalla; osoittimen alta luet kierrosluvun, kaasuläpän ja
  solun arvon.
- Kortin valintaruutu näyttää ja piilottaa pinnan. **Z-akseli ja väriasteikot seuraavat
  vain näkyviä firmwareja** — yhden piilottaminen skaalaa näkymän jäljelle jääneiden
  mukaan. Yhden kartan kumpua ei siis voi litistää kartta, jota et katso.
- Jokainen pinta pitää oman väriasteikkonsa, joten yhden kytkeminen ei väritä muita
  uudelleen.
- Korkeuskäyrät piirretään itse pinnalle ja projisoidaan kaikille kolmelle tasolle:
  lattialle (kierrosluku × kaasuläppä), takaseinälle (kaasuläppä × arvo) ja sivuseinälle
  (kierrosluku × arvo).

**Erotus** tekee valitusta perustasta vertailukohdan ja näyttää muut poikkeamana siihen.
Akselipisteet eroavat alustojen välillä (2,4° vastaan 2,2° ensimmäisessä
kaasuläppäpisteessä), joten kartta näytteistetään bilineaarisesti perustan akseleille eikä
pariteta solu solulta.

**Leikkaus** halkaisee kartan kiinteällä kierrosluvulla tai kiinteällä kaasuläpän kulmalla.
Leikkaus näkyy kahdesti: viivana itse pinnoilla, kukin oman firmwarensa värillä, ja
2D-kuvaajana näkymän alla. Liukusäädin liikuttaa molempia.

**PNG** tallentaa nykyisen näkymän. Oikean ylänurkan **i**-painike avaa lyhyen kuvauksen ja
linkin tähän repositorioon.

## Ajolokin toisto

Pudota purettu loki **onboard-loggerista** (`.csv`: `time` sekä kanavat, jotka kyseinen ajo
tallensi) ladatun firmwaren viereen, tai — lisäosana ajettaessa — valitse yksi kohdasta
**Tallennetut ajot** sivupaneelissa. Yhdistä kaksi sen kanavaa nykyisen kartan akseleihin —
kierrosluku ja kaasuläppä arvataan sytytyksen ja polttoaineen pääkartoille, kun loki sisältää
molemmat; jokainen muu taulukko vaatii käsin tehdyn valinnan, koska mikään XDF:ssä ei kerro,
mitä kukin akseli tarkoittaa — ja loki toistetaan taulukon oman haun kautta, solu solulta.

Kolme näkymää näkymän alla:

- **Toisto** — taulukon ennustama arvo ajan mukaan, vieressä se, mitä loki todella mittasi
  sille (ennakko, ruiskutusaika…). Näiden kahden ero on jokainen korjaus, jota peruskartta ei
  näytä; läheinen yhteensopivuus tasaisella ajolla vahvistaa, että kanavavastaavuus ja
  yksiköt ovat oikein.
- **Vietetty aika** — kartan muotoinen lämpökartta, väritetty sen mukaan, kuinka kauan ajo
  vietti kussakin solussa.
- **Reitti** itse pinnalla: jokainen näyte pienenä pisteenä, värillinen jälki, joka yhdistää
  tähän mennessä ajetun matkan, ja punainen pystysuora merkki nykyisessä pisteessä — kaikki
  yhdessä päälle kytkettävissä yhdellä valintaruudulla.

Näkymän alla oleva yhteinen vierityspalkki ohjaa kaikkia kolmea näkymää kerralla,
toisto/tauko-painikkeella ja neljällä nopeudella (**:1** reaaliaika, aina **:1k** tuhat kertaa
hitaampaan) nopean siirtymän tarkastelemiseksi yksityiskohtaisesti. Jäljen väri valitaan
viidestä vaihtoehdosta — punainen, vihreä, sininen, keltainen tai valkoinen — "Palauta näkymä"
-painikkeen vieressä olevasta pyöreästä painikkeesta; nykyinen piste pysyy aina punaisena
valinnasta riippumatta, jottei se koskaan sekoitu jälkeen.

Tämä on rehellinen tasaisen kuormituksen kartoista ja niiden tavanomaisista korjauksista. Se
ei näytä äkillisen kaasunavauksen tilapäistä rikastusta — tuo korjaus lasketaan oikeassa
firmwaressa muutosnopeuden ja seinämäkalvon tilan perusteella, ei haulla taulukosta, eikä
kerran sekunnissa näytteistävä loki pystyisi joka tapauksessa erottamaan muutamaa sataa
millisekuntia.

Toisto käy läpi kaikki näkyvät firmwaret yhtä aikaa, joten yksi ajo voi näyttää, miten kumpikin
kalibrointi olisi siihen vastannut.

## Kieli ja ulkoasu

Kolmetoista kieltä, valitaan ylätunnisteesta: English, Čeština, Deutsch, Español, Français,
Italiano, Nederlands, Polski, Suomi, Svenska, Ελληνικά, Български, Русский. Ennen valintaa
ratkaisee selaimen oma kieli, muuten englanti. Vaalea ja tumma teema; selain muistaa
molemmat valinnat.

## Mitä XDF:stä luetaan

- `<XDFTABLE>` → otsikko, luokat, kolme akselia;
- `EMBEDDEDDATA`: osoite, solun koko, rivi- ja sarakeaskeleet, tyyppiliput (`0x01`
  etumerkillinen, `0x02` little-endian, `0x04` liukuluku), ja lippujen puuttuessa otsikon
  `<DEFAULTS>`;
- `<MATH equation="X/10">` lasketaan omalla jäsentimellä (järjestelyratapiha-menetelmä)
  eikä `eval`-kutsulla — muualta tullut XDF ei saa suorittaa koodia sivulla;
- akselien arvot tulevat linkitetystä selitetaulukosta (`<embedinfo linkobjid=...>`, näin
  5AM-tiedostot säilövät kierrosluku- ja kaasuläppäpisteet), akselin omasta osoitteesta,
  staattisista `<LABEL>`-riveistä tai, jos mitään näistä ei ole, solun järjestysnumerosta.

Tämän perheen sytytyksen pääkartta on 32 kierroslukupistettä × 20 kaasuläppäpistettä,
`uint16 LE`, ennakko = `raw / 10`.

## Testit

```bash
node tests/run.js            # offline-sarja: XML, kaavat, binäärin luku, XDF, hila, kielet
node tests/ui_links.js       # app.js DOM-tynkää vasten: parittaminen ja kytkennät
node tests/ui_library.js     # kirjastopaneeli
python3 tests/serve_test.py  # serve.py:n kirjasto-API
```

Selaintarkistukset vaativat playwrightin ja firmwaret hakemistossa `testdata/` (ei gitissä):

```bash
python3 serve.py &
npm i playwright && npx playwright install chromium
node tests/browser.mjs   # korkeuskäyrät, akselien alueet, leikkaus, erotus, PNG
```

## onboard-loggerin lisäosana

Ei riippuvuuksia, ei käännösvaihetta ja Plotly mukana `vendor/`-hakemistossa, joten sivu toimii
kortilla ilman yhteyttä internetiin. `./release-addon.sh` paketoi sen lisäosaksi:

```bash
./release-addon.sh    # dist/ecu-map-viewer-addon-<versio>-<sha>.tar.gz
```

Tuo paketti asennetaan onboard-loggeriin kohdasta **Config → System → Lisäosat**. Kortti tarjoilee
sivun ja pitää sen vierellä varastoa määrittelyille — se ei suorita riviäkään tästä koodista, ja
lisäosan poisto vie sen tiedostot mukanaan.

Firmware-välilehdelle ilmestyy silloin **Näytä kartta** *Diff 2 .bin* -painikkeen viereen: rastita
yksi tai useampi vedos, ja ne avautuvat tänne välilehteen, jota käytetään uudelleen eikä
monisteta. Pudota `.xdf` kerran, niin se jää kortille ja seuraava painallus piirtää heti.
