import type { ComponentType, SVGProps } from "react";
import {
  CalendarIcon,
  DiscordIcon,
  GmailIcon,
  LinkedInIcon,
  OutlookIcon,
  SlackIcon,
  TelegramIcon,
  WhatsAppIcon,
} from "@/components/landing/icons";

export type StaticAction = {
  name: string;
  description: string;
};

export type Provider = {
  id:
    | "gmail"
    | "google-calendar"
    | "whatsapp"
    | "slack"
    | "outlook"
    | "discord"
    | "linkedin"
    | "telegram";
  name: string;
  description: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  brandClass: string;
  hasLiveTools: boolean;
  staticActions: StaticAction[];
};

export const STATUS_CONNECTED = "connected";

export const PROVIDERS: Provider[] = [
  {
    id: "gmail",
    name: "Gmail",
    description: "Inbox summaries, priority detection & draft replies.",
    Icon: GmailIcon,
    brandClass: "text-[#EA4335]",
    hasLiveTools: true,
    staticActions: [
      { name: "Fetch emails", description: "Read recent messages from your inbox." },
      { name: "Search inbox", description: "Find emails by sender, subject, or content." },
      { name: "Draft replies", description: "Compose reply drafts for your review." },
    ],
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    description: "Meetings pulled into your daily briefing.",
    Icon: CalendarIcon,
    brandClass: "text-[#4285F4]",
    hasLiveTools: false,
    staticActions: [
      { name: "List events", description: "Read upcoming meetings for your briefing." },
      { name: "Create event", description: "Schedule meetings suggested by the AI agent." },
      { name: "Detect conflicts", description: "Flag overlapping meetings before they happen." },
    ],
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    description: "Group-chat recaps and commitments turned into reminders.",
    Icon: WhatsAppIcon,
    brandClass: "text-[#25D366]",
    hasLiveTools: false,
    staticActions: [
      { name: "Summarize chats", description: "Condense busy group chats into recaps." },
      { name: "Detect commitments", description: "Turn \"I'll send it Friday\" into reminders." },
      { name: "Priority pings", description: "Surface messages that need a reply today." },
    ],
  },
  {
    id: "slack",
    name: "Slack",
    description: "Channel mentions and DMs that need you.",
    Icon: SlackIcon,
    brandClass: "text-[#E01E5A]",
    hasLiveTools: false,
    staticActions: [
      { name: "List unread mentions", description: "Collect @-mentions across channels." },
      { name: "Search messages", description: "Find workspace messages by keyword." },
      { name: "Send message", description: "Post replies to channels or DMs." },
    ],
  },
  {
    id: "outlook",
    name: "Outlook",
    description: "Work email and calendar, digested every morning.",
    Icon: OutlookIcon,
    brandClass: "text-[#0078D4]",
    hasLiveTools: false,
    staticActions: [
      { name: "Fetch emails", description: "Read recent messages from your work inbox." },
      { name: "List events", description: "Pull calendar items into your briefing." },
      { name: "Draft replies", description: "Compose reply drafts for your review." },
    ],
  },
  {
    id: "discord",
    name: "Discord",
    description: "Server pings and DMs distilled into a daily digest.",
    Icon: DiscordIcon,
    brandClass: "text-[#5865F2]",
    hasLiveTools: false,
    staticActions: [
      { name: "Summarize servers", description: "Recap active channels you follow." },
      { name: "List mentions", description: "Collect pings and replies that need you." },
      { name: "Send message", description: "Reply to channels or DMs." },
    ],
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    description: "Messages and connection requests that deserve a reply.",
    Icon: LinkedInIcon,
    brandClass: "text-[#0A66C2]",
    hasLiveTools: false,
    staticActions: [
      { name: "List messages", description: "Surface InMail and DMs worth answering." },
      { name: "Review invitations", description: "Summarize pending connection requests." },
      { name: "Draft replies", description: "Compose professional responses for review." },
    ],
  },
  {
    id: "telegram",
    name: "Telegram",
    description: "Channels and DMs condensed into what actually matters.",
    Icon: TelegramIcon,
    brandClass: "text-[#26A5E4]",
    hasLiveTools: false,
    staticActions: [
      { name: "Summarize channels", description: "Digest busy channels into highlights." },
      { name: "Detect follow-ups", description: "Track promises made in chats." },
      { name: "Send message", description: "Reply to chats and groups." },
    ],
  },
];
