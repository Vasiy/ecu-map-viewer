# Prohlížeč map ECU

Čte výpisy firmwaru Magneti Marelli **IAW 5AM** (Ducati / Moto Morini) přes jejich definice
`.xdf` z TunerPro a kreslí kalibrační tabulky — zapalování, palivo i každou další tabulku,
kterou definice nese — jako 3-D plochy. Několik firmwarů leží v jedné scéně a hned je
vidět, kde se kalibrace rozcházejí: schod tam, kde má být hladko, nevyhlazený šev mezi body
mřížky, jiný tvar na jiné platformě.

Je to statická stránka: žádné sestavování, žádné závislosti, žádná síť. Běží ze složky, z
kontejneru nebo z desky, která sama vysílá přístupový bod.

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

## Spuštění

### V Dockeru

```bash
docker build -t ecu-map-viewer .
docker run --rm -p 8123:8123 ecu-map-viewer
```

Nebo přes Compose:

```bash
docker compose up --build
```

Pak otevřete <http://127.0.0.1:8123/>. Kontejner podává tytéž soubory a týmž `serve.py`
jako místní spuštění; program se v žádnou chvíli nepřipojuje k internetu. Jiný port se
nastaví při mapování: `docker run --rm -p 9000:8123 ecu-map-viewer`.

### Bez Dockeru

Stačí Python 3 — je v macOS i v každé distribuci Linuxu:

```bash
python3 serve.py          # http://127.0.0.1:8123/
python3 serve.py 9000     # jiný port
```

Otevřít `index.html` přímo z disku také funguje, ale s místním serverem je to bezpečnější:
některé prohlížeče omezují, co smí číst stránka načtená přes `file://`.

`serve.py` posílá `Cache-Control: no-store`. Po aktualizaci na tom záleží: `python3 -m
http.server` neposílá žádné hlavičky cache a prohlížeč si může nechat starý `index.html`
vedle čerstvého `js/app.js`.

## Načtení firmwaru

Přetáhněte `.bin` i jeho `.xdf` do levého panelu, nebo stiskněte **Vybrat soubory**.
**Shodná jména se spárují sama** — `firmware.bin` + `firmware.xdf`. Dvojic můžete pustit
kolik chcete; z každé je karta v seznamu s vlastní barvou.

Název na kartě se upravuje přímo na místě. Co napíšete, to se objeví v bublině pod
kurzorem, v legendě i u křivky řezu.

### Jedna definice pro více firmwarů

Shodná jména jsou pohodlí, ne pravidlo. Každá karta nese **výběr definice** se všemi `.xdf`
načtenými v této relaci a s vestavěnými předvolbami; na tutéž definici může ukazovat
libovolně mnoho karet.

Takhle se nejrychleji porovnávají verze jedné kalibrace: pusťte obrazy spolu s jedinou
`.xdf`, jejíž název neodpovídá žádnému z nich, a dostanou ji všechny naráz — konec
kopírování definice pro každý obraz a přejmenovávání kopií. Když pustíte dvě a více
definic, nic se nepředpokládá; vyberte je kartu po kartě.

Volby se pamatují podle názvu souboru, takže tentýž firmware svou definici příště zase
najde.

### Soubory, které zůstávají v zařízení

Se zadaným datovým adresářem — `python3 serve.py --data ~/firmware` — prohlížeč ukáže i to,
co v něm už leží, a soubor načte jedním kliknutím: tytéž soubory není nutné pokaždé
přetahovat. Ručně puštěná `.xdf` se tam uloží, obrazy firmwaru ne — přetáhnout obraz obvykle
znamená podívat se, ne odložit.

Kontejner k tomu připojuje `./data`. Naslouchá na všech rozhraních, takže zápis je tam
odmítnut, dokud není nastaveno `ALLOW_REMOTE_WRITES=1` — což `docker-compose.yml` dělá
otevřeně. Bez datového adresáře žádná knihovna není a stránka se chová přesně jako dřív.

### Soubor .bin bez svého .xdf

Karta pak nabídne předvolbu platformy: zabudovanou adresu hlavní mapy zapalování a osy,
které tato rodina jednotek sdílí.

| Platforma | Adresa |
|---|---|
| Moto Morini Granpasso (23EC) | `0x4856E` |
| Ducati Multistrada 1100 DP | `0x484DE` |
| Ducati 1198 Stock | `0x48634` |
| Ducati Hypermotard 1100 | `0x4856E` |

Předvolba je nouzové řešení. Vlastní XDF je vždy lepší: nese skutečné osy, skutečné
přepočtové vzorce a všechny ostatní tabulky.

## Výběr mapy

XDF obsahuje desítky tabulek, proto je nabídka **Mapa** rozdělená:

- **Stejná mapa na různých platformách** — role. Tatáž tabulka se v každé definici jmenuje
  jinak (`Ignition Main advance`, `Ignition - Main`, `Ignition map`); role je spojí a jedna
  volba vykreslí všechny firmwary.
- **Plochy (3D)** — přesné názvy z definice.
- **Křivky (1D)** — jednorozměrné tabulky, kreslené obyčejným čárovým grafem.

Role pokrývají hlavní mapy i obvyklé korekce — deltu, teplotu vzduchu a motoru, zahřívání, fázi, maximální moment. Přesné názvy se porovnávají bez interpunkce a bez značek typu `[corsaro]`, takže `Fuel - Main` a `Fuel Main` skončí v jedné položce.

Počítadlo vedle (`2/3`) říká, v kolika načtených firmwarech ta tabulka je. Ten, kterému
chybí, je na své kartě označen červeně.

## Porovnávání

- Otáčení tažením, přiblížení kolečkem; po najetí se ukáží otáčky, škrticí klapka a hodnota
  buňky.
- Zaškrtávátko na kartě plochu zobrazuje a skrývá. **Osa z i barevné škály se počítají jen
  z viditelných firmwarů** — skrytí jednoho přeškáluje scénu podle toho, co zbylo. Hrb na
  jedné mapě tak nemůže být zploštěn mapou, na kterou se právě nedíváte.
- Každá plocha si drží vlastní barevnou škálu, takže zapnutí jedné nepřebarví ostatní.
- Vrstevnice se kreslí na samotné ploše a promítají do všech tří rovin: podlahy
  (otáčky × klapka), zadní stěny (klapka × hodnota) a boční (otáčky × hodnota).

**Rozdíl** udělá ze zvoleného základu referenci a ostatní ukáže jako odchylku od něj. Body
os se mezi platformami liší (2,4° proti 2,2° v prvním bodě klapky), proto se mapa
převzorkuje bilineárně na osy základu, místo aby se párovala buňku po buňce.

**Řez** protne mapu při pevných otáčkách nebo při pevném úhlu klapky. Řez se objeví dvakrát:
jako čára na samotných plochách, každá v barvě svého firmwaru, a jako 2-D graf pod scénou.
Posuvník hýbe obojím.

**PNG** uloží aktuální pohled. Tlačítko **i** vpravo nahoře nabízí krátký popis a odkaz na
tento repozitář.

## Přehrání záznamu jízdy

Přetáhněte dekódovaný záznam z **onboard-logger** (`.csv`: `time` a kanály, které ta jízda
zaznamenala) vedle načteného firmwaru, nebo si ho — při běhu jako doplněk — vyberte z
**Uložené jízdy** v bočním panelu. Přiřaďte dva jeho kanály k osám aktuální mapy — otáčky a
škrticí klapka se odhadují pro hlavní mapy zapalování a paliva, když záznam nese oba; každá
jiná tabulka potřebuje ruční volbu, protože nic v XDF neříká, co která osa znamená — a
záznam se přehrává přes vlastní vyhledávání tabulky, buňku po buňce.

Tři pohledy pod scénou:

- **Přehrávání** — hodnota, kterou tabulka předpovídá v čase, vedle toho, co pro ni záznam
  skutečně naměřil (předstih, doba vstřiku…). Rozdíl mezi oběma je každá korekce, kterou
  základní mapa neukazuje; těsná shoda při rovnoměrné jízdě potvrzuje, že přiřazení i
  jednotky jsou správné.
- **Strávený čas** — teplotní mapa ve tvaru tabulky, obarvená podle toho, kolik času jízda
  strávila v každé buňce.
- **Trasa** přímo na ploše: každý vzorek jako malý bod, barevná stopa spojující vše dosud
  ujeté, a červená svislá značka v aktuálním bodě — vše zapínané společně jedním zaškrtávátkem.

Společný posuvník pod scénou řídí všechny tři pohledy najednou, s přehráváním/pauzou a čtyřmi
rychlostmi (**:1** reálný čas, až **:1k** tisíckrát pomaleji) pro podrobné sledování rychlého
přechodového děje. Barva stopy je volba z pěti možností — červená, zelená, modrá, žlutá nebo
bílá — pomocí kulatého tlačítka vedle „Obnovit pohled“; aktuální bod zůstává vždy červený bez
ohledu na volbu, aby se se stopou nikdy nesplýval.

To je poctivé vůči mapám v ustáleném stavu a jejich obvyklým korekcím. Neukazuje přechodné
obohacení při prudkém sešlápnutí plynu — tato korekce se ve skutečném firmwaru počítá podle
rychlosti změny a stavu palivového filmu na stěnách, ne podle tabulky, a záznam vzorkovaný
jednou za sekundu stejně nedokáže rozlišit pár set milisekund.

Přehrávání běží proti všem viditelným firmwarům najednou, takže jedna jízda může ukázat, jak
by na ni odpověděla každá ze dvou kalibrací.

## Jazyk a vzhled

Třináct jazyků, přepínají se v záhlaví: English, Čeština, Deutsch, Español, Français,
Italiano, Nederlands, Polski, Suomi, Svenska, Ελληνικά, Български, Русский. Dokud si
nevyberete, rozhoduje jazyk prohlížeče, jinak angličtina. Světlý a tmavý motiv; obě volby
si prohlížeč pamatuje.

## Co se čte z XDF

- `<XDFTABLE>` → název, kategorie, tři osy;
- `EMBEDDEDDATA`: adresa, velikost buňky, kroky řádků a sloupců, příznaky typu (`0x01` se
  znaménkem, `0x02` little-endian, `0x04` plovoucí řádová čárka), a když příznaky chybí,
  `<DEFAULTS>` z hlavičky;
- `<MATH equation="X/10">` vyhodnocuje vlastní parser (metoda seřaďovacího nádraží), ne
  `eval` — cizí XDF nesmí na stránce spouštět kód;
- hodnoty os pocházejí z propojené tabulky-legendy (`<embedinfo linkobjid=...>`, tak
  soubory 5AM ukládají body otáček a klapky), z vlastní adresy osy, ze statických záznamů
  `<LABEL>`, a když nic z toho není, z indexu buňky.

Hlavní mapa zapalování v této rodině má 32 bodů otáček × 20 bodů klapky, `uint16 LE`,
předstih = `raw / 10`.

## Testy

```bash
node tests/run.js            # offline sada: XML, vzorce, čtení binárky, XDF, mřížka, jazyky
node tests/ui_links.js       # app.js na DOM atrapě: párování a vazby
node tests/ui_library.js     # panel knihovny
python3 tests/serve_test.py  # library API v serve.py
```

Kontroly v prohlížeči potřebují playwright a firmwary v `testdata/` (mimo git):

```bash
python3 serve.py &
npm i playwright && npx playwright install chromium
node tests/browser.mjs   # vrstevnice, rozsahy os, řez, rozdíl, PNG
```

## Jako doplněk pro onboard-logger

Žádné závislosti, žádný build a Plotly leží v `vendor/`, takže stránka běží na desce bez cesty na
internet. `./release-addon.sh` ji zabalí jako doplněk:

```bash
./release-addon.sh    # dist/ecu-map-viewer-addon-<verze>-<sha>.tar.gz
```

Ten archiv se v onboard-loggeru instaluje přes **Config → System → Doplňky**. Deska stránku
servíruje a vedle ní vede úložiště pro definice — nespustí ani řádek tohoto kódu, a odebrání
doplňku odnese i jeho soubory.

Karta Firmware pak ukáže **Zobrazit mapu** vedle *Diff 2 .bin*: zaškrtněte jeden nebo víc obrazů a
otevřou se tady, v kartě, která se použije znovu místo aby se množila. Pusťte `.xdf` jednou a
zůstane na desce, takže další stisk kreslí hned.
