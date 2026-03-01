// --- Request types ---

export interface QueryRequest {
  question: string;
  filter_categories?: string[] | null;
}

// --- Citation types (discriminated union on `type`) ---

export interface ArchiveCitation {
  type: "archive";
  id: number;
  doc_id: string;
  pages: number[];
  text_span: string;
  confidence: number;
}

export interface WebCitation {
  type: "web";
  id: number;
  title: string;
  url: string;
}

export type Citation = ArchiveCitation | WebCitation;

// --- Graph types ---

export interface GraphNode {
  canonical_id: string;
  name: string;
  main_categories: string[];
  sub_category: string | null;
  attributes: Record<string, unknown>;
  highlighted: boolean;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  attributes: Record<string, unknown>;
  highlighted: boolean;
}

export interface GraphPayload {
  nodes: GraphNode[];
  edges: GraphEdge[];
  center_node: string;
}

// --- Response types ---

export interface QueryResponse {
  answer: string;
  source_type: "archive" | "web_fallback" | "mixed";
  citations: Citation[];
  graph: GraphPayload | null;
}

export interface SignedUrlResponse {
  url: string;
  expires_in: number;
}

export interface OcrConfidenceWarning {
  page: number;
  confidence: number;
}

export interface IngestResponse {
  job_id: string;
  status: "processing" | "done" | "failed";
  pages_total: number;
  chunks_processed: number;
  entities_extracted: number;
  ocr_confidence_warnings: OcrConfidenceWarning[];
}

// --- Frontend-only types ---

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  graph?: GraphPayload | null;
  source_type?: "archive" | "web_fallback" | "mixed";
}

// --- Constants ---

export const MAIN_CATEGORIES = [
  "Internal Relations and Research",
  "Economic and Financial",
  "Social Services",
  "Defence and Military",
  "General and Establishment",
] as const;

export type MainCategory = (typeof MAIN_CATEGORIES)[number];
