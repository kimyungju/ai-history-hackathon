import { describe, it, expect } from "vitest";
import { parseCitations } from "./parseCitations";
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
