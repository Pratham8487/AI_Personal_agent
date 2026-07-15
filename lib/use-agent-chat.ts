"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "./auth-client";

export type AgentChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  apps: string[];
  suggestions: string[];
  streaming?: boolean;
  error?: boolean;
};

export type AgentToolStatus = { app: string; label: string };

type StreamEvent =
  | { type: "meta"; conversationId: string }
  | { type: "status"; app: string; label: string }
  | { type: "delta"; text: string }
  | { type: "suggestions"; items: string[] }
  | { type: "done"; messageId: string | null; apps: string[] }
  | { type: "error"; message: string };

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
 * NDJSON events from /api/agent/chat into the message list, and starts
 * fresh sessions via /api/agent/new.
 */
export function useAgentChat(userId: string | undefined) {
  const [messages, setMessages] = useState<AgentChatMessage[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [toolStatus, setToolStatus] = useState<AgentToolStatus | null>(null);
  const conversationRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    apiFetch("/api/agent/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    })
      .then(async (res) => {
        if (!active || !res.ok) return;
        const body = (await res.json()) as {
          conversationId?: string | null;
          messages?: AgentChatMessage[];
        };
        if (!active) return;
        conversationRef.current = body.conversationId ?? null;
        if (Array.isArray(body.messages)) setMessages(body.messages);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setHistoryLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [userId]);

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
      if (!message || !userId || abortRef.current) return;

      const assistantId = localId();
      setMessages((current) => [
        ...current,
        { id: localId(), role: "user", content: message, apps: [], suggestions: [] },
        {
          id: assistantId,
          role: "assistant",
          content: "",
          apps: [],
          suggestions: [],
          streaming: true,
        },
      ]);
      setIsStreaming(true);
      setToolStatus(null);

      const controller = new AbortController();
      abortRef.current = controller;
      let failure: string | null = null;

      try {
        const res = await apiFetch("/api/agent/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId,
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

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        const handleEvent = (event: StreamEvent) => {
          switch (event.type) {
            case "meta":
              conversationRef.current = event.conversationId;
              break;
            case "status":
              setToolStatus({ app: event.app, label: event.label });
              break;
            case "delta":
              setToolStatus(null);
              patchMessage(assistantId, (m) => ({
                ...m,
                content: m.content + event.text,
              }));
              break;
            case "suggestions":
              patchMessage(assistantId, (m) => ({
                ...m,
                suggestions: event.items,
              }));
              break;
            case "done":
              patchMessage(assistantId, (m) => ({
                ...m,
                apps: event.apps,
                streaming: false,
              }));
              break;
            case "error":
              failure = event.message || GENERIC_ERROR;
              break;
          }
        };

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              handleEvent(JSON.parse(line) as StreamEvent);
            } catch {
              // skip malformed line
            }
          }
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          failure = GENERIC_ERROR;
        }
      } finally {
        abortRef.current = null;
        setIsStreaming(false);
        setToolStatus(null);
        const failureText = failure;
        patchMessage(assistantId, (m) => ({
          ...m,
          streaming: false,
          ...(failureText && !m.content
            ? { content: failureText, error: true }
            : {}),
        }));
      }
    },
    [userId, patchMessage],
  );

  const newConversation = useCallback(async () => {
    if (!userId) return;
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setToolStatus(null);
    setIsStreaming(false);
    conversationRef.current = null;
    try {
      const res = await apiFetch("/api/agent/new", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) {
        const body = (await res.json()) as { conversationId?: string };
        conversationRef.current = body.conversationId ?? null;
      }
    } catch {
      // a fresh conversation is created on the next send anyway
    }
  }, [userId]);

  return { messages, historyLoaded, isStreaming, toolStatus, send, newConversation };
}
