/**
 * The JSX type contract — checked by `bun run check`, not by `bun test`.
 *
 * This file has no runtime assertion: it *is* the assertion. If it compiles,
 * `JSX.ElementType` accepts everything the renderers know how to render; each
 * `@ts-expect-error` fails if the error it expects disappears, so widening is
 * locked in both directions.
 *
 * It's also the package's only `.tsx` file, so the only place the tsconfig's
 * `jsxImportSource: "./src"` is actually exercised.
 *
 * @module
 */
import { Fragment, raw } from "./index.js";

// ── Must compile: everything `renderNode` knows how to render ─────────────

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

// ── Must NOT compile: widening goes to renderable, not to `any` ───────────

const BadObject = () => ({ a: 1 });
const BadSymbol = () => Symbol("nope");
const BadMap = () => new WeakMap();

// @ts-expect-error a plain object is not renderable
export const rejected1 = <BadObject />;
// @ts-expect-error a symbol is not renderable
export const rejected2 = <BadSymbol />;
// @ts-expect-error a WeakMap is neither a node nor an iterable of nodes
export const rejected3 = <BadMap />;

// `JSX.IntrinsicElements` used to accept any attribute on any element — this
// block locks the opposite, both ways: refusing `class={[…]}` would be just
// as wrong as accepting `<dvi>`.

// Must compile: what the engine actually serializes.
declare const isActive: boolean;

export const attrsAccepted = [
  <div class={["a", isActive && "b", null]} style={{ color: "red", "--brand": 1 }} />,
  <div class="simple" style="color:red" />,
  <li key="k">clé relevée par le transform, pas un attribut</li>,
  <input disabled readOnly maxLength={3} autoFocus />,
  <a href={Promise.resolve("/tard")} title={raw("d&eacute;j&agrave;")} />,
  // A handler is inline script, so it's a string.
  <button onclick="submit()" onClick="submit()" />,
  <img src="/a.png" alt="" width={16} height={16} />,
  <svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg">
    <path d="M0 0h10v10z" strokeWidth={2} />
  </svg>,
  <label htmlFor="champ">étiquette</label>,
  <div dangerouslySetInnerHTML={{ __html: "<b>x</b>" }} />,
  // Custom elements stay open: a hyphen, and nobody knows their attributes.
  // `data-*` / `aria-*` pass everywhere (TypeScript doesn't check non-identifier
  // attribute names).
  <my-widget whatever="ok" data-x="1" aria-hidden="true">
    contenu
  </my-widget>,
  <div data-turbo="false" aria-label="x" />,
];

// Must NOT compile.

// @ts-expect-error `dvi` isn't an element — and has no hyphen, so it isn't a
// custom element either
export const attrsRejected1 = <dvi />;
// @ts-expect-error `clas` isn't an attribute of `div`
export const attrsRejected2 = <div clas="typo" />;
// @ts-expect-error a function isn't serializable to HTML — `buildAttrs` throws
export const attrsRejected3 = <div onClick={() => {}} />;
// @ts-expect-error `tabIndex` is a number
export const attrsRejected4 = <div tabIndex="1" />;
// @ts-expect-error `ref` has no meaning outside a reconciler
export const attrsRejected5 = <div ref={null} />;
// @ts-expect-error a symbol is not a renderable child
export const attrsRejected6 = <div>{Symbol("nope")}</div>;
// @ts-expect-error `defaultValue` is a React notion, not an HTML attribute
export const attrsRejected7 = <input defaultValue="x" />;
