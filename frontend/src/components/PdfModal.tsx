import { useEffect, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useAppStore } from "../stores/useAppStore";
import { apiClient, API_BASE } from "../api/client";

// Configure pdf.js worker from local node_modules (CDN doesn't have this version)
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

export default function PdfModal() {
  const isPdfModalOpen = useAppStore((s) => s.isPdfModalOpen);
  const pdfModalProps = useAppStore((s) => s.pdfModalProps);
  const closePdfModal = useAppStore((s) => s.closePdfModal);

  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showText, setShowText] = useState(false);
  const [pageText, setPageText] = useState<string | null>(null);
  const [textLoading, setTextLoading] = useState(false);

  // Fetch signed URL and load PDF
  useEffect(() => {
    if (!isPdfModalOpen || !pdfModalProps) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setPdfDoc(null);

    (async () => {
      try {
        const { url } = await apiClient.getSignedUrl(pdfModalProps.docId, pdfModalProps.page);
        const pdfUrl = url.startsWith("/document/") ? `${API_BASE}${url}` : url;
        const doc = await pdfjsLib.getDocument(pdfUrl).promise;
        if (cancelled) return;

        setPdfDoc(doc);
        setTotalPages(doc.numPages);
        setCurrentPage(Math.min(pdfModalProps.page, doc.numPages));
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load PDF");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isPdfModalOpen, pdfModalProps]);

  // Render current page
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;

    let cancelled = false;

    (async () => {
      const page = await pdfDoc.getPage(currentPage);
      if (cancelled) return;

      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current!;
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const ctx = canvas.getContext("2d")!;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
    })();

    return () => {
      cancelled = true;
    };
  }, [pdfDoc, currentPage, scale]);

  // Fetch OCR text when text view is active
  useEffect(() => {
    if (!showText || !isPdfModalOpen || !pdfModalProps) return;

    let cancelled = false;
    setTextLoading(true);

    (async () => {
      try {
        const data = await apiClient.getPageText(pdfModalProps.docId, currentPage);
        if (!cancelled) setPageText(data.text);
      } catch {
        if (!cancelled) setPageText("Failed to load OCR text.");
      } finally {
        if (!cancelled) setTextLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [showText, currentPage, isPdfModalOpen, pdfModalProps]);

  // Escape key to close
  useEffect(() => {
    if (!isPdfModalOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePdfModal();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isPdfModalOpen, closePdfModal]);

  // Reset text view when modal closes
  useEffect(() => {
    if (!isPdfModalOpen) {
      setShowText(false);
      setPageText(null);
    }
  }, [isPdfModalOpen]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) closePdfModal();
    },
    [closePdfModal]
  );

  if (!isPdfModalOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center"
      onClick={handleBackdropClick}
    >
      <div className="bg-stone-900 rounded-xl shadow-2xl flex flex-col max-w-[90vw] max-h-[90vh] w-[800px] animate-fade-in-up">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-stone-700/60">
          <div className="flex items-center gap-3">
            <span className="text-sm text-stone-300 font-medium">
              {pdfModalProps?.docId}
            </span>
            {totalPages > 0 && (
              <span className="text-xs text-stone-500">
                Page {currentPage} / {totalPages}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Text toggle */}
            <button
              onClick={() => setShowText((v) => !v)}
              className={`px-2 py-1 text-xs rounded ${
                showText
                  ? "bg-ink-500/30 text-ink-400"
                  : "text-stone-400 hover:text-stone-100"
              }`}
            >
              {showText ? "PDF" : "Text"}
            </button>

            {/* Zoom controls */}
            <button
              onClick={() => setScale((s) => Math.max(0.5, s - 0.2))}
              className="text-stone-400 hover:text-stone-100 px-2 py-1 text-sm"
            >
              -
            </button>
            <span className="text-xs text-stone-500 w-12 text-center">
              {Math.round(scale * 100)}%
            </span>
            <button
              onClick={() => setScale((s) => Math.min(3, s + 0.2))}
              className="text-stone-400 hover:text-stone-100 px-2 py-1 text-sm"
            >
              +
            </button>

            {/* Page navigation */}
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="text-stone-400 hover:text-stone-100 disabled:text-stone-600 px-2 py-1 text-sm"
            >
              Prev
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="text-stone-400 hover:text-stone-100 disabled:text-stone-600 px-2 py-1 text-sm"
            >
              Next
            </button>

            {/* Close */}
            <button
              onClick={closePdfModal}
              className="text-stone-400 hover:text-stone-100 ml-2 p-1"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Canvas / Text area */}
        <div className="flex-1 overflow-auto p-4 flex justify-center">
          {loading || textLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-ink-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-20">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          ) : showText ? (
            <pre className="w-full max-w-none whitespace-pre-wrap text-stone-200 text-sm font-mono leading-relaxed p-2">
              {pageText ?? "Toggle text view to load OCR content."}
            </pre>
          ) : (
            <canvas ref={canvasRef} className="max-w-full" />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
