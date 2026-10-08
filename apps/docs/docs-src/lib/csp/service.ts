export type CspPolicy = Readonly<Record<string, readonly string[]>>;

/** One collector per document or response. Hashes authorize code, not sanitize it. */
export class CspService {
  private readonly policy: Record<string, string[]>;
  private hashes = new Set<string>();

  constructor(policy: CspPolicy = CspService.defaultCsp()) {
    this.policy = {};
    for (const [directive, sources] of Object.entries(policy)) {
      if (
        !/^[a-z][a-z0-9-]*$/.test(directive) ||
        sources.some((source) => /[;\r\n]/.test(source))
      ) {
        throw new TypeError("Invalid CSP directive or source.");
      }
      this.policy[directive] = [...sources];
    }
  }

  private static defaultCsp(): CspPolicy {
    return {
      "default-src": ["'self'"],
      "script-src": ["'self'"],
      "style-src": ["'self'", "'unsafe-inline'"],
      "font-src": ["'self'"],
      // Expressive Code embeds its copy and terminal icons as SVG data URLs.
      "img-src": ["'self'", "data:"],
      "connect-src": ["'self'"],
      "base-uri": ["'self'"],
      "form-action": ["'self'"],
    };
  }

  /** Pass the protected script body, without tags, as emitted by the renderer. */
  async addScript(body: string): Promise<string> {
    const hashes = this.hashes;
    // HTML parsing normalizes these before the browser checks the CSP hash.
    const parsed = body.replace(/\r\n?/g, "\n").replace(/\0/g, "\uFFFD");
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(parsed));
    const hash = `sha256-${btoa(String.fromCharCode(...new Uint8Array(digest)))}`;
    hashes.add(`'${hash}'`);
    return hash;
  }

  /** Read after awaiting addScript/rendering. Returns a header value, not a header name. */
  getCSPHeader(): string {
    const policy = { ...this.policy };
    if (this.hashes.size) {
      const directive = "script-src-elem" in policy ? "script-src-elem" : "script-src";
      const sources = policy[directive] ?? policy["default-src"] ?? [];
      policy[directive] = [
        ...new Set([
          ...sources.filter((source) => source !== "'none'"),
          ...[...this.hashes].sort(),
        ]),
      ];
    }
    return Object.entries(policy)
      .map(([name, sources]) => [name, ...sources].join(" "))
      .join("; ");
  }

  /** Clear collected hashes, preserving the configured policy. */
  clear(): void {
    this.hashes = new Set();
  }
}
