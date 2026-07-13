import { callWhatsappTool } from "@/lib/server/whatsapp-mcp";
import { cut, toIso, type DashboardProvider } from "../provider";
import type { BriefEntry, PriorityItem } from "@/lib/dashboard-brief-types";

const ID = "whatsapp";

const DAY_MS = 86_400_000;
const FETCH_COUNT = 20;
const MAX_MESSAGES = 15;

type WaMessage = {
  chatName: string | null;
  sender: string | null;
  fromMe: boolean;
  text: string | null;
  sentAt: string;
};

export const whatsappProvider: DashboardProvider = {
  id: ID,
  name: "WhatsApp",
  icon: ID,
  promptHint:
    "whatsapp.messages are incoming WhatsApp messages from the last 24 hours; group them by chat to spot urgent conversations and threads awaiting a reply.",

  async fetchSnapshot(userId: string) {
    const result = await callWhatsappTool(userId, "fetch_recent_messages", {
      count: FETCH_COUNT,
    });
    const rows = result.structured?.messages;
    const since = Date.now() - DAY_MS;
    // The tool returns all-time recent rows; keep only the last 24 hours.
    const messages = (Array.isArray(rows) ? (rows as WaMessage[]) : [])
      .filter((m) => !m.fromMe && m.text && Date.parse(m.sentAt) >= since)
      .slice(0, MAX_MESSAGES)
      .map((m) => ({
        chat: m.chatName ?? "Direct chat",
        sender: m.sender ?? "Unknown",
        text: cut(m.text ?? "", 140),
        sentAt: m.sentAt,
      }));
    const chatCount = new Set(messages.map((m) => m.chat)).size;

    const fallbackBrief: BriefEntry[] =
      messages.length > 0
        ? [
            {
              text: `${messages.length} WhatsApp message${messages.length === 1 ? "" : "s"} arrived in the last 24 hours.`,
              apps: [ID],
            },
          ]
        : [];

    const fallbackItems: PriorityItem[] = messages
      .slice(0, 4)
      .map((message) => ({
        source: ID,
        title: cut(`${message.sender} · ${message.chat}`, 120),
        description: message.text,
        priority: "medium" as const,
        timestamp: toIso(message.sentAt),
      }));

    return {
      importantCount: chatCount,
      // Awaiting-reply detection needs the AI; no mechanical proxy exists.
      followUpCount: 0,
      isEmpty: messages.length === 0,
      aiPayload: { messages },
      fallbackBrief,
      fallbackItems,
    };
  },
};
