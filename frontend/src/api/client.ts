import type {
  QueryRequest,
  QueryResponse,
  SignedUrlResponse,
  GraphNode,
} from "../types";

const BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      `API error ${res.status}: ${body.detail ?? res.statusText}`
    );
  }
  return res.json() as Promise<T>;
}

export const apiClient = {
  postQuery(req: QueryRequest): Promise<QueryResponse> {
    return request<QueryResponse>(`${BASE}/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
  },

  getSignedUrl(docId: string, page: number): Promise<SignedUrlResponse> {
    return request<SignedUrlResponse>(
      `${BASE}/document/signed_url?doc_id=${encodeURIComponent(docId)}&page=${page}`,
      { method: "GET" }
    );
  },

  searchGraph(
    query: string,
    limit = 20,
    categories?: string[]
  ): Promise<GraphNode[]> {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    if (categories?.length) {
      categories.forEach((c) => params.append("categories", c));
    }
    return request<GraphNode[]>(`${BASE}/graph/search?${params}`, {
      method: "GET",
    });
  },

  listDocuments(): Promise<{ documents: string[] }> {
    return request<{ documents: string[] }>(`${BASE}/admin/documents`, {
      method: "GET",
    });
  },

  getOcrQuality(docId: string): Promise<{
    doc_id: string;
    total_pages: number;
    avg_confidence: number;
    flagged_pages: { page: number; confidence: number }[];
    flagged_count: number;
  }> {
    return request(`${BASE}/admin/documents/${encodeURIComponent(docId)}/ocr`, {
      method: "GET",
    });
  },
};
