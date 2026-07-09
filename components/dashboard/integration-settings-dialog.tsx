"use client";

import { useCallback, useEffect, useState } from "react";
import Badge from "./badge";
import Modal from "./modal";
import type { Provider } from "@/lib/integrations";

type GmailTool = { name: string; description?: string };

const actionButton =
  "rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5";
const inputClass =
  "w-full rounded-lg border border-zinc-200 bg-transparent px-3 py-1.5 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-violet-500/50 dark:border-white/10 dark:text-white dark:placeholder:text-zinc-500";
const sectionTitle = "text-sm font-medium text-zinc-900 dark:text-white";

function EmailsSection({ userId }: { userId: string }) {
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchEmails = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ uid: userId, count: "5" });
      if (query.trim()) params.set("q", query.trim());
      const res = await fetch(`/api/integrations/gmail/emails?${params}`);
      const body = (await res.json().catch(() => null)) as {
        preview?: string;
        error?: string;
      } | null;
      if (!res.ok) setError(body?.error ?? "Could not fetch emails.");
      else setPreview(body?.preview ?? "(empty result)");
    } catch {
      setError("Could not reach the server. Please retry.");
    } finally {
      setLoading(false);
    }
  }, [userId, query]);

  return (
    <div className="mt-5 border-t border-zinc-200 pt-4 dark:border-white/10">
      <p className={sectionTitle}>Inbox</p>
      <div className="mt-2 flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search (e.g. from:priya is:unread) — empty for recent"
          className={inputClass}
        />
        <button
          type="button"
          onClick={fetchEmails}
          disabled={loading}
          className={`shrink-0 ${actionButton}`}
        >
          {loading ? "Loading…" : "Fetch"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-rose-500">{error}</p>}
      {preview && (
        <pre className="mt-3 max-h-48 overflow-auto rounded-xl bg-zinc-100 p-3 text-xs whitespace-pre-wrap text-zinc-700 dark:bg-white/5 dark:text-zinc-300">
          {preview}
        </pre>
      )}
    </div>
  );
}

function LabelsSection({ userId }: { userId: string }) {
  const [labels, setLabels] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchLabels = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/integrations/gmail/labels?uid=${userId}`);
      const body = (await res.json().catch(() => null)) as {
        labels?: string[];
        error?: string;
      } | null;
      if (!res.ok) setError(body?.error ?? "Could not fetch labels.");
      else setLabels(body?.labels ?? []);
    } catch {
      setError("Could not reach the server. Please retry.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  return (
    <div className="mt-5 border-t border-zinc-200 pt-4 dark:border-white/10">
      <div className="flex items-center justify-between gap-3">
        <p className={sectionTitle}>Labels</p>
        <button
          type="button"
          onClick={fetchLabels}
          disabled={loading}
          className={actionButton}
        >
          {loading ? "Loading…" : "Load labels"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-rose-500">{error}</p>}
      {labels && (
        <div className="mt-3 flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
          {labels.length === 0 ? (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              No labels found.
            </p>
          ) : (
            labels.map((label) => (
              <Badge key={label} tone="zinc">
                {label}
              </Badge>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function SendSection({ userId }: { userId: string }) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const send = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSent(false);
    try {
      const res = await fetch("/api/integrations/gmail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, to, subject, body }),
      });
      const result = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) {
        setError(result?.error ?? "Could not send the email.");
      } else {
        setSent(true);
        setTo("");
        setSubject("");
        setBody("");
      }
    } catch {
      setError("Could not reach the server. Please retry.");
    } finally {
      setLoading(false);
    }
  }, [userId, to, subject, body]);

  return (
    <div className="mt-5 border-t border-zinc-200 pt-4 dark:border-white/10">
      <p className={sectionTitle}>Send an email</p>
      <div className="mt-2 space-y-2">
        <input
          type="email"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="To"
          className={inputClass}
        />
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject"
          className={inputClass}
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Message"
          rows={3}
          className={`${inputClass} resize-none`}
        />
        <button
          type="button"
          onClick={send}
          disabled={loading || !to || !subject || !body}
          className="w-full rounded-lg bg-gradient-to-r from-violet-500 to-blue-500 px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-violet-500/25 transition-opacity hover:opacity-85 disabled:opacity-50"
        >
          {loading ? "Sending…" : "Send"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-rose-500">{error}</p>}
      {sent && (
        <p className="mt-2 text-xs text-emerald-500">Email sent successfully.</p>
      )}
    </div>
  );
}

function GmailTools({ userId }: { userId: string }) {
  const [tools, setTools] = useState<GmailTool[] | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setTools(null);
    setError(null);
    fetch(`/api/integrations/gmail/tools?uid=${userId}`)
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as {
          tools?: GmailTool[];
          email?: string;
          error?: string;
        } | null;
        if (!active) return;
        if (!res.ok) {
          setError(body?.error ?? "Could not load Gmail tools.");
        } else {
          setTools(body?.tools ?? []);
          setEmail(body?.email ?? null);
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
          onClick={() => setAttempt((n) => n + 1)}
          className={`mt-3 ${actionButton}`}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!tools) {
    return (
      <div className="space-y-2">
        <div className="skeleton h-10 rounded-xl" />
        <div className="skeleton h-10 rounded-xl" />
        <div className="skeleton h-10 rounded-xl" />
      </div>
    );
  }

  return (
    <div>
      {email && (
        <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
          Connected as <span className="font-medium">{email}</span>
        </p>
      )}
      <ul className="max-h-40 space-y-3 overflow-y-auto pr-1">
        {tools.map((tool) => (
          <li key={tool.name}>
            <p className="text-sm font-medium text-zinc-900 dark:text-white">
              {tool.name}
            </p>
            {tool.description && (
              <p className="mt-0.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                {tool.description}
              </p>
            )}
          </li>
        ))}
      </ul>
      <EmailsSection userId={userId} />
      <LabelsSection userId={userId} />
      <SendSection userId={userId} />
    </div>
  );
}

export default function IntegrationSettingsDialog({
  provider,
  userId,
  onClose,
}: {
  provider: Provider;
  userId: string;
  onClose: () => void;
}) {
  return (
    <Modal title={`${provider.name} tools`} onClose={onClose}>
      {provider.hasLiveTools ? (
        <GmailTools userId={userId} />
      ) : (
        <div>
          <Badge tone="zinc">
            Preview — live tools arrive when this platform is wired up
          </Badge>
          <ul className="mt-4 space-y-3">
            {provider.staticActions.map((action) => (
              <li key={action.name}>
                <p className="text-sm font-medium text-zinc-900 dark:text-white">
                  {action.name}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                  {action.description}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}
