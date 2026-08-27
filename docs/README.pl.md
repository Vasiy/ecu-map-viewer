# Przeglądarka map ECU

Czyta zrzuty firmware Magneti Marelli **IAW 5AM** (Ducati / Moto Morini) przez ich
definicje `.xdf` z TunerPro i rysuje mapy kalibracyjne — zapłon, paliwo i każdą inną
tablicę, którą definicja zawiera — jako powierzchnie 3-D. Kilka firmware'ów leży w jednej
scenie i od razu widać, gdzie kalibracje się rozjeżdżają: stopień tam, gdzie ma być gładko,
niewygładzony szew między punktami siatki, inny kształt na innej platformie.

To strona statyczna: bez budowania, bez zależności, bez sieci. Działa z katalogu, z
kontenera albo z płytki, która sama nadaje punkt dostępowy.

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

## Uruchomienie

### W Dockerze

```bash
docker build -t ecu-map-viewer .
docker run --rm -p 8123:8123 ecu-map-viewer
```

Albo przez Compose:

```bash
docker compose up --build
```

Potem otwórz <http://127.0.0.1:8123/>. Kontener serwuje te same pliki i tym samym
`serve.py`, co uruchomienie lokalne; program w żadnym momencie nie łączy się z internetem.
Inny port ustawia się przy mapowaniu: `docker run --rm -p 9000:8123 ecu-map-viewer`.

### Bez Dockera

Wystarczy Python 3 — jest w macOS i w każdej dystrybucji Linuksa:

```bash
python3 serve.py          # http://127.0.0.1:8123/
python3 serve.py 9000     # inny port
```

Otwarcie `index.html` prosto z dysku też działa, ale z lokalnym serwerem jest bezpieczniej:
niektóre przeglądarki ograniczają to, co strona wczytana przez `file://` może odczytać.

`serve.py` wysyła `Cache-Control: no-store`. Po aktualizacji to istotne: `python3 -m
http.server` nie wysyła żadnych nagłówków pamięci podręcznej, a przeglądarka potrafi
zostawić stary `index.html` obok świeżego `js/app.js`.

## Wczytanie firmware'u

Przeciągnij `.bin` razem z jego `.xdf` na lewy panel albo naciśnij **Wybierz pliki**. **Oba
pliki muszą mieć tę samą nazwę** — `firmware.bin` + `firmware.xdf`. Par może być dowolnie
wiele; każda staje się kartą na liście, z własnym kolorem.

Nazwę na karcie zmienia się na miejscu. To, co wpiszesz, trafia do podpowiedzi pod
kursorem, do legendy i do krzywej przekroju.

### Plik .bin bez swojego .xdf

Karta proponuje wtedy gotową definicję platformy: wbudowany adres głównej mapy zapłonu i
osie wspólne dla tej rodziny sterowników.

| Platforma | Adres |
|---|---|
| Moto Morini Granpasso (23EC) | `0x4856E` |
| Ducati Multistrada 1100 DP | `0x484DE` |
| Ducati 1198 Stock | `0x48634` |
| Ducati Hypermotard 1100 | `0x4856E` |

Gotowa definicja to rozwiązanie awaryjne. Własny XDF jest zawsze lepszy: ma prawdziwe osie,
prawdziwe wzory przeliczeniowe i wszystkie pozostałe tablice.

## Wybór mapy

XDF zawiera dziesiątki tablic, dlatego lista **Mapa** jest pogrupowana:

- **Ta sama mapa na różnych platformach** — role. Ta sama tablica w każdej definicji nazywa
  się inaczej (`Ignition Main advance`, `Ignition - Main`, `Ignition map`); rola je łączy, a
  jeden wybór rysuje wszystkie firmware'y.
- **Powierzchnie (3D)** — dokładne tytuły z definicji.
- **Krzywe (1D)** — tablice jednowymiarowe, rysowane zwykłym wykresem liniowym.

Licznik obok (`2/3`) mówi, w ilu wczytanych firmware'ach jest ta tablica. Ten, w którym jej
nie ma, zostaje oznaczony na czerwono na swojej karcie.

## Porównywanie

- Obrót przeciąganiem, przybliżanie kółkiem; po najechaniu widać obroty, przepustnicę i
  wartość komórki.
- Pole wyboru na karcie pokazuje i ukrywa daną powierzchnię. **Oś z i skale kolorów liczą
  się tylko z widocznych firmware'ów** — ukrycie jednego przeskalowuje scenę do tego, co
  zostało. Garb na jednej mapie nie da się więc spłaszczyć mapą, na którą właśnie nie
  patrzysz.
- Każda powierzchnia ma własną skalę kolorów, więc włączenie jednej nie przemalowuje
  pozostałych.
- Izolinie są rysowane na samej powierzchni i rzutowane na wszystkie trzy płaszczyzny:
  podłogę (obroty × przepustnica), tylną ścianę (przepustnica × wartość) i boczną
  (obroty × wartość).

**Różnica** czyni wybraną bazę odniesieniem i pokazuje pozostałe jako odchyłkę od niej.
Punkty osi różnią się między platformami (2,4° wobec 2,2° w pierwszym punkcie
przepustnicy), więc mapa jest przepróbkowywana dwuliniowo na osie bazy, a nie dopasowywana
komórka po komórce.

**Przekrój** tnie mapę przy stałych obrotach albo przy stałym kącie przepustnicy. Cięcie
pojawia się dwa razy: jako linia na samych powierzchniach, każda w kolorze swojego
firmware'u, i jako wykres 2-D pod sceną. Suwak przesuwa oba.

**PNG** zapisuje bieżący widok. Przycisk **i** w prawym górnym rogu ma krótki opis i odnośnik
do tego repozytorium.

## Język i wygląd

Trzynaście języków, przełączane w nagłówku: English, Čeština, Deutsch, Español, Français,
Italiano, Nederlands, Polski, Suomi, Svenska, Ελληνικά, Български, Русский. Dopóki nie
wybierzesz, decyduje język przeglądarki, a w razie braku tłumaczenia — angielski. Motyw
jasny i ciemny; oba wybory przeglądarka zapamiętuje.

## Co jest czytane z XDF

- `<XDFTABLE>` → tytuł, kategorie, trzy osie;
- `EMBEDDEDDATA`: adres, rozmiar komórki, kroki wiersza i kolumny, znaczniki typu (`0x01`
  ze znakiem, `0x02` little-endian, `0x04` zmiennoprzecinkowy), a przy ich braku
  `<DEFAULTS>` z nagłówka;
- `<MATH equation="X/10">` liczy własny parser (metoda stacji rozrządowej), a nie `eval` —
  cudzy XDF nie może wykonywać kodu na stronie;
- wartości osi biorą się z powiązanej tablicy-legendy (`<embedinfo linkobjid=...>`, tak
  pliki 5AM przechowują punkty obrotów i przepustnicy), z własnego adresu osi, ze
  statycznych wpisów `<LABEL>`, a w ostateczności z numeru komórki.

Główna mapa zapłonu w tej rodzinie to 32 punkty obrotów × 20 punktów przepustnicy, `uint16
LE`, kąt = `raw / 10`.

## Testy

```bash
node tests/run.js        # zestaw offline: XML, wzory, odczyt binariów, XDF, siatka, języki
```

Testy w przeglądarce wymagają playwrighta i firmware'ów w `testdata/` (katalog poza gitem):

```bash
python3 serve.py &
npm i playwright && npx playwright install chromium
node tests/browser.mjs   # izolinie, zakresy osi, przekrój, różnica, PNG
```
