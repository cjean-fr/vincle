/**
 * Microbench runner.
 *
 * Importe tous les microbenchmarks et les exécute.
 * Chaque fichier exporte une fonction `register()` qui enregistre
 * ses groupes/bench via l'API mitata.
 *
 * Usage : `bun run bench:micro`
 */
import { run } from "mitata";
import { register as escapeContent } from "./escape-content.js";

escapeContent();

await run();
