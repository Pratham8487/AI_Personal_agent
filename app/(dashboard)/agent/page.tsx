"use client";

import ChatMessage from "@/components/agent/chat-message";
import RecentSummary from "@/components/agent/recent-summary";
import SuggestionChips from "@/components/agent/suggestion-chips";
import AppIcon from "@/components/dashboard/app-icon";
import Card from "@/components/dashboard/card";
import PageHeader from "@/components/dashboard/page-header";
import { PROVIDERS, STATUS_CONNECTED } from "@/lib/integrations";
import { useAgentChat } from "@/lib/use-agent-chat";
import { useCurrentUser } from "@/lib/use-current-user";
import { useIntegrations } from "@/lib/use-integrations";
import { PlusSignIcon, SentIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState } from "react";

const STARTER_CHIPS = [
  "What are my important updates today?",
  "Summarize my unread emails",
  "What needs my reply today?",
  "Any WhatsApp messages I missed?",
  "Find risks in my inbox",
  "Who messaged me most this week?",
];

export default function AgentPage() {
  const { user, isLoaded } = useCurrentUser();
  const { statuses } = useIntegrations(user?.id);
  const {
    messages,
    historyLoaded,
    isStreaming,
    toolStatus,
    send,
    newConversation,
  } = useAgentChat(user?.id);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const connectedApps = PROVIDERS.filter(
    (provider) => statuses[provider.id]?.status === STATUS_CONNECTED,
  );
  const hasLiveSource = connectedApps.some((provider) => provider.hasLiveTools);

  // Keep the newest message in view while history loads and answers stream.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, toolStatus, historyLoaded]);

  const submit = (text: string) => {
    if (isStreaming) return;
    setInput("");
    void send(text);
  };

  const lastMessage = messages[messages.length - 1];
  const quickReplies =
    !isStreaming && lastMessage?.role === "assistant" && !lastMessage.error
      ? lastMessage.suggestions
      : [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="AI Agent"
        description="Ask anything across your connected accounts."
        action={
          <button
            type="button"
            onClick={() => void newConversation()}
            disabled={messages.length === 0 && !isStreaming}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
          >
            <HugeiconsIcon icon={PlusSignIcon} size={14} strokeWidth={2} />
            New chat
          </button>
        }
      />

      <RecentSummary
        userId={user?.id}
        enabled={Boolean(user) && hasLiveSource}
      />

      <Card className="flex flex-1 flex-col">
        <div
          ref={scrollRef}
          className="no-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto pr-1"
        >
          {!isLoaded || (user && !historyLoaded) ? (
            <div className="space-y-3 pt-2">
              <div className="skeleton h-10 w-2/3 rounded-2xl" />
              <div className="skeleton ml-auto h-10 w-1/2 rounded-2xl" />
              <div className="skeleton h-10 w-3/5 rounded-2xl" />
            </div>
          ) : !user ? (
            <p className="pt-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
              Sign in to chat with your agent.
            </p>
          ) : messages.length === 0 ? (
            <div className="flex h-full min-h-[38vh] flex-col items-center justify-center gap-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-r from-violet-500 to-blue-500 text-lg text-white shadow-lg shadow-violet-500/25">
                ✦
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                  Hi! I&apos;m Aster.
                </p>
                <p className="mt-1 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
                  Ask about your email, chats, or day — I pull live data from
                  your connected apps before answering.
                </p>
              </div>
              {connectedApps.length > 0 && (
                <div className="flex items-center gap-2 text-xs text-zinc-400 dark:text-zinc-500">
                  <span>Connected:</span>
                  {connectedApps.map((provider) => (
                    <AppIcon
                      key={provider.id}
                      app={provider.id}
                      className="h-4 w-4"
                    />
                  ))}
                </div>
              )}
              <SuggestionChips
                items={STARTER_CHIPS}
                onSelect={submit}
                className="max-w-lg justify-center"
              />
            </div>
          ) : (
            <>
              {messages.map((message, index) => (
                <ChatMessage
                  key={message.id}
                  message={message}
                  toolStatus={index === messages.length - 1 ? toolStatus : null}
                />
              ))}
              {quickReplies.length > 0 && (
                <SuggestionChips
                  items={quickReplies}
                  onSelect={submit}
                  className="pl-1"
                />
              )}
            </>
          )}
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit(input);
          }}
          className="mt-4 flex items-center gap-2 rounded-xl border border-zinc-200 p-2 pl-4 dark:border-white/10"
        >
          <input
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={
              isStreaming ? "Aster is answering..." : "Ask Aster anything..."
            }
            disabled={!user}
            maxLength={4000}
            className="flex-1 bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400 disabled:cursor-not-allowed dark:text-white dark:placeholder:text-zinc-500"
          />
          <button
            type="submit"
            aria-label="Send message"
            disabled={!user || isStreaming || !input.trim()}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-r from-violet-500 to-blue-500 text-white shadow-lg shadow-violet-500/25 transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <HugeiconsIcon icon={SentIcon} size={17} strokeWidth={1.8} />
          </button>
        </form>
      </Card>
    </div>
  );
}
