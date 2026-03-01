import { useRef, useEffect } from "react";
import { useAppStore } from "../stores/useAppStore";
import ChatMessage from "./ChatMessage";
import CategoryFilter from "./CategoryFilter";

export default function ChatPanel() {
  const messages = useAppStore((s) => s.messages);
  const isQuerying = useAppStore((s) => s.isQuerying);
  const queryError = useAppStore((s) => s.queryError);
  const chatInput = useAppStore((s) => s.chatInput);
  const setChatInput = useAppStore((s) => s.setChatInput);
  const sendQuery = useAppStore((s) => s.sendQuery);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length, isQuerying]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = chatInput.trim();
    if (!trimmed || isQuerying) return;
    setChatInput("");
    sendQuery(trimmed);
  };

  return (
    <div className="flex flex-col h-full bg-stone-950 overflow-hidden">
      {/* Message area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 min-h-0">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-xs animate-fade-in">
              <span className="text-ink-500/60 text-3xl select-none">&#9670;</span>
              <h2 className="font-display text-xl font-semibold text-stone-300 mt-3">
                Research Assistant
              </h2>
              <p className="text-stone-500 text-sm mt-2 leading-relaxed">
                Ask questions about colonial-era documents. Every answer traces back to specific archive pages.
              </p>
              <p className="text-stone-600 text-xs mt-4 italic font-display">
                Try: &ldquo;Who was the Resident of Singapore in 1830?&rdquo;
              </p>
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <ChatMessage key={i} message={msg} />
        ))}
        {isQuerying && (
          <div className="flex justify-start mb-3 animate-fade-in">
            <div className="bg-stone-800/80 rounded-2xl px-4 py-3">
              <div className="flex gap-1.5">
                <span className="w-1.5 h-1.5 bg-ink-500 rounded-full animate-subtle-pulse" />
                <span className="w-1.5 h-1.5 bg-ink-500 rounded-full animate-subtle-pulse [animation-delay:200ms]" />
                <span className="w-1.5 h-1.5 bg-ink-500 rounded-full animate-subtle-pulse [animation-delay:400ms]" />
              </div>
            </div>
          </div>
        )}
        {queryError && (
          <div className="mb-3 px-4 py-2 bg-red-500/10 border border-red-500/30 rounded-lg animate-fade-in">
            <p className="text-red-400 text-sm">{queryError}</p>
            <button
              className="text-red-400 text-xs underline mt-1"
              onClick={() => {
                const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
                if (lastUserMsg) sendQuery(lastUserMsg.content);
              }}
            >
              Retry
            </button>
          </div>
        )}
      </div>

      <div className="shrink-0"><CategoryFilter /></div>

      {/* Input bar */}
      <form onSubmit={handleSubmit} className="shrink-0 border-t border-stone-800/60 px-4 py-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Ask about the archives..."
            className="flex-1 bg-stone-800/60 text-stone-100 rounded-lg px-4 py-2.5 text-sm outline-none border border-stone-700/50 focus:border-ink-500/50 focus:ring-1 focus:ring-ink-500/30 placeholder:text-stone-500 transition-colors"
            disabled={isQuerying}
          />
          <button
            type="submit"
            disabled={isQuerying || !chatInput.trim()}
            className="bg-ink-600 hover:bg-ink-500 disabled:bg-stone-800 disabled:text-stone-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
