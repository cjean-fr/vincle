# Générateur de site : premier plan

Statut : première version implémentée localement, 6 octobre 2026.
`@vincle/site`, le site personnel et la documentation utilisent le moteur commun.
Aucune publication sur le registre ni migration des serveurs de développement.

## Objectif

Extraire un petit module de génération statique, provisoirement nommé
`@vincle/site`, éprouvé par deux consommateurs : le site personnel de
`home/apps/website` et la documentation de Vincle.

La profondeur recherchée : les consommateurs fournissent les sorties à
produire ; le module concentre leur validation, leur écriture et leur cycle de
vie. La localité porte sur les fichiers générés, le levier sur les deux sites.
Le rendu et les choix éditoriaux restent dans les consommateurs.

## Ce que les deux sites font déjà

| Responsabilité    | Site personnel                                 | Documentation                                                    |
| ----------------- | ---------------------------------------------- | ---------------------------------------------------------------- |
| Sources           | Table de routes explicite                      | Découverte MDX/JSX et métadonnées                                |
| Production        | Fonctions renvoyant des `Response`             | Rendu JSX dans un scope par page                                 |
| Sorties           | HTML, CSS, JSON, texte, XML, JPEG, PNG         | HTML, Markdown, recherche, sitemap, fichiers pour agents         |
| Chemins           | `/index.html`, `/cv/index.html`                | `/guide/introduction` → `guide/introduction.html`                |
| Ressources        | Copie de `public/`, CSS et images calculés     | Vite possède `assets/`, copie de `public/` et `agent/`           |
| Développement     | Rendu à la requête, redémarrage Bun            | Rebuild sur changement, fichiers servis, rechargement navigateur |
| Erreurs attendues | `404.html` et `418.html` avec statut explicite | Pages d'erreur générées séparément                               |

Sources de référence :

- `home/apps/website/build.ts`, `src/routes.ts`, `dev.ts`.
- `home/apps/website/src/pages/site.css.ts`, `photo.jpg.ts`, `social.png.ts`.
- `apps/docs/docs-src/lib/build-engine.tsx`, `pages.ts`, `render-document.ts`.
- `apps/docs/docs-src/lib/build-static-assets.ts`, `dev-server.ts`.

Les deux consommateurs justifient une seam de production de sorties. Ils ne
justifient pas encore un serveur de développement commun : leurs modes de
production et de rafraîchissement sont différents.

## Périmètre du premier module

Une sortie générée associe un chemin de fichier relatif à son contenu. Un URL
public et un chemin de fichier sont deux informations distinctes : le moteur
ne devine pas si `/cv/` doit devenir `cv/index.html` ou `cv.html`.

Le module prend en charge :

- Validation des chemins, doublons et collisions avec les fichiers copiés.
- Contenus textuels et binaires, sans conversion forcée en texte.
- Création des répertoires et écriture des sorties.
- Copie des ressources déclarées.
- Suppression des sorties devenues obsolètes lors d'une génération suivante.
- Conservation des ressources produites par un autre outil, notamment Vite.
- Échec explicite, avec le chemin concerné, lorsqu'une production échoue.

L'interface exacte reste à concevoir. Éviter une collection de hooks génériques
avant d'avoir migré les deux consommateurs.

### Production et fichiers dérivés

Les adaptateurs restent proches de chaque site :

- L'adaptateur du site personnel traduit ses routes et leurs `Response` en
  sorties, et valide les statuts. Un statut 404 ou 418 est accepté uniquement
  lorsqu'il est déclaré comme résultat attendu pour cette route.
- L'adaptateur de documentation garde découverte, scopes de rendu, métadonnées
  et transformations HTML. Il produit ensuite recherche, Markdown, sitemap et
  fichiers pour agents à partir du même ensemble de pages rendues.

Le moteur commun doit pouvoir recevoir ces sorties dérivées sans obliger la
documentation à rendre les pages deux fois ni à écrire des fichiers hors du
cycle de génération. Choisir cette seam pendant la migration de la doc.

Les statuts et en-têtes d'une `Response` ne survivent pas automatiquement dans
un fichier statique. Les règles Netlify et le comportement des serveurs locaux
restent explicites dans les sites pour la première version.

### Propriété des sorties

Première version : le répertoire de sortie appartient à une génération complète,
à l'exception des noms de premier niveau déclarés dans `preserve`. Toutes les
sorties sont préparées avant le remplacement. Cette propriété explicite reprend
les deux builds existants et permet le premier passage sans inventaire historique.
Un inventaire deviendra utile si une intégration doit partager un sous-répertoire
avec le générateur ; aucun des deux consommateurs ne le nécessite aujourd'hui.

Les collisions entre sorties et ressources copiées sont refusées par le moteur.
Les chemins absolus, `..` et les copies symboliques sont refusés. Une erreur de
production conserve le site précédent ; la publication par déplacements de
fichiers n'est pas atomique et les builds concurrents vers le même répertoire ne
sont pas pris en charge.

La documentation prépare encore ses fichiers dérivés dans un répertoire temporaire
avec ses producteurs existants, puis fournit l'ensemble au moteur. Leurs règles
internes restent dans la doc ; le moteur remplace uniquement la publication et
le nettoyage. Le site personnel utilise temporairement une dépendance `file:`
vers le checkout Vincle voisin : sa distribution indépendante attend une version
publiée du package.

## Répartition des packages

`@vincle/core` conserve le rendu et les interfaces neutres existantes.
`@vincle/site` porte la génération de fichiers ; il n'introduit aucun type de
site, de MDX ou de Flow dans Core. Sa dépendance à Core n'est nécessaire que
si son interface expose réellement du rendu JSX.

Flow reste une intégration facultative. Si un site produit des fragments
statiques avec `renderToStatic`, l'adaptateur traduit les fragments en sorties.
Cela ne nécessite pas de dépendance à Flow dans le moteur commun.

MDX, Vite, Tailwind, Sharp, traduction, navigation et recherche restent dans
leurs consommateurs ou intégrations. Aucune extraction supplémentaire à ce stade.

## Étapes et critères de réussite

1. **Capturer les contrats des deux sites.** Inventorier chemins, contenu,
   erreurs attendues et fichiers externes ; distinguer les données variables
   des sorties comparables. Terminé lorsque les deux builds ont un référentiel
   permettant de vérifier une migration.
2. **Créer le moteur minimal et migrer le site personnel.** Conserver ses
   fonctions de routes et son serveur local. Terminé lorsque son build produit
   les mêmes fichiers et contenus, y compris CSS, images et pages d'erreur.
3. **Migrer l'écriture et le nettoyage de la documentation.** Conserver ses
   producteurs de contenu. Adapter l'interface seulement aux besoins réels des
   fichiers dérivés et de Vite. Terminé lorsque build complet et refresh passent
   par le même cycle de sorties et que les tests de la doc restent valides.
4. **Réévaluer la profondeur.** Retirer les duplications remplacées dans les
   deux sites. Stabiliser l'interface après les migrations ; décider alors si
   un CLI ou une intégration de développement apporte un gain mesurable.

## Validation

Tester le moteur à travers son interface avec de vrais répertoires temporaires :
texte et binaire, suppression et renommage, conservation de Vite et des fichiers
publics, collisions, chemins invalides, erreur de production et reprise.

Conserver les tests des sites pour le rendu, le référencement, les ressources
et les statuts HTTP locaux. Le test de lifecycle ajouté à la documentation
constitue déjà un contrat de migration.

## Validation de cette première version

- Moteur : 16 tests de fichiers, vérification TypeScript et compilation.
- Site personnel : build, TypeScript et 36 tests ; les 15 sorties calculées
  correspondent au rendu direct, avec normalisation de l'horodatage du CV.
- Documentation : 112 tests, TypeScript, 87 fichiers identiques octet pour octet
  avant et après migration, ressources Vite comprises.
- Les serveurs de développement restent propres aux consommateurs.

## Suites possibles

- Publier une version du package pour remplacer la dépendance locale de `home`.
- Éprouver davantage la production de fichiers dérivés avant d'extraire MDX,
  recherche ou référencement dans une intégration dédiée.
- Envisager un inventaire ou une publication atomique uniquement lorsqu'un
  consommateur en a besoin.
