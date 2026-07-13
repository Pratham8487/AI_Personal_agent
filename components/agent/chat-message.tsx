"use client";

import AppIcon from "@/components/dashboard/app-icon";
import Markdown from "@/components/agent/markdown";
import { PROVIDERS } from "@/lib/integrations";
import type { AgentChatMessage, AgentToolStatus } from "@/lib/use-agent-chat";

const providerName = new Map<string, string>(
  PROVIDERS.map((p) => [p.id, p.name]),
);

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1.5">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="typing-dot h-1.5 w-1.5 rounded-full bg-violet-500 dark:bg-violet-400"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}

/** One chat bubble; toolStatus is only passed for the streaming message. */
export default function ChatMessage({
  message,
  toolStatus = null,
}: {
  message: AgentChatMessage;
  toolStatus?: AgentToolStatus | null;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-md rounded-2xl rounded-br-sm bg-gradient-to-r from-violet-500 to-blue-500 px-4 py-2.5 text-sm whitespace-pre-wrap text-white shadow-lg shadow-violet-500/25">
          {message.content}
        </p>
      </div>
    );
  }

  const waiting = message.streaming && !message.content;
  return (
    <div className="flex flex-col items-start gap-1.5">
      <div
        className={`max-w-[85%] rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm ${
          message.error
            ? "border border-rose-300/60 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
            : "bg-zinc-100 text-zinc-700 dark:bg-white/5 dark:text-zinc-200"
        }`}
      >
        {waiting ? (
          toolStatus ? (
            <span className="flex items-center gap-2 py-1">
              <AppIcon app={toolStatus.app} className="h-4 w-4" />
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {providerName.get(toolStatus.app) ?? toolStatus.app}:{" "}
                {toolStatus.label}
              </span>
              <TypingDots />
            </span>
          ) : (
            <span className="flex py-1">
              <TypingDots />
            </span>
          )
        ) : (
          <>
            <Markdown text={message.content} />
            {message.streaming && (
              <div className="mt-2">
                <TypingDots />
              </div>
            )}
          </>
        )}
      </div>
      {!message.streaming && message.apps.length > 0 && (
        <div className="flex items-center gap-1.5 pl-1 text-[11px] text-zinc-400 dark:text-zinc-500">
          <span>Pulled from</span>
          {message.apps.map((app) => (
            <span key={app} className="flex items-center gap-1">
              <AppIcon app={app} className="h-3 w-3" />
              {providerName.get(app) ?? app}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
