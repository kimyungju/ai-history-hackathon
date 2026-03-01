import { useMemo, useCallback } from "react";
import Markdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import type { ChatMessage as ChatMessageType, Citation } from "../types";
import { injectCitationHtml, extractUniqueCitations } from "../utils/parseCitations";
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

  const citations = message.citations ?? [];

  // Build citation lookup map once
  const citationMap = useMemo(() => {
    const map = new Map<string, Citation>();
    for (const c of citations) {
      map.set(`${c.type}:${c.id}`, c);
    }
    return map;
  }, [citations]);

  // Deduplicated citations for sources footer (order of first appearance)
  const uniqueCitations = useMemo(
    () => extractUniqueCitations(message.content, citations),
    [message.content, citations]
  );

  // Remap original citation IDs → sequential 1, 2, 3...
  const idRemap = useMemo(() => {
    const map = new Map<string, number>();
    uniqueCitations.forEach((c, i) => {
      map.set(`${c.type}:${c.id}`, i + 1);
    });
    return map;
  }, [uniqueCitations]);

  // Inject citation HTML with sequential numbering
  const processedText = useMemo(
    () => injectCitationHtml(message.content, citations, idRemap),
    [message.content, citations, idRemap]
  );

  const sourceLabel =
    message.source_type === "mixed"
      ? "Archive + Web"
      : message.source_type === "web_fallback"
        ? "Web sources"
        : null;

  // Custom <cite> renderer for inline citations
  const markdownComponents = useMemo(
    () => ({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cite: ({ children, ...props }: any) => {
        const ref = props["data-ref"] as string | undefined;
        if (!ref) return <cite {...props}>{children}</cite>;

        const citation = citationMap.get(ref);
        if (!citation) return <>{children}</>;

        if (citation.type === "archive") {
          return (
            <button
              type="button"
              className="inline-flex items-center bg-ink-600/20 text-ink-400 hover:bg-ink-600/35 hover:text-ink-300 px-1 rounded text-[10px] font-mono cursor-pointer transition-colors ml-0.5 align-super leading-none"
              title={`${citation.doc_id} p.${citation.pages.join(",")}`}
              onClick={() => openPdfModal(citation.doc_id, citation.pages[0])}
            >
              [{children}]
            </button>
          );
        }

        // Web citation
        return (
          <a
            href={citation.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/35 hover:text-emerald-300 px-1 rounded text-[10px] font-mono transition-colors ml-0.5 align-super leading-none"
            title={citation.title}
          >
            [{children}]
          </a>
        );
      },
    }),
    [citationMap, openPdfModal]
  );

  return (
    <div className="flex justify-start mb-3 animate-fade-in">
      <div className="bg-stone-800/80 rounded-2xl rounded-bl-sm px-4 py-2 max-w-[85%]">
        <div className="text-sm prose prose-invert prose-sm max-w-none prose-p:text-stone-200 prose-strong:text-stone-100 prose-p:leading-relaxed">
          <Markdown rehypePlugins={[rehypeRaw]} components={markdownComponents}>
            {processedText}
          </Markdown>
        </div>
        {/* Sources footer */}
        {uniqueCitations.length > 0 && (
          <div className="mt-2 pt-2 border-t border-stone-700/50">
            <span className="text-[10px] text-stone-500 font-medium tracking-wider uppercase">
              {sourceLabel ?? "Sources"}
            </span>
            <div className="mt-1 flex flex-col gap-0.5">
              {uniqueCitations.map((c, idx) =>
                c.type === "archive" ? (
                  <button
                    key={`${c.type}:${c.id}`}
                    className="flex items-center gap-1.5 text-[11px] text-ink-400 hover:text-ink-300 hover:underline transition-colors text-left font-mono"
                    onClick={() => openPdfModal(c.doc_id, c.pages[0])}
                    title={c.text_span}
                  >
                    <span className="text-stone-600 text-[10px]">[{idx + 1}]</span>
                    <span>{c.doc_id}</span>
                    <span className="text-stone-500">p.{c.pages.join(",")}</span>
                  </button>
                ) : (
                  <a
                    key={`${c.type}:${c.id}`}
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-[11px] text-emerald-400 hover:text-emerald-300 hover:underline transition-colors font-mono"
                    title={c.title}
                  >
                    <span className="text-stone-600 text-[10px]">[{idx + 1}]</span>
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
