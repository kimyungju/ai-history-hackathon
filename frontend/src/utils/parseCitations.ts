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

/**
 * Replace [archive:N] / [web:N] markers with inline <cite> HTML tags.
 * Used for single-pass Markdown rendering with rehype-raw.
 */
export function injectCitationHtml(
  text: string,
  citations: Citation[],
  idRemap?: Map<string, number>
): string {
  text = expandGroupedCitations(text);
  const citationMap = new Map<string, Citation>();
  for (const c of citations) {
    citationMap.set(`${c.type}:${c.id}`, c);
  }

  // Collect all valid matches with their keys
  const matches: { index: number; length: number; key: string }[] = [];
  for (const m of text.matchAll(CITATION_RE)) {
    const key = `${m[1]}:${m[2]}`;
    if (citationMap.has(key)) {
      matches.push({ index: m.index, length: m[0].length, key });
    }
  }

  // Mark which matches to keep: for consecutive runs of the same ref,
  // keep only the last one
  const keep = new Set<number>();
  for (let i = 0; i < matches.length; i++) {
    const next = matches[i + 1];
    if (!next || next.key !== matches[i].key) {
      keep.add(i); // last in its run → keep
    }
  }

  // Build result: kept → <cite> HTML, removed → empty string
  let result = "";
  let lastIndex = 0;
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    result += text.slice(lastIndex, m.index);
    if (keep.has(i)) {
      const displayId = idRemap?.get(m.key) ?? m.key.split(":")[1];
      result += `<cite data-ref="${m.key}">${displayId}</cite>`;
    }
    lastIndex = m.index + m.length;
  }
  result += text.slice(lastIndex);
  return result;
}

/**
 * Extract deduplicated citations referenced in the text, preserving order of first appearance.
 */
export function extractUniqueCitations(
  text: string,
  citations: Citation[]
): Citation[] {
  text = expandGroupedCitations(text);
  const citationMap = new Map<string, Citation>();
  for (const c of citations) {
    citationMap.set(`${c.type}:${c.id}`, c);
  }

  const unique: Citation[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(CITATION_RE)) {
    const key = `${match[1]}:${match[2]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const citation = citationMap.get(key);
    if (citation) unique.push(citation);
  }
  return unique;
}
