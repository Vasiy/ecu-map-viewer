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

Przeciągnij `.bin` razem z jego `.xdf` na lewy panel albo naciśnij **Wybierz pliki**.
**Zgodne nazwy łączą się same** — `firmware.bin` + `firmware.xdf`. Par może być dowolnie
wiele; każda staje się kartą na liście, z własnym kolorem.

Nazwę na karcie zmienia się na miejscu. To, co wpiszesz, trafia do podpowiedzi pod
kursorem, do legendy i do krzywej przekroju.

### Jedna definicja dla wielu firmware'ów

Zgodne nazwy to wygoda, nie reguła. Każda karta ma **wybór definicji** z wszystkimi `.xdf`
wczytanymi w tej sesji i wbudowanymi presetami; dowolnie wiele kart może wskazywać tę samą.

To najszybszy sposób na porównanie wersji jednej kalibracji: upuść obrazy razem z jednym
`.xdf`, którego nazwa nie pasuje do żadnego z nich, a trafi on od razu do wszystkich —
koniec z kopiowaniem definicji dla każdego obrazu i zmienianiem nazw kopii. Po upuszczeniu
dwóch lub więcej definicji nic nie jest zakładane; wybierz je karta po karcie.

Wybory są zapamiętywane po nazwie pliku, więc ten sam firmware odnajdzie swoją definicję
następnym razem.

### Pliki trzymane na urządzeniu

Po wskazaniu katalogu danych — `python3 serve.py --data ~/firmware` — przeglądarka pokazuje
też to, co już w nim leży, i wczytuje plik jednym kliknięciem: tych samych plików nie trzeba
przeciągać za każdym razem. Upuszczony ręcznie `.xdf` zostaje tam zapisany, obrazy
firmware'u nie — przeciągnięcie obrazu zwykle znaczy „obejrzeć”, a nie „odłożyć”.

Kontener montuje w tym celu `./data`. Nasłuchuje na wszystkich interfejsach, więc zapis jest
tam odrzucany, dopóki nie ustawi się `ALLOW_REMOTE_WRITES=1` — co `docker-compose.yml` robi
jawnie. Bez katalogu danych nie ma żadnej biblioteki, a strona zachowuje się dokładnie jak
wcześniej.

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

Role obejmują mapy główne i typowe korekty — deltę, temperaturę powietrza i silnika, rozgrzewanie, fazę, moment maksymalny. Dokładne nazwy porównywane są bez interpunkcji i bez znaczników w rodzaju `[corsaro]`, więc `Fuel - Main` i `Fuel Main` trafiają do jednej pozycji.

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
node tests/run.js            # zestaw offline: XML, wzory, odczyt binariów, XDF, siatka, języki
node tests/ui_links.js       # app.js na atrapie DOM: parowanie i powiązania
node tests/ui_library.js     # panel biblioteki
python3 tests/serve_test.py  # API biblioteki w serve.py
```

Testy w przeglądarce wymagają playwrighta i firmware'ów w `testdata/` (katalog poza gitem):

```bash
python3 serve.py &
npm i playwright && npx playwright install chromium
node tests/browser.mjs   # izolinie, zakresy osi, przekrój, różnica, PNG
```

## Jako dodatek do onboard-logger

Bez zależności, bez kroku budowania, Plotly leży w `vendor/` — strona działa na płytce bez drogi
do internetu. `./release-addon.sh` pakuje ją jako dodatek:

```bash
./release-addon.sh    # dist/ecu-map-viewer-addon-<wersja>-<sha>.tar.gz
```

To archiwum instaluje się w onboard-logger przez **Config → System → Dodatki**. Płytka serwuje
stronę i trzyma obok magazyn na definicje — nie wykonuje ani linijki tego kodu, a usunięcie dodatku
zabiera jego pliki.

Zakładka Firmware pokazuje wtedy **Pokaż mapę** obok *Diff 2 .bin*: zaznacz jeden lub kilka obrazów,
a otworzą się tutaj, w karcie, która jest używana ponownie zamiast mnożona. Upuść `.xdf` raz i
zostanie na płytce, więc następne naciśnięcie od razu rysuje mapy.
