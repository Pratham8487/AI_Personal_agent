"use client";

import { useState } from "react";
import {
  callWhatsappMcpBatch,
  parseWaChats,
  parseWaMessages,
  type WaChat,
  type WhatsappMcpResult,
} from "@/lib/whatsapp-mcp-client";
import { toolTitle } from "@/lib/tool-title";

export type WaMcpTool = {
  name: string;
  description?: string;
  inputSchema?: {
    properties?: Record<string, { type?: string; description?: string }>;
    required?: string[];
  };
};

const inputClass =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/40 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-zinc-500";

const runButtonClass =
  "shrink-0 rounded-lg bg-gradient-to-r from-violet-500 to-blue-500 px-3 py-1.5 text-xs font-semibold text-white shadow-lg shadow-violet-500/25 transition-opacity hover:opacity-85 disabled:opacity-50";

type Phase = "idle" | "loading" | "done" | "error";

const PAGE_SIZE = 5;

/** Display label without leaking raw JIDs. */
function chatLabel(chat: WaChat): string {
  if (chat.name) return chat.name;
  const [id, domain] = chat.jid.split("@");
  return domain === "s.whatsapp.net" ? `+${id}` : "Unnamed group";
}

function ChatList({ chats }: { chats: WaChat[] }) {
  const [visible, setVisible] = useState(PAGE_SIZE);
  const remaining = chats.length - visible;
  return (
    <div>
      <ul className="space-y-1.5">
        {chats.slice(0, visible).map((chat) => (
          <li key={chat.jid} className="text-sm">
            <span className="font-medium break-words text-zinc-900 dark:text-white">
              {chatLabel(chat)}
            </span>
            {typeof chat.participants === "number" && (
              <span className="ml-1.5 text-xs whitespace-nowrap text-zinc-500 dark:text-zinc-400">
                {chat.participants} members
              </span>
            )}
          </li>
        ))}
      </ul>
      {remaining > 0 && (
        <button
          type="button"
          onClick={() => setVisible((count) => count + PAGE_SIZE)}
          className="mt-2 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
        >
          Show more ({remaining} left)
        </button>
      )}
    </div>
  );
}

/** Compact group dropdown: search + short scrollable list. */
function GroupPicker({
  groups,
  value,
  onChange,
}: {
  groups: WaChat[];
  value: string;
  onChange: (jid: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const selected = groups.find((group) => group.jid === value);
  const filtered = filter.trim()
    ? groups.filter((group) =>
        chatLabel(group).toLowerCase().includes(filter.trim().toLowerCase()),
      )
    : groups;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className={`${inputClass} text-left`}
      >
        {selected ? (
          chatLabel(selected)
        ) : (
          <span className="text-zinc-400 dark:text-zinc-500">
            Select a group…
          </span>
        )}
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div className="absolute top-full z-20 mt-1 w-full rounded-lg border border-zinc-200 bg-white p-1.5 shadow-lg dark:border-white/10 dark:bg-[#17111f]">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search groups…"
              autoFocus
              className={inputClass}
            />
            <ul className="no-scrollbar mt-1.5 max-h-44 overflow-y-auto">
              {filtered.map((group) => (
                <li key={group.jid}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(group.jid);
                      setOpen(false);
                    }}
                    className="w-full rounded-md px-2.5 py-1.5 text-left text-sm text-zinc-900 transition-colors hover:bg-zinc-100 dark:text-white dark:hover:bg-white/5"
                  >
                    <span className="break-words">{chatLabel(group)}</span>
                    {typeof group.participants === "number" && (
                      <span className="ml-1.5 text-xs whitespace-nowrap text-zinc-500 dark:text-zinc-400">
                        {group.participants} members
                      </span>
                    )}
                  </button>
                </li>
              ))}
              {filtered.length === 0 && (
                <li className="px-2.5 py-2 text-xs text-zinc-500 dark:text-zinc-400">
                  No groups match.
                </li>
              )}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

function ResultView({ result }: { result: WhatsappMcpResult }) {
  const messages = parseWaMessages(result.structured);
  if (messages) {
    if (messages.length === 0) {
      return (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No messages found.
        </p>
      );
    }
    return (
      <ul className="space-y-2 overflow-x-hidden">
        {messages.map((message, index) => (
          <li
            key={`${message.chatJid}-${message.sentAt}-${index}`}
            className="rounded-lg bg-white p-2.5 dark:bg-white/5"
          >
            <p className="flex items-baseline justify-between gap-2 text-xs">
              <span className="font-semibold text-zinc-900 dark:text-white">
                {message.fromMe ? "Me" : (message.sender ?? "Unknown")}
                {message.chatName && (
                  <span className="ml-1.5 font-normal text-zinc-400">
                    in {message.chatName}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-zinc-400">
                {message.sentAt.slice(0, 16).replace("T", " ")}
              </span>
            </p>
            <p className="mt-1 text-sm break-words text-zinc-700 dark:text-zinc-200">
              {message.text}
            </p>
          </li>
        ))}
      </ul>
    );
  }

  const chats = parseWaChats(result.structured);
  if (chats) {
    if (chats.length === 0) {
      return (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No matches found.
        </p>
      );
    }
    return <ChatList chats={chats} />;
  }

  return (
    <p className="text-sm break-words whitespace-pre-wrap text-zinc-700 dark:text-zinc-200">
      {result.message}
    </p>
  );
}

/** One accordion MCP tool; input fields are derived from its schema. */
export default function WhatsappToolRunner({
  tool,
  userId,
  expanded,
  onToggle,
}: {
  tool: WaMcpTool;
  userId: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<WhatsappMcpResult | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [groups, setGroups] = useState<WaChat[] | null>(null);
  const [groupsError, setGroupsError] = useState(false);

  // Only required string args get inputs; counts fall back to defaults.
  const fields = (tool.inputSchema?.required ?? []).filter(
    (key) => tool.inputSchema?.properties?.[key]?.type === "string",
  );
  const hasGroupField = fields.includes("group");
  const canRun = fields.every((field) => (values[field] ?? "").trim());

  const loadGroups = () => {
    callWhatsappMcpBatch(userId, [{ name: "list_groups" }])
      .then(([res]) => {
        const parsed = res.ok ? parseWaChats(res.structured) : null;
        if (parsed) setGroups(parsed);
        else setGroupsError(true);
      })
      .catch(() => setGroupsError(true));
  };

  const run = () => {
    setPhase("loading");
    const args = Object.fromEntries(
      fields.map((field) => [field, (values[field] ?? "").trim()]),
    );
    callWhatsappMcpBatch(userId, [{ name: tool.name, args }])
      .then(([res]) => {
        setResult(res);
        setPhase(res.ok ? "done" : "error");
      })
      .catch(() => {
        setResult({
          ok: false,
          message: "Could not reach the server. Please retry.",
          structured: null,
        });
        setPhase("error");
      });
  };

  const toggle = () => {
    if (!expanded) {
      if (phase === "idle" && fields.length === 0) run();
      if (hasGroupField && groups === null && !groupsError) loadGroups();
    }
    onToggle();
  };

  return (
    <li className="rounded-xl border border-zinc-200 bg-zinc-50 dark:border-white/10 dark:bg-white/5">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between gap-3 p-3 text-left"
        aria-expanded={expanded}
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-zinc-900 dark:text-white">
            {toolTitle(tool.name)}
          </span>
          {tool.description && (
            <span className="mt-0.5 block text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              {tool.description}
            </span>
          )}
        </span>
        <span className="shrink-0 text-xs font-semibold text-violet-500 dark:text-violet-400">
          {expanded ? "Hide" : "Run"}
        </span>
      </button>

      {expanded && (
        <div className="no-scrollbar max-h-80 overflow-y-auto border-t border-zinc-200 p-3 dark:border-white/10">
          {fields.length > 0 && (
            <div className="mb-3 space-y-2">
              {fields.map((field) =>
                field === "group" && groups === null && !groupsError ? (
                  <select key={field} disabled className={inputClass}>
                    <option>Loading your groups…</option>
                  </select>
                ) : field === "group" && groups && groups.length > 0 ? (
                  <GroupPicker
                    key={field}
                    groups={groups}
                    value={values[field] ?? ""}
                    onChange={(jid) =>
                      setValues((prev) => ({ ...prev, [field]: jid }))
                    }
                  />
                ) : field === "text" ? (
                  <textarea
                    key={field}
                    value={values[field] ?? ""}
                    onChange={(e) =>
                      setValues((prev) => ({ ...prev, [field]: e.target.value }))
                    }
                    placeholder={
                      tool.inputSchema?.properties?.[field]?.description ?? field
                    }
                    rows={3}
                    className={inputClass}
                  />
                ) : (
                  <input
                    key={field}
                    value={values[field] ?? ""}
                    onChange={(e) =>
                      setValues((prev) => ({ ...prev, [field]: e.target.value }))
                    }
                    placeholder={
                      tool.inputSchema?.properties?.[field]?.description ?? field
                    }
                    className={inputClass}
                  />
                ),
              )}
              {hasGroupField && groups && groups.length === 0 && (
                <p className="text-xs text-amber-500">
                  No WhatsApp groups found for your account. Type a group name
                  or JID manually.
                </p>
              )}
              <button
                type="button"
                onClick={run}
                disabled={phase === "loading" || !canRun}
                className={runButtonClass}
              >
                Run
              </button>
            </div>
          )}

          {phase === "loading" && (
            <div className="space-y-2">
              <div className="skeleton h-10 rounded-lg" />
              <div className="skeleton h-10 rounded-lg" />
            </div>
          )}

          {phase === "error" && result && (
            <div>
              <p className="text-sm text-rose-500">{result.message}</p>
              <button
                type="button"
                onClick={run}
                disabled={!canRun}
                className="mt-2 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
              >
                Retry
              </button>
            </div>
          )}

          {phase === "done" && result && <ResultView result={result} />}
        </div>
      )}
    </li>
  );
}
