import { InvalidToolArgsError, UnknownToolError } from "./gmail-mcp";
import { ensureConnected, getOpenSocket } from "./whatsapp-manager";
import {
  getChatHistory,
  getContact,
  getFrequentChats,
  getRecentMessages,
  listGroupsDb,
  recordSentMessage,
  resolveChatJid,
  searchChats,
  type ChatSummary,
  type StoredMessage,
} from "./whatsapp-store";
import type { WASocket } from "baileys";

const CHAT_ARG = {
  type: "string",
  description: "Phone number (with country code), chat JID, or contact name.",
};
const GROUP_ARG = {
  type: "string",
  description: "Group JID (ending in @g.us) or group name.",
};

function countArg(max: number, dflt: number) {
  return {
    type: "integer",
    minimum: 1,
    maximum: max,
    description: `How many messages to return (default ${dflt}).`,
  };
}

/** MCP tool catalog: names/descriptions/input schemas in one place. */
export const WHATSAPP_MCP_TOOLS = [
  {
    name: "fetch_recent_messages",
    description: "Fetch the most recent WhatsApp messages across all chats.",
    inputSchema: { type: "object", properties: { count: countArg(50, 20) } },
  },
  {
    name: "read_chat_history",
    description: "Read the message history of one WhatsApp chat.",
    inputSchema: {
      type: "object",
      properties: {
        chat: CHAT_ARG,
        count: countArg(100, 25),
        before: {
          type: "string",
          description: "Only messages before this ISO timestamp.",
        },
      },
      required: ["chat"],
    },
  },
  {
    name: "send_message",
    description: "Send a WhatsApp text message to a person.",
    inputSchema: {
      type: "object",
      properties: {
        to: CHAT_ARG,
        text: { type: "string", description: "Message text to send." },
      },
      required: ["to", "text"],
    },
  },
  {
    name: "search_chats",
    description: "Search WhatsApp chats and contacts by name.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Name to search for." },
        count: countArg(25, 10),
      },
      required: ["query"],
    },
  },
  {
    name: "summarize_conversation",
    description:
      "Return the recent messages of a chat as a transcript for the assistant to summarize — it does not produce the summary itself.",
    inputSchema: {
      type: "object",
      properties: { chat: CHAT_ARG, count: countArg(200, 50) },
      required: ["chat"],
    },
  },
  {
    name: "get_contact",
    description: "Look up a WhatsApp contact's details.",
    inputSchema: {
      type: "object",
      properties: {
        contact: {
          type: "string",
          description: "Phone number, JID, or (partial) contact name.",
        },
      },
      required: ["contact"],
    },
  },
  {
    name: "list_frequent_contacts",
    description: "List the WhatsApp contacts the user messages most often.",
    inputSchema: { type: "object", properties: { count: countArg(25, 10) } },
  },
  {
    name: "list_groups",
    description: "List the WhatsApp groups the user participates in.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "fetch_group_messages",
    description: "Fetch recent messages from one WhatsApp group.",
    inputSchema: {
      type: "object",
      properties: { group: GROUP_ARG, count: countArg(100, 25) },
      required: ["group"],
    },
  },
  {
    name: "send_group_message",
    description: "Send a WhatsApp text message to a group.",
    inputSchema: {
      type: "object",
      properties: {
        group: GROUP_ARG,
        text: { type: "string", description: "Message text to send." },
      },
      required: ["group", "text"],
    },
  },
];

function parseCount(value: unknown, max: number, dflt: number): number {
  const parsed = typeof value === "number" ? Math.trunc(value) : dflt;
  return Math.min(max, Math.max(1, Number.isNaN(parsed) ? dflt : parsed));
}

function requireString(
  args: Record<string, unknown>,
  key: string,
  maxLength: number,
): string {
  const value =
    typeof args[key] === "string" ? (args[key] as string).trim() : "";
  if (!value) throw new InvalidToolArgsError(`"${key}" is required.`);
  if (value.length > maxLength) {
    throw new InvalidToolArgsError(`"${key}" is too long (max ${maxLength}).`);
  }
  return value;
}

function parseBefore(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new InvalidToolArgsError(
      '"before" must be an ISO timestamp (e.g. 2026-07-01T00:00:00Z).',
    );
  }
  return value;
}

type StructuredMessage = {
  chatJid: string;
  chatName: string | null;
  sender: string | null;
  fromMe: boolean;
  text: string | null;
  sentAt: string;
};

/** Human-readable sender; raw JIDs (especially anonymized @lid) never leak. */
function displaySender(row: StoredMessage): string {
  if (row.from_me) return "Me";
  if (row.sender_name) return row.sender_name;
  const jid = row.sender_jid ?? "";
  if (jid.endsWith("@s.whatsapp.net")) return `+${jid.split("@")[0]}`;
  if (!row.chat_jid.endsWith("@g.us") && row.chat_name) return row.chat_name;
  return "Unknown";
}

function toStructured(rows: StoredMessage[]): StructuredMessage[] {
  return rows.map((row) => ({
    chatJid: row.chat_jid,
    chatName: row.chat_name,
    sender: displaySender(row),
    fromMe: row.from_me,
    text: row.text,
    sentAt: row.sent_at,
  }));
}

/** "[2026-07-10 14:03] (Chat) Sender: text" lines, oldest first. */
function formatTranscript(rows: StoredMessage[], includeChat: boolean): string {
  if (rows.length === 0) return "No messages found.";
  return [...rows]
    .reverse()
    .map((row) => {
      const time = row.sent_at.slice(0, 16).replace("T", " ");
      const chat = includeChat ? ` (${row.chat_name ?? row.chat_jid})` : "";
      return `[${time}]${chat} ${displaySender(row)}: ${row.text ?? ""}`;
    })
    .join("\n");
}

function formatChats(chats: ChatSummary[]): string {
  if (chats.length === 0) return "No matches found.";
  return chats
    .map((chat) => `${chat.name ?? "Unnamed"} — ${chat.jid}`)
    .join("\n");
}

/** Verifies a raw phone number is on WhatsApp; other inputs resolve via DB. */
async function resolveSendTarget(
  userId: string,
  sock: WASocket,
  input: string,
): Promise<string> {
  const digits = input.replace(/[\s().+-]/g, "");
  if (!input.includes("@") && /^\d{6,15}$/.test(digits)) {
    const results = await sock.onWhatsApp(digits);
    const match = results?.[0];
    if (!match?.exists) {
      throw new InvalidToolArgsError(`"${input}" is not on WhatsApp.`);
    }
    return match.jid;
  }
  return resolveChatJid(userId, input);
}

export type WhatsappToolResult = {
  text: string;
  structured?: Record<string, unknown>;
};

/** Executes one WhatsApp tool for the user; returns text + structured data. */
export async function callWhatsappTool(
  userId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<WhatsappToolResult> {
  switch (name) {
    case "fetch_recent_messages": {
      const rows = await getRecentMessages(userId, parseCount(args.count, 50, 20));
      return {
        text: formatTranscript(rows, true),
        structured: { messages: toStructured(rows) },
      };
    }
    case "read_chat_history": {
      const chat = requireString(args, "chat", 100);
      const jid = await resolveChatJid(userId, chat);
      const rows = await getChatHistory(
        userId,
        jid,
        parseCount(args.count, 100, 25),
        parseBefore(args.before),
      );
      return {
        text: formatTranscript(rows, false),
        structured: { chatJid: jid, messages: toStructured(rows) },
      };
    }
    case "send_message": {
      const to = requireString(args, "to", 100);
      const text = requireString(args, "text", 4096);
      const sock = await ensureConnected(userId);
      const jid = await resolveSendTarget(userId, sock, to);
      const sent = await sock.sendMessage(jid, { text });
      await recordSentMessage(userId, jid, text, sent?.key?.id ?? null);
      return { text: "Message sent.", structured: { to: jid } };
    }
    case "search_chats": {
      const query = requireString(args, "query", 100);
      const chats = await searchChats(userId, query, parseCount(args.count, 25, 10));
      return {
        text: formatChats(chats),
        structured: { chats },
      };
    }
    case "summarize_conversation": {
      const chat = requireString(args, "chat", 100);
      const jid = await resolveChatJid(userId, chat);
      const rows = await getChatHistory(userId, jid, parseCount(args.count, 200, 50));
      return {
        text:
          rows.length === 0
            ? "No messages found."
            : `Transcript of the last ${rows.length} messages:\n${formatTranscript(rows, false)}`,
        structured: { chatJid: jid, messages: toStructured(rows) },
      };
    }
    case "get_contact": {
      const input = requireString(args, "contact", 100);
      const contacts = await getContact(userId, input);
      return {
        text:
          contacts.length === 0
            ? `No contact found matching "${input}".`
            : contacts
                .map(
                  (c) =>
                    `${c.name ?? c.notify ?? "Unnamed"} — ${c.jid}${c.notify && c.name ? ` (pushes as "${c.notify}")` : ""}`,
                )
                .join("\n"),
        structured: { contacts },
      };
    }
    case "list_frequent_contacts": {
      const chats = await getFrequentChats(userId, parseCount(args.count, 25, 10));
      return { text: formatChats(chats), structured: { chats } };
    }
    case "list_groups": {
      const sock = getOpenSocket(userId);
      if (sock) {
        try {
          const groups = await sock.groupFetchAllParticipating();
          const chats = Object.values(groups)
            .map((group) => ({
              jid: group.id,
              name: group.subject || null,
              is_group: true,
              participants: group.participants?.length ?? null,
            }))
            .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
          return {
            text:
              chats.length === 0
                ? "No groups found."
                : chats
                    .map(
                      (chat) =>
                        `${chat.name ?? "Unnamed"} — ${chat.jid}${chat.participants ? ` (${chat.participants} members)` : ""}`,
                    )
                    .join("\n"),
            structured: { chats },
          };
        } catch {
          // fall through to the synced copy
        }
      }
      const chats = await listGroupsDb(userId);
      return { text: formatChats(chats), structured: { chats } };
    }
    case "fetch_group_messages": {
      const group = requireString(args, "group", 100);
      const jid = await resolveChatJid(userId, group, { groupOnly: true });
      const rows = await getChatHistory(userId, jid, parseCount(args.count, 100, 25));
      return {
        text: formatTranscript(rows, false),
        structured: { chatJid: jid, messages: toStructured(rows) },
      };
    }
    case "send_group_message": {
      const group = requireString(args, "group", 100);
      const text = requireString(args, "text", 4096);
      const jid = await resolveChatJid(userId, group, { groupOnly: true });
      const sock = await ensureConnected(userId);
      const sent = await sock.sendMessage(jid, { text });
      await recordSentMessage(userId, jid, text, sent?.key?.id ?? null);
      return { text: "Message sent.", structured: { to: jid } };
    }
    default:
      throw new UnknownToolError(name);
  }
}
