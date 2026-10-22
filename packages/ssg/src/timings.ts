/**
 * Build timing measurements: data shapes, a recording collector and a pure
 * text formatter. No imports, no I/O, no clock of its own beyond the one
 * injected into `createTimings`; the formatted report is testable to the
 * character.
 */

/** Sequential build phase, in the order buildInternal reaches it. */
export type BuildPhase =
  | "configuration"
  | "source inspection"
  | "work directory"
  | "assets prepare"
  | "discovery"
  | "cleanup";

/** Elapsed time of one completed sequential phase. */
export interface BuildPhaseTiming {
  readonly name: BuildPhase;
  readonly milliseconds: number;
}

/** Active (backpressure-excluded) render time of one page, with its output count. */
export interface BuildPageTiming {
  readonly route: string;
  readonly milliseconds: number;
  readonly outputs: number;
}

/** Wall-clock publication, rendering included by construction. */
export interface BuildPublicationTiming {
  readonly milliseconds: number;
  readonly files: number;
}

/** One build's measurements; formatted by formatTimings, never printed by itself. */
export interface BuildTimings {
  readonly phases: readonly BuildPhaseTiming[];
  readonly pages: readonly BuildPageTiming[];
  readonly publication?: BuildPublicationTiming;
  readonly total: number;
}

/** Recording surface used by buildInternal; no allocation until a call is made. */
export interface TimingsCollector {
  phase(name: BuildPhase, milliseconds: number): void;
  page(route: string, milliseconds: number, outputs: number): void;
  publication(milliseconds: number, files: number): void;
  snapshot(): BuildTimings;
}

const LABEL_WIDTH = 26;
const VALUE_WIDTH = 7;
const PERCENT_WIDTH = 6;
const SLOWEST_PAGES = 3;
// oxlint-disable-next-line no-control-regex -- Intentional: escaping control characters is the defence, see the module threat model.
const CONTROL_CHARACTERS = /[\x00-\x1f\x7f]/g;

/**
 * Create a timings collector. The clock is read once at creation and again on
 * every `snapshot()`, so `total` is wall-clock build time from collector
 * creation to the snapshot. It is injectable only to keep tests deterministic;
 * durations themselves are measured by the caller and merely recorded here.
 */
export function createTimings(now: () => number = () => performance.now()): TimingsCollector {
  const created = now();
  const phases: BuildPhaseTiming[] = [];
  const pages: BuildPageTiming[] = [];
  let publication: BuildPublicationTiming | undefined;

  return {
    phase(name, milliseconds) {
      phases.push({ name, milliseconds });
    },
    page(route, milliseconds, outputs) {
      pages.push({ route, milliseconds, outputs });
    },
    publication(milliseconds, files) {
      publication = { milliseconds, files };
    },
    snapshot() {
      return {
        phases: [...phases],
        pages: [...pages],
        ...(publication === undefined ? {} : { publication: { ...publication } }),
        total: now() - created,
      };
    },
  };
}

function duration(milliseconds: number): string {
  return milliseconds < 1000
    ? `${Math.round(milliseconds)} ms`
    : `${(milliseconds / 1000).toFixed(2)} s`;
}

function percentage(value: number, total: number): string {
  return `${(total > 0 ? (value / total) * 100 : 0).toFixed(1)}%`;
}

/** Escape 0x00-0x1F and 0x7F as `\xNN` so no control byte reaches the terminal. */
function escapeControlCharacters(route: string): string {
  return route.replace(
    CONTROL_CHARACTERS,
    (character) => `\\x${character.charCodeAt(0).toString(16).padStart(2, "0")}`,
  );
}

/** One aligned row: label cell, value cell, optional percentage then suffix. */
function row(
  indent: number,
  label: string,
  value: string,
  percent?: string,
  suffix?: string,
): string {
  const labelCell = `${" ".repeat(indent)}${label}`.padEnd(LABEL_WIDTH);
  const valueCell = value.padStart(VALUE_WIDTH);
  const percentCell = percent === undefined ? "" : ` ${percent.padStart(PERCENT_WIDTH)}`;
  return `${labelCell}${valueCell}${percentCell}${suffix === undefined ? "" : `  ${suffix}`}`.trimEnd();
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function median(sorted: readonly number[]): number {
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle]!;
  return (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function percentile95(sorted: readonly number[]): number {
  return sorted[Math.max(0, Math.ceil(0.95 * sorted.length) - 1)]!;
}

/**
 * Format one build's timings as plain, deterministic text: fixed columns, no
 * color, no clock, no locale, no I/O - the same input always yields the same
 * string. Page rendering is derived from the page durations rather than
 * stored, so the translated sitemap time is attributed to no page and is
 * absent from that line. Routes are the only untrusted input: control
 * characters are escaped before padding, so an ANSI sequence from a file name
 * can neither drive the terminal nor merge two routes into one line. Unicode
 * bidirectional controls (U+202A-U+202E, U+2066-U+2069) and zero-width
 * characters are not neutralised; they can reorder the glyphs of one line but
 * cannot emit a terminal sequence or erase another line.
 */
export function formatTimings(timings: BuildTimings): string {
  const lines = [`build timings  total ${duration(timings.total)}`];

  if (timings.phases.length > 0) {
    lines.push("  phases (sequential)");
    for (const phase of timings.phases)
      lines.push(
        row(
          4,
          phase.name,
          duration(phase.milliseconds),
          percentage(phase.milliseconds, timings.total),
        ),
      );
  }

  if (timings.pages.length > 0) {
    const rendering = timings.pages.reduce((sum, page) => sum + page.milliseconds, 0);
    lines.push(
      row(
        2,
        "page rendering (active)",
        duration(rendering),
        percentage(rendering, timings.total),
        `· ${plural(timings.pages.length, "page", "pages")}`,
      ),
    );
  }

  if (timings.publication !== undefined) {
    const { milliseconds, files } = timings.publication;
    lines.push(
      row(
        2,
        "publication (wall)",
        duration(milliseconds),
        percentage(milliseconds, timings.total),
        `· ${plural(files, "file", "files")}, includes rendering`,
      ),
    );
  }

  if (timings.pages.length > 0) {
    const sorted = timings.pages.map((page) => page.milliseconds).toSorted((a, b) => a - b);
    lines.push(
      `  slowest pages (median ${duration(median(sorted))} · p95 ${duration(percentile95(sorted))})`,
    );
    const slowest = timings.pages
      .toSorted(
        (a, b) =>
          b.milliseconds - a.milliseconds || (a.route < b.route ? -1 : a.route > b.route ? 1 : 0),
      )
      .slice(0, SLOWEST_PAGES);
    for (const page of slowest)
      lines.push(
        row(
          4,
          escapeControlCharacters(page.route),
          duration(page.milliseconds),
          undefined,
          plural(page.outputs, "output", "outputs"),
        ),
      );
  }

  return lines.join("\n");
}
