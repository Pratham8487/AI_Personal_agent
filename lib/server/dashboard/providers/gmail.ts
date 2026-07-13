import type { EmailSummary } from "@/lib/server/gmail-api";
import { callGmailTool } from "@/lib/server/gmail-mcp";
import {
  cut,
  timeKey,
  titleKey,
  toIso,
  type DashboardProvider,
} from "../provider";
import type { BriefEntry, PriorityItem } from "@/lib/dashboard-brief-types";

const ID = "gmail";

/** Same "waiting on your reply" proxy as lib/use-gmail-data.ts. */
const AWAITING_QUERY = "in:inbox is:unread older_than:2d";
const FETCH_COUNT = 8;
const MAX_EMAILS = 8;

function parseEmails(structured: Record<string, unknown> | undefined) {
  const messages = structured?.messages;
  return Array.isArray(messages) ? (messages as EmailSummary[]) : [];
}

/** Deep link to one message in the Gmail web client. */
function mailLink(id: string): string {
  return `https://mail.google.com/mail/u/0/#all/${id}`;
}

/** Bounded email fields for the AI payload; ref lets the AI cite the email. */
function toAiEmails(emails: EmailSummary[]) {
  return emails.slice(0, MAX_EMAILS).map((email) => ({
    ref: email.id,
    from: cut(email.from, 80),
    subject: cut(email.subject, 120),
    date: toIso(email.date) || email.date,
    snippet: cut(email.snippet, 120),
  }));
}

export const gmailProvider: DashboardProvider = {
  id: ID,
  name: "Gmail",
  icon: ID,
  promptHint:
    "gmail.unreadEmails are unread inbox emails; gmail.awaitingEmails have been unread for 2+ days (follow-ups).",

  async fetchSnapshot(userId: string) {
    const [unreadResult, awaitingResult] = await Promise.all([
      callGmailTool(userId, "search_inbox", {
        query: "in:inbox is:unread",
        count: FETCH_COUNT,
      }),
      callGmailTool(userId, "search_inbox", {
        query: AWAITING_QUERY,
        count: FETCH_COUNT,
      }),
    ]);
    const unread = parseEmails(unreadResult.structured);
    const awaiting = parseEmails(awaitingResult.structured);

    const fallbackBrief: BriefEntry[] = [
      {
        text: `You have ${unread.length} unread email${unread.length === 1 ? "" : "s"}.`,
        apps: [ID],
      },
    ];
    if (awaiting.length > 0) {
      fallbackBrief.push({
        text: `${awaiting.length} email${awaiting.length === 1 ? " has" : "s have"} been waiting on you for 2+ days.`,
        apps: [ID],
      });
    }

    const fallbackItems: PriorityItem[] = unread.slice(0, 4).map((email) => ({
      source: ID,
      title: cut(email.subject, 120) || "(no subject)",
      description: cut(email.snippet, 240),
      priority: "medium" as const,
      timestamp: toIso(email.date),
      link: mailLink(email.id),
    }));

    // Keyed by ref, timestamp, and normalized subject so links resolve even
    // when the AI omits or rewrites the ref.
    const links: Record<string, string> = {};
    for (const email of [...unread, ...awaiting]) {
      const url = mailLink(email.id);
      links[email.id] = url;
      const byTime = timeKey(email.date);
      if (byTime) links[byTime] = url;
      const byTitle = titleKey(email.subject);
      if (byTitle) links[byTitle] = url;
    }

    return {
      importantCount: unread.length,
      followUpCount: awaiting.length,
      isEmpty: unread.length === 0 && awaiting.length === 0,
      aiPayload: {
        unreadEmails: toAiEmails(unread),
        awaitingEmails: toAiEmails(awaiting),
      },
      fallbackBrief,
      fallbackItems,
      links,
    };
  },
};
