# GOAL

Ce document est le nord de Vincle. Il ne décrit pas ce qui existe, mais ce
que chaque décision — code, API, découpage de package — doit servir. Quand un
choix hésite entre deux options, c'est ce document qui tranche.

## Ce qu'on veut

- **Performance proche de kitajs**, même à deux passes (fold statique +
  arbre dynamique). Deux passes n'est pas une excuse — c'est le prix d'avoir
  du streaming et de l'async que kitajs n'a pas. Ce prix doit rester
  négligeable, jamais un compromis qu'on subit.

- **`<Template>` / `<Slot>` propres, "à la Island/Suspense"** — un modèle
  mental que quiconque connaît React Suspense ou les Islands doit reconnaître
  immédiatement, sans réapprendre un vocabulaire maison. La primitive vient
  d'abord, l'adaptateur (Turbo, HTMX, Native, ESI) vient après et ne doit
  jamais fuiter dans la primitive.

- **Future-proof** : prêt pour les drafts de rendu out-of-band sans JS
  (streaming HTML natif, swaps déclaratifs côté navigateur) et pour
  `AsyncLocalStorage` sur tous les runtimes qui le supportent, avec un
  fallback correct — jamais silencieux — là où il ne l'est pas. Le jour où
  ces standards se stabilisent, Vincle doit s'aligner sans réécriture.

- **Aucune architecture "hacky"**. Un contournement de type qui ment sur ce
  qu'un moteur accepte réellement (`as unknown as X`), un flag qui triche
  pour faire passer un test, une abstraction qui existe pour cacher un bug
  plutôt que pour clarifier une idée : aucun de ces raccourcis n'a sa place
  ici, même temporairement. Voir la note de conception ci-dessous.

- **Être le partenaire du dev : casser vite, et casser fort.** Une erreur
  d'usage (scope absent, clé de contexte introuvable, runtime incompatible,
  schéma d'URL dangereux) doit lever une erreur explicite, au plus tôt,
  avec un message qui dit quoi faire — jamais un `undefined` silencieux, un
  fallback qui masque le problème, ou un comportement différent en prod
  qu'en dev. Un dev qui se trompe doit le savoir à la compilation ou au
  premier appel, pas trois couches plus loin en debug de prod.

- **Solution clé en main pour HTMX et Turbo** — pas un exemple qui marche
  dans la démo et lâche en prod. Les adaptateurs `@vincle/flow` doivent être
  la référence que la communauté HTMX/Turbo pointe du doigt en disant
  "voilà comment on fait du SSR streamé proprement".

- **D'autres intégrations** au-delà de HTMX/Turbo — chaque nouvel
  adaptateur valide que l'abstraction `Adapter` de `@vincle/flow` est la
  bonne, pas un cas particulier de plus à maintenir.

- **Un générateur de doc "à la Starlight"**, en Vincle. `apps/docs` n'est pas
  qu'une vitrine : c'est le premier gros consommateur réel de Vincle, et sa
  friction est un signal direct. Si `apps/docs` doit contourner Vincle pour
  avancer, c'est Vincle qu'on corrige, pas la doc qu'on adapte. Ce projet
  doit devenir le meilleur banc d'essai de la DX du framework, puis un
  package publiable à part entière.

- **DX parfaite** : une interface simple qui masque la complexité inutile,
  mais que l'on peut rouvrir sans étage caché ni magie non documentée dès
  qu'on en a besoin. Le chemin heureux tient en trois lignes ; le chemin
  avancé existe et est aussi propre que le premier.

- **Prod-ready pour des grands comptes** : pas de surface d'attaque
  (échappement par défaut, schémas d'URL filtrés, pas d'exécution de code
  injecté), une dégradation prévisible sous charge, et une compatibilité
  runtime large (Node, Bun, Deno, Cloudflare Workers) vérifiée, pas supposée.

- **Tests automatisés, de mutation, et un golden standard React
  (server-side only) avec les écarts documentés.** Un écart de comportement
  avec React server-side n'est acceptable que s'il est nommé, justifié, et
  écrit noir sur blanc — jamais découvert en prod par un utilisateur.

- **`@vincle/vite-plugin-precompile` doit précompiler sans dépendre du style
  Deno, pour tout runtime JSX qui expose `jsxTemplate`** (Preact, Hono/JSX,
  et au-delà) — pas seulement Vincle. La précompilation est une brique
  générique ; Vincle en est un client, pas le seul bénéficiaire.

## Ce qui rend Vincle distinctif

Deux exemples concrets de ce que "sans étage caché" veut dire en pratique —
la barre à tenir pour toute nouvelle fonctionnalité :

- **L'async est natif dans les composants, sans rien demander au dev.** Un
  composant qui `await` ses données se rend correctement, point. Pas de
  `useState` + `useEffect` + suspense boundary à orchestrer comme en React —
  la fonction est async, elle est awaited, elle produit du HTML. C'est le
  cœur du renseignement : `@vincle/core` connaît la forme `Awaitable<T>` de
  bout en bout (VNode, RawString, Promise des deux) précisément pour que
  cette promesse ne se brise jamais, y compris dans les coins profonds du
  moteur (fragments imbriqués, tableaux d'enfants mixtes sync/async). Le
  jour où un composant async produit un résultat incorrect parce que le
  moteur ne l'a pas vu venir, c'est un bug de `@vincle/core`, jamais un
  détail d'implémentation que le dev doit connaître pour s'en prémunir.

- **`<script>` et `<style>` acceptent du vrai JS/CSS écrit tel quel** —
  pas de `dangerouslySetInnerHTML`, pas de syntaxe d'échappement maison, pas
  de template string à part. Le contenu de ces balises suit les règles
  d'échappement HTML *rawtext* (celles que le navigateur applique déjà à
  `<script>`/`<style>`), pas celles du texte JSX normal. Le dev écrit
  `<script>{`if (x < 1) {}`}</script>` et ça marche, parce que le moteur sait
  que ces deux balises ne sont pas comme les autres — il n'a pas besoin
  qu'on le lui répète à chaque appel.

- **Le contexte scopé-async est modifiable, pas juste lisible.** Pas de
  `<Provider value={...}>` à empiler dans l'arbre pour changer une valeur —
  `setContext(key, value)` mute directement le scope `AsyncLocalStorage`
  courant, à n'importe quel point du rendu, et devient visible pour tout ce
  qui se rend après, isolé proprement entre requêtes concurrentes. C'est un
  contexte au sens propre du terme (une pile d'exécution qui porte de
  l'état), pas une prop qu'on refait descendre à chaque niveau. Ça doit
  rester vrai même si `AsyncLocalStorage` n'est pas disponible sur le
  runtime cible : le fallback synchrone existe pour ça, pas comme
  échappatoire qui casse la sémantique en silence.

## Cohérence par package

Chaque paquet garde une responsabilité et une seule ; le nord ci-dessus se
lit différemment selon où on se trouve :

| Package | Ce qu'il doit rester |
| :-- | :-- |
| `@vincle/core` | Le moteur JSX → HTML. Zéro dépendance, zéro fuite d'implémentation dans son API publique. Toute la performance et toute la correctness async/streaming naissent ici — les autres packages en héritent, ils ne la réinventent pas. |
| `@vincle/flow` | Les fragments différés et le streaming. Chaque adaptateur (Turbo, HTMX, Native, WebPlatform, ESI) parle le même contrat (`Adapter`) — s'il a besoin d'un cas spécial dans le cœur de `@vincle/flow`, c'est que le contrat est incomplet, pas que l'adaptateur a raison de tricher. |
| `@vincle/vite-plugin` | L'intégration assets Vite. Rien d'autre — pas de logique de rendu, pas de logique de streaming. |
| `@vincle/precompile-core` + `@vincle/vite-plugin-precompile` | La précompilation JSX, agnostique du runtime cible. `@vincle/core` est un client parmi d'autres, jamais un couplage caché. |
| `@vincle/eslint-plugin` | Les garde-fous d'usage sûr de `@vincle/core` — encode en règle ce que la doc ne peut qu'expliquer. |
| `apps/docs` | Le banc d'essai grandeur nature de la DX Vincle, et la préfiguration du générateur de doc "à la Starlight". |

## Note de conception

Le code doit être un exemple de code "parfait" : le point de rencontre entre
performance, maintenabilité, simplicité et lisibilité — jamais l'un sacrifié
pour un autre sans que ce soit un choix explicite et documenté.

Il doit refléter une idée simple : aller jusqu'au bout des choses, mais les
rendre simples par de bonnes abstractions — sans en avoir de trop. Une
abstraction se justifie par la duplication ou la complexité réelle qu'elle
supprime, jamais par anticipation d'un besoin hypothétique.
