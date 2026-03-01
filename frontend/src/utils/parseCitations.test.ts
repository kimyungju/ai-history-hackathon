import { describe, it, expect } from "vitest";
import { parseCitations, injectCitationHtml, extractUniqueCitations } from "./parseCitations";
import type { Citation } from "../types";

const citations: Citation[] = [
  {
    type: "archive",
    id: 1,
    doc_id: "doc_042",
    pages: [3],
    text_span: "The colonial government...",
    confidence: 0.92,
  },
  {
    type: "web",
    id: 2,
    title: "Wikipedia",
    url: "https://en.wikipedia.org/wiki/Straits",
  },
  {
    type: "archive",
    id: 7,
    doc_id: "CO 273:59:18",
    pages: [1],
    text_span: "Straits Settlements...",
    confidence: 0.9,
  },
  {
    type: "archive",
    id: 11,
    doc_id: "CO 273:59:22",
    pages: [2],
    text_span: "transferred from Indian Government...",
    confidence: 0.88,
  },
];

describe("parseCitations", () => {
  it("returns plain text when no markers present", () => {
    const result = parseCitations("Hello world", []);
    expect(result).toEqual([{ type: "text", content: "Hello world" }]);
  });

  it("parses a single archive marker", () => {
    const result = parseCitations(
      "The governor arrived [archive:1] in 1819.",
      citations
    );
    expect(result).toEqual([
      { type: "text", content: "The governor arrived " },
      { type: "citation", citation: citations[0] },
      { type: "text", content: " in 1819." },
    ]);
  });

  it("parses a web marker", () => {
    const result = parseCitations("See also [web:2].", citations);
    expect(result).toEqual([
      { type: "text", content: "See also " },
      { type: "citation", citation: citations[1] },
      { type: "text", content: "." },
    ]);
  });

  it("parses multiple markers", () => {
    const result = parseCitations(
      "Fact [archive:1] and source [web:2].",
      citations
    );
    expect(result).toHaveLength(5);
    expect(result[1]).toEqual({ type: "citation", citation: citations[0] });
    expect(result[3]).toEqual({ type: "citation", citation: citations[1] });
  });

  it("leaves unmatched markers as plain text", () => {
    const result = parseCitations("Unknown [archive:99] ref.", citations);
    expect(result).toEqual([
      { type: "text", content: "Unknown [archive:99] ref." },
    ]);
  });

  it("expands grouped citations like [archive:7, 11]", () => {
    const result = parseCitations(
      "The Straits Settlements [archive:7, 11] were established.",
      citations
    );
    expect(result).toEqual([
      { type: "text", content: "The Straits Settlements " },
      { type: "citation", citation: citations[2] },
      { type: "citation", citation: citations[3] },
      { type: "text", content: " were established." },
    ]);
  });

  it("expands grouped citations with three or more ids", () => {
    const result = parseCitations(
      "Facts [archive:1, 7, 11].",
      citations
    );
    expect(result).toHaveLength(5);
    expect(result[1]).toEqual({ type: "citation", citation: citations[0] });
    expect(result[2]).toEqual({ type: "citation", citation: citations[2] });
    expect(result[3]).toEqual({ type: "citation", citation: citations[3] });
  });
});

describe("injectCitationHtml", () => {
  it("replaces a single archive marker with cite tag", () => {
    const result = injectCitationHtml("Fact [archive:1].", citations);
    expect(result).toBe('Fact <cite data-ref="archive:1">1</cite>.');
  });

  it("replaces multiple markers", () => {
    const result = injectCitationHtml("A [archive:1] and B [web:2].", citations);
    expect(result).toContain('<cite data-ref="archive:1">1</cite>');
    expect(result).toContain('<cite data-ref="web:2">2</cite>');
  });

  it("expands grouped citations before injecting", () => {
    const result = injectCitationHtml("Text [archive:7, 11].", citations);
    expect(result).toContain('<cite data-ref="archive:7">7</cite>');
    expect(result).toContain('<cite data-ref="archive:11">11</cite>');
  });

  it("leaves unmatched markers as-is", () => {
    const result = injectCitationHtml("Unknown [archive:99] ref.", citations);
    expect(result).toBe("Unknown [archive:99] ref.");
  });

  it("preserves markdown formatting around citations", () => {
    const result = injectCitationHtml("**Bold** text [archive:1].", citations);
    expect(result).toBe('**Bold** text <cite data-ref="archive:1">1</cite>.');
  });

  it("collapses consecutive same-ref citations to last occurrence", () => {
    const result = injectCitationHtml(
      "Fact A [archive:1]. Fact B [archive:1]. Fact C [archive:1].",
      citations
    );
    // Only the last [archive:1] is kept
    expect(result).toBe(
      'Fact A . Fact B . Fact C <cite data-ref="archive:1">1</cite>.'
    );
  });

  it("keeps different refs even when interleaved with same ref", () => {
    const result = injectCitationHtml(
      "A [archive:1]. B [web:2]. C [archive:1].",
      citations
    );
    // All three are different runs, so all kept
    expect(result).toContain('<cite data-ref="archive:1">1</cite>');
    expect(result).toContain('<cite data-ref="web:2">2</cite>');
    // archive:1 appears twice but separated by web:2, so both kept
    const citeCount = (result.match(/data-ref="archive:1"/g) || []).length;
    expect(citeCount).toBe(2);
  });

  it("collapses same ref but keeps different refs in sequence", () => {
    const result = injectCitationHtml(
      "A [archive:1]. B [archive:1]. C [web:2]. D [web:2].",
      citations
    );
    // archive:1 run → keep last; web:2 run → keep last
    const archive1Count = (result.match(/data-ref="archive:1"/g) || []).length;
    const web2Count = (result.match(/data-ref="web:2"/g) || []).length;
    expect(archive1Count).toBe(1);
    expect(web2Count).toBe(1);
  });
});

describe("extractUniqueCitations", () => {
  it("extracts unique citations in order of appearance", () => {
    const result = extractUniqueCitations(
      "A [archive:1] then [web:2] then [archive:1] again.",
      citations
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(citations[0]);
    expect(result[1]).toBe(citations[1]);
  });

  it("handles grouped citations", () => {
    const result = extractUniqueCitations(
      "Text [archive:7, 11].",
      citations
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(citations[2]);
    expect(result[1]).toBe(citations[3]);
  });

  it("skips unmatched markers", () => {
    const result = extractUniqueCitations(
      "A [archive:1] and [archive:99].",
      citations
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(citations[0]);
  });

  it("returns empty for no markers", () => {
    const result = extractUniqueCitations("Plain text.", citations);
    expect(result).toHaveLength(0);
  });
});
