"use client";

import { useState } from "react";
import GmailEmailList from "./gmail-email-list";
import {
  callGmailMcpBatch,
  formatCountStat,
  parseCountResult,
  parseLabels,
  parseMessages,
  parseProfile,
  type GmailMcpResult,
} from "@/lib/gmail-mcp-client";

export type McpTool = { name: string; description?: string };

/** Tools that run without arguments the moment they are expanded. */
const AUTO_RUN = new Set(["read_emails", "get_labels", "get_profile"]);

const QUERY_TOOLS = new Set(["search_inbox", "count_messages"]);

const inputClass =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/40 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-zinc-500";

const runButtonClass =
  "shrink-0 rounded-lg bg-gradient-to-r from-violet-500 to-blue-500 px-3 py-1.5 text-xs font-semibold text-white shadow-lg shadow-violet-500/25 transition-opacity hover:opacity-85 disabled:opacity-50";

type Phase = "idle" | "loading" | "done" | "error";

function ResultView({
  result,
  onRetry,
}: {
  result: GmailMcpResult;
  onRetry: () => void;
}) {
  const messages = parseMessages(result.structured);
  if (messages) {
    return (
      <GmailEmailList
        status="ready"
        emails={messages}
        error={null}
        onRetry={onRetry}
        emptyText="No messages found."
      />
    );
  }

  const labels = parseLabels(result.structured);
  if (labels) {
    return labels.length ? (
      <ul className="flex flex-wrap gap-1.5">
        {labels.map((label) => (
          <li
            key={label}
            className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-white/10 dark:text-zinc-300"
          >
            {label}
          </li>
        ))}
      </ul>
    ) : (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">No labels found.</p>
    );
  }

  const profile = parseProfile(result.structured);
  if (profile) {
    return (
      <dl className="space-y-1 text-sm">
        <div className="flex gap-2">
          <dt className="text-zinc-500 dark:text-zinc-400">Email:</dt>
          <dd className="text-zinc-900 dark:text-white">{profile.emailAddress}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-zinc-500 dark:text-zinc-400">Total messages:</dt>
          <dd className="text-zinc-900 dark:text-white">
            {profile.messagesTotal.toLocaleString("en-US")}
          </dd>
        </div>
      </dl>
    );
  }

  const count = parseCountResult(result.structured);
  if (count !== null) {
    return (
      <p className="text-sm text-zinc-700 dark:text-zinc-200">
        <span className="text-lg font-semibold text-zinc-900 dark:text-white">
          {formatCountStat(count)}
        </span>{" "}
        matching messages
      </p>
    );
  }

  return (
    <p className="text-sm whitespace-pre-wrap text-zinc-700 dark:text-zinc-200">
      {result.message}
    </p>
  );
}

/** One expandable MCP tool: click to run it live and see formatted output. */
export default function GmailToolRunner({
  tool,
  userId,
}: {
  tool: McpTool;
  userId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<GmailMcpResult | null>(null);
  const [query, setQuery] = useState("is:unread");
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const run = (args: Record<string, unknown>) => {
    setPhase("loading");
    callGmailMcpBatch(userId, [{ name: tool.name, args }])
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

  const runWithInputs = () => {
    if (tool.name === "send_email") {
      run({ to: to.trim(), subject: subject.trim(), body: body.trim() });
    } else if (QUERY_TOOLS.has(tool.name)) {
      run({ query: query.trim(), count: 5 });
    } else {
      run({ count: 5 });
    }
  };

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && phase === "idle" && AUTO_RUN.has(tool.name)) {
      run({ count: 5 });
    }
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
          <span className="block font-mono text-sm font-medium text-zinc-900 dark:text-white">
            {tool.name}
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
        <div className="border-t border-zinc-200 p-3 dark:border-white/10">
          {QUERY_TOOLS.has(tool.name) && (
            <div className="mb-3 flex gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. from:boss is:unread"
                className={inputClass}
              />
              <button
                type="button"
                onClick={runWithInputs}
                disabled={phase === "loading" || !query.trim()}
                className={runButtonClass}
              >
                Run
              </button>
            </div>
          )}

          {tool.name === "send_email" && (
            <div className="mb-3 space-y-2">
              <input
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="Recipient email"
                type="email"
                className={inputClass}
              />
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject"
                className={inputClass}
              />
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Message body"
                rows={3}
                className={inputClass}
              />
              <button
                type="button"
                onClick={runWithInputs}
                disabled={
                  phase === "loading" || !to.trim() || !subject.trim() || !body.trim()
                }
                className={runButtonClass}
              >
                Send email
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
                onClick={runWithInputs}
                className="mt-2 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
              >
                Retry
              </button>
            </div>
          )}

          {phase === "done" && result && (
            <ResultView result={result} onRetry={runWithInputs} />
          )}
        </div>
      )}
    </li>
  );
}
