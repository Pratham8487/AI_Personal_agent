"use client";

import { useEffect, useState } from "react";
import GmailToolRunner, { type McpTool } from "./gmail-tool-runner";

/** Lists the Gmail tools by calling the MCP endpoint (tools/list). */
export default function GmailMcpTools({ userId }: { userId: string }) {
  const [tools, setTools] = useState<McpTool[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    fetch(`/api/integrations/gmail/mcp?uid=${userId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as {
          result?: { tools?: McpTool[] };
          error?: { message?: string };
        } | null;
        if (!active) return;
        if (!res.ok || !body?.result) {
          setError(body?.error?.message ?? "Could not load MCP tools.");
        } else {
          setTools(body.result.tools ?? []);
        }
      })
      .catch(() => {
        if (active) setError("Could not reach the server. Please retry.");
      });
    return () => {
      active = false;
    };
  }, [userId, attempt]);

  if (error) {
    return (
      <div>
        <p className="text-sm text-rose-500">{error}</p>
        <button
          type="button"
          onClick={() => {
            setTools(null);
            setError(null);
            setAttempt((n) => n + 1);
          }}
          className="mt-3 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!tools) {
    return (
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="skeleton h-14 rounded-xl" />
        <div className="skeleton h-14 rounded-xl" />
        <div className="skeleton h-14 rounded-xl" />
        <div className="skeleton h-14 rounded-xl" />
      </div>
    );
  }

  if (tools.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        No MCP tools available.
      </p>
    );
  }

  return (
    <ul className="grid items-start gap-3 lg:grid-cols-2">
      {tools.map((tool) => (
        <GmailToolRunner key={tool.name} tool={tool} userId={userId} />
      ))}
    </ul>
  );
}
