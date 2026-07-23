/**
 * Trusted, already-escaped HTML.
 * Passed verbatim through the render pipeline without escaping.
 */
export class RawString {
  readonly value: string;
  constructor(value: string) {
    this.value = value;
  }
  toString(): string {
    return this.value;
  }
}

/**
 * Mark an HTML string as trusted: it will be rendered verbatim without HTML
 * escaping. Use this for HTML you generated yourself or from a source you
 * fully trust — typically a Markdown renderer's output or a templating helper.
 */
export const raw = (value: string): RawString => new RawString(value);
