# CONTEXT.md — Glossaire domaine Vincle

Ce fichier nomme les concepts du domaine pour les reviews d'architecture et les
discussions de design. La référence normative reste GOAL.md.

## Décisions

Les décisions de design vivent dans GOAL.md (le nord) et dans la mémoire projet
(`kyle-memory/projects/vincle/memory.md`).

## Modes de rendu

- **fold statique** — `tryRenderStatic`/`serialize.ts` : passage unique qui
  pré-rend l'arbre statique en `RawString` au moment de `jsx()`. Le moteur de
  perf (GOAL : perf kitajs même à deux passes).
- **marche** — `renderNode`/`render.ts` : parcours de l'arbre VNode, en string
  (`renderToString`) ou en chunks (`renderToChunks`).
- **precompile** — `jsxEscape`/`jsxTemplate`/`jsxAttr`/`jsx-runtime.ts` :
  runtime des transforms Deno/Bun-style (`jsxImportSource: "precompile"`).
  Un troisième rendu du même arbre, émis par le compilateur.

## Types

- **RawString** — HTML de confiance, bypass l'échappement. L'exécution des
  éléments statiques : `jsx()` rend un `RawString`, pas un VNode.
- **VNode** — nœud dynamique (composants, promesses, éléments non-foldables).

## Règles du moteur

- **document order** — les composants s'exécutent dans l'ordre du markup ;
  invariant central, vit dans `renderChildrenAsync` et ses copies.
- **règle rawtext** — les enfants directs de `<script>`/`<style>` suivent
  l'échappement rawtext HTML5, pas l'échappement texte normal.

## Module attributs

- **serializeAttr** — le sérialiseur d'UNE valeur d'attribut : la taxonomie de
  valeurs (string, boolean, number/bigint, RawString, style, class, fonction →
  erreur, URL → `#blocked`) vit ici, une fois, testée dans `attrs.test.ts`.
  Sync : les promesses sont une politique async des appelants.
- **buildAttrs** — adaptateur batch (le fold) : boucle, réservés, alias
  collision, espace de tête. Garde une copie inline de la taxonomie : la
  délégation coûte 13-16 % au fold (mesuré 2026-07-31, bench:stats 3.9σ/3.7σ —
  l'allocation RawString par attribut est le prix). L'équivalence résiduelle
  `buildAttrs ≡ serializeAttr` la garde alignée.
- **jsxAttr** — adaptateur valeur-seule (precompile) : délègue à serializeAttr,
  seule la récursion des promesses lui appartient. Avant la fusion (2026-07-31),
  c'était une implémentation parallèle qui avait dérivé 4 fois de buildAttrs,
  dont une injection (`jsxAttr('x"><script>', v)` fermait le tag).

## @vincle/flow

- **Template / Slot / Include** — primitives de fragments différés.
- **Adapter** — contrat des adaptateurs (Turbo, HTMX, Native, ESI, WebPlatform) :
  Placeholder, Patch, Frame, capabilities, transformShell, encode.
- **encodeWith** — l'unique implémentation d'encode : protocole du wire
  (séparateur `\n`), vit du côté adaptateur (candidat à déplacer dans la
  primitive — voir rapport 2026-07-31).
