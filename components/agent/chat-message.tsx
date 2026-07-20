"use client";

import Markdown from "@/components/agent/markdown";
import ToolTrace from "@/components/agent/tool-trace";
import AppIcon from "@/components/dashboard/app-icon";
import { PROVIDERS } from "@/lib/integrations";
import type { AgentChatMessage, AgentToolRun } from "@/lib/use-agent-chat";
import { Copy01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";

const providerName = new Map<string, string>(
  PROVIDERS.map((p) => [p.id, p.name]),
);

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1.5" aria-label="Thinking">
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

/** Gradient mark identifying the assistant, mirroring the empty-state badge. */
function AsterAvatar() {
  return (
    <div
      aria-hidden
      className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-blue-500 text-[13px] text-white shadow-sm shadow-violet-500/25"
    >
      ✦
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={copied ? "Copied" : "Copy message"}
      onClick={() => {
        void navigator.clipboard
          .writeText(text)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1_500);
          })
          .catch(() => {});
      }}
      className="rounded-md p-1 text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:text-zinc-600 dark:hover:text-zinc-200"
    >
      <HugeiconsIcon
        icon={copied ? Tick02Icon : Copy01Icon}
        size={13}
        strokeWidth={2}
        className={copied ? "text-emerald-500" : ""}
      />
    </button>
  );
}

/**
 * One chat turn. `toolRuns` is passed only for the message currently being
 * generated, so the tool checklist shows against the answer it belongs to.
 */
export default function ChatMessage({
  message,
  toolRuns = [],
}: {
  message: AgentChatMessage;
  toolRuns?: AgentToolRun[];
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[80%] rounded-2xl rounded-br-md bg-gradient-to-br from-violet-500 to-blue-500 px-4 py-2.5 text-sm whitespace-pre-wrap text-white shadow-md shadow-violet-500/20">
          {message.content}
        </p>
      </div>
    );
  }

  const waiting = message.streaming && !message.content;

  return (
    <div className="group flex items-start gap-2.5">
      <AsterAvatar />
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
        <div
          className={`w-fit max-w-full min-w-0 rounded-2xl rounded-tl-md px-4 py-2.5 text-sm ${
            message.error
              ? "border border-rose-300/60 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
              : "bg-zinc-100 text-zinc-700 dark:bg-white/[0.06] dark:text-zinc-200"
          }`}
        >
          {waiting ? (
            <div className="flex flex-col gap-2 py-0.5">
              {toolRuns.length > 0 && <ToolTrace runs={toolRuns} />}
              <TypingDots />
            </div>
          ) : (
            <>
              {toolRuns.length > 0 && (
                <div className="mb-2 border-b border-zinc-200 pb-2 dark:border-white/10">
                  <ToolTrace runs={toolRuns} />
                </div>
              )}
              <Markdown text={message.content} />
              {message.streaming && (
                <div className="mt-2">
                  <TypingDots />
                </div>
              )}
            </>
          )}
        </div>

        {!message.streaming && (
          <div className="flex min-h-[22px] items-center gap-2 pl-1 text-[11px] text-zinc-400 dark:text-zinc-500">
            {message.apps.length > 0 && (
              <span className="flex items-center gap-1.5">
                <span>Pulled from</span>
                {message.apps.map((app) => (
                  <span key={app} className="flex items-center gap-1">
                    <AppIcon app={app} className="h-3 w-3" />
                    {providerName.get(app) ?? app}
                  </span>
                ))}
              </span>
            )}
            {message.stopped && <span>Stopped</span>}
            {message.content && !message.error && (
              <CopyButton text={message.content} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
