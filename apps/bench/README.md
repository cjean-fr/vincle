# @vincle/bench

Comparaison de `@vincle/core` avec `@kitajs/html`, React, Preact et `hono/jsx`
sur quatre formes de page : `text`, `stack`, `async`, `realworld`.

## La règle

**Une exécution n'est pas une mesure.** Le bruit entre deux exécutions du même
binaire sur le même code est de 2 à 6 % selon le cas — l'ordre de grandeur de la
plupart des optimisations qu'on envisage ici. Un delta lu sur une exécution, ou
même sur trois, ne distingue pas un changement de code de l'humeur de la machine.

La procédure est décrite et rendue contraignante ci-dessous — baseline AVANT
modification, `--against` après, un delta sous 3σ est un verdict. Lisez-la avant
de citer un chiffre.

## Commandes

```bash
# coup d'œil — ne peut pas être cité comme un delta
bun run bench
```

```bash
# mesure sérieuse : enregistrer une référence AVANT de toucher au code
bun run bench:stats -- --runs 8 --save results/baseline.json
```

```bash
# … modifier le code, rebuilder, puis comparer
bun run bench:stats -- --runs 8 --against results/baseline.json
```

Options : `--runs <n>` (défaut 8, minimum 2), `--save <fichier>`,
`--against <fichier>`.

Un delta sous **3σ** est rapporté `noise — not a finding`. C'est un verdict :
soit on augmente `--runs` jusqu'à trancher, soit on acte que le changement n'est
pas mesurable et on décide sur d'autres critères.

Les baselines **absolues** ne sont pas versionnées — elles sont spécifiques à une
machine et à un instant. On enregistre la sienne localement, juste avant de
modifier le code.

## Le gate de CI : des ratios, pas des ops/s

Une baseline en ops/s ne vaut que sur la machine qui l'a écrite, donc elle ne peut
pas garder la CI. Résultat longtemps subi : la CI lançait une exécution unique —
ce que la section ci-dessus déclare non citable — et l'archivait sans jamais la
comparer. L'objectif n°1 du projet était le seul sur lequel rien ne pouvait
échouer.

Ce qui voyage d'une machine à l'autre, c'est le **ratio** entre deux renderers
mesurés dans la même exécution : le bruit leur est commun et se simplifie. C'est
aussi ce que GOAL vise — « proche de kitajs », pas un nombre d'opérations.

```bash
# rejouer le gate localement (8 exécutions, ~2 min)
bun run bench:gate
```

```bash
# rafraîchir la baseline de ratios — depuis une exécution CI de préférence
bun run bench:stats -- --runs 8 --save-gate results/ratios.json
```

`results/ratios.json` est le seul fichier de `results/` versionné (exception
explicite dans `.gitignore`). Le gate échoue si un ratio s'est **dégradé** d'au
moins 3σ ; une amélioration ou un mouvement dans le bruit ne fait rien échouer.

Deux limites, dites plutôt que tues : les cas `async` et `precompile` n'ont pas
de concurrent, donc ils ne sont pas gatés ; et un concurrent bruyant réduit la
sensibilité de son couple (`@kitajs/html` sur `text` a un cv de ~17 %).

## Localiser un coût

`bench:stats` dit _si_ quelque chose a changé, pas _où_ le temps passe. Pour ça,
un profil — l'attribution y est fiable, parce qu'elle est interne à un processus.

`src/profile.js` rend **une** implémentation sur **un** cas, en boucle serrée :
un profil de `bench.js` est un profil de mitata, pas du renderer.

```bash
NODE_ENV=production node --conditions=dist --cpu-prof src/profile.js vincle realworld 600
```

```bash
NODE_ENV=production bun --conditions=dist --cpu-prof src/profile.js kitajs realworld 600
```

Profilez la **référence aussi**, sur le même arbre. « Où vincle passe son temps »
se lit mal seul ; « ce que vincle fait que kitajs ne fait pas » se lit tout de
suite — et une partie de l'écart s'est révélée être du travail que kitajs
n'effectue pas du tout (filtrage de schéma d'URL, résolution des noms
d'attributs React→HTML).

Les deux moteurs, toujours : un effet présent sous V8 **et** JSC est structurel,
un effet sur un seul est une déoptimisation moteur et appelle un autre correctif.

Un profil ne dit pas ce qui est **supprimable** : le temps d'un travail
inévitable reste attribué là où il se produit. Pour chiffrer un gain potentiel,
ablatez le code et mesurez le plafond avant d'écrire le correctif.

## Les deux moteurs

Le bench tourne sous Bun (JSC) et sous Node (V8) sans modification. Un écart
présent sur les deux est structurel ; un écart présent sur un seul est une
déoptimisation propre au moteur, et appelle un correctif tout autre.

```bash
NODE_ENV=production node --conditions=dist src/bench.js
```

## On mesure `dist`

La condition d'export `dist` fait résoudre `@vincle/core` vers l'artefact
construit, et la tâche turbo `bench:stats` dépend de `^build`. On mesure ce qu'on
publie, pas les sources.
