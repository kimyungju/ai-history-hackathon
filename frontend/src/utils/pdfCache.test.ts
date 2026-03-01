import { describe, it, expect, beforeEach } from "vitest";
import { pdfCache } from "./pdfCache";

const makeFakeDoc = (id: string) =>
  ({ numPages: 3, _id: id }) as unknown as import("pdfjs-dist").PDFDocumentProxy;

beforeEach(() => {
  pdfCache.clear();
});

describe("pdfCache", () => {
  it("returns undefined for unknown docId", () => {
    expect(pdfCache.get("unknown")).toBeUndefined();
  });

  it("returns cached document after set", () => {
    const doc = makeFakeDoc("doc_001");
    pdfCache.set("doc_001", doc);
    expect(pdfCache.get("doc_001")).toBe(doc);
  });

  it("clear removes all entries", () => {
    pdfCache.set("a", makeFakeDoc("a"));
    pdfCache.set("b", makeFakeDoc("b"));
    pdfCache.clear();
    expect(pdfCache.get("a")).toBeUndefined();
    expect(pdfCache.get("b")).toBeUndefined();
  });

  it("has returns correct boolean", () => {
    expect(pdfCache.has("x")).toBe(false);
    pdfCache.set("x", makeFakeDoc("x"));
    expect(pdfCache.has("x")).toBe(true);
  });
});
