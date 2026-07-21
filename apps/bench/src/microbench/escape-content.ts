/**
 * Microbench : escapeContent (vincle) vs escapeHtml (kitajs).
 *
 * Compare différentes implémentations d'échappement HTML pour le text content.
 * Permet de trancher entre stratégies : charCodeAt vs value[i], slices vs
 * replace, regex pre-check vs pas de check, etc.
 *
 * Pour ajouter un nouveau microbench sur une autre fonction, crée un fichier
 * dans microbench/ et exporte une fonction `register()` qui enregistre ses
 * groupes via mitata. Puis ajoute-le dans index.ts.
 */
import { bench, group } from "mitata";
import { escapeContent as vincleEscape } from "@vincle/core/html";
import { escapeHtml as kitajsEscape } from "@kitajs/html";

// ── Implémentations locales pour isoler chaque stratégie ─────────────────

const RE_ONLY_AMP_LT = /[&<]/;

/** Vincle's algorithm extracré localement : charCodeAt, &/< only, slice building */
function local_vincle(str: string): string {
  const m = RE_ONLY_AMP_LT.exec(str);
  if (!m) return str;
  let out = "";
  let last = 0;
  for (let i = m.index; i < str.length; i++) {
    let rep: string;
    switch (str.charCodeAt(i)) {
      case 38:
        rep = "&amp;";
        break;
      case 60:
        rep = "&lt;";
        break;
      default:
        continue;
    }
    if (i !== last) out += str.slice(last, i);
    out += rep;
    last = i + 1;
  }
  return out + str.slice(last);
}

/** Kitajs's algorithm mais limité à & et < seulement (apples-to-apples) */
function local_kitajs_limited(value: string): string {
  if (!RE_ONLY_AMP_LT.test(value)) return value;
  const length = value.length;
  let escaped = "",
    start = 0,
    end = 0;
  for (; end < length; end++) {
    switch (value[end]) {
      case "&":
        escaped += value.slice(start, end) + "&amp;";
        start = end + 1;
        continue;
      case "<":
        escaped += value.slice(start, end) + "&lt;";
        start = end + 1;
        continue;
    }
  }
  escaped += value.slice(start, end);
  return escaped;
}

/** Hybrid : vincle guard (/[&<]/ + m.index skip) + kitajs value[i] loop */
function local_hybrid(str: string): string {
  const m = RE_ONLY_AMP_LT.exec(str);
  if (!m) return str;
  return Bun.escapeHTML(str);
  const length = str.length;
  let escaped = "",
    start = m.index,
    end = m.index;
  for (; end < length; end++) {
    switch (str[end]) {
      case "&":
        escaped += str.slice(start, end) + "&amp;";
        start = end + 1;
        continue;
      case "<":
        escaped += str.slice(start, end) + "&lt;";
        start = end + 1;
        continue;
    }
  }
  escaped += str.slice(start, end);
  return escaped;
}

const RE_AMP_LT = /[&<]/;
const isBun = typeof Bun !== "undefined" && typeof Bun.escapeHTML === "function";

/**
 * Échappe le contenu HTML pour les caractères `&` et `<` de manière ultra-optimisée.
 * S'adapte dynamiquement au runtime (Bun/V8) et à la taille de la chaîne.
 */
export function escapeContent(str: string): string {
  // 1. Fast-path natif si on tourne sur Bun (C++ / Zig ultra-rapide)
  if (isBun) {
    return Bun.escapeHTML(str);
  }

  // 2. Garde rapide sans allocation pour les chaînes "propres"
  if (!RE_AMP_LT.test(str)) {
    return str;
  }

  const length = str.length;

  // 3. Stratégie chaînes courtes (< 80 chars) : Boucle simple depuis 0
  // Évite le coût d'allocation de l'objet de match de RegExp.exec()
  if (length < 80) {
    let escaped = "";
    let start = 0;
    let end = 0;
    for (; end < length; end++) {
      switch (str[end]) {
        case "&":
          escaped += str.slice(start, end) + "&amp;";
          start = end + 1;
          continue;
        case "<":
          escaped += str.slice(start, end) + "&lt;";
          start = end + 1;
          continue;
      }
    }
    escaped += str.slice(start, end);
    return escaped;
  }

  // 4. Stratégie chaînes longues (>= 80 chars) : RegExp.exec() pour sauter le début
  // Le coût d'allocation d'exec() est largement compensé par les itérations évitées
  const m = RE_AMP_LT.exec(str);
  if (!m) return str; // Sécurité JIT

  const firstIndex = m.index;
  let escaped = str.slice(0, firstIndex); // Correctement initialisé avec le préfixe propre !
  let start = firstIndex;
  let end = firstIndex;

  for (; end < length; end++) {
    switch (str[end]) {
      case "&":
        escaped += str.slice(start, end) + "&amp;";
        start = end + 1;
        continue;
      case "<":
        escaped += str.slice(start, end) + "&lt;";
        start = end + 1;
        continue;
    }
  }
  escaped += str.slice(start, end);
  return escaped;
}

/** Hybrid sans m.index : vincle guard + kitajs value[i] loop depuis 0 */
function local_hybrid_noskip(str: string): string {
  if (!RE_ONLY_AMP_LT.test(str)) return str;
  const length = str.length;
  let escaped = "",
    start = 0,
    end = 0;
  for (; end < length; end++) {
    switch (str[end]) {
      case "&":
        escaped += str.slice(start, end) + "&amp;";
        start = end + 1;
        continue;
      case "<":
        escaped += str.slice(start, end) + "&lt;";
        start = end + 1;
        continue;
    }
  }
  escaped += str.slice(start, end);
  return escaped;
}



// ── Fixtures ─────────────────────────────────────────────────────────────

// Short strings
const SHORT_CLEAN = "hello world, this is a test";
const SHORT_AMP = "a & b & c";
const SHORT_LT = "a < b < c";
const SHORT_MIXED = "<a> & <b>";

// Medium strings (~200 chars)
const MED_CLEAN =
  "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation";
const MED_MIXED =
  "lorem <b>ipsum</b> dolor & sit amet & consectetur & adipiscing elit <i>sed do</i> eiusmod tempor";

// Long strings (~10KB) — generated once
function makeLongClean(len: number): string {
  const base =
    "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ";
  return base.repeat(Math.ceil(len / base.length)).slice(0, len);
}

function makeLongEscaped(len: number, freq: number): string {
  // Generate a string where every `freq`-th char is & or <
  let s = "";
  for (let i = 0; i < len; i++) {
    if (i % freq === 0) {
      s += i % 2 === 0 ? "&" : "<";
    } else {
      s += "x";
    }
  }
  return s;
}

const LONG_CLEAN_1K = makeLongClean(1024);
const LONG_CLEAN_10K = makeLongClean(10_240);
const LONG_CLEAN_100K = makeLongClean(102_400);
const LONG_ESC_1K = makeLongEscaped(1024, 10);     // ~10% escape chars
const LONG_ESC_10K = makeLongEscaped(10_240, 10);
const LONG_ESC_SPARSE_10K = makeLongEscaped(10_240, 100);  // ~1% escape

// ── Helpers ──────────────────────────────────────────────────────────────

type EscapeFn = (s: string) => string;

function benchImpl(name: string, fn: EscapeFn, fixture: string): void {
  bench(name, () => fn(fixture));
}

function benchGroup(
  label: string,
  fixture: string,
  fns: [string, EscapeFn][],
): void {
  group(label, () => {
    for (const [name, fn] of fns) {
      benchImpl(name, fn, fixture);
    }
  });
}

// ── Register benchmarks ─────────────────────────────────────────────────

export function register(): void {
  // ── 0. Hybrid verification — direct comparison of the 4 key candidates ──

  const HYBRID_CHECK: [string, EscapeFn][] = [
    ["vincle (actuel)", vincleEscape],
    ["kitajs-limited", local_kitajs_limited],
    ["hybrid (guard vincle + value[i])", local_hybrid],
    ["hybrid-noskip", local_hybrid_noskip],
  ];

  group("0a. Hybrid — short clean", () => {
    for (const [name, fn] of HYBRID_CHECK) benchImpl(name, fn, SHORT_CLEAN);
  });
  group("0b. Hybrid — short & only", () => {
    for (const [name, fn] of HYBRID_CHECK) benchImpl(name, fn, SHORT_AMP);
  });
  group("0c. Hybrid — short mixed", () => {
    for (const [name, fn] of HYBRID_CHECK) benchImpl(name, fn, SHORT_MIXED);
  });
  group("0d. Hybrid — medium clean (~200)", () => {
    for (const [name, fn] of HYBRID_CHECK) benchImpl(name, fn, MED_CLEAN);
  });
  group("0e. Hybrid — medium mixed", () => {
    for (const [name, fn] of HYBRID_CHECK) benchImpl(name, fn, MED_MIXED);
  });
  group("0f. Hybrid — long clean 10KB", () => {
    for (const [name, fn] of HYBRID_CHECK) benchImpl(name, fn, LONG_CLEAN_10K);
  });
  group("0g. Hybrid — long 10% escape 10KB", () => {
    for (const [name, fn] of HYBRID_CHECK) benchImpl(name, fn, LONG_ESC_10K);
  });
}
