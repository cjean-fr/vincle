// ── Benchmark: class vs tuple × accès × déstructuration ────────────
import { bench, run } from "mitata";

const N = 100_000;
const ELEMENT = Symbol.for("vincle.element");

function gen(i: number) {
  return {
    className: `item-${i % 100}`,
    id: `id-${i}`,
    style: { color: "red" },
    children: `child-${i}`,
  };
}
const ITEMS = Array.from({ length: N }, (_, i) => gen(i));

// ═════════════════════════════════════════════════════════════════════
// SHAPES
// ═════════════════════════════════════════════════════════════════════

// 1. Class sub
class VNodeC {
  readonly tag: string;
  readonly attrs: Record<string, unknown>;
  constructor(tag: string, attrs: Record<string, unknown>) {
    this.tag = tag;
    this.attrs = attrs;
  }
}
function makeC(tag: string, a: Record<string, unknown>) { return new VNodeC(tag, a); }

// 2. Tuple [Symbol, tag, attrs]
type VTuple = [typeof ELEMENT, string, Record<string, unknown>];
function makeT(tag: string, a: Record<string, unknown>): VTuple { return [ELEMENT, tag, a]; }

// 3. Tuple flat [tag, children, className, id, style]
type VTupleF = [string, unknown, string?, string?, Record<string,unknown>?];
function makeTF(tag: string, a: Record<string, unknown>): VTupleF {
  return [tag, a.children, a.className as string, a.id as string, a.style as Record<string,unknown>];
}

// ═════════════════════════════════════════════════════════════════════
// RENDER readers — 3 styles d'accès tuple
// ═════════════════════════════════════════════════════════════════════

// Class — lecture directe (référence)
function renderC(n: VNodeC): string {
  const a = n.attrs;
  return `<${n.tag} class="${(a.className as string)||''}">${(a.children as string)||''}</${n.tag}>`;
}

// Tuple — index direct
function renderT_idx(n: VTuple): string {
  const tag = n[1], a = n[2];
  return `<${tag} class="${(a.className as string)||''}">${(a.children as string)||''}</${tag}>`;
}

// Tuple — destructure locals
function renderT_des(n: VTuple): string {
  const [_, tag, a] = n;
  return `<${tag} class="${(a.className as string)||''}">${(a.children as string)||''}</${tag}>`;
}

// Tuple — destructure dans signature
function renderT_sig([_, tag, a]: VTuple): string {
  return `<${tag} class="${(a.className as string)||''}">${(a.children as string)||''}</${tag}>`;
}

// Tuple flat — index direct
function renderTF_idx(n: VTupleF): string {
  const [tag, children, className] = n;
  return `<${tag} class="${className||''}">${children||''}</${tag}>`;
}

// Tuple flat — destructure locals
function renderTF_des(n: VTupleF): string {
  const [tag, children, className] = n;
  return `<${tag} class="${className||''}">${children||''}</${tag}>`;
}

// ═════════════════════════════════════════════════════════════════════
// CREATE
// ═════════════════════════════════════════════════════════════════════
bench("class sub     — create", () => { for (let i = 0; i < N; i++) makeC("div", ITEMS[i]); });
bench("tuple sub     — create", () => { for (let i = 0; i < N; i++) makeT("div", ITEMS[i]); });
bench("tuple flat    — create", () => { for (let i = 0; i < N; i++) makeTF("div", ITEMS[i]); });

// ═════════════════════════════════════════════════════════════════════
// RENDER (nodes pré-créés — pas de bruit de création)
// ═════════════════════════════════════════════════════════════════════
const nodesC = ITEMS.map(a => makeC("div", a));
const nodesT = ITEMS.map(a => makeT("div", a));
const nodesTF = ITEMS.map(a => makeTF("div", a));

bench("class sub     — render",         () => { for (let i = 0; i < N; i++) renderC(nodesC[i]); });
bench("tuple sub idx — render",         () => { for (let i = 0; i < N; i++) renderT_idx(nodesT[i]); });
bench("tuple sub des — render",         () => { for (let i = 0; i < N; i++) renderT_des(nodesT[i]); });
bench("tuple sub sig — render",         () => { for (let i = 0; i < N; i++) renderT_sig(nodesT[i]); });
bench("tuple flat    — render",         () => { for (let i = 0; i < N; i++) renderTF_idx(nodesTF[i]); });

// ═════════════════════════════════════════════════════════════════════
// COMBINED (create + render — réel)
// ═════════════════════════════════════════════════════════════════════
bench("class sub     — combined",       () => { for (let i = 0; i < N; i++) renderC(makeC("div", ITEMS[i])); });
bench("tuple sub idx — combined",       () => { for (let i = 0; i < N; i++) renderT_idx(makeT("div", ITEMS[i])); });
bench("tuple sub des — combined",       () => { for (let i = 0; i < N; i++) renderT_des(makeT("div", ITEMS[i])); });
bench("tuple sub sig — combined",       () => { for (let i = 0; i < N; i++) renderT_sig(makeT("div", ITEMS[i])); });
bench("tuple flat    — combined",       () => { for (let i = 0; i < N; i++) renderTF_idx(makeTF("div", ITEMS[i])); });

await run();
