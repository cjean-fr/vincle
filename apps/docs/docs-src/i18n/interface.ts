import { createTypedTranslator } from "@cjean-fr/i18n-tiny";

import type { Locale } from "./locale.js";

export type InterfaceSpec = {
  copyCode: readonly [];
  copiedCode: readonly [];
  terminalWindow: readonly [];
  skipContent: readonly [];
  primaryNavigation: readonly [];
  sections: readonly [];
  guide: readonly [];
  integration: readonly [];
  api: readonly [];
  search: readonly [];
  searchDocumentation: readonly [];
  loadingIndex: readonly [];
  loading: readonly [];
  searchQuery: readonly [];
  searchResults: readonly [];
  loadingSearch: readonly [];
  searchPlaceholder: readonly [];
  searchFailed: readonly [];
  typeToSearch: readonly [];
  noResults: readonly [];
  resultCount: readonly ["count"];
  editPage: readonly [];
  lastUpdated: readonly ["date"];
  contents: readonly [];
  onThisPage: readonly [];
  sectionLink: readonly [];
  codeAlternatives: readonly [];
  openNavigation: readonly [];
  closeNavigation: readonly [];
  language: readonly [];
  notFoundTitle: readonly [];
  notFoundMessage: readonly [];
  errorTitle: readonly [];
  errorMessage: readonly [];
  backHome: readonly [];
  description: readonly [];
  themeInitial: readonly [];
  themeAutoDark: readonly [];
  themeAutoLight: readonly [];
  themeLightAuto: readonly [];
  themeLightDark: readonly [];
  themeDarkLight: readonly [];
  themeDarkAuto: readonly [];
};

const en = createTypedTranslator<InterfaceSpec>()(
  {
    copyCode: "Copy to clipboard",
    copiedCode: "Copied!",
    terminalWindow: "Terminal window",
    skipContent: "Skip to content",
    primaryNavigation: "Primary navigation",
    sections: "Sections",
    guide: "Guide",
    integration: "Integration",
    api: "API",
    search: "Search",
    searchDocumentation: "Search documentation",
    loadingIndex: "Loading index…",
    loading: "Loading…",
    searchQuery: "Search query",
    searchResults: "Search results",
    loadingSearch: "Loading search…",
    searchPlaceholder: "Search docs…",
    searchFailed: "Failed to load search",
    typeToSearch: "Type to search",
    noResults: "No results",
    resultCount: "{count} results",
    editPage: "Edit this page on GitHub →",
    lastUpdated: "Last updated: {date}",
    contents: "Table of contents",
    onThisPage: "On this page",
    sectionLink: "Direct link to this section",
    codeAlternatives: "Code example alternatives",
    openNavigation: "Open navigation",
    closeNavigation: "Close navigation",
    language: "Language",
    notFoundTitle: "Page Not Found",
    notFoundMessage: "Page not found.",
    errorTitle: "Server Error",
    errorMessage: "Server error. Something went wrong.",
    backHome: "← Back to home",
    description: "The small, safe way to render JSX into HTML strings.",
    themeInitial: "Theme: Automatic. Switch to Light",
    themeAutoDark: "Theme: Automatic (system dark). Switch to light",
    themeAutoLight: "Theme: Automatic (system light). Switch to dark",
    themeLightAuto: "Theme: Light. Return to Automatic",
    themeLightDark: "Theme: Light. Switch to Dark",
    themeDarkLight: "Theme: Dark. Switch to Light",
    themeDarkAuto: "Theme: Dark. Return to Automatic",
  },
  { locale: "en" },
);

const fr = createTypedTranslator<InterfaceSpec>()(
  {
    copyCode: "Copier dans le presse-papiers",
    copiedCode: "Copié !",
    terminalWindow: "Fenêtre de terminal",
    skipContent: "Aller au contenu",
    primaryNavigation: "Navigation principale",
    sections: "Rubriques",
    guide: "Guide",
    integration: "Intégration",
    api: "API",
    search: "Rechercher",
    searchDocumentation: "Rechercher dans la documentation",
    loadingIndex: "Chargement de l’index…",
    loading: "Chargement…",
    searchQuery: "Termes de recherche",
    searchResults: "Résultats de recherche",
    loadingSearch: "Chargement de la recherche…",
    searchPlaceholder: "Rechercher dans la documentation…",
    searchFailed: "Impossible de charger la recherche",
    typeToSearch: "Saisissez votre recherche",
    noResults: "Aucun résultat",
    resultCount: "{count} résultats",
    editPage: "Modifier cette page sur GitHub →",
    lastUpdated: "Dernière mise à jour : {date}",
    contents: "Table des matières",
    onThisPage: "Sur cette page",
    sectionLink: "Lien direct vers cette section",
    codeAlternatives: "Variantes de l’exemple de code",
    openNavigation: "Ouvrir la navigation",
    closeNavigation: "Fermer la navigation",
    language: "Langue",
    notFoundTitle: "Page introuvable",
    notFoundMessage: "Cette page est introuvable.",
    errorTitle: "Erreur du serveur",
    errorMessage: "Une erreur s’est produite sur le serveur.",
    backHome: "← Retour à l’accueil",
    description: "Un moteur léger et sûr pour rendre du JSX en chaînes HTML.",
    themeInitial: "Thème : automatique. Passer au clair",
    themeAutoDark: "Thème : automatique (système sombre). Passer au clair",
    themeAutoLight: "Thème : automatique (système clair). Passer au sombre",
    themeLightAuto: "Thème : clair. Revenir au mode automatique",
    themeLightDark: "Thème : clair. Passer au sombre",
    themeDarkLight: "Thème : sombre. Passer au clair",
    themeDarkAuto: "Thème : sombre. Revenir au mode automatique",
  },
  { locale: "fr" },
);

const translators = { en, fr };

export function translatorFor(locale: Locale) {
  return translators[locale];
}
