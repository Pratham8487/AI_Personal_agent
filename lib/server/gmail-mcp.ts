import {
  GMAIL_TOOLS,
  countMessages,
  fetchEmails,
  getLabels,
  getProfile,
  sendEmail,
} from "./gmail-api";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class UnknownToolError extends Error {
  constructor(name: string) {
    super(`Unknown tool: ${name}`);
    this.name = "UnknownToolError";
  }
}

export class InvalidToolArgsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidToolArgsError";
  }
}

/** JSON Schemas for the tool inputs, keyed by GMAIL_TOOLS name. */
const INPUT_SCHEMAS: Record<string, Record<string, unknown>> = {
  read_emails: {
    type: "object",
    properties: {
      count: {
        type: "integer",
        minimum: 1,
        maximum: 10,
        description: "How many messages to fetch (default 5).",
      },
    },
  },
  search_inbox: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "Gmail search query (from:, subject:, is:unread, ...).",
      },
      count: {
        type: "integer",
        minimum: 1,
        maximum: 10,
        description: "How many matches to return (default 5).",
      },
    },
    required: ["query"],
  },
  send_email: {
    type: "object",
    properties: {
      to: { type: "string", description: "Recipient email address." },
      subject: { type: "string", description: "Email subject." },
      body: { type: "string", description: "Plain-text message body." },
    },
    required: ["to", "subject", "body"],
  },
  get_labels: { type: "object", properties: {} },
  get_profile: { type: "object", properties: {} },
  count_messages: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Gmail search query to count matches for.",
      },
    },
    required: ["query"],
  },
};

/** MCP tool catalog: same names/descriptions as the Settings dialog. */
export const GMAIL_MCP_TOOLS = GMAIL_TOOLS.map((tool) => ({
  ...tool,
  inputSchema: INPUT_SCHEMAS[tool.name] ?? { type: "object", properties: {} },
}));

function parseCount(value: unknown): number {
  const parsed = typeof value === "number" ? Math.trunc(value) : 5;
  return Math.min(10, Math.max(1, Number.isNaN(parsed) ? 5 : parsed));
}

function requireString(
  args: Record<string, unknown>,
  key: string,
  maxLength: number,
): string {
  const value = typeof args[key] === "string" ? (args[key] as string).trim() : "";
  if (!value) throw new InvalidToolArgsError(`"${key}" is required.`);
  if (value.length > maxLength) {
    throw new InvalidToolArgsError(`"${key}" is too long (max ${maxLength}).`);
  }
  return value;
}

export type GmailToolResult = {
  text: string;
  structured?: Record<string, unknown>;
};

/** Executes one Gmail tool for the user; returns text plus structured data. */
export async function callGmailTool(
  userId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<GmailToolResult> {
  switch (name) {
    case "read_emails": {
      const result = await fetchEmails(userId, parseCount(args.count));
      return { text: result.preview, structured: { messages: result.messages } };
    }
    case "search_inbox": {
      const query = requireString(args, "query", 200);
      const result = await fetchEmails(userId, parseCount(args.count), query);
      return { text: result.preview, structured: { messages: result.messages } };
    }
    case "send_email": {
      const to = requireString(args, "to", 320);
      if (!EMAIL_PATTERN.test(to)) {
        throw new InvalidToolArgsError('"to" must be a valid email address.');
      }
      const subject = requireString(args, "subject", 300);
      const body = requireString(args, "body", 10_000);
      await sendEmail(userId, to, subject, body);
      return { text: `Email sent to ${to}.` };
    }
    case "get_labels": {
      const labels = await getLabels(userId);
      return {
        text: labels.length ? labels.join("\n") : "No labels found.",
        structured: { labels },
      };
    }
    case "get_profile": {
      const profile = await getProfile(userId);
      return {
        text: `Email: ${profile.emailAddress}\nTotal messages: ${profile.messagesTotal}`,
        structured: {
          emailAddress: profile.emailAddress,
          messagesTotal: profile.messagesTotal,
        },
      };
    }
    case "count_messages": {
      const query = requireString(args, "query", 200);
      const { count, capped } = await countMessages(userId, query);
      return {
        text: `${count}${capped ? "+" : ""} messages match "${query}".`,
        structured: { count, capped, query },
      };
    }
    default:
      throw new UnknownToolError(name);
  }
}
