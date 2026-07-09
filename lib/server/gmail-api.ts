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

export async function fetchEmails(
  userId: string,
  count: number,
  query?: string,
): Promise<{ tool: string; preview: string }> {
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
    };
  }

  const messages = await Promise.all(
    ids.map((id) =>
      gmailFetch<MessageMeta>(
        token,
        `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
      ),
    ),
  );

  const preview = messages
    .map((message) => {
      const headers = message.payload?.headers ?? [];
      const header = (name: string) =>
        headers.find((h) => h.name.toLowerCase() === name.toLowerCase())
          ?.value ?? "";
      const lines = [
        `From:    ${header("From")}`,
        `Subject: ${header("Subject")}`,
        `Date:    ${header("Date")}`,
      ];
      if (message.snippet) lines.push(`         ${message.snippet}`);
      return lines.join("\n");
    })
    .join("\n\n");

  return { tool, preview };
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
