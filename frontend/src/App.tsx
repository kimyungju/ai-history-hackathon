import { useAppStore } from "./stores/useAppStore";
import { useIsMobile } from "./hooks/useIsMobile";
import ResizableSplitter from "./components/ResizableSplitter";
import ChatPanel from "./components/ChatPanel";
import GraphCanvas from "./components/GraphCanvas";
import GraphSearchBar from "./components/GraphSearchBar";
import NodeSidebar from "./components/NodeSidebar";
import PdfModal from "./components/PdfModal";
import AdminPanel from "./components/AdminPanel";

function AppHeader() {
  const toggleAdmin = useAppStore((s) => s.toggleAdmin);

  return (
    <div className="h-10 flex items-center justify-between px-4 border-b border-stone-800/60 bg-stone-950 shrink-0">
      <div className="flex items-center gap-2.5">
        <img src="/logo.png" alt="Colonial Archives" className="w-7 h-7 rounded-full" />
        <h1 className="font-display text-[15px] font-semibold text-stone-200 tracking-wide">
          Colonial Archives
        </h1>
      </div>
      <button
        onClick={toggleAdmin}
        className="text-stone-500 hover:text-stone-300 text-xs font-medium tracking-wide uppercase transition-colors"
      >
        Admin
      </button>
    </div>
  );
}

export default function App() {
  const splitRatio = useAppStore((s) => s.splitRatio);
  const mobileTab = useAppStore((s) => s.mobileTab);
  const setMobileTab = useAppStore((s) => s.setMobileTab);
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div className="h-screen w-screen bg-stone-950 text-stone-100 flex flex-col overflow-hidden">
        <AppHeader />

        {/* Tab bar */}
        <div className="flex border-b border-stone-800/60 shrink-0">
          <button
            onClick={() => setMobileTab("graph")}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              mobileTab === "graph"
                ? "text-ink-400 border-b-2 border-ink-400"
                : "text-stone-500"
            }`}
          >
            Knowledge Graph
          </button>
          <button
            onClick={() => setMobileTab("chat")}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              mobileTab === "chat"
                ? "text-ink-400 border-b-2 border-ink-400"
                : "text-stone-500"
            }`}
          >
            Chat
          </button>
        </div>

        {/* Active panel */}
        <div className="flex-1 overflow-hidden">
          {mobileTab === "graph" ? (
            <div className="relative h-full bg-stone-900">
              <GraphSearchBar />
              <GraphCanvas />
              <NodeSidebar />
            </div>
          ) : (
            <ChatPanel />
          )}
        </div>

        <PdfModal />
        <AdminPanel />
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-stone-950 text-stone-100 flex flex-col overflow-hidden">
      <AppHeader />

      <div
        className="flex-1 grid min-h-0"
        style={{
          gridTemplateColumns: `${splitRatio * 100}% 4px 1fr`,
        }}
      >
        {/* Graph panel */}
        <div className="relative overflow-hidden bg-stone-900">
          <GraphSearchBar />
          <GraphCanvas />
          <NodeSidebar />
        </div>

        <ResizableSplitter />

        <ChatPanel />
      </div>

      <PdfModal />
      <AdminPanel />
    </div>
  );
}
