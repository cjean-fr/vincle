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

## Pourquoi il n'y a pas de gate

Trois formes ont été essayées, mesurées, et aucune ne tient à cette échelle
(3 à 12 % d'écart) sur cette charge :

| forme                                           | ce qu'elle a fait                                                                                                                                                          |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ratios contre React, Preact, Hono, Kita         | confondus avec le moteur et la machine : le ratio `stack` contre React est passé de 3,25 à 2,42 sans qu'une ligne ne change. Trois semaines de `REGRESSION`, aucune vraie. |
| A/B contre un build figé, un processus par côté | non biaisé (moyennes à ±2 % de 1,00) mais σ ≈ 3 % par paire, soit ~9 % de sensibilité à 8 paires. La régression connue, 3 % dans ce contexte, passait dessous.             |
| le même A/B dans le contexte complet            | biais d'ordre de 10 % : le premier chauffe le JIT et laisse son GC au second. Le build **lent** a été mesuré 13 % plus rapide.                                             |

Deux choses apprises au passage, et qui restent vraies :

- **Le coût dépend du contexte du processus.** Le même changement valait 3 % dans
  un processus qui ne rendait que vincle, et 11 % dans un processus qui rendait
  aussi les quatre concurrents. Les caches d'inline pollués sont ce qui ressemble
  à une application.
- **Ce qui a effectivement trouvé la régression**, c'est un A/B à la main : le
  `dist` d'avant et celui d'après, sur la même machine, dans la même session,
  quand on soupçonne déjà une ligne. Reproductible :

```bash
git checkout <avant> -- packages/core/src
bun run build --filter=@vincle/core && bun run bench:stats -- --runs 8
git checkout HEAD -- packages/core/src   # puis reconstruire
```

La CI mesure et archive. Elle ne tranche pas.

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
