import type { Citation } from "../types";

export type TextSegment = { type: "text"; content: string };
export type CitationSegment = { type: "citation"; citation: Citation };
export type ParsedSegment = TextSegment | CitationSegment;

const CITATION_RE = /\[(archive|web):(\d+)\]/g;
const GROUPED_CITATION_RE = /\[(archive|web):(\d+(?:\s*,\s*\d+)+)\]/g;

/** Expand grouped citations like [archive:7, 11] → [archive:7][archive:11] */
function expandGroupedCitations(text: string): string {
  return text.replace(GROUPED_CITATION_RE, (_, type, nums) =>
    nums.split(",").map((n: string) => `[${type}:${n.trim()}]`).join("")
  );
}

export function parseCitations(
  text: string,
  citations: Citation[]
): ParsedSegment[] {
  text = expandGroupedCitations(text);
  const citationMap = new Map<string, Citation>();
  for (const c of citations) {
    citationMap.set(`${c.type}:${c.id}`, c);
  }

  const segments: ParsedSegment[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(CITATION_RE)) {
    const key = `${match[1]}:${match[2]}`;
    const citation = citationMap.get(key);

    if (!citation) continue; // unmatched marker — skip

    if (match.index > lastIndex) {
      segments.push({ type: "text", content: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: "citation", citation });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", content: text.slice(lastIndex) });
  }

  if (segments.length === 0) {
    return [{ type: "text", content: text }];
  }

  return segments;
}
