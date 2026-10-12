import type { PageMeta } from "../types.js";

const ISO_DATE =
  /^(\d{4}-\d{2}-\d{2})(?:T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d))?$/;

/** YAML dates may arrive as Date objects; metadata always exposes ISO strings. */
export function normalizePublicationDate(value: unknown, file: string): string | undefined {
  if (value === undefined) return undefined;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (typeof value === "string") {
    const match = ISO_DATE.exec(value);
    if (match) {
      const day = new Date(`${match[1]}T00:00:00.000Z`);
      if (
        Number.isFinite(day.getTime()) &&
        day.toISOString().slice(0, 10) === match[1] &&
        Number.isFinite(Date.parse(value))
      )
        return value;
    }
  }
  throw new Error(
    `[@vincle/docs] ${file}: published_at must be an ISO date (YYYY-MM-DD) or timestamp with a timezone.`,
  );
}

/** Date-only values start at midnight UTC; timestamps use their explicit offset. */
export function isPublished(meta: Pick<PageMeta, "published_at">, now: Date): boolean {
  return meta.published_at === undefined || Date.parse(meta.published_at) <= now.getTime();
}
