"use client";

import ChatMessage from "@/components/agent/chat-message";
import Composer from "@/components/agent/composer";
import RecentSummary from "@/components/agent/recent-summary";
import SuggestionCards, {
  type Suggestion,
} from "@/components/agent/suggestion-cards";
import SuggestionChips from "@/components/agent/suggestion-chips";
import AppIcon from "@/components/dashboard/app-icon";
import Card from "@/components/dashboard/card";
import PageHeader from "@/components/dashboard/page-header";
import { PROVIDERS, STATUS_CONNECTED } from "@/lib/integrations";
import { useAgentChat } from "@/lib/use-agent-chat";
import { useCurrentUser } from "@/lib/use-current-user";
import { useIntegrations } from "@/lib/use-integrations";
import { useStickToBottom } from "@/lib/use-stick-to-bottom";
import { ArrowDown01Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { useMemo } from "react";

/** Prompts that make sense regardless of which apps are connected. */
const BASE_SUGGESTIONS: Suggestion[] = [
  { title: "What are my important updates today?" },
  { title: "What needs my reply today?" },
];

/** Prompts only offered once the app behind them can actually be queried. */
const APP_SUGGESTIONS: Record<string, Suggestion[]> = {
  gmail: [
    { title: "Summarize my unread emails", app: "gmail" },
    { title: "Find urgent emails I haven't replied to", app: "gmail" },
  ],
  whatsapp: [
    { title: "Any WhatsApp messages I missed?", app: "whatsapp" },
    { title: "Who messaged me most this week?", app: "whatsapp" },
  ],
};

export default function AgentPage() {
  const { user, isLoaded } = useCurrentUser();
  const { statuses } = useIntegrations(user?.id);
  const {
    messages,
    historyLoaded,
    isStreaming,
    toolRuns,
    send,
    stop,
    newConversation,
  } = useAgentChat(user?.id);

  const connectedApps = useMemo(
    () =>
      PROVIDERS.filter(
        (provider) => statuses[provider.id]?.status === STATUS_CONNECTED,
      ),
    [statuses],
  );
  const liveApps = useMemo(
    () => connectedApps.filter((provider) => provider.hasLiveTools),
    [connectedApps],
  );

  const suggestions = useMemo(() => {
    const appSpecific = liveApps.flatMap(
      (provider) => APP_SUGGESTIONS[provider.id] ?? [],
    );
    return [...appSpecific, ...BASE_SUGGESTIONS].slice(0, 6);
  }, [liveApps]);

  const { ref, isPinned, onScroll, scrollToBottom } =
    useStickToBottom<HTMLDivElement>([messages, toolRuns, historyLoaded]);

  const submit = (text: string) => {
    if (isStreaming) return;
    void send(text);
  };

  const lastMessage = messages[messages.length - 1];
  const quickReplies =
    !isStreaming && lastMessage?.role === "assistant" && !lastMessage.error
      ? lastMessage.suggestions
      : [];

  const loading = !isLoaded || (Boolean(user) && !historyLoaded);

  return (
    <div className="flex h-full min-h-0 flex-col pb-6">
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

      <RecentSummary userId={user?.id} enabled={Boolean(user) && liveApps.length > 0} />

      <Card className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={ref}
          onScroll={onScroll}
          role="log"
          aria-live="polite"
          aria-busy={isStreaming}
          aria-label="Conversation"
          className="no-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto pr-1"
        >
          {loading ? (
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
            <div className="flex h-full min-h-[38vh] flex-col items-center justify-center gap-5 py-14 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-blue-500 text-lg text-white shadow-lg shadow-violet-500/25">
                ✦
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                  Hi! I&apos;m Aster.
                </p>
                <p className="mt-1 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
                  {liveApps.length > 0
                    ? "Ask about your email, chats, or day — I pull live data from your connected apps before answering."
                    : "Ask me anything. Connect an app to let me pull in your real email and chats."}
                </p>
              </div>

              {connectedApps.length > 0 ? (
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
              ) : (
                <Link
                  href="/integrations"
                  className="text-xs font-medium text-violet-600 underline underline-offset-2 dark:text-violet-400"
                >
                  Connect an app to get live answers
                </Link>
              )}

              <SuggestionCards items={suggestions} onSelect={submit} />
            </div>
          ) : (
            <>
              {messages.map((message, index) => (
                <ChatMessage
                  key={message.id}
                  message={message}
                  toolRuns={
                    index === messages.length - 1 && isStreaming ? toolRuns : []
                  }
                />
              ))}
              {quickReplies.length > 0 && (
                <SuggestionChips
                  items={quickReplies}
                  onSelect={submit}
                  className="pl-[38px]"
                />
              )}
            </>
          )}
        </div>

        {/* Only offered when the pin is released, i.e. the user scrolled up. */}
        {!isPinned && messages.length > 0 && (
          <button
            type="button"
            onClick={() => scrollToBottom()}
            aria-label="Scroll to latest"
            className="absolute bottom-28 left-1/2 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-600 shadow-md transition-colors hover:bg-zinc-50 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <HugeiconsIcon icon={ArrowDown01Icon} size={16} strokeWidth={2} />
          </button>
        )}

        <Composer
          disabled={!user}
          isStreaming={isStreaming}
          onSend={submit}
          onStop={stop}
        />
      </Card>
    </div>
  );
}
