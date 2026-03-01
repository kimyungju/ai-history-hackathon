import Markdown from "react-markdown";
import type { ChatMessage as ChatMessageType, Citation } from "../types";
import { parseCitations } from "../utils/parseCitations";
import { useAppStore } from "../stores/useAppStore";

interface Props {
  message: ChatMessageType;
}

export default function ChatMessage({ message }: Props) {
  const isUser = message.role === "user";
  const openPdfModal = useAppStore((s) => s.openPdfModal);

  if (isUser) {
    return (
      <div className="flex justify-end mb-3 animate-fade-in">
        <div className="bg-ink-600 rounded-2xl rounded-br-sm px-4 py-2 max-w-[85%]">
          <p className="text-sm whitespace-pre-wrap text-white">{message.content}</p>
        </div>
      </div>
    );
  }

  const segments = parseCitations(message.content, message.citations ?? []);

  // Deduplicate citations by type:id
  const uniqueCitations: Citation[] = [];
  const seen = new Set<string>();
  for (const seg of segments) {
    if (seg.type === "citation") {
      const key = `${seg.citation.type}:${seg.citation.id}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueCitations.push(seg.citation);
      }
    }
  }

  const sourceLabel =
    message.source_type === "mixed"
      ? "Archive + Web"
      : message.source_type === "web_fallback"
        ? "Web sources"
        : null;

  return (
    <div className="flex justify-start mb-3 animate-fade-in">
      <div className="bg-stone-800/80 rounded-2xl rounded-bl-sm px-4 py-2 max-w-[85%]">
        <div className="text-sm prose prose-invert prose-sm max-w-none prose-p:text-stone-200 prose-strong:text-stone-100">
          {segments.map((seg, i) =>
            seg.type === "text" ? (
              <Markdown key={i}>{seg.content}</Markdown>
            ) : seg.citation.type === "archive" ? (
              <sup
                key={i}
                className="cursor-pointer text-ink-400 hover:text-ink-300 font-mono text-[10px] ml-0.5"
                title={`${seg.citation.doc_id} p.${seg.citation.pages.join(",")}`}
                onClick={() => openPdfModal(seg.citation.doc_id, seg.citation.pages[0])}
              >
                {seg.citation.id}
              </sup>
            ) : (
              <a
                key={i}
                href={seg.citation.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-400 hover:text-emerald-300 font-mono text-[10px] ml-0.5"
                title={seg.citation.title}
              >
                <sup>{seg.citation.id}</sup>
              </a>
            )
          )}
        </div>
        {/* Sources footer */}
        {uniqueCitations.length > 0 && (
          <div className="mt-2 pt-2 border-t border-stone-700/50">
            {sourceLabel && (
              <span className="text-xs text-stone-500 font-medium tracking-wide">{sourceLabel}</span>
            )}
            <div className="mt-1 flex flex-col gap-1">
              {uniqueCitations.map((c) =>
                c.type === "archive" ? (
                  <button
                    key={`${c.type}:${c.id}`}
                    className="flex items-center gap-1.5 text-xs text-ink-400 hover:text-ink-300 transition-colors text-left font-mono"
                    onClick={() => openPdfModal(c.doc_id, c.pages[0])}
                    title={c.text_span}
                  >
                    <span className="text-stone-500">[{c.id}]</span>
                    <span>{c.doc_id}</span>
                    <span className="text-stone-500">p.{c.pages.join(",")}</span>
                  </button>
                ) : (
                  <a
                    key={`${c.type}:${c.id}`}
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 transition-colors font-mono"
                    title={c.title}
                  >
                    <span className="text-stone-500">[{c.id}]</span>
                    <span>{c.title}</span>
                  </a>
                )
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
