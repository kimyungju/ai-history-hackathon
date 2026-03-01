import { useState, useEffect } from "react";
import { apiClient } from "../api/client";
import { useAppStore } from "../stores/useAppStore";

interface OcrQuality {
  doc_id: string;
  total_pages: number;
  avg_confidence: number;
  flagged_pages: { page: number; confidence: number }[];
  flagged_count: number;
}

export default function AdminPanel() {
  const isAdminOpen = useAppStore((s) => s.isAdminOpen);
  const toggleAdmin = useAppStore((s) => s.toggleAdmin);
  const openPdfModal = useAppStore((s) => s.openPdfModal);

  const [documents, setDocuments] = useState<string[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);
  const [ocrData, setOcrData] = useState<OcrQuality | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isAdminOpen) return;
    setLoading(true);
    apiClient
      .listDocuments()
      .then((data) => setDocuments(data.documents))
      .catch(() => setDocuments([]))
      .finally(() => setLoading(false));
  }, [isAdminOpen]);

  useEffect(() => {
    if (!selectedDoc) {
      setOcrData(null);
      return;
    }
    setLoading(true);
    apiClient
      .getOcrQuality(selectedDoc)
      .then(setOcrData)
      .catch(() => setOcrData(null))
      .finally(() => setLoading(false));
  }, [selectedDoc]);

  if (!isAdminOpen) return null;

  return (
    <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center">
      <div className="bg-gray-900 rounded-xl shadow-2xl w-[700px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <h2 className="text-sm font-semibold text-gray-200">
            OCR Quality — Ingested Documents
          </h2>
          <button
            onClick={toggleAdmin}
            className="text-gray-400 hover:text-white p-1"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {loading && (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!loading && documents.length === 0 && (
            <p className="text-gray-500 text-sm text-center py-8">
              No ingested documents found.
            </p>
          )}

          {!loading && documents.length > 0 && (
            <div className="space-y-2">
              {documents.map((docId) => (
                <button
                  key={docId}
                  onClick={() =>
                    setSelectedDoc(selectedDoc === docId ? null : docId)
                  }
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    selectedDoc === docId
                      ? "bg-gray-700 text-white"
                      : "text-gray-300 hover:bg-gray-800"
                  }`}
                >
                  {docId}
                </button>
              ))}
            </div>
          )}

          {/* OCR detail for selected doc */}
          {ocrData && (
            <div className="mt-4 border-t border-gray-700 pt-4">
              <div className="flex items-center gap-4 mb-3">
                <span className="text-sm text-gray-300">
                  Pages: {ocrData.total_pages}
                </span>
                <span className="text-sm text-gray-300">
                  Avg confidence:{" "}
                  <span
                    className={
                      ocrData.avg_confidence < 0.7
                        ? "text-red-400"
                        : "text-green-400"
                    }
                  >
                    {(ocrData.avg_confidence * 100).toFixed(1)}%
                  </span>
                </span>
                <span className="text-sm text-gray-300">
                  Flagged: {ocrData.flagged_count}
                </span>
              </div>

              {ocrData.flagged_pages.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-xs text-gray-500 mb-2">
                    Flagged pages (click to view in PDF):
                  </p>
                  {ocrData.flagged_pages.map((fp) => (
                    <button
                      key={fp.page}
                      onClick={() => openPdfModal(ocrData.doc_id, fp.page)}
                      className="flex items-center gap-3 w-full px-3 py-1.5 rounded text-sm text-left hover:bg-gray-800 transition-colors"
                    >
                      <span className="text-gray-400">
                        Page {fp.page}
                      </span>
                      <span className="text-red-400 text-xs">
                        {(fp.confidence * 100).toFixed(1)}% confidence
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-green-400">
                  All pages above confidence threshold.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
