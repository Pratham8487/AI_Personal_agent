"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AgentMessagePayload,
  AgentStreamEvent,
} from "./agent-protocol";
import { apiFetch } from "./auth-client";

export type AgentChatMessage = AgentMessagePayload & {
  /** Answer text is still arriving. */
  streaming?: boolean;
  /** Rendered as a failure bubble rather than an answer. */
  error?: boolean;
  /** Generation was stopped by the user; text may be partial. */
  stopped?: boolean;
};

/** One tool call in the current turn, for the "working on it" checklist. */
export type AgentToolRun = {
  id: string;
  app: string;
  label: string;
  done: boolean;
  ok: boolean;
};

const GENERIC_ERROR = "Something went wrong while answering. Please retry.";
const NOT_CONFIGURED =
  "The AI model isn't configured yet. Add OPENAI_API_KEY to .env.local to enable the agent.";

function localId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Chat state machine for the AI Agent page: loads today's history, streams
 * NDJSON events from /api/agent/chat into the message list, and starts fresh
 * sessions via /api/agent/new.
 *
 * `isStreaming` tracks only the answer text. The request stays open a little
 * longer to receive quick replies, so the composer re-enables the moment the
 * answer is readable rather than when the socket finally closes.
 */
export function useAgentChat(userId: string | undefined) {
  const [messages, setMessages] = useState<AgentChatMessage[]>([]);
  /** User whose history is currently loaded; drives `historyLoaded` below. */
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [toolRuns, setToolRuns] = useState<AgentToolRun[]>([]);
  const conversationRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Mirrors isStreaming for guards that run before React re-renders.
  const streamingRef = useRef(false);

  // Derived rather than a separate flag: switching users invalidates the
  // loaded transcript immediately, without a setState inside the effect body.
  const historyLoaded = Boolean(userId) && loadedFor === userId;

  useEffect(() => {
    if (!userId) return;
    let active = true;
    apiFetch("/api/agent/history", { method: "POST" })
      .then(async (res) => {
        if (!active || !res.ok) return;
        const body = (await res.json()) as {
          conversationId?: string | null;
          messages?: AgentChatMessage[];
        };
        if (!active) return;
        conversationRef.current = body.conversationId ?? null;
        setMessages(Array.isArray(body.messages) ? body.messages : []);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadedFor(userId);
      });
    return () => {
      active = false;
    };
  }, [userId]);

  // Abandon any in-flight turn when the page unmounts.
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const patchMessage = useCallback(
    (id: string, patch: (message: AgentChatMessage) => AgentChatMessage) => {
      setMessages((current) =>
        current.map((message) => (message.id === id ? patch(message) : message)),
      );
    },
    [],
  );

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || !userId || streamingRef.current) return;

      // A previous turn may still be open collecting quick replies; dropping
      // it is fine, the answer itself is already saved server-side.
      abortRef.current?.abort();

      const now = new Date().toISOString();
      const assistantId = localId();
      setMessages((current) => [
        ...current,
        {
          id: localId(),
          role: "user",
          content: message,
          apps: [],
          suggestions: [],
          createdAt: now,
        },
        {
          id: assistantId,
          role: "assistant",
          content: "",
          apps: [],
          suggestions: [],
          createdAt: now,
          streaming: true,
        },
      ]);
      streamingRef.current = true;
      setIsStreaming(true);
      setToolRuns([]);

      const controller = new AbortController();
      abortRef.current = controller;
      let failure: string | null = null;
      let finished = false;

      const settle = () => {
        if (finished) return;
        finished = true;
        streamingRef.current = false;
        setIsStreaming(false);
        setToolRuns([]);
      };

      try {
        const res = await apiFetch("/api/agent/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: conversationRef.current,
            message,
          }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const body = (await res.json().catch(() => null)) as {
            code?: string;
          } | null;
          failure =
            body?.code === "not_configured" ? NOT_CONFIGURED : GENERIC_ERROR;
          return;
        }

        const handleEvent = (event: AgentStreamEvent) => {
          switch (event.type) {
            case "meta":
              conversationRef.current = event.conversationId;
              break;
            case "tool_start":
              setToolRuns((current) => [
                ...current,
                {
                  id: event.id,
                  app: event.app,
                  label: event.label,
                  done: false,
                  ok: true,
                },
              ]);
              break;
            case "tool_end":
              setToolRuns((current) =>
                current.map((run) =>
                  run.id === event.id
                    ? { ...run, done: true, ok: event.ok }
                    : run,
                ),
              );
              break;
            case "delta":
              patchMessage(assistantId, (m) => ({
                ...m,
                content: m.content + event.text,
              }));
              break;
            case "done":
              patchMessage(assistantId, (m) => ({
                ...m,
                apps: event.apps,
                streaming: false,
              }));
              // Text is complete; quick replies may still be on the way.
              settle();
              break;
            case "suggestions":
              patchMessage(assistantId, (m) => ({
                ...m,
                suggestions: event.items,
              }));
              break;
            case "error":
              failure = event.message || GENERIC_ERROR;
              break;
          }
        };

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              handleEvent(JSON.parse(line) as AgentStreamEvent);
            } catch {
              // skip malformed line
            }
          }
        }
      } catch (error) {
        const isAbort =
          error instanceof DOMException && error.name === "AbortError";
        if (isAbort) {
          patchMessage(assistantId, (m) =>
            m.streaming ? { ...m, streaming: false, stopped: true } : m,
          );
        } else {
          failure = GENERIC_ERROR;
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        settle();
        const failureText = failure;
        patchMessage(assistantId, (m) => ({
          ...m,
          streaming: false,
          // Keep any partial answer; only replace a bubble that has no text.
          ...(failureText && !m.content
            ? { content: failureText, error: true }
            : {}),
        }));
      }
    },
    [userId, patchMessage],
  );

  /** Stops the current answer, keeping whatever text already arrived. */
  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const newConversation = useCallback(async () => {
    if (!userId) return;
    abortRef.current?.abort();
    abortRef.current = null;
    streamingRef.current = false;
    setMessages([]);
    setToolRuns([]);
    setIsStreaming(false);
    conversationRef.current = null;
    try {
      const res = await apiFetch("/api/agent/new", { method: "POST" });
      if (res.ok) {
        const body = (await res.json()) as { conversationId?: string };
        conversationRef.current = body.conversationId ?? null;
      }
    } catch {
      // a fresh conversation is created on the next send anyway
    }
  }, [userId]);

  return {
    messages,
    historyLoaded,
    isStreaming,
    toolRuns,
    send,
    stop,
    newConversation,
  };
}
