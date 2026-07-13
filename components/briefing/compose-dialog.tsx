"use client";

import AppIcon from "@/components/dashboard/app-icon";
import {
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/dashboard/form-classes";
import Modal from "@/components/dashboard/modal";
import type { BriefingItem } from "@/lib/briefing-types";
import {
  CheckmarkCircle02Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useState } from "react";

type Channel = "gmail" | "whatsapp";
type Phase = "editing" | "sending" | "sent";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const channelChip =
  "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors";

/**
 * AI-assisted compose: drafts from the briefing item's context, stays fully
 * editable, then sends through the selected connected channel.
 */
export default function ComposeDialog({
  userId,
  resultId,
  item,
  connected,
  onClose,
  onSent,
}: {
  userId: string;
  resultId: string;
  item: BriefingItem;
  connected: { gmail: boolean; whatsapp: boolean };
  onClose: () => void;
  onSent: (notice: string) => void;
}) {
  const initialChannel: Channel =
    item.source === "whatsapp" && connected.whatsapp
      ? "whatsapp"
      : connected.gmail
        ? "gmail"
        : "whatsapp";
  const [channel, setChannel] = useState<Channel>(initialChannel);
  const [phase, setPhase] = useState<Phase>("editing");
  // Drafting is derived state: the AI draft for `channel` hasn't landed yet.
  const [draftedFor, setDraftedFor] = useState<Channel | null>(null);
  const [draftAttempt, setDraftAttempt] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/briefings/compose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        channel,
        resultId,
        item: {
          title: item.title,
          description: item.description,
          source: item.source,
          timestamp: item.timestamp,
        },
      }),
    })
      .then(async (res) => {
        const responseBody: unknown = await res.json().catch(() => null);
        if (!active) return;
        const rawDraft = (responseBody as { draft?: unknown })?.draft;
        if (res.ok && rawDraft && typeof rawDraft === "object") {
          const {
            to: draftTo,
            subject: draftSubject,
            body: draftBody,
          } = rawDraft as Record<string, unknown>;
          setTo(typeof draftTo === "string" ? draftTo : "");
          setSubject(typeof draftSubject === "string" ? draftSubject : "");
          setBody(typeof draftBody === "string" ? draftBody : "");
        } else {
          setNotice("AI draft unavailable — write your message below.");
        }
        setDraftedFor(channel);
      })
      .catch(() => {
        if (!active) return;
        setNotice("AI draft unavailable — write your message below.");
        setDraftedFor(channel);
      });
    return () => {
      active = false;
    };
  }, [userId, resultId, item, channel, draftAttempt]);

  const regenerate = useCallback(() => {
    setDraftedFor(null);
    setNotice(null);
    setError(null);
    setDraftAttempt((n) => n + 1);
  }, []);

  const switchChannel = useCallback((next: Channel) => {
    setChannel((prev) => {
      if (prev === next) return prev;
      setDraftedFor(null);
      setNotice(null);
      setError(null);
      return next;
    });
  }, []);

  const canSend =
    phase === "editing" &&
    body.trim().length > 0 &&
    to.trim().length > 0 &&
    (channel !== "gmail" ||
      (EMAIL_PATTERN.test(to.trim()) && subject.trim().length > 0));

  const send = useCallback(async () => {
    if (!canSend) return;
    setPhase("sending");
    setError(null);
    try {
      const res = await fetch("/api/briefings/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          channel,
          to: to.trim(),
          ...(channel === "gmail" ? { subject: subject.trim() } : {}),
          body: body.trim(),
        }),
      });
      if (!res.ok) {
        const responseBody: unknown = await res.json().catch(() => null);
        const { error: message } = (responseBody ?? {}) as { error?: string };
        setError(message ?? "Could not send. Please retry.");
        setPhase("editing");
        return;
      }
      setPhase("sent");
      setTimeout(() => {
        onSent(channel === "gmail" ? "Email sent." : "Message sent.");
        onClose();
      }, 1_500);
    } catch {
      setError("Could not send. Please retry.");
      setPhase("editing");
    }
  }, [canSend, userId, channel, to, subject, body, onSent, onClose]);

  const drafting = draftedFor !== channel;

  return (
    <Modal title="Compose" onClose={onClose}>
      {phase === "sent" ? (
        <div className="flex flex-col items-center py-8 text-center">
          <HugeiconsIcon
            icon={CheckmarkCircle02Icon}
            size={40}
            strokeWidth={1.5}
            className="text-emerald-500"
          />
          <p className="mt-3 text-sm font-semibold text-zinc-900 dark:text-white">
            {channel === "gmail" ? "Email sent" : "Message sent"}
          </p>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="space-y-4"
        >
          <div>
            <span className={labelClass}>Send via</span>
            <div className="flex gap-2">
              {(["gmail", "whatsapp"] as const).map((id) => {
                const isConnected = connected[id];
                const selected = channel === id;
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={!isConnected || drafting}
                    title={
                      !isConnected ? "Connect in Integrations first" : undefined
                    }
                    onClick={() => switchChannel(id)}
                    className={`${channelChip} ${
                      !isConnected
                        ? "cursor-not-allowed border-zinc-200 text-zinc-400 opacity-50 dark:border-white/10 dark:text-zinc-500"
                        : selected
                          ? "border-violet-500/50 bg-violet-500/10 text-violet-700 dark:text-violet-300"
                          : "border-zinc-200 text-zinc-600 hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
                    }`}
                  >
                    <AppIcon app={id} className="h-3.5 w-3.5" />
                    {id === "gmail" ? "Email" : "WhatsApp"}
                  </button>
                );
              })}
            </div>
          </div>

          {notice && (
            <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
              {notice}
            </p>
          )}

          {drafting ? (
            <div className="space-y-2">
              <div className="skeleton h-9 rounded-lg" />
              {channel === "gmail" && (
                <div className="skeleton h-9 rounded-lg" />
              )}
              <div className="skeleton h-28 rounded-lg" />
              <p className="flex items-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-500">
                <HugeiconsIcon
                  icon={SparklesIcon}
                  size={12}
                  strokeWidth={1.8}
                  className="animate-spin"
                />
                Drafting with AI…
              </p>
            </div>
          ) : (
            <>
              <div>
                <label htmlFor="compose-to" className={labelClass}>
                  {channel === "gmail" ? "To (email)" : "To (phone or chat)"}
                </label>
                <input
                  id="compose-to"
                  type={channel === "gmail" ? "email" : "text"}
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder={
                    channel === "gmail" ? "name@example.com" : "+15551234567"
                  }
                  className={inputClass}
                />
              </div>
              {channel === "gmail" && (
                <div>
                  <label htmlFor="compose-subject" className={labelClass}>
                    Subject
                  </label>
                  <input
                    id="compose-subject"
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    maxLength={300}
                    className={inputClass}
                  />
                </div>
              )}
              <div>
                <label htmlFor="compose-body" className={labelClass}>
                  Message
                </label>
                <textarea
                  id="compose-body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={6}
                  maxLength={channel === "gmail" ? 10_000 : 4_096}
                  className={`${inputClass} resize-y`}
                />
              </div>
            </>
          )}

          {error && <p className="text-xs text-rose-500">{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={regenerate}
              disabled={drafting || phase === "sending"}
              className={`flex items-center gap-1.5 ${secondaryButtonClass}`}
            >
              <HugeiconsIcon icon={SparklesIcon} size={12} strokeWidth={1.8} />
              Regenerate draft
            </button>
            <button
              type="submit"
              disabled={!canSend}
              className={primaryButtonClass}
            >
              {phase === "sending" ? "Sending…" : "Send"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
