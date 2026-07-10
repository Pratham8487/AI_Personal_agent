import { getValidAccessToken } from "./gmail-oauth";

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

/** Actions the Gmail integration exposes (shown in the Settings dialog). */
export const GMAIL_TOOLS = [
  {
    name: "read_emails",
    description: "Fetch the latest inbox messages with sender, subject, and snippet.",
  },
  {
    name: "search_inbox",
    description: "Search messages with Gmail queries (from:, subject:, is:unread, ...).",
  },
  {
    name: "send_email",
    description: "Send an email from the connected account.",
  },
  {
    name: "get_labels",
    description: "List the account's labels (Inbox, Starred, custom labels, ...).",
  },
  {
    name: "get_profile",
    description: "Read the connected account's email address and message counts.",
  },
  {
    name: "count_messages",
    description: "Count messages matching a Gmail query (exact up to 1,000).",
  },
];

async function gmailFetch<T>(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${GMAIL_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Gmail API request failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export async function getProfile(
  userId: string,
): Promise<{ emailAddress: string; messagesTotal: number }> {
  const token = await getValidAccessToken(userId);
  return gmailFetch(token, "/profile");
}

export async function getLabels(userId: string): Promise<string[]> {
  const token = await getValidAccessToken(userId);
  const result = await gmailFetch<{ labels?: { name: string }[] }>(
    token,
    "/labels",
  );
  return (result.labels ?? []).map((label) => label.name).sort();
}

type MessageMeta = {
  snippet?: string;
  payload?: { headers?: { name: string; value: string }[] };
};

export type EmailSummary = {
  from: string;
  subject: string;
  date: string;
  snippet: string;
};

export async function fetchEmails(
  userId: string,
  count: number,
  query?: string,
): Promise<{ tool: string; preview: string; messages: EmailSummary[] }> {
  const token = await getValidAccessToken(userId);
  const tool = query ? "search_inbox" : "read_emails";
  const params = new URLSearchParams({ maxResults: String(count) });
  if (query) {
    params.set("q", query);
  } else {
    params.set("labelIds", "INBOX");
  }
  const list = await gmailFetch<{ messages?: { id: string }[] }>(
    token,
    `/messages?${params}`,
  );
  const ids = (list.messages ?? []).map((m) => m.id);
  if (ids.length === 0) {
    return {
      tool,
      preview: query ? "No messages matched your search." : "Your inbox is empty.",
      messages: [],
    };
  }

  const metas = await Promise.all(
    ids.map((id) =>
      gmailFetch<MessageMeta>(
        token,
        `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
      ),
    ),
  );

  const messages = metas.map((message) => {
    const headers = message.payload?.headers ?? [];
    const header = (name: string) =>
      headers.find((h) => h.name.toLowerCase() === name.toLowerCase())
        ?.value ?? "";
    return {
      from: header("From"),
      subject: header("Subject"),
      date: header("Date"),
      snippet: message.snippet ?? "",
    };
  });

  const preview = messages
    .map((message) => {
      const lines = [
        `From:    ${message.from}`,
        `Subject: ${message.subject}`,
        `Date:    ${message.date}`,
      ];
      if (message.snippet) lines.push(`         ${message.snippet}`);
      return lines.join("\n");
    })
    .join("\n\n");

  return { tool, preview, messages };
}

export const COUNT_CAP = 1000;

/**
 * Counts real message ids by paging the list endpoint —
 * Gmail's resultSizeEstimate is a rough guess (it plateaus around 201),
 * so it must not be shown to users.
 */
export async function countMessages(
  userId: string,
  query: string,
): Promise<{ count: number; capped: boolean }> {
  const token = await getValidAccessToken(userId);
  let count = 0;
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({ maxResults: "500", q: query });
    if (pageToken) params.set("pageToken", pageToken);
    const result = await gmailFetch<{
      messages?: { id: string }[];
      nextPageToken?: string;
    }>(token, `/messages?${params}`);
    count += result.messages?.length ?? 0;
    pageToken = result.nextPageToken;
  } while (pageToken && count < COUNT_CAP);
  return { count: Math.min(count, COUNT_CAP), capped: Boolean(pageToken) };
}

export async function sendEmail(
  userId: string,
  to: string,
  subject: string,
  body: string,
): Promise<void> {
  const token = await getValidAccessToken(userId);
  const message = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    body,
  ].join("\r\n");
  await gmailFetch(token, "/messages/send", {
    method: "POST",
    body: JSON.stringify({
      raw: Buffer.from(message).toString("base64url"),
    }),
  });
}
