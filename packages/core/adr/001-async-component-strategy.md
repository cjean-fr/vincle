# ADR-001 : Stratégie de support des composants async dans core-next

**Status** : conclu — voir Décision ci-dessous

**Contexte** : core-next (tree-walk VNode, futur `@vincle/core`) doit supporter
les composants async sans régesser le rendu purement synchrone qui constitue
~99% des cas d'usage.

Le renderer parcourt le VNode tree récursivement et concatène du HTML.
Les composants sont des fonctions appelées par le renderer. Si une fonction
composant est `async`, le renderer reçoit une Promise au lieu d'un VNode.

## API publique : l'argument décisif

Avant toute considération de perf, l'API publique est le premier critère :

```ts
// Synchrone — ergonomique, pas de propagation async
const html = renderToString(tree);
res.send(html);

// Asynchrone — force await partout
const html = await renderToString(tree);
res.send(html);
```

Le renderer sync permet d'écrire du serveur plus simple. La contrainte vient
du runtime : si on introduit la moindre Promise dans le hot path, le type de
retour devient `string | Promise<string>`, et l'utilisateur doit gérer les
deux.

## Benchmarks finaux (conditions stabilisées)

Environnement : Intel i5-10210U, Bun 1.3.14, gouverneur `performance`, core
pinné (`taskset -c 2`). Bench `timed-both.ts` (realworld 10k purchases, 20
iters × 10 blocks × 5 samples, cooling 1500ms).

### Résultats — chaque approche benchmarkée dans les mêmes conditions

| Approche                               | core-next median | core-2 median | Ratio (core-next / core-2) |
| -------------------------------------- | ---------------- | ------------- | -------------------------- |
| **A — Pure sync**                      | **6 733 ms**     | 14 042 ms     | **0.48×**                  |
| **B — Unifié** (Promise checks inline) | **9 634 ms**     | 10 363 ms     | 0.93×                      |
| **D — Shared-core avec callbacks**     | **9 780 ms**     | 10 483 ms     | 0.93×                      |

### Observations

- **A vs B** : B est +43% plus lent que A. La perte vient des `instanceof
Promise` et des `.then()` dispersés dans tout l'arbre récursif — pas d'une
  construction unique.
- **B vs D** : quasi identiques. La délégation par callback n'ajoute rien.
  L'overhead n'est pas dans l'indirection d'appel mais dans les branches
  conditionnelles + closures `.then()`.
- **core-2** est très variable (19-29% spread) même avec core pinné. core-next
  est plus stable.
- Le ratio 0.48× de l'approche A signifie que core-next est **2× plus rapide**
  que core-2 sur cette charge dans ces conditions. Ce ratio n'est pas un
  indicateur absolu (core-2 varie trop) mais la **supériorité relative** entre
  A, B et D est fiable puisqu'ils tournent dans les mêmes blocs alternés.

## Comparaison des approches

| Critère                     | A — Deux chemins             | B — Unifiée     | C — Two-pass (éliminé)   | D — Callbacks (éliminé)      |
| --------------------------- | ---------------------------- | --------------- | ------------------------ | ---------------------------- |
| Sync perf vs core-next max  | **1.0×** (pas de perte)      | 0.70×           | ~0.83×                   | 0.69×                        |
| Sync perf vs core-2         | **2.0×**                     | 1.08×           | ~1.2×                    | 1.08×                        |
| Async support               | `renderToStringAsync` séparé | Intégré         | Intégré (resolve await)  | `renderToStringAsync` séparé |
| Allocations supplémentaires | 0                            | 0               | Oui (VNodes)             | 0                            |
| Complexité de code          | Duplication helpers          | Branches mortes | Deux passes, allocations | Indirection callbacks        |
| Maintenance                 | Deux fichiers                | Un seul chemin  | Logique de changement    | Callers + closure overhead   |

## Décision

**Choisir l'approche A — deux chemins séparés (sync pur + async dédié).**

Justification :

1. Les approches B, C et D ont toutes un overhead mesuré sur le hot path sync
   (entre 17% et 44%). Aucun mécanisme de partage ne réduit cet overhead de
   façon significative.
2. Le code sync représente ~99% des cas d'usage (render SSG, render API,
   render partiel). Pénaliser 99% des appels pour 1% est un mauvais trade-off.
3. La duplication n'est pas un problème de maintenance : React, Vue, Preact,
   Svelte dupliquent massivement le hot path. Le pattern est éprouvé.
4. L'export `renderToString` reste 100% synchrone (type `string`, pas
   d'`await` nécessaire). L'export `renderToStringAsync` est optionnel.

### Mise en œuvre

- `create-element.ts` = render 100% sync (composants sync uniquement).
  Retourne `string`, 0 checks Promise, 0 overhead.
- `create-element-async.ts` = copie avec support Promise. Retourne
  `string | Promise<string>`.
- Les deux fichiers partagent les utilitaires purs (`escapeHtml`,
  `escapeRawTagContent`, `buildAttrs`, `raw`).
- `index.ts` exporte `renderToString` (sync) et `renderToStringAsync`
  (optionnel).

### Risques résiduels

- Un composant `async` passé à `renderToString` (sync) lancera l'erreur
  habituelle des fonctions async non attendues. La détection en amont
  (validation TS ou guard explicite) peut être ajoutée plus tard.
- Le fichier async est à maintenir en parallèle du sync. Les changements
  de logique de rendu devront être répercutés dans les deux fichiers.
