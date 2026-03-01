import { useAppStore } from "./stores/useAppStore";
import { useIsMobile } from "./hooks/useIsMobile";
import ResizableSplitter from "./components/ResizableSplitter";
import ChatPanel from "./components/ChatPanel";
import GraphCanvas from "./components/GraphCanvas";
import GraphSearchBar from "./components/GraphSearchBar";
import NodeSidebar from "./components/NodeSidebar";
import PdfModal from "./components/PdfModal";

export default function App() {
  const splitRatio = useAppStore((s) => s.splitRatio);
  const mobileTab = useAppStore((s) => s.mobileTab);
  const setMobileTab = useAppStore((s) => s.setMobileTab);
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div className="h-screen w-screen bg-gray-950 text-gray-100 flex flex-col overflow-hidden">
        {/* Tab bar */}
        <div className="flex border-b border-gray-700 shrink-0">
          <button
            onClick={() => setMobileTab("graph")}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              mobileTab === "graph"
                ? "text-blue-400 border-b-2 border-blue-400"
                : "text-gray-500"
            }`}
          >
            Knowledge Graph
          </button>
          <button
            onClick={() => setMobileTab("chat")}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              mobileTab === "chat"
                ? "text-blue-400 border-b-2 border-blue-400"
                : "text-gray-500"
            }`}
          >
            Chat
          </button>
        </div>

        {/* Active panel */}
        <div className="flex-1 overflow-hidden">
          {mobileTab === "graph" ? (
            <div className="relative h-full bg-gray-900">
              <GraphSearchBar />
              <GraphCanvas />
              <NodeSidebar />
            </div>
          ) : (
            <ChatPanel />
          )}
        </div>

        <PdfModal />
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-gray-950 text-gray-100 overflow-hidden">
      <div
        className="h-full grid"
        style={{
          gridTemplateColumns: `${splitRatio * 100}% 4px 1fr`,
        }}
      >
        {/* Graph panel */}
        <div className="relative overflow-hidden bg-gray-900">
          <GraphSearchBar />
          <GraphCanvas />
          <NodeSidebar />
        </div>

        <ResizableSplitter />

        <ChatPanel />
      </div>

      <PdfModal />
    </div>
  );
}
