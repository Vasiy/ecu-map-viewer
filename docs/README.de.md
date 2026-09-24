# ECU-Kennfeld-Viewer

Liest Firmware-Abzüge von Magneti Marelli **IAW 5AM** (Ducati / Moto Morini) über ihre
TunerPro-Definitionen `.xdf` und zeichnet die Kennfelder — Zündung, Kraftstoff und jede
weitere Tabelle der Definition — als 3-D-Flächen. Mehrere Firmwares liegen in einer Szene
übereinander, und man sieht sofort, wo die Kalibrierungen auseinandergehen: eine Stufe, wo
es glatt sein sollte, eine unverblendete Naht zwischen Stützstellen, eine andere Form auf
einer anderen Plattform.

Eine statische Seite: kein Build, keine Abhängigkeiten, kein Netz. Sie läuft aus einem
Ordner, aus einem Container oder von dem Board, das seinen eigenen Access Point aufspannt.

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

### Mit Docker

```bash
docker build -t ecu-map-viewer .
docker run --rm -p 8123:8123 ecu-map-viewer
```

Oder mit Compose:

```bash
docker compose up --build
```

Danach <http://127.0.0.1:8123/> öffnen. Der Container liefert dieselben Dateien über
dasselbe `serve.py` wie der lokale Start; ins Internet geht das Programm zu keinem
Zeitpunkt. Ein anderer Port wird beim Mappen gesetzt:
`docker run --rm -p 9000:8123 ecu-map-viewer`.

### Ohne Docker

Es braucht nur Python 3 — bei macOS und jeder Linux-Distribution dabei:

```bash
python3 serve.py          # http://127.0.0.1:8123/
python3 serve.py 9000     # anderer Port
```

`index.html` lässt sich auch direkt von der Platte öffnen, mit lokalem Server ist es aber
sicherer: manche Browser schränken ein, was eine über `file://` geladene Seite lesen darf.

`serve.py` sendet `Cache-Control: no-store`. Nach einem Update ist das wichtig: `python3 -m
http.server` schickt gar keine Cache-Header, und der Browser kann eine alte `index.html`
neben einem frischen `js/app.js` behalten.

## Firmware laden

Ziehen Sie eine `.bin` samt `.xdf` in die linke Spalte oder klicken Sie **Dateien wählen**.
**Gleiche Namen finden sich von selbst** — `firmware.bin` + `firmware.xdf`. Es dürfen
beliebig viele Paare sein; jedes wird zu einer Karte in der Liste mit eigener Farbe.

Der Name auf der Karte ist direkt änderbar. Was dort steht, steht auch im Tooltip, in der
Legende und an der Schnittkurve.

### Eine Definition für mehrere Firmwares

Gleiche Namen sind bequem, aber keine Vorschrift. Jede Karte trägt eine
**Definitionsauswahl** mit allen in dieser Sitzung geladenen `.xdf` und den eingebauten
Vorlagen; beliebig viele Karten dürfen auf dieselbe zeigen.

So vergleicht man Versionen einer Kalibrierung am schnellsten: Legen Sie die Abbilder
zusammen mit einer einzigen `.xdf` ab, deren Name zu keinem davon passt — sie wird allen
auf einmal zugeteilt. Kein Kopieren der Definition je Abbild und kein Umbenennen mehr. Bei
zwei oder mehr Definitionen auf einmal wird nichts angenommen; wählen Sie pro Karte.

Die Auswahl wird pro Dateiname gemerkt, sodass dieselbe Firmware ihre Definition beim
nächsten Laden wiederfindet.

### Dateien, die auf dem Gerät liegen

Mit einem Datenverzeichnis — `python3 serve.py --data ~/firmware` — zeigt der Viewer auch,
was schon darin liegt, und lädt eine Datei mit einem Klick; dieselben Dateien müssen nicht
jedes Mal hineingezogen werden. Eine von Hand abgelegte `.xdf` wird dort gespeichert,
Firmware-Abbilder nicht: ein Abbild hineinzuziehen heißt meist hinsehen, nicht hinterlegen.

Der Container bindet dafür `./data` ein. Er lauscht auf allen Schnittstellen, deshalb wird
das Schreiben dort abgelehnt, solange `ALLOW_REMOTE_WRITES=1` nicht gesetzt ist — was
`docker-compose.yml` offen tut. Ohne Datenverzeichnis gibt es gar keine Bibliothek, und die
Seite verhält sich genau wie zuvor.

### Eine .bin ohne ihre .xdf

Die Karte bietet stattdessen eine Plattform-Vorgabe an: die eingebaute Adresse des
Zündungs-Hauptkennfelds und die Achsen, die diese Steuergerätefamilie teilt.

| Plattform | Adresse |
|---|---|
| Moto Morini Granpasso (23EC) | `0x4856E` |
| Ducati Multistrada 1100 DP | `0x484DE` |
| Ducati 1198 Stock | `0x48634` |
| Ducati Hypermotard 1100 | `0x4856E` |

Die Vorgabe ist der Notnagel. Die eigene XDF ist immer besser: sie bringt die echten
Achsen, die echten Umrechnungsformeln und alle übrigen Tabellen mit.

## Kennfeld wählen

Eine XDF enthält Dutzende Tabellen, deshalb ist die Auswahl **Kennfeld** gruppiert:

- **Gleiches Kennfeld auf allen Plattformen** — Rollen. Dieselbe Tabelle heißt in jeder
  Definition anders (`Ignition Main advance`, `Ignition - Main`, `Ignition map`); eine
  Rolle fasst sie zusammen, ein Klick zeichnet alle Firmwares.
- **Flächen (3D)** — die exakten Titel aus der Definition.
- **Kurven (1D)** — eindimensionale Tabellen, als gewöhnliches Liniendiagramm.

Rollen decken die Hauptkennfelder und die üblichen Korrekturen ab — Delta, Luft- und Motortemperatur, Warmlauf, Phase, maximales Drehmoment. Exakte Titel werden ohne Satzzeichen und ohne Marken wie `[corsaro]` verglichen, sodass `Fuel - Main` und `Fuel Main` in einem Eintrag landen.

Der Zähler daneben (`2/3`) sagt, wie viele der geladenen Firmwares diese Tabelle führen.
Wo sie fehlt, steht ein roter Hinweis auf der Karte.

## Vergleichen

- Drehen durch Ziehen, Zoomen mit dem Rad; beim Überfahren erscheinen Drehzahl,
  Drosselklappe und Zellenwert.
- Das Häkchen auf der Karte blendet die Fläche ein und aus. **Z-Achse und Farbskalen
  richten sich allein nach den sichtbaren Firmwares** — ein weggeklicktes Kennfeld
  skaliert die Szene neu. Ein Buckel auf einer Fläche kann so nicht von einem Kennfeld
  plattgedrückt werden, das Sie gerade gar nicht ansehen.
- Jede Fläche behält ihre eigene Farbskala; das Umschalten einer färbt die anderen nicht um.
- Höhenlinien liegen auf der Fläche und werden auf alle drei Ebenen projiziert: Boden
  (Drehzahl × Drosselklappe), Rückwand (Drosselklappe × Wert), Seitenwand (Drehzahl × Wert).

**Differenz** macht die gewählte Basis zur Referenz und zeigt die übrigen als Delta dazu.
Die Stützstellen unterscheiden sich zwischen Plattformen (2,4° gegen 2,2° am ersten
Drosselklappenpunkt), deshalb wird ein Kennfeld bilinear auf die Achsen der Basis
umgerechnet statt Zelle für Zelle zugeordnet.

**Schnitt** schneidet das Kennfeld bei fester Drehzahl oder festem Drosselklappenwinkel.
Der Schnitt erscheint doppelt: als Linie auf den Flächen selbst, jeweils in der Farbe ihrer
Firmware, und als 2-D-Diagramm unter der Szene. Der Schieber bewegt beides.

**PNG** sichert die aktuelle Ansicht. Der Knopf **i** oben rechts zeigt eine kurze
Beschreibung und den Link zu diesem Repository.

## Fahrprotokoll abspielen

Ziehen Sie ein dekodiertes Protokoll von **onboard-logger** (`.csv`: `time` plus die Kanäle,
die diese Fahrt aufgezeichnet hat) neben eine geladene Firmware, oder wählen Sie es — als
Add-on gestartet — aus **Aufgezeichnete Fahrten** in der Seitenleiste. Ordnen Sie zwei seiner
Kanäle den Achsen des aktuellen Kennfelds zu — Drehzahl und Drosselklappe werden für die
Zündungs- und Kraftstoff-Hauptkennfelder geraten, wenn das Protokoll beide führt; jede andere
Tabelle braucht eine Wahl von Hand, denn keine XDF sagt, welche Achse was bedeutet —, und das
Protokoll läuft Zelle für Zelle durch den eigenen Nachschlag des Kennfelds.

Drei Ansichten unter der Szene:

- **Wiedergabe** — der vorhergesagte Wert des Kennfelds über die Zeit, daneben was das
  Protokoll dafür tatsächlich gemessen hat (Zündwinkel, Einspritzzeit …). Der Abstand
  zwischen beiden ist jede Korrektur, die das Grundkennfeld nicht zeigt; eine enge
  Übereinstimmung bei ruhiger Fahrt bestätigt, dass Zuordnung und Einheiten stimmen.
- **Verweildauer** — eine Heatmap in der Form des Kennfelds, gefärbt danach, wie lange die
  Fahrt in jeder Zelle verbrachte.
- Ein **Fahrweg** auf der Fläche selbst: jeder Messwert als kleiner Punkt, eine farbige Spur,
  die alles bisher Gefahrene verbindet, und eine rote senkrechte Markierung am aktuellen
  Punkt — alles zusammen per Häkchen ein- und ausschaltbar.

Eine gemeinsame Scrub-Leiste unter der Szene steuert alle drei Ansichten zugleich, mit
Play/Pause und vier Geschwindigkeiten — **:1** spielt die ganze Fahrt in rund fünfzehn Sekunden
ab, unabhängig von ihrer Länge; **:10**/**:100**/**:1k** verlangsamen dieses Tempo, um einen
schnellen Übergang im Detail zu verfolgen. Die Farbe der Spur ist eine Wahl aus
fünf — Rot, Grün, Blau, Gelb oder Weiß — über die runde Schaltfläche neben „Ansicht
zurücksetzen"; der aktuelle Punkt bleibt unabhängig davon immer rot, damit er nicht mit der
Spur verschmilzt.

Das ist ehrlich über stationäre Kennfelder und ihre üblichen Korrekturen. Es zeigt keine
Anreicherung bei einem plötzlichen Gasstoß — diese Korrektur läuft in der echten Firmware
über die Änderungsrate und den Zustand des Wandfilms, nicht über einen Nachschlag, und ein
einmal pro Sekunde abgetastetes Protokoll kann ohnehin keine paar hundert Millisekunden
auflösen.

Die Wiedergabe läuft gleichzeitig gegen jede sichtbare Firmware, sodass eine Fahrt zeigen
kann, wie zwei Kalibrierungen jeweils darauf reagiert hätten.

## Sprache und Darstellung

Dreizehn Sprachen, umschaltbar in der Kopfzeile: English, Čeština, Deutsch, Español,
Français, Italiano, Nederlands, Polski, Suomi, Svenska, Ελληνικά, Български, Русский.
Solange nichts gewählt ist, entscheidet die Sprache des Browsers, sonst Englisch. Helles
und dunkles Thema; beide Entscheidungen merkt sich der Browser.

## Was aus der XDF gelesen wird

- `<XDFTABLE>` → Titel, Kategorien, drei Achsen;
- `EMBEDDEDDATA`: Adresse, Zellengröße, Zeilen- und Spaltenschritte, Typflags (`0x01`
  vorzeichenbehaftet, `0x02` Little Endian, `0x04` Gleitkomma), bei fehlenden Flags
  `<DEFAULTS>` aus dem Kopf;
- `<MATH equation="X/10">` wertet ein eigener Shunting-Yard-Parser aus, nicht `eval` — eine
  fremde XDF darf keinen Code auf der Seite ausführen;
- Achsenwerte kommen aus einer verlinkten Legendentabelle (`<embedinfo linkobjid=...>`, so
  legen die 5AM-Dateien Drehzahl- und Drosselklappenstützstellen ab), aus der eigenen
  Adresse der Achse, aus statischen `<LABEL>`-Einträgen oder, wenn nichts davon da ist, aus
  dem Zellenindex.

Das Zündungs-Hauptkennfeld dieser Familie hat 32 Drehzahl- × 20 Drosselklappenpunkte,
`uint16 LE`, Winkel = `raw / 10`.

## Tests

```bash
node tests/run.js            # Offline-Suite: XML, Formeln, Binärlesen, XDF, Gitter, Sprachen
node tests/ui_links.js       # app.js auf einem DOM-Stub: Paarung und Verknüpfungen
node tests/ui_library.js     # das Bibliotheksfeld
python3 tests/serve_test.py  # die Bibliotheks-API von serve.py
```

Die Browser-Prüfungen brauchen playwright und Firmware-Abzüge in `testdata/` (nicht im Git):

```bash
python3 serve.py &
npm i playwright && npx playwright install chromium
node tests/browser.mjs   # Höhenlinien, Achsenbereiche, Schnitt, Differenz, PNG
```

## Als onboard-logger-Add-on

Keine Abhängigkeiten, kein Build-Schritt, Plotly liegt in `vendor/` — die Seite läuft also auf
einem Board ohne Weg ins Internet. `./release-addon.sh` packt sie als Add-on:

```bash
./release-addon.sh    # dist/ecu-map-viewer-addon-<version>-<sha>.tar.gz
```

Dieses Archiv wird in onboard-logger unter **Config → System → Add-ons** installiert. Das Board
liefert die Seite aus und führt daneben einen Speicher für die Definitionen — es führt keine Zeile
dieses Codes aus, und beim Entfernen gehen seine Dateien mit.

Im Firmware-Reiter erscheint dann **Kennfeld zeigen** neben *Diff 2 .bin*: ein oder mehrere
Abbilder anhaken, und sie öffnen sich hier, in einem Tab, der wiederverwendet statt verdoppelt
wird. Eine `.xdf` einmal hineinziehen genügt — sie bleibt auf dem Board, und der nächste Druck
zeichnet sofort.
