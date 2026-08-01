/**
 * Contrat de types du JSX — vérifié par `bun run check`, pas par `bun test`.
 *
 * Ce fichier ne contient aucune assertion d'exécution : il *est* l'assertion.
 * S'il compile, `JSX.ElementType` accepte tout ce que les renderers savent
 * rendre ; les `@ts-expect-error` échouent si l'erreur qu'ils attendent
 * disparaît, donc l'élargissement est verrouillé dans les deux sens.
 *
 * C'est aussi le seul fichier `.tsx` du package, donc le seul endroit où le
 * `jsxImportSource: "./src"` du tsconfig est réellement exercé.
 *
 * @module
 */
import { Fragment, raw } from "./index.js";

// ── Doivent compiler : tout ce que `renderNode` sait rendre ────────────────

const Str = () => "hello";
const Num = () => 42;
const Big = () => 10n;
const Bool = () => false;
const Nul = () => null;
const Undef = () => undefined;
const Arr = () => [<div>a</div>, <div>b</div>];
const Nested = () => [["a", 1], [<i>b</i>]];
const Raw = () => raw("<b>déjà échappé</b>");
const Async = async () => <div>tard</div>;
const Gen = async function* () {
  yield <li>a</li>;
  yield "b";
};
const Compose = ({ label }: { label: string }) => (
  <p>
    {label}
    <Str />
  </p>
);

export const accepted = [
  <Str />,
  <Num />,
  <Big />,
  <Bool />,
  <Nul />,
  <Undef />,
  <Arr />,
  <Nested />,
  <Raw />,
  <Async />,
  <Gen />,
  <Compose label="x" />,
  <div>élément simple</div>,
  <my-element data-x="1">custom</my-element>,
  <>fragment court</>,
  <Fragment>fragment explicite</Fragment>,
];

// ── Ne doivent PAS compiler : on élargit vers le rendable, pas vers `any` ──

const BadObject = () => ({ a: 1 });
const BadSymbol = () => Symbol("nope");
const BadMap = () => new WeakMap();

// @ts-expect-error un objet quelconque n'est pas rendable
export const rejected1 = <BadObject />;
// @ts-expect-error un symbole n'est pas rendable
export const rejected2 = <BadSymbol />;
// @ts-expect-error un WeakMap n'est ni un nœud ni un itérable de nœuds
export const rejected3 = <BadMap />;

// ── Contrat d'attributs des éléments intrinsèques ──────────────────────────
//
// `JSX.IntrinsicElements` était `{ [K in string]: Record<string, unknown> }` :
// tout élément acceptait tout attribut, donc aucune faute de frappe n'était une
// erreur. Ce bloc est ce qui interdit d'y revenir — et il est symétrique, parce
// qu'un typage qui refuse `class={[…]}` ou `<my-widget>` serait tout aussi faux
// qu'un typage qui accepte `<dvi>`.

// Doivent compiler : ce que le moteur sérialise réellement.
declare const isActive: boolean;

export const attrsAccepted = [
  <div class={["a", isActive && "b", null]} style={{ color: "red", "--brand": 1 }} />,
  <div class="simple" style="color:red" />,
  <li key="k">clé relevée par le transform, pas un attribut</li>,
  <input disabled readOnly maxLength={3} autoFocus />,
  <a href={Promise.resolve("/tard")} title={raw("d&eacute;j&agrave;")} />,
  // Un gestionnaire est du script inline, donc une chaîne.
  <button onclick="submit()" onClick="submit()" />,
  <img src="/a.png" alt="" width={16} height={16} />,
  <svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg">
    <path d="M0 0h10v10z" strokeWidth={2} />
  </svg>,
  <label htmlFor="champ">étiquette</label>,
   <div dangerouslySetInnerHTML={{ __html: "<b>x</b>" }} />,
  // Les éléments custom restent ouverts : un tiret et personne ne connaît leurs
  // attributs. Les `data-*` / `aria-*` passent partout (TypeScript ne vérifie
  // pas les noms d'attribut non identifiants).
  <my-widget whatever="ok" data-x="1" aria-hidden="true">
    contenu
  </my-widget>,
  <div data-turbo="false" aria-label="x" />,
];

// Ne doivent PAS compiler.

// @ts-expect-error `dvi` n'est pas un élément — et n'a pas de tiret, donc ce
// n'est pas non plus un élément custom
export const attrsRejected1 = <dvi />;
// @ts-expect-error `clas` n'est pas un attribut de `div`
export const attrsRejected2 = <div clas="typo" />;
// @ts-expect-error une fonction n'est pas sérialisable en HTML — `buildAttrs` lève
export const attrsRejected3 = <div onClick={() => {}} />;
// @ts-expect-error `tabIndex` est un nombre
export const attrsRejected4 = <div tabIndex="1" />;
// @ts-expect-error `ref` n'a aucun sens hors d'un réconciliateur
export const attrsRejected5 = <div ref={null} />;
// @ts-expect-error un symbole n'est pas un enfant rendable
export const attrsRejected6 = <div>{Symbol("nope")}</div>;
// @ts-expect-error `defaultValue` est une notion React, pas un attribut HTML
export const attrsRejected7 = <input defaultValue="x" />;
