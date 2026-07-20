"use client";

import { MAX_MESSAGE_CHARS } from "@/lib/agent-protocol";
import { SentIcon, StopIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState } from "react";

const MAX_ROWS_PX = 160;

/**
 * Chat composer: auto-growing textarea, Enter to send, Shift+Enter for a
 * newline. Turns into a stop button while an answer is generating so a long
 * or wrong answer can be cut short.
 */
export default function Composer({
  disabled,
  isStreaming,
  onSend,
  onStop,
}: {
  disabled: boolean;
  isStreaming: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
}) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Grow with content up to a cap, then scroll internally.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_ROWS_PX)}px`;
  }, [value]);

  // Return focus to the composer once the answer finishes.
  useEffect(() => {
    if (!isStreaming && !disabled) textareaRef.current?.focus();
  }, [isStreaming, disabled]);

  const submit = () => {
    const text = value.trim();
    if (!text || disabled || isStreaming) return;
    setValue("");
    onSend(text);
  };

  const remaining = MAX_MESSAGE_CHARS - value.length;
  const showCount = remaining <= 200;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="mt-4 shrink-0"
    >
      <div className="flex items-end gap-2 rounded-2xl border border-zinc-200 bg-white/60 p-2 pl-4 transition-colors focus-within:border-violet-400/70 dark:border-white/10 dark:bg-white/[0.03] dark:focus-within:border-violet-400/50">
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={(event) =>
            setValue(event.target.value.slice(0, MAX_MESSAGE_CHARS))
          }
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={
            disabled
              ? "Sign in to chat with your agent."
              : isStreaming
                ? "Aster is answering…"
                : "Ask Aster anything…"
          }
          disabled={disabled}
          aria-label="Message"
          className="no-scrollbar my-1.5 max-h-40 flex-1 resize-none bg-transparent text-sm leading-relaxed text-zinc-900 outline-none placeholder:text-zinc-400 disabled:cursor-not-allowed dark:text-white dark:placeholder:text-zinc-500"
        />

        {isStreaming ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop generating"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-300 text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-white/15 dark:text-zinc-300 dark:hover:bg-white/5"
          >
            <HugeiconsIcon icon={StopIcon} size={16} strokeWidth={2} />
          </button>
        ) : (
          <button
            type="submit"
            aria-label="Send message"
            disabled={disabled || !value.trim()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-blue-500 text-white shadow-lg shadow-violet-500/25 transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          >
            <HugeiconsIcon icon={SentIcon} size={17} strokeWidth={1.8} />
          </button>
        )}
      </div>

      <div className="mt-1.5 flex justify-between px-1 text-[11px] text-zinc-400 dark:text-zinc-500">
        <span>
          <kbd className="font-sans font-medium">Enter</kbd> to send ·{" "}
          <kbd className="font-sans font-medium">Shift+Enter</kbd> for a new
          line
        </span>
        {showCount && (
          <span className={remaining < 0 ? "text-rose-500" : ""}>
            {remaining} left
          </span>
        )}
      </div>
    </form>
  );
}
