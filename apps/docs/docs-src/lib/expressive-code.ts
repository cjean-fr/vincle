/**
 * The Expressive Code renderer, and the assets that do not vary per page.
 *
 * `baseStyles`, `themeStyles` and `jsModules` derive from the config alone, so
 * they ship in the client bundle (`virtual:expressive-code.*`) instead of being
 * inlined into every document. Nothing here is emitted per page.
 */
import {
  createRenderer,
  type SatteriExpressiveCodeRenderer,
  type ThemeObjectOrShikiThemeName,
} from "satteri-expressive-code";

export const EC_THEMES: ThemeObjectOrShikiThemeName[] = ["github-light", "github-dark"];

/**
 * Bind the dark variant to the site's `dark` class instead of the OS.
 *
 * The selector is concatenated onto `:root` and onto `.expressive-code`, so it
 * must be a compound suffix — `.dark`, never a combinator. The light theme is
 * first in `EC_THEMES` and is emitted unscoped, hence `false`. The media query
 * has to go: `theme/client.ts` already folds the OS preference into the class,
 * and leaving it on would override an explicit choice.
 */
const themeCssSelector = (theme: { type: string }): string | false =>
  theme.type === "dark" ? ".dark" : false;

let rendererPromise: Promise<SatteriExpressiveCodeRenderer> | null = null;

/** One instance for the whole process. */
export function getRenderer(): Promise<SatteriExpressiveCodeRenderer> {
  rendererPromise ??= createRenderer({
    themes: EC_THEMES,
    themeCssSelector,
    useDarkModeMediaQuery: false,
  });
  return rendererPromise;
}

/**
 * The same renderer with its page-independent assets blanked, so the rehype
 * plugin has nothing to inline on a document's first code block and emits markup
 * only. Passed as `customCreateRenderer` in `mdx-cache.ts`; the real assets ship
 * through `expressiveCodeStyles` / `expressiveCodeScript`.
 */
export async function getSharedRenderer(): Promise<SatteriExpressiveCodeRenderer> {
  const renderer = await getRenderer();
  return { ...renderer, baseStyles: "", themeStyles: "", jsModules: [] };
}

/** Base rules, then theme variables — cascade order matters. */
export async function expressiveCodeStyles(): Promise<string> {
  const { baseStyles, themeStyles } = await getRenderer();
  return baseStyles + themeStyles;
}

export async function expressiveCodeScript(): Promise<string> {
  const { jsModules } = await getRenderer();
  return jsModules.join("\n");
}
