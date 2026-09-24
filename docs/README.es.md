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

Arrastra un `.bin` y su `.xdf` al panel izquierdo, o pulsa **Elegir archivos**. **Los
nombres que coinciden se emparejan solos** — `firmware.bin` + `firmware.xdf`. Suelta tantas
parejas como quieras: cada una se convierte en una tarjeta de la lista, con su color.

El nombre de la tarjeta se edita ahí mismo. Lo que escribas es lo que aparece en el aviso
bajo el cursor, en la leyenda y en la curva de la sección.

### Una definición para varios firmwares

Que los nombres coincidan es una comodidad, no una regla. Cada tarjeta lleva un **selector
de definición** con todos los `.xdf` cargados en la sesión y los perfiles integrados, y
cuantas tarjetas quieras pueden apuntar al mismo.

Es la forma rápida de comparar versiones de una misma calibración: suelta las imágenes
junto a un único `.xdf` cuyo nombre no coincida con ninguna, y se les entrega a todas a la
vez; se acabó copiar la definición una vez por imagen y renombrar cada copia. Si sueltas
dos definiciones o más, no se supone nada: elígelas tarjeta a tarjeta.

Tus elecciones se recuerdan por nombre de archivo, así que el mismo firmware vuelve a
encontrar su definición la próxima vez.

### Archivos guardados en el dispositivo

Con un directorio de datos — `python3 serve.py --data ~/firmware` — el visor también lista
lo que ya hay dentro y carga un archivo con un clic, así no hay que arrastrar los mismos
archivos cada vez. Un `.xdf` soltado a mano se guarda ahí; las imágenes de firmware no,
porque arrastrar una suele ser mirarla, no depositarla.

El contenedor monta `./data` con el mismo fin. Escucha en todas las interfaces, así que
allí la escritura se rechaza salvo que se ponga `ALLOW_REMOTE_WRITES=1`, cosa que
`docker-compose.yml` hace a la vista. Sin directorio de datos no hay biblioteca alguna y la
página se comporta igual que antes.

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

Los roles cubren los mapas principales y las correcciones habituales: delta, temperatura del aire y del motor, calentamiento, fase, par máximo. Los títulos exactos se comparan sin puntuación ni marcas como `[corsaro]`, así que `Fuel - Main` y `Fuel Main` caen en una sola entrada.

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

## Reproducir un registro de conducción

Suelta un registro decodificado de **onboard-logger** (`.csv`: `time` más los canales que esa
salida grabó) junto a un firmware cargado, o, ejecutándose como complemento, elige uno de
**Trayectos grabados** en el panel lateral. Asigna dos de sus canales a los ejes del mapa
actual — RPM y acelerador se adivinan para los mapas principales de encendido y combustible
cuando el registro trae ambos; cualquier otra tabla necesita una elección a mano, porque nada
en un XDF dice qué significa cada eje — y el registro se reproduce a través de la propia
consulta de la tabla, celda a celda.

Tres vistas bajo la escena:

- **Reproducción** — el valor que predice la tabla a lo largo del tiempo, junto a lo que el
  registro realmente midió para ella (avance, tiempo de inyección…). La diferencia entre
  ambos es cada corrección que el mapa base no muestra; una coincidencia cercana en crucero
  estable confirma que la asignación y las unidades son correctas.
- **Tiempo pasado** — un mapa de calor con la forma del mapa, coloreado según cuánto tiempo
  pasó la conducción en cada celda.
- Una **trayectoria** sobre la propia superficie: cada muestra como un punto pequeño, una
  estela de color que une todo lo recorrido hasta ahora, y un marcador vertical rojo en el
  punto actual — todo activable junto con una sola casilla.

Una barra de desplazamiento compartida bajo la escena controla las tres vistas a la vez, con
reproducir/pausar y cuatro velocidades — **:1** reproduce todo el trayecto en unos quince
segundos, sea cual sea su duración; **:10**/**:100**/**:1k** ralentizan ese ritmo para examinar
un transitorio rápido en detalle. El color de la estela es una elección entre
cinco — rojo, verde, azul, amarillo o blanco — mediante el botón redondo junto a «Restablecer
vista»; el punto actual siempre queda rojo, sea cual sea la elección, para que nunca se
confunda con la estela.

Esto es honesto sobre los mapas en régimen estable y sus correcciones habituales. No muestra
el enriquecimiento transitorio de un acelerón brusco — esa corrección corre sobre la
velocidad de cambio y el estado de la película de pared en el firmware real, no sobre una
consulta, y un registro muestreado una vez por segundo no puede resolver unos pocos cientos
de milisegundos de todas formas.

La reproducción corre contra todos los firmwares visibles a la vez, así que una sola
conducción puede mostrar cómo habría respondido cada calibración.

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
node tests/run.js            # suite sin conexión: XML, fórmulas, lectura binaria, XDF, rejilla, idiomas
node tests/ui_links.js       # app.js sobre un DOM simulado: emparejado y enlaces
node tests/ui_library.js     # el panel de la biblioteca
python3 tests/serve_test.py  # la API de biblioteca de serve.py
```

Las comprobaciones en navegador necesitan playwright y firmwares en `testdata/` (ignorado
por git):

```bash
python3 serve.py &
npm i playwright && npx playwright install chromium
node tests/browser.mjs   # curvas de nivel, rangos de ejes, sección, diferencia, PNG
```

## Como complemento de onboard-logger

Sin dependencias, sin paso de compilación y con Plotly en `vendor/`, así que la página funciona en
una placa sin salida a internet. `./release-addon.sh` la empaqueta como complemento:

```bash
./release-addon.sh    # dist/ecu-map-viewer-addon-<versión>-<sha>.tar.gz
```

Ese archivo se instala en onboard-logger desde **Config → System → Complementos**. La placa sirve
la página y guarda un almacén al lado para las definiciones: no ejecuta ni una línea de este
código, y al quitar el complemento se van sus archivos.

Entonces la pestaña Firmware muestra **Ver mapa** junto a *Diff 2 .bin*: marca una o varias
imágenes y se abren aquí, en una pestaña que se reutiliza en vez de duplicarse. Suelta un `.xdf`
una vez y se queda en la placa, así que la siguiente pulsación dibuja los mapas de inmediato.
