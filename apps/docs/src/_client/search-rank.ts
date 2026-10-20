export interface SearchHeading {
  id: string;
  text: string;
}

export interface SearchDocument {
  url: string;
  title: string;
  headings: SearchHeading[];
  text: string;
}

export interface SearchHit {
  document: SearchDocument;
  /** The section whose heading holds the query, when the page title does not. */
  heading?: SearchHeading;
  score: number;
}

/**
 * The pages holding every term, best first.
 *
 * Where the terms sit outranks how often they match: every term in the page
 * title, then every term in one section heading, then the rest. The score only
 * orders pages within a rank.
 */
export function search(docs: SearchDocument[], query: string): SearchHit[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  const holdsAll = (text: string) => terms.every((term) => text.toLowerCase().includes(term));

  return docs
    .flatMap((document) => {
      const score = scoreDocument(document, terms);
      if (score === 0) return [];
      if (holdsAll(document.title)) return [{ document, score, rank: 2 }];
      const heading = document.headings.find((candidate) => holdsAll(candidate.text));
      return [heading ? { document, heading, score, rank: 1 } : { document, score, rank: 0 }];
    })
    .toSorted(
      (a, b) =>
        b.rank - a.rank || b.score - a.score || a.document.title.localeCompare(b.document.title),
    )
    .map(({ rank: _, ...hit }) => hit);
}

function scoreDocument(document: SearchDocument, terms: string[]): number {
  const fields = [
    { value: document.title.toLowerCase(), weight: 8 },
    { value: document.url.replace(/[/-]+/g, " ").toLowerCase(), weight: 5 },
    { value: document.text.toLowerCase(), weight: 1 },
  ];
  let score = 0;

  for (const term of terms) {
    let matchedTerm = false;

    for (const field of fields) {
      if (field.value.includes(term)) {
        score += field.weight;
        matchedTerm = true;
      }
    }

    if (!matchedTerm) return 0;
  }

  return score;
}
