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
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    description: "Meetings pulled into your daily briefing.",
    Icon: CalendarIcon,
    brandClass: "text-[#4285F4]",
    hasLiveTools: false,
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    description: "Group-chat recaps and commitments turned into reminders.",
    Icon: WhatsAppIcon,
    brandClass: "text-[#25D366]",
    hasLiveTools: false,
  },
  {
    id: "slack",
    name: "Slack",
    description: "Channel mentions and DMs that need you.",
    Icon: SlackIcon,
    brandClass: "text-[#E01E5A]",
    hasLiveTools: false,
  },
  {
    id: "outlook",
    name: "Outlook",
    description: "Work email and calendar, digested every morning.",
    Icon: OutlookIcon,
    brandClass: "text-[#0078D4]",
    hasLiveTools: false,
  },
  {
    id: "discord",
    name: "Discord",
    description: "Server pings and DMs distilled into a daily digest.",
    Icon: DiscordIcon,
    brandClass: "text-[#5865F2]",
    hasLiveTools: false,
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    description: "Messages and connection requests that deserve a reply.",
    Icon: LinkedInIcon,
    brandClass: "text-[#0A66C2]",
    hasLiveTools: false,
  },
  {
    id: "telegram",
    name: "Telegram",
    description: "Channels and DMs condensed into what actually matters.",
    Icon: TelegramIcon,
    brandClass: "text-[#26A5E4]",
    hasLiveTools: false,
  },
];
