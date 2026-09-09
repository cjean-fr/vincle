/**
 * Tag-name vocabulary: what a tag may be called.
 *
 * A leaf module on purpose — it imports nothing. The door, `jsx-runtime.ts`,
 * validates with these answers, and `serialize.ts` re-exports them for the
 * `./html` barrel — which is what imports `serialize.ts`. The answers cannot
 * live in the door without a cycle, so they live here, one leaf both import.
 *
 * @module
 */

// `\p{C}` under `/u` drags in Unicode tables, so valid names are memoised in a
// `Set` — cheaper per hit than a `Map` on this hot path, and there's no value to
// dereference. Invalid names aren't cached: they throw, so re-paying the regex
// on the way out costs nothing anyone waits for.
//
// The scan below runs before the memo, not after: scanning a tag name costs
// less than a hash lookup, which is a call into a builtin — 5 to 9% across both
// engines on `stack` and `realworld`.
const RE_INVALID_TAG = /^[!?]|[\s"'<>/=`\\]|\p{C}/u;

const VALID_TAGS = new Set<string>();
const VALID_TAGS_MAX = 1024;

export function isValidTag(tag: string): boolean {
  const len = tag.length;
  if (len === 0) return false;
  let i = 0;
  while (i < len) {
    const c = tag.charCodeAt(i);
    if (c < 97 || c > 122) break;
    i++;
  }
  if (i === len) return true;

  if (VALID_TAGS.has(tag)) return true;
  if (RE_INVALID_TAG.test(tag)) return false;
  if (VALID_TAGS.size < VALID_TAGS_MAX) VALID_TAGS.add(tag);
  return true;
}

export function invalidTagMessage(tag: string): string {
  return (
    `[vincle/core] Invalid tag name ${JSON.stringify(tag)}: a tag name must not be empty, ` +
    'start with "!" or "?", or contain whitespace, control characters, or any of " \' < > / = ` \\ . ' +
    'If the tag is computed, check the expression that produced it — it must be a plain tag name like "div", not a component or an undefined value.'
  );
}
