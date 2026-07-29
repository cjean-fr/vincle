import { buildAttrs } from "./attrs.js";
import { escapeContent, escapeRawTagContent, isRawtextTag } from "./escape.js";
import { VNode } from "./jsx-runtime.js";
import { RawString } from "./raw.js";
import { invalidTagMessage, isValidTag, serializeElement } from "./serialize.js";

// `Symbol.asyncIterator in value` force une recherche sur la chaîne de
// prototypes, et ce test tombe une fois par nœud de l'arbre. Un accès de
// propriété passe par un inline cache et coûte moins : ~2 % sur `realworld` en
// comparaison intra-run — sous le seuil de `bench:stats --against` à n=8, donc
// pas un chiffre publiable au sens d'ADR-003. Le `typeof === "function"` est
// plus strict que `in` — un objet portant un `Symbol.asyncIterator` non
// appelable n'est plus pris pour un async iterable, alors qu'il échouait de
// toute façon à l'itération — et aligne ce test sur celui que
// `jsx-precompile-runtime.ts` fait déjà pour le même protocole.
function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    value != null &&
    typeof value === "object" &&
    typeof (value as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === "function"
  );
}

export function renderToString(node: unknown): Promise<string> {
  return Promise.resolve(renderNode(node));
}

/**
 * Parcours récursif du VNode tree (version async).
 * N'accepte PAS de rawtextTag — l'échappement spécifique à `<script>` / `<style>`
 * est géré localement dans renderChildrenAsync, pas hérité.
 */
function renderNode(vnode: unknown): string | Promise<string> {
  // ── Sync fast path ──
  if (vnode === null || vnode === undefined || typeof vnode === "boolean") return "";
  if (typeof vnode === "string") return escapeContent(vnode);
  if (typeof vnode === "number" || typeof vnode === "bigint") return String(vnode);
  if (vnode instanceof RawString) return vnode.value;

  // ── Async primitives ──
  if (vnode instanceof Promise) {
    return vnode.then((resolved) => renderNode(resolved));
  }
  if (Array.isArray(vnode)) return renderChildrenAsync(vnode);
  // Ni un tableau ni un VNode ne sont jamais un async iterable, et le VNode est
  // le cas dominant : on ne paie le test de protocole que sur ce qui reste.
  // Ordre miroir de `streamNode` — les deux doivent rester interchangeables.
  if (!(vnode instanceof VNode)) {
    if (isAsyncIterable(vnode)) return collectAsyncIterable(vnode);
    return escapeContent(String(vnode));
  }

  // ── Component ──
  if (typeof vnode.tag === "function") {
    let result: unknown;
    try {
      result = vnode.tag(vnode.attrs);
    } catch (e) {
      return Promise.reject(e);
    }
    if (result instanceof Promise) {
      return result.then((r) => renderNode(r));
    }
    if (isAsyncIterable(result)) {
      return collectAsyncIterable(result);
    }
    return renderNode(result);
  }

  // ── Regular element ──
  const { tag, attrs, children } = vnode;

  if (!isValidTag(tag)) throw new TypeError(invalidTagMessage(tag));

  const attrStr = buildAttrs(attrs);
  const childTag = isRawtextTag(tag) ? tag : undefined;

  if (children !== undefined) {
    const content = renderChildrenAsync(children, childTag);
    if (content instanceof Promise) {
      return content.then((c) => serializeElement(tag, attrStr, c, true));
    }
    return serializeElement(tag, attrStr, content, true);
  }
  return serializeElement(tag, attrStr, "", false);
}

function renderChildrenAsync(children: unknown, rawtextTag?: string): string | Promise<string> {
  if (!Array.isArray(children)) {
    if (typeof children === "string") {
      return rawtextTag ? escapeRawTagContent(children, rawtextTag) : escapeContent(children);
    }
    // Non-string single child: délégué à renderNode sans rawtextTag
    return renderNode(children);
  }
  if (children.length === 0) return "";

  // Un enfant ne révèle sa nature async qu'après rendu : un VNode à
  // tag-fonction (composant) peut résoudre en Promise sans que le child brut
  // soit lui-même une Promise ou un AsyncIterable — un pré-scan des children
  // bruts (avant appel des composants) le raterait. On rend donc chaque
  // enfant une seule fois et on décide sync/async sur le résultat obtenu.
  //
  // On concatène directement au lieu de remplir un tableau puis de le `join`.
  // La plupart des listes d'enfants sont entièrement synchrones, et le tableau
  // intermédiaire y était le premier poste de coût du renderer — 35 % du temps
  // sur le bench `realworld` (profil V8), GC compris. Le tableau n'apparaît
  // qu'au premier enfant réellement async, et il ne porte alors que la queue :
  // le préfixe déjà rendu reste une simple chaîne.
  let out = "";
  let deferred: Promise<string> | undefined;
  let i = 0;

  for (; i < children.length; i++) {
    const part = renderChild(children[i], rawtextTag);
    // `renderChild` ne rend qu'une string ou une Promise : `typeof` suffit et
    // évite un `instanceof` (parcours de prototype) par enfant.
    if (typeof part !== "string") {
      // On garde le résultat : re-rendre cet enfant plus bas le rendrait deux
      // fois, ce qui perd des éléments sur un AsyncIterable déjà entamé.
      deferred = part;
      break;
    }
    out += part;
  }
  if (deferred === undefined) return out;

  const parts: (string | Promise<string>)[] = [out, deferred];
  for (i++; i < children.length; i++) parts.push(renderChild(children[i], rawtextTag));
  return Promise.all(parts).then((resolved) => resolved.join(""));
}

/**
 * Rend un enfant. Les strings directes portent l'échappement rawtext local
 * (`<script>` / `<style>`) ; tout le reste passe par `renderNode`, sans hériter
 * du rawtextTag.
 */
function renderChild(child: unknown, rawtextTag: string | undefined): string | Promise<string> {
  if (typeof child === "string") {
    return rawtextTag ? escapeRawTagContent(child, rawtextTag) : escapeContent(child);
  }
  return renderNode(child);
}

async function collectAsyncIterable(iterable: AsyncIterable<unknown>): Promise<string> {
  let out = "";
  for await (const chunk of iterable) {
    const rendered = renderNode(chunk);
    out += rendered instanceof Promise ? await rendered : rendered;
  }
  return out;
}
