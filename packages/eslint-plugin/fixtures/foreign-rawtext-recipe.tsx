/**
 * Lint fixture, not a test: this file is covered by the repository's own
 * `bun lint` run so the no-foreign-rawtext rule's scope resolution (the
 * SourceCode.getScope path) executes under oxlint itself, not only under
 * the RuleTester. It must stay warning-free: if recipe recognition
 * regresses, the repository lint starts warning here.
 */

import { raw } from "@vincle/core";
import { escapeContent } from "@vincle/core/html";

declare const source: string;

// The documented recipe under foreign content: recognized through the
// file's direct imports, never flagged.
export const foreignScript = () => (
  <svg>
    <script>{raw(escapeContent(source))}</script>
  </svg>
);

// The same recipe behind a namespace import.
import * as vincle from "@vincle/core";
import * as vincleHtml from "@vincle/core/html";

export const foreignStyle = () => (
  <math>
    <style>{vincle.raw(vincleHtml.escapeContent(source))}</style>
  </math>
);
