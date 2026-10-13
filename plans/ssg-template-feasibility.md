# Faisabilité de templates `.vincle` pour SSG

Étude du 14 octobre 2026, basée sur l’arbre de travail actuel, y compris les évolutions SSG non commitées. Aucun changement d’implémentation ni de dépendance proposé ici n’a été appliqué.

## Conclusion

Un format de template autorisant du JavaScript brut dans `<script>` est faisable pour `@vincle/ssg`, sans changement de Core. La génération statique et le rendu sont déjà extensibles. Le coût principal est la définition du langage, le traitement des assets et l’outillage des fichiers sources.

Recommandation : expérimenter un compilateur séparé, produisant des modules compatibles avec Core, avec un adaptateur SSG et Vite. Commencer par scripts inline et CSS global. Ajouter les scripts TypeScript bundlés après validation du graphe de composants et de la découverte des entrées client. Ne pas modifier la grammaire des fichiers `.tsx`.

## Ce que SSG permet déjà

| Besoin                          | État observé                                                                                          | Travail restant                                                                 |
| ------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Découvrir les routes `.vincle`  | Les handlers sont enregistrés par extension ; le routage enlève l’extension indépendamment du format. | Ajouter un handler optionnel.                                                   |
| Charger une page compilée       | `ModuleLoader.load(file, importSource, compiled)` accepte du JavaScript généré ; MDX l’utilise déjà.  | Générer du JS exécutable avec export par défaut et métadonnées.                 |
| Rendre scripts et styles        | Core traite déjà les enfants textuels de ces éléments comme du rawtext.                               | Convertir leur contenu en chaînes de manière correcte.                          |
| Importer un composant `.vincle` | Un handler ne traite que les routes découvertes. Les imports passent par le chargeur de modules.      | Plugin Vite et, si support sans Vite, plugin esbuild partageant le compilateur. |
| Charger `_layout.vincle`        | Le chargeur utilise les modules, mais recherche seulement TSX/JSX/TS/JS.                              | Ajouter le format à la recherche des layouts et définir sa priorité.            |
| Recompiler en développement     | Vite et le cache SSG suivent déjà les fichiers et graphes de modules.                                 | Relier chaque module généré/script/style à sa source et tester l’invalidation.  |

Sources locales : [contrats](../packages/ssg/src/types.ts), [formats et MDX](../packages/ssg/src/formats.ts), [découverte](../packages/ssg/src/handlers.ts), [routes](../packages/ssg/src/routes.ts), [chargement esbuild](../packages/ssg/src/module.ts), [layouts](../packages/ssg/src/layouts.ts), [modules dev](../packages/ssg/src/dev-modules.ts), [rendu Core](../packages/core/src/render.ts), [échappement rawtext](../packages/core/src/escape.ts).

Attention : la voie `compiled` actuelle accepte du **JavaScript**, pas du TSX brut (`loader: "js"` dans esbuild et identifiant `.vincle-compiled.js` dans Vite). Le compilateur doit donc abaisser TypeScript/JSX avant ce passage, ou l’adaptateur doit charger le fichier original avec son propre transform.

## Ce qu’Astro apporte réellement

Astro possède une grammaire de template distincte du TSX. Son compiler expose `parse()`, `transform()` et `convertToTSX()`. `parse()` peut fournir un AST à un générateur Vincle si le langage retenu reste compatible avec la syntaxe Astro. Le README signale néanmoins des limites sur certaines positions de l’AST : les diagnostics et sourcemaps devront être vérifiés. [Compiler officiel](https://github.com/withastro/compiler).

`transform()` émet du code destiné au runtime Astro. Remplacer `internalURL` change l’import, sans supprimer le contrat de ce runtime. `convertToTSX()` est une projection d’analyse pour l’outillage : elle n’est pas une compilation exécutable de composants pour Core. Réutiliser le parser est donc une option ; brancher directement ces sorties sur Vincle ne l’est pas sans adaptation substantielle. [API et options](https://github.com/withastro/compiler/blob/main/packages/compiler/src/shared/types.ts), [générateur TSX](https://github.com/withastro/compiler/blob/main/internal/printer/print-to-tsx.go).

Deux choix sont raisonnables :

- Adopter un sous-ensemble de templates Astro et utiliser son AST : moins de parsing à écrire, mais dépendance à sa grammaire et à ses évolutions.
- Définir une petite grammaire Vincle et développer un parser adapté : plus de travail initial, davantage de maîtrise. Un parser HTML seul ne couvre pas les expressions JSX, les composants et les expressions TypeScript.

Dans les deux cas, une regex globale sur `<script>` ne suffit pas. Il faut distinguer le template, les expressions, les attributs, les commentaires et les chaînes contenant des faux tags. Le parser Astro ne peut pas directement remplacer le parseur d’un module TSX arbitraire contenant `export default () => ...`.

## Proposition de langage initial

Exemple de syntaxe à valider, **non disponible actuellement** :

```astro
---
import Header from "../components/Header.tsx";
export const meta = { title: "Accueil" };
const { children } = props;
---
<Header />
<main>{children}</main>
<script>
  if (window.innerWidth < 800) {
    document.body.classList.add("compact");
  }
</script>
<style>
  main { max-width: 70rem; }
</style>
```

Le bloc serveur fournit imports, exports et code exécuté au rendu. `props` est une convention proposée : elle devrait recevoir le contexte SSG et les props des composants, sans introduire d’objet `Astro`. Le compilateur doit séparer les imports/exports de module du code exécuté dans le composant ; déplacer tout le frontmatter tel quel serait incorrect.

Dans `<script>` et `<style>`, les accolades appartiennent au langage embarqué, sans interpolation serveur implicite. Les données serveur destinées au navigateur doivent passer par un mécanisme explicite de sérialisation. Les composants TSX existants restent utilisables.

La première version devrait garder `<script>` inline, accepter du JavaScript navigateur, préserver l’ordre et ne pas dédupliquer silencieusement. TypeScript et imports de packages dans ce bloc nécessitent la phase de bundling suivante. Le CSS est global ; styles scoped, hydratation et directives Astro sont hors du premier périmètre.

La terminaison `</script>` doit suivre une règle documentée. En syntaxe HTML elle ferme le bloc même lorsqu’elle apparaît dans une chaîne JavaScript ; le comportement ne peut pas être choisi au hasard par un scanner. Tester aussi JSON-LD, scripts externes et attributs avant stabilisation.

## Scripts bundlés : obstacle concret dans le cycle actuel

Dans `build.ts`, `assets.prepare()` précède `discoverPages()`. Dans `vite.ts`, les entrées viennent de la configuration, de `_client/main.*` ou d’`index.html`. Un script découvert pendant le rendu d’une page arrive donc trop tard pour participer à ce build d’assets. [Cycle de build](../packages/ssg/src/build.ts), [intégration Vite](../packages/ssg/src/vite.ts).

Pour des scripts TypeScript avec imports :

1. Analyser les sources et leurs composants/layouts accessibles avant le build client, sans exécuter les scripts navigateur.
2. Exposer chaque script comme sous-module associé au fichier source, avec résolution relative, diagnostics et sourcemap.
3. Fournir les entrées à Vite et conserver une correspondance stable avec les URLs produites.
4. Générer les références de scripts/CSS pendant le rendu ; définir leur ordre et la déduplication lorsqu’un composant apparaît plusieurs fois.
5. Invalider les modules et pages concernés lorsqu’un script, un composant ou un import change.

Cela peut être porté initialement par une `AssetIntegration` spécialisée plutôt que par une refonte de l’API SSG. La découverte préalable doit couvrir les layouts et composants importés, pas uniquement les fichiers de routes. Les imports dynamiques demandent une règle explicite ; le premier prototype peut les exclure du graphe de templates pris en charge.

Vite fournit les hooks pour les formats personnalisés et les modules virtuels ; les sous-modules provenant d’un fichier réel doivent garder leur lien avec cette source pour le mapping. [API officielle Vite](https://vite.dev/guide/api-plugin).

Astro effectue aussi bundling, conversion TypeScript et déduplication de scripts. Ce sont des fonctionnalités de son pipeline complet, pas du seul parsing. Vincle doit définir ses règles indépendamment, notamment la distinction inline/bundlé. [Scripts Astro](https://docs.astro.build/en/guides/client-side-scripts/).

## Outillage et frontières de packages

Architecture proposée : package de compilation de templates indépendant de Flow, adaptateurs de chargement/build dans l’intégration SSG. Core conserve ses contrats de rendu neutres. Les types spécifiques au format ou à SSG restent dans leurs packages ; toute extension JSX éventuelle utilise l’augmentation des interfaces Core conformément à AGENTS.md.

Le précompilateur JSX actuel appelle Oxc sur du TSX/JSX standard. Il peut rester une optimisation optionnelle en aval d’une génération JSX valide, sans devenir le parser du nouveau langage. Il faut composer les sourcemaps de chaque étape. [Précompilateur](../packages/precompile/src/index.ts).

Un build réussi ne garantit pas le typage des sources `.vincle`. Astro lui-même utilise un outillage dédié : `tsc` ignore les fichiers `.astro`, et le contrôle CLI passe par `astro check`. Pour Vincle, une projection TSX avec mappings, un contrôle CLI et une intégration éditeur sont des travaux distincts. Associer l’extension à une grammaire Astro peut aider la coloration d’un prototype, mais ne fournit pas automatiquement le typage Vincle. [TypeScript Astro](https://docs.astro.build/en/guides/typescript/), [éditeurs](https://docs.astro.build/en/editor-setup/).

## Vérification effectuée et limites

Un essai temporaire a enregistré un handler `.vincle`, envoyé du JS généré à `source.modules.load(...)`, puis lancé `build({ assets: false })`. Le résultat attendu a été vérifié exactement :

```html
<main>
  <h1>Hello &amp; welcome</h1>
  <script>
    if (1 < 2) {
      console.log("ok");
    }
  </script>
</main>
```

L’essai confirme la découverte du format, le chargement du module, le rendu Core et la publication HTML. Le JS était écrit manuellement : **aucun parser `.vincle`, compilateur Astro, bundling client ou support éditeur n’a été testé**. Le processus esbuild s’est arrêté dans le sandbox ; le même essai a réussi avec autorisation d’exécution élargie. La fixture a été supprimée.

## Étapes de décision

| Étape                   | Critère de réussite                                                                                 | Effort relatif |
| ----------------------- | --------------------------------------------------------------------------------------------------- | -------------- |
| Prototype parser → Core | Page, layout, composant TSX et script brut produisent le HTML attendu ; erreurs localisées.         | Modéré         |
| Graphe de templates     | Imports `.vincle`, layout, watch et suppression/recréation fonctionnent en dev et build.            | Modéré         |
| Assets embarqués        | Script TS avec import, composant répété, CSS global, base d’URL et manifeste fonctionnent ensemble. | Élevé          |
| Expérience développeur  | Erreurs de props et scripts mappées vers la source ; contrôle CLI, coloration et formatage définis. | Élevé          |

Premier objectif conseillé : valider le parser et la sémantique sur une page et un layout avant de promettre un format public. Couvrir `<`, accolades, backticks, commentaires, faux tags, Unicode/positions, `</script>`, JSON-LD, attributs dynamiques, imports et espaces significatifs. Comparer rendu compilé et JSX équivalent. Le résultat de ce prototype déterminera si le parser Astro mérite une dépendance durable.
