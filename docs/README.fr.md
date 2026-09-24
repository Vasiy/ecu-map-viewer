# Visionneuse de cartographies ECU

Lit les dumps de firmware Magneti Marelli **IAW 5AM** (Ducati / Moto Morini) à travers
leurs définitions TunerPro `.xdf` et trace les cartographies — allumage, carburant et
toutes les autres tables de la définition — en surfaces 3-D. Plusieurs firmwares tiennent
dans une même scène, et l'on voit tout de suite où les calibrations divergent : une marche
là où tout devrait être lisse, une couture non lissée entre deux points de la grille, une
forme différente sur une autre plateforme.

C'est une page statique : pas de build, pas de dépendances, pas de réseau. Elle tourne
depuis un dossier, depuis un conteneur, ou depuis la carte qui diffuse son propre point
d'accès.

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

## Lancer

### Avec Docker

```bash
docker build -t ecu-map-viewer .
docker run --rm -p 8123:8123 ecu-map-viewer
```

Ou avec Compose :

```bash
docker compose up --build
```

Ouvrez ensuite <http://127.0.0.1:8123/>. Le conteneur sert les mêmes fichiers, par le même
`serve.py`, que le lancement local ; le programme ne va sur internet à aucun moment. Pour
un autre port, changez le mappage : `docker run --rm -p 9000:8123 ecu-map-viewer`.

### Sans Docker

Python 3 suffit — il est livré avec macOS et toutes les distributions Linux :

```bash
python3 serve.py          # http://127.0.0.1:8123/
python3 serve.py 9000     # autre port
```

Ouvrir `index.html` directement depuis le disque fonctionne aussi, mais un serveur local
est plus sûr : certains navigateurs limitent ce qu'une page chargée en `file://` peut lire.

`serve.py` envoie `Cache-Control: no-store`. C'est important après une mise à jour :
`python3 -m http.server` n'envoie aucun en-tête de cache, et le navigateur peut garder un
ancien `index.html` à côté d'un `js/app.js` tout neuf.

## Charger un firmware

Faites glisser un `.bin` et son `.xdf` dans le panneau de gauche, ou cliquez sur **Choisir
des fichiers**. **Des noms identiques s'apparient d'eux-mêmes** — `firmware.bin` +
`firmware.xdf`. Déposez autant de paires que vous voulez : chacune devient une carte dans la
liste, avec sa propre couleur.

Le nom sur la carte se modifie sur place. Ce que vous y écrivez apparaît dans l'infobulle,
dans la légende et sur la courbe de coupe.

### Une définition pour plusieurs firmwares

Des noms identiques, c'est pratique, pas obligatoire. Chaque carte porte un **sélecteur de
définition** listant tous les `.xdf` chargés dans la session et les préréglages intégrés,
et autant de cartes que vous voulez peuvent pointer vers le même.

C'est la façon rapide de comparer des versions d'une même cartographie : déposez les images
avec une seule `.xdf` dont le nom ne correspond à aucune d'elles, et elle leur est attribuée
d'un coup — fini de copier la définition une fois par image et de renommer chaque copie. Si
vous déposez deux définitions ou plus, rien n'est supposé : choisissez carte par carte.

Vos choix sont retenus par nom de fichier : le même firmware retrouve sa définition au
chargement suivant.

### Les fichiers gardés sur l'appareil

Avec un répertoire de données — `python3 serve.py --data ~/firmware` — le visualiseur
affiche aussi ce qui s'y trouve déjà et charge un fichier d'un clic : plus besoin d'y
glisser les mêmes fichiers à chaque fois. Une `.xdf` déposée à la main y est enregistrée ;
pas les images de firmware, car en déposer une, c'est généralement la regarder, pas la
ranger.

Le conteneur monte `./data` dans le même but. Il écoute sur toutes les interfaces, donc
l'écriture y est refusée tant que `ALLOW_REMOTE_WRITES=1` n'est pas défini — ce que
`docker-compose.yml` fait ouvertement. Sans répertoire de données, il n'y a aucune
bibliothèque et la page se comporte exactement comme avant.

### Un .bin sans son .xdf

La carte propose alors un préréglage de plateforme : l'adresse intégrée de la cartographie
d'allumage principale et les axes communs à cette famille de calculateurs.

| Plateforme | Adresse |
|---|---|
| Moto Morini Granpasso (23EC) | `0x4856E` |
| Ducati Multistrada 1100 DP | `0x484DE` |
| Ducati 1198 Stock | `0x48634` |
| Ducati Hypermotard 1100 | `0x4856E` |

Le préréglage est une solution de repli. Votre propre XDF vaut toujours mieux : il porte
les vrais axes, les vraies formules de conversion et toutes les autres tables.

## Choisir une cartographie

Une XDF contient des dizaines de tables, d'où le regroupement du sélecteur
**Cartographie** :

- **La même cartographie sur toutes les plateformes** — les rôles. La même table porte un
  nom différent dans chaque définition (`Ignition Main advance`, `Ignition - Main`,
  `Ignition map`) ; un rôle les rassemble, et un seul choix trace tous les firmwares.
- **Surfaces (3D)** — les titres exacts de la définition.
- **Courbes (1D)** — les tables à une dimension, tracées en graphique linéaire ordinaire.

Les rôles couvrent les cartographies principales et les corrections habituelles — delta, température d'air et moteur, montée en température, phase, couple maximum. Les titres exacts sont comparés sans la ponctuation ni les marques comme `[corsaro]`, si bien que `Fuel - Main` et `Fuel Main` tiennent dans une seule entrée.

Le compteur à côté (`2/3`) indique combien de firmwares chargés portent cette table. Celui
qui ne l'a pas est signalé en rouge sur sa carte.

## Comparer

- Rotation en faisant glisser, zoom à la molette, survol pour lire le régime, le papillon
  et la valeur de la cellule.
- La case à cocher d'une carte affiche ou masque sa surface. **L'axe z et les échelles de
  couleur ne suivent que les firmwares visibles** : en masquer un remet la scène à
  l'échelle de ce qui reste. Une bosse sur une cartographie ne peut donc pas être aplatie
  par une cartographie que vous ne regardez pas.
- Chaque surface garde sa propre échelle de couleur ; en basculer une ne repeint pas les
  autres.
- Les courbes de niveau sont tracées sur la surface et projetées sur les trois plans : le
  sol (régime × papillon), le mur du fond (papillon × valeur) et le mur latéral
  (régime × valeur).

**Différence** prend la référence choisie comme étalon et affiche les autres en écart par
rapport à elle. Les points d'axe diffèrent d'une plateforme à l'autre (2,4° contre 2,2° au
premier point de papillon), aussi une cartographie est-elle rééchantillonnée
bilinéairement sur les axes de la référence, et non appariée cellule par cellule.

**Coupe** tranche la cartographie à régime fixe ou à angle de papillon fixe. La coupe
apparaît deux fois : en ligne tracée sur les surfaces elles-mêmes, chacune dans la couleur
de son firmware, et en graphique 2-D sous la scène. Le curseur déplace les deux.

**PNG** enregistre la vue courante. Le bouton **i**, en haut à droite, donne une courte
description et le lien vers ce dépôt.

## Rejouer un journal de conduite

Déposez un journal décodé d'**onboard-logger** (`.csv` : `time` plus les canaux que ce trajet
a enregistrés) à côté d'un firmware chargé, ou, en fonctionnement comme module, choisissez-en
un dans **Trajets enregistrés** du panneau latéral. Associez deux de ses canaux aux axes de
la cartographie actuelle — régime et papillon sont devinés pour les cartographies principales
d'allumage et de carburant quand le journal porte les deux ; toute autre table demande un
choix à la main, puisque rien dans une XDF ne dit ce que signifie chaque axe — et le journal
est rejoué à travers la table elle-même, cellule par cellule.

Trois vues sous la scène :

- **Relecture** — la valeur que la table prédit dans le temps, à côté de ce que le journal a
  réellement mesuré pour elle (avance, temps d'injection…). L'écart entre les deux est
  chaque correction que la cartographie de base ne montre pas ; une correspondance étroite en
  croisière stable confirme que l'association et les unités sont correctes.
- **Temps passé** — une carte de chaleur à la forme de la cartographie, colorée selon le
  temps passé par le trajet dans chaque cellule.
- Un **trajet** sur la surface elle-même : chaque échantillon comme un petit point, une
  traînée colorée reliant tout ce qui a été parcouru jusqu'ici, et un repère vertical rouge au
  point actuel — le tout activé ensemble par une seule case à cocher.

Une barre de défilement partagée sous la scène pilote les trois vues à la fois, avec
lecture/pause et quatre vitesses (**:1** temps réel, jusqu'à **:1k** mille fois plus lent)
pour examiner un régime transitoire en détail. La couleur de la traînée est un choix parmi
cinq — rouge, vert, bleu, jaune ou blanc — via le bouton rond à côté de « Réinitialiser la
vue » ; le point actuel reste rouge quel que soit ce choix, pour ne jamais se confondre avec
la traînée.

Cela reste honnête sur les cartographies en régime stable et leurs corrections habituelles.
Cela ne montre pas l'enrichissement transitoire d'un coup d'accélérateur — cette correction
tourne sur la vitesse de variation et l'état du film de paroi dans le vrai firmware, pas sur
une table, et un journal échantillonné une fois par seconde ne peut de toute façon pas
résoudre quelques centaines de millisecondes.

La relecture tourne contre tous les firmwares visibles à la fois, si bien qu'un seul trajet
peut montrer comment deux calibrations y auraient chacune répondu.

## Langue et apparence

Treize langues, au choix dans l'en-tête : English, Čeština, Deutsch, Español, Français,
Italiano, Nederlands, Polski, Suomi, Svenska, Ελληνικά, Български, Русский. Tant que vous
n'avez pas choisi, c'est la langue du navigateur qui décide, l'anglais à défaut. Thème
clair et thème sombre ; les deux choix sont retenus dans le navigateur.

## Ce qui est lu dans la XDF

- `<XDFTABLE>` → titre, catégories, trois axes ;
- `EMBEDDEDDATA` : adresse, taille de cellule, pas de ligne et de colonne, drapeaux de type
  (`0x01` signé, `0x02` petit-boutiste, `0x04` virgule flottante), et à défaut de drapeaux,
  `<DEFAULTS>` de l'en-tête ;
- `<MATH equation="X/10">` est évalué par un analyseur en gare de triage plutôt que par
  `eval` — une XDF venue d'ailleurs ne doit pas exécuter de code dans la page ;
- les valeurs d'axe viennent d'une table de légende liée (`<embedinfo linkobjid=...>`,
  c'est ainsi que les fichiers 5AM rangent les points de régime et de papillon), de
  l'adresse propre de l'axe, d'entrées `<LABEL>` statiques, ou, à défaut de tout cela, de
  l'indice de la cellule.

Dans cette famille, la cartographie d'allumage principale fait 32 points de régime × 20
points de papillon, `uint16 LE`, angle = `raw / 10`.

## Tests

```bash
node tests/run.js            # suite hors ligne : XML, formules, lecture binaire, XDF, grille, langues
node tests/ui_links.js       # app.js sur un DOM factice : appariement et liens
node tests/ui_library.js     # le panneau bibliothèque
python3 tests/serve_test.py  # l'API bibliothèque de serve.py
```

Les vérifications navigateur demandent playwright et des firmwares dans `testdata/`
(ignoré par git) :

```bash
python3 serve.py &
npm i playwright && npx playwright install chromium
node tests/browser.mjs   # courbes de niveau, plages d'axes, coupe, différence, PNG
```

## En module onboard-logger

Aucune dépendance, aucune étape de build et Plotly embarqué dans `vendor/` : la page tourne sur
une carte sans accès à internet. `./release-addon.sh` l'empaquette en module :

```bash
./release-addon.sh    # dist/ecu-map-viewer-addon-<version>-<sha>.tar.gz
```

Cette archive s'installe dans onboard-logger via **Config → System → Modules**. La carte sert la
page et tient un stockage à côté pour les définitions — elle n'exécute pas une ligne de ce code, et
retirer le module emporte ses fichiers.

L'onglet Firmware affiche alors **Voir la cartographie** à côté de *Diff 2 .bin* : cochez une ou
plusieurs images et elles s'ouvrent ici, dans un onglet réutilisé plutôt que dupliqué. Déposez une
`.xdf` une fois et elle reste sur la carte : la pression suivante dessine aussitôt.
