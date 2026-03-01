import type { PDFDocumentProxy } from "pdfjs-dist";

const cache = new Map<string, PDFDocumentProxy>();

export const pdfCache = {
  get(docId: string): PDFDocumentProxy | undefined {
    return cache.get(docId);
  },
  set(docId: string, doc: PDFDocumentProxy): void {
    cache.set(docId, doc);
  },
  has(docId: string): boolean {
    return cache.has(docId);
  },
  clear(): void {
    cache.clear();
  },
};
