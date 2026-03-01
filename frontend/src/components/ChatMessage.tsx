import Markdown from "react-markdown";
import type { ChatMessage as ChatMessageType } from "../types";
import { parseCitations } from "../utils/parseCitations";
import CitationBadge from "./CitationBadge";

interface Props {
  message: ChatMessageType;
}

export default function ChatMessage({ message }: Props) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end mb-3">
        <div className="bg-blue-600 rounded-2xl rounded-br-sm px-4 py-2 max-w-[85%]">
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    );
  }

  // Assistant message — parse citation markers
  const segments = parseCitations(message.content, message.citations ?? []);

  const sourceLabel =
    message.source_type === "mixed"
      ? "Archive + Web"
      : message.source_type === "web_fallback"
        ? "Web sources"
        : null;

  return (
    <div className="flex justify-start mb-3">
      <div className="bg-gray-800 rounded-2xl rounded-bl-sm px-4 py-2 max-w-[85%]">
        <div className="text-sm prose prose-invert prose-sm max-w-none">
          {segments.map((seg, i) =>
            seg.type === "text" ? (
              <Markdown key={i}>{seg.content}</Markdown>
            ) : (
              <CitationBadge key={i} citation={seg.citation} />
            )
          )}
        </div>
        {sourceLabel && (
          <div className="mt-2 pt-2 border-t border-gray-700">
            <span className="text-xs text-gray-500">Sources: {sourceLabel}</span>
          </div>
        )}
      </div>
    </div>
  );
}
