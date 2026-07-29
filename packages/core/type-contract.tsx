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
