# @vincle/bench

Comparaison de `@vincle/core` avec `@kitajs/html`, React, Preact et `hono/jsx`
sur quatre formes de page : `text`, `stack`, `async`, `realworld`.

## La règle

**Une exécution n'est pas une mesure.** Le bruit entre deux exécutions du même
binaire sur le même code est de 2 à 6 % selon le cas — l'ordre de grandeur de la
plupart des optimisations qu'on envisage ici. Un delta lu sur une exécution, ou
même sur trois, ne distingue pas un changement de code de l'humeur de la machine.

La procédure est décrite et rendue contraignante par
[ADR-003](../../packages/core/adr/003-rendu-et-mesure.md). Lisez-la avant
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

Les baselines ne sont pas versionnées — elles sont spécifiques à une machine et à
un instant. On enregistre la sienne localement, juste avant de modifier le code.

## Localiser un coût

`bench:stats` dit *si* quelque chose a changé, pas *où* le temps passe. Pour ça,
un profil — l'attribution y est fiable, parce qu'elle est interne à un processus :

```bash
NODE_ENV=production node --conditions=dist --cpu-prof src/bench.js
```

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
