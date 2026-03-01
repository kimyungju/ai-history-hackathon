import { create } from "zustand";
import type { ChatMessage, GraphPayload, GraphNode } from "../types";
import { apiClient } from "../api/client";

interface AppState {
  // Chat
  messages: ChatMessage[];
  isQuerying: boolean;
  queryError: string | null;
  filterCategories: string[];
  chatInput: string;

  // Graph
  graphData: GraphPayload | null;
  selectedNode: GraphNode | null;

  // UI
  splitRatio: number;
  isSidebarOpen: boolean;
  isPdfModalOpen: boolean;
  pdfModalProps: { docId: string; page: number } | null;
  mobileTab: "graph" | "chat";
  isAdminOpen: boolean;

  // Actions
  sendQuery: (question: string) => Promise<void>;
  selectNode: (node: GraphNode | null) => void;
  openPdfModal: (docId: string, page: number) => void;
  closePdfModal: () => void;
  setSplitRatio: (ratio: number) => void;
  setFilterCategories: (cats: string[]) => void;
  setChatInput: (text: string) => void;
  setGraphData: (data: GraphPayload | null) => void;
  setMobileTab: (tab: "graph" | "chat") => void;
  toggleAdmin: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  messages: [],
  isQuerying: false,
  queryError: null,
  filterCategories: [],
  chatInput: "",
  graphData: null,
  selectedNode: null,
  splitRatio: 0.65,
  isSidebarOpen: false,
  isPdfModalOpen: false,
  pdfModalProps: null,
  mobileTab: "chat",
  isAdminOpen: false,

  // Actions
  async sendQuery(question: string) {
    const { filterCategories } = get();
    const userMsg: ChatMessage = { role: "user", content: question };

    set({
      isQuerying: true,
      queryError: null,
      messages: [...get().messages, userMsg],
    });

    try {
      const response = await apiClient.postQuery({
        question,
        filter_categories:
          filterCategories.length > 0 ? filterCategories : null,
      });

      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: response.answer,
        citations: response.citations,
        graph: response.graph,
        source_type: response.source_type,
      };

      set({
        messages: [...get().messages, assistantMsg],
        graphData: response.graph ?? get().graphData,
        isQuerying: false,
      });
    } catch (err) {
      set({
        queryError: err instanceof Error ? err.message : "Query failed",
        isQuerying: false,
      });
    }
  },

  selectNode(node: GraphNode | null) {
    set({
      selectedNode: node,
      isSidebarOpen: node !== null,
    });
  },

  openPdfModal(docId: string, page: number) {
    set({ isPdfModalOpen: true, pdfModalProps: { docId, page } });
  },

  closePdfModal() {
    set({ isPdfModalOpen: false, pdfModalProps: null });
  },

  setSplitRatio(ratio: number) {
    const clamped = Math.min(0.7, Math.max(0.3, ratio));
    set({ splitRatio: clamped });
    try {
      localStorage.setItem("splitRatio", String(clamped));
    } catch {
      // localStorage may be unavailable
    }
  },

  setFilterCategories(cats: string[]) {
    set({ filterCategories: cats });
  },

  setChatInput(text: string) {
    set({ chatInput: text });
  },

  setGraphData(data: GraphPayload | null) {
    set({ graphData: data });
  },

  setMobileTab(tab: "graph" | "chat") {
    set({ mobileTab: tab });
  },

  toggleAdmin() {
    set((s) => ({ isAdminOpen: !s.isAdminOpen }));
  },
}));

// Restore split ratio from localStorage on load
try {
  const stored = localStorage.getItem("splitRatio");
  if (stored) {
    const ratio = parseFloat(stored);
    if (!isNaN(ratio)) {
      useAppStore.setState({
        splitRatio: Math.min(0.7, Math.max(0.3, ratio)),
      });
    }
  }
} catch {
  // ignore
}
