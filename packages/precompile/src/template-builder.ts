import type { TransformContext } from "./types.js";

/**
 * The tagged template being written: the static slices, and the runtime
 * expressions that separate them.
 *
 * Vocabulary map, one per layer: these slices become the runtime's `templates`
 * and the expressions its `values` (`jsxTemplate(templates, ...values)`); a
 * `hole` here is one expression slot, while a `chunk` elsewhere is a stream
 * piece (`render.ts`), never a template slot.
 *
 * `parts.length === exprs.length + 1` is enforced here and nowhere else: the
 * emit helpers append through `static` and `hole`, so no caller can leave the
 * two out of step.
 */
export class TemplateBuilder {
  #parts: string[] = [""];
  #exprs: string[] = [];
  #deferred = false;

  /** Append text to the current slice, escaped for a template literal. */
  static(str: string): void {
    this.#parts[this.#parts.length - 1] =
      (this.#parts[this.#parts.length - 1] ?? "") + escapeForTemplate(str);
  }

  /** Close the current slice with a runtime expression, and open the next. */
  hole(expr: string, deferred = false): void {
    this.#exprs.push(expr);
    this.#parts.push("");
    this.#deferred ||= deferred;
  }

  build(ctx: TransformContext): string {
    // Deferred holes render under the eventual Provider context; compatibility
    // mode keeps the reference runtime contract even when holes are deferred.
    const helper = !ctx.compatibility && this.#deferred ? "jsxTemplateDeferred" : "jsxTemplate";
    ctx.used.add(helper);
    if (this.#exprs.length === 0) {
      return `${helper}\`${this.#parts[0] ?? ""}\``;
    }

    let result = `${helper}\`${this.#parts[0] ?? ""}`;
    for (let i = 0; i < this.#exprs.length; i++) {
      result += `\${${this.#exprs[i] ?? ""}}${this.#parts[i + 1] ?? ""}`;
    }
    result += "`";
    return result;
  }
}

/**
 * Escape what has special meaning inside a template-literal slice: `` ` ``,
 * `\`, and `${`. Left as-is, a backtick or `${` coming from static JSX text or
 * an attribute value breaks codegen, or injects an arbitrary interpolation into
 * the generated template.
 */
function escapeForTemplate(str: string): string {
  return str.replace(/[\\`]/g, "\\$&").replace(/\$\{/g, "\\${");
}
