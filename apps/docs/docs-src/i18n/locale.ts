export const locales = ["en", "fr"] as const;
export type Locale = (typeof locales)[number];

export function localeFor(url: string): Locale {
  return url === "/fr" || url.startsWith("/fr/") ? "fr" : "en";
}

export function unlocalizedPath(url: string): string {
  return localeFor(url) === "fr" ? url.slice(3) || "/" : url;
}

export function localizedPath(url: string, locale: Locale): string {
  const route = unlocalizedPath(url);
  return locale === "fr" ? "/fr" + (route === "/" ? "" : route) : route;
}

export function markdownPath(url: string): string {
  return unlocalizedPath(url) === "/"
    ? localeFor(url) === "fr"
      ? "/fr/index.md"
      : "/index.md"
    : url + ".md";
}

export function browserLocale(): Locale {
  return document.documentElement.lang === "fr" ? "fr" : "en";
}

export function translationAlternates(url: string, available: ReadonlySet<string>) {
  return locales
    .map((locale) => ({ locale, href: localizedPath(url, locale) }))
    .filter(({ href }) => available.has(href));
}
