# Visor de mapas de la ECU

Lee volcados de firmware Magneti Marelli **IAW 5AM** (Ducati / Moto Morini) a través de sus
definiciones `.xdf` de TunerPro y dibuja las tablas de calibración — encendido, combustible
y cualquier otra tabla que traiga la definición — como superficies 3-D. Varios firmwares
caben en una misma escena, y se ve enseguida dónde se separan las calibraciones: un escalón
donde todo debería ser suave, una costura sin suavizar entre puntos de la rejilla, otra
forma en otra plataforma.

Es una página estática: sin compilación, sin dependencias, sin red. Funciona desde una
carpeta, desde un contenedor o desde la placa que emite su propio punto de acceso.

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

## Arrancar

### Con Docker

```bash
docker build -t ecu-map-viewer .
docker run --rm -p 8123:8123 ecu-map-viewer
```

O con Compose:

```bash
docker compose up --build
```

Después abre <http://127.0.0.1:8123/>. El contenedor sirve los mismos archivos, con el
mismo `serve.py`, que el arranque local; el programa no sale a internet en ningún momento.
Para otro puerto cambia el mapeo: `docker run --rm -p 9000:8123 ecu-map-viewer`.

### Sin Docker

Basta con Python 3 — viene con macOS y con cualquier distribución de Linux:

```bash
python3 serve.py          # http://127.0.0.1:8123/
python3 serve.py 9000     # otro puerto
```

Abrir `index.html` directamente desde el disco también funciona, pero con un servidor local
es más seguro: algunos navegadores limitan lo que puede leer una página cargada por
`file://`.

`serve.py` envía `Cache-Control: no-store`. Importa tras una actualización: `python3 -m
http.server` no envía ninguna cabecera de caché, y el navegador puede quedarse con un
`index.html` viejo junto a un `js/app.js` recién cambiado.

## Cargar un firmware

Arrastra un `.bin` y su `.xdf` al panel izquierdo, o pulsa **Elegir archivos**. **Los dos
archivos necesitan el mismo nombre** — `firmware.bin` + `firmware.xdf`. Suelta tantas
parejas como quieras: cada una se convierte en una tarjeta de la lista, con su color.

El nombre de la tarjeta se edita ahí mismo. Lo que escribas es lo que aparece en el aviso
bajo el cursor, en la leyenda y en la curva de la sección.

### Un .bin sin su .xdf

La tarjeta ofrece entonces un preajuste de plataforma: la dirección incorporada del mapa de
encendido principal y los ejes que comparte esta familia de centralitas.

| Plataforma | Dirección |
|---|---|
| Moto Morini Granpasso (23EC) | `0x4856E` |
| Ducati Multistrada 1100 DP | `0x484DE` |
| Ducati 1198 Stock | `0x48634` |
| Ducati Hypermotard 1100 | `0x4856E` |

El preajuste es el recurso de emergencia. Tu propio XDF siempre es mejor: trae los ejes
reales, las fórmulas de conversión reales y todas las demás tablas.

## Elegir un mapa

Un XDF guarda decenas de tablas, así que el selector **Mapa** va agrupado:

- **El mismo mapa en todas las plataformas** — los roles. La misma tabla se llama distinto
  en cada definición (`Ignition Main advance`, `Ignition - Main`, `Ignition map`); un rol
  las junta, y una sola elección dibuja todos los firmwares.
- **Superficies (3D)** — los títulos exactos de la definición.
- **Curvas (1D)** — tablas de una dimensión, dibujadas como un gráfico de líneas normal.

El contador de al lado (`2/3`) dice en cuántos firmwares cargados está esa tabla. El que no
la tiene queda marcado en rojo en su tarjeta.

## Comparar

- Gira arrastrando, acerca con la rueda, y al pasar por encima lees revoluciones,
  acelerador y valor de la celda.
- La casilla de la tarjeta muestra y oculta esa superficie. **El eje z y las escalas de
  color siguen solo a los firmwares visibles**: ocultar uno reescala la escena a lo que
  queda. Así, una joroba de un mapa no puede quedar aplanada por un mapa que no estás
  mirando.
- Cada superficie conserva su propia escala de color, así que encender una no repinta las
  demás.
- Las curvas de nivel se dibujan sobre la superficie y se proyectan en los tres planos: el
  suelo (revoluciones × acelerador), la pared del fondo (acelerador × valor) y la lateral
  (revoluciones × valor).

**Diferencia** toma la base elegida como referencia y muestra las demás como desvío
respecto a ella. Los puntos de los ejes cambian entre plataformas (2,4° frente a 2,2° en el
primer punto de acelerador), así que un mapa se remuestrea de forma bilineal sobre los ejes
de la base, no se empareja celda a celda.

**Sección** corta el mapa a revoluciones fijas o con el acelerador fijo. El corte aparece
dos veces: como línea dibujada sobre las propias superficies, cada una en el color de su
firmware, y como gráfico 2-D bajo la escena. El deslizador mueve los dos.

**PNG** guarda la vista actual. El botón **i**, arriba a la derecha, trae una descripción
corta y el enlace a este repositorio.

## Idioma y apariencia

Trece idiomas, se eligen en la cabecera: English, Čeština, Deutsch, Español, Français,
Italiano, Nederlands, Polski, Suomi, Svenska, Ελληνικά, Български, Русский. Mientras no
elijas, decide el idioma del navegador, y si no está traducido, el inglés. Tema claro y
oscuro; ambas decisiones se recuerdan en el navegador.

## Qué se lee del XDF

- `<XDFTABLE>` → título, categorías, tres ejes;
- `EMBEDDEDDATA`: dirección, tamaño de celda, pasos de fila y columna, banderas de tipo
  (`0x01` con signo, `0x02` little-endian, `0x04` coma flotante) y, si faltan, `<DEFAULTS>`
  de la cabecera;
- `<MATH equation="X/10">` lo evalúa un analizador shunting-yard y no `eval` — un XDF de
  fuera no debe ejecutar código en la página;
- los valores de los ejes vienen de una tabla de leyenda enlazada (`<embedinfo
  linkobjid=...>`, así guardan los archivos 5AM los puntos de revoluciones y acelerador),
  de la dirección propia del eje, de entradas `<LABEL>` estáticas o, a falta de todo eso,
  del índice de la celda.

En esta familia el mapa de encendido principal son 32 puntos de revoluciones × 20 puntos de
acelerador, `uint16 LE`, avance = `raw / 10`.

## Pruebas

```bash
node tests/run.js        # suite sin conexión: XML, fórmulas, lectura binaria, XDF, rejilla, idiomas
```

Las comprobaciones en navegador necesitan playwright y firmwares en `testdata/` (ignorado
por git):

```bash
python3 serve.py &
npm i playwright && npx playwright install chromium
node tests/browser.mjs   # curvas de nivel, rangos de ejes, sección, diferencia, PNG
```
