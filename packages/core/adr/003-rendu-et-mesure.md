# ADR-003 : Rendu et mesure

**Status** : actif — cette ADR est **contraignante**. Elle remplace ADR-001
(stratégie de support des composants async) et ADR-002 (méthodologie de
benchmark), supprimées, dont tout le contenu encore valide est repris ici.
ADR-001 reste consultable dans l'historique (commit `64ecc9a`) ; ADR-002 n'avait
jamais été commitée, elle n'a donc pas d'autre trace que ce document.

**Date** : 2026-07-29

---

## Pourquoi un seul document

ADR-001 mélangeait deux natures de contenu : des décisions d'architecture et des
tableaux de mesures. Une décision d'architecture vit des années ; un chiffre de
perf périme au commit suivant. Réunis dans un même document, ils finissent par se
contredire — et c'est arrivé : ADR-001 affirmait un surcoût async de « 17 à 44 %
sur le hot path sync », mesuré avec une méthode qu'ADR-002, daté du même jour,
interdisait explicitement. Une mesure ultérieure a montré que le mécanisme
incriminé — un type de retour `string | Promise<string>` par nœud — coûte un
ordre de grandeur de moins.

D'où la règle qui gouverne ce document : **il ne contient aucun résultat de
mesure décrivant le code actuel.** Les anecdotes datées sur le passé y restent
— elles ne prétendent pas décrire le présent, donc elles ne périment pas.

---

## 1. Décisions de rendu

### Aucun rendu synchrone

`@vincle/core` expose `renderToString` et `renderToChunks`, tous deux dans
`render.ts`, tous deux asynchrones.

Exporter en plus un renderer synchrone serait tentant — il est plus rapide — mais
c'est deux surfaces publiques, deux comportements à documenter, et un piège : le
dev choisit le renderer sync, écrit un composant async six mois plus tard, et
récolte du HTML corrompu **sans erreur**. Le renderer sync ne lève rien sur une
Promise, il émet `[object Promise]` dans la sortie. Ce silence est la raison de
n'avoir aucune porte synchrone, et elle doit toujours marcher (cf. `GOAL.md`,
« être le partenaire du dev »).

Corollaire : toute proposition de rendre l'API publique synchrone, ou d'ajouter un
troisième export de rendu, doit d'abord dire ce qu'elle fait de ce silence.

Corollaire moins évident, et découvert de la mauvaise manière : **ce silence n'a
pas le droit d'exister ailleurs non plus.** `[object Promise]` est sorti de trois
autres endroits où le type promettait l'attente et où le moteur coerçait —
`dangerouslySetInnerHTML.__html`, les valeurs d'attribut (`class`, `style`,
`href`…), et l'inverse pour les itérables synchrones, que `Renderable` déclare
depuis toujours et que le tree-walk rendait en `[object Set]`. Chacun était une
déclaration de type non tenue. La règle qui en sort : **si le type l'autorise, le
moteur le fait** — et le contrôle, c'est `type-contract.tsx` d'un côté, la liste
de cas `jsxAttr ≡ buildAttrs` de l'autre.

### L'ordre d'exécution est l'ordre du document

Les deux renderers exécutent les composants dans l'ordre du document. Un frère
n'est démarré que lorsque celui de gauche est terminé.

Ce n'était pas le cas de `renderToString`, et c'était un choix délibéré :
`renderChildrenAsync` démarrait tous les frères restants avant d'en attendre un
seul (`Promise.all`), ce qui recouvrait leurs I/O. Le recouvrement était gratuit
— jusqu'à ce qu'un composant écrive dans le contexte. Alors le document dépendait
de la latence :

```
<div><Writer/><Reader/></div>     // Writer await, puis setContext(K, "b")
Reader rapide  →  <div>…a…</div>
Reader lent    →  <div>…b…</div>
```

Même arbre, même code, deux documents — et `renderToChunks`, ordonné par
nécessité puisque les octets partent dans l'ordre, en produisait un troisième.
Le contexte est une pile d'exécution mutable (cf. `GOAL.md`) ; des frères qui se
recouvrent sont en course dessus, et rien dans l'arbre ne disait quelle réponse
était la bonne.

Ordonner le parcours supprime la course au lieu de la documenter, et fait
coïncider les deux renderers **par construction** plutôt que par un test qui le
revérifie à chaque commit.

Ce qu'on abandonne est réel : deux composants qui font chacun un fetch ne les
recouvrent plus. Ce n'est pas un oubli, c'est un arbitrage — et le projet a déjà
l'outil qui rachète le recouvrement là où il est _visible dans le balisage_ :
`<Template>` / `<Slot>` de `@vincle/flow`. Une concurrence qu'on voit vaut mieux
qu'une concurrence qui réécrit le HTML dans le dos du dev.

Corollaire : toute proposition de rendre `renderChildrenAsync` concurrent doit
d'abord dire ce qu'elle fait du non-déterminisme. Le test qui verrouille la règle
est `src/execution-order.test.ts`.

### Deux renderers, une seule sérialisation

`renderNode` et `streamNode` parcourent le même arbre et doivent produire les
mêmes octets. Toute divergence de sérialisation est un bug, pas une variante —
`serialize.ts` est l'autorité unique sur l'enveloppe d'un élément, et le fuzz
différentiel de `render-chunks.test.ts` verrouille le reste sur 500 arbres
générés.

En pratique cela veut dire que les branches de `renderNode` et de `streamNode` se
suivent dans le même ordre. Réordonner l'une sans l'autre est une régression même
si les tests passent.

Le troisième parcours est le fold statique de `serialize.ts`, qui pré-rend un
sous-arbre à la construction. Il est soumis à la même règle, et son garde-fou est
`path-equivalence.test.ts` : le générateur construit le même arbre logique deux
fois — une fois avec `jsx` (fold actif), une fois avec un `vnodeOf` qui ne diffère
de `jsx` que par l'absence du fold — et compare les octets sur 1000 arbres. Le
contrôle ne doit différer de `jsx` que par ce seul point ; s'il en diffère par
deux, la comparaison ne mesure plus rien.

### Une seule autorité par question

Le fold et les tree-walks validaient chacun le nom de balise : trois vérifications
pour une réponse, dont deux inatteignables par l'API publique — une balise string
n'entre dans le moteur que par `jsx()`. Le fold jugeait en plus les props pour
décider s'il pouvait folder, alors que `buildAttrs`, qu'il appelle dix lignes plus
bas, savait toutes les sérialiser.

La règle : **une question, un endroit.** Le nom de balise se valide dans `jsx()`,
au plus tôt, là où la pile pointe encore l'élément écrit par le dev. Les props se
sérialisent dans `buildAttrs`, seule autorité. `dangerouslySetInnerHTML` reste la
seule prop que le fold ne peut pas voir — elle remplace les enfants qu'il lit dans
`props` — donc `jsx()` la garde pour lui.

### `renderToChunks` n'est pas un substitut de `renderToString`

Mesuré : produire une chaîne complète en drainant `renderToChunks` est nettement
plus lent que `renderToString`, parce que `streamNode` est un générateur async qui
se rappelle en `yield*` — il en alloue un **par nœud**, là où le coût d'un simple
type de retour polymorphe est marginal.

Les deux renderers sont donc justifiés, pas redondants. La tentation de les
fusionner pour « supprimer du code » reviendra : la réponse est non, sauf si
`streamNode` est d'abord réécrit sans récursion de générateurs (une pile
explicite dans `renderToChunks`, un seul générateur au sommet).

---

## 2. Comment on mesure

### Une exécution n'est pas une mesure

Entre deux exécutions du même binaire sur le même code, le débit bouge d'un ordre
de grandeur comparable à celui des optimisations qu'on cherche. Une exécution
unique, ou même un triplet, ne distingue pas un changement de code de l'humeur de
la machine.

Ce n'est pas une précaution théorique. Le 2026-07-29, trois conclusions avaient
été tenues pour des résultats : un gain attribué au cache d'attributs, annoncé sur
un triplet (l'effet existe, le chiffre publié ne reposait sur rien) ; un surcoût
attribué à la validation des noms de balise, qui s'est révélé être du bruit sur
tous les cas sauf un ; et l'idée que tout l'écart avec kitajs vivait dans la
sérialisation d'attributs, alors que le profil les donnait à parité. Cette
dernière a orienté plusieurs itérations dans le vide.

`bun run bench` reste utile pour un coup d'œil. Son résultat **ne peut pas** être
cité comme un delta.

### Deux modes, et le bon selon le cas

**Avant/après** — `bench:stats --save` puis `--against`, minimum 8 exécutions en
processus frais. C'est le mode obligatoire quand la variante remplace le code
existant.

**Intra-run** — quand les deux variantes peuvent coexister dans le même
processus, mesure-les côte à côte et agrège le _ratio_ par exécution. La variance
inter-processus les affecte identiquement et s'annule ; on résout alors des effets
que le mode avant/après laisse dans le bruit. C'est aussi le seul mode praticable
pour arbitrer un choix de représentation, puisqu'il n'exige pas d'implémenter la
refonte avant de savoir si elle vaut le coup.

### Le test porte sur la moyenne

Un écart entre deux moyennes se juge sur l'**erreur standard** (`sd / √n`), pas
sur l'écart-type d'un échantillon. Comparer à l'écart-type brut sous-estime la
significativité d'un facteur `√n` et fait passer un effet réel pour du bruit —
avec pour conséquence pratique de sur-échantillonner sans raison. Seuil retenu :
3 écarts standard de la moyenne. En dessous, ce n'est pas un résultat, et il faut
décider sur d'autres bases que la perf.

### Les chiffres ne vivent pas ici

Un résultat de mesure va dans `apps/bench/results/*.json`, daté et rattaché au
commit mesuré. Un document de décision qui cite un delta devient faux sans que
personne ne s'en aperçoive.

---

## 3. Comment on diagnostique

Les trois conclusions fausses ci-dessus, et celles qui ont suivi, ont un point
commun qui n'est pas le manque de rigueur statistique : elles sont toutes parties
d'une **lecture du code**. On repère un mécanisme suspect, on construit une
histoire mécanique plausible, et on mesure ensuite pour la confirmer. La mesure
sert à valider une hypothèse déjà choisie au lieu de désigner la cible.

### Pas de ticket de perf sans profil préalable

Le profil nomme la fonction et sa part du temps ; un ticket ne peut cibler qu'une
ligne du profil. « Je pense que X est lent » n'ouvre pas de ticket. Le seul
diagnostic de perf de ce projet qui se soit révélé juste et actionnable est le
seul qui soit parti d'un profil.

### Prouver qu'un chemin est emprunté avant de l'écrire

Pas avant de l'optimiser : **avant de l'écrire.** Le code écrit pour un cas qui
n'arrive jamais ne reste pas neutre, il devient faux — et personne ne peut le
voir, puisque rien ne l'atteint. Le cas d'école de ce projet est le test
`tag === "Fragment"` : écrit pour une forme qu'aucun transformeur JSX ne produit,
présent dans les trois tree-walks mais absent de `tryRenderStatic`, il faisait
diverger le fold statique du tree-walk pour qui l'atteignait à la main. Sa
suppression n'a cassé aucun test existant — c'est exactement ce qui le rendait
invisible.

Le critère :

> La branche doit être atteignable par un test qui passe par l'API publique
> **telle que le transformeur la produit**. S'il faut fabriquer le VNode à la
> main pour l'atteindre, la branche est morte.

Le détecteur existe déjà : Stryker. Un mutant survivant ne signale pas seulement
un test manquant — il signale du code que peut-être personne n'emprunte. Relire
`reports/mutation/mutation.html` sous cet angle est gratuit.

### Ce que cette règle ne couvre pas : la fréquence

Elle prouve qu'un chemin existe, pas à quelle fréquence il est pris. Un test de
protocole placé avant le cas dominant est sur un chemin bel et bien emprunté ;
c'est sa _position_ qui suppose une fréquence jamais vérifiée. Pour ça, la seule
réponse est de compter sur un rendu réel — `apps/docs` est un consommateur
disponible — pas de raisonner.

### Se méfier de l'explication élégante

Une explication mécanique cohérente n'est pas une preuve, et l'assurance avec
laquelle elle est formulée ne dit rien de sa justesse. Le garde-fou le plus
rentable est l'ordre de grandeur : si un mécanisme réputé coûter un tick de
microtask « explique » un écart mille fois plus grand, l'explication est fausse
avant même d'être testée.
