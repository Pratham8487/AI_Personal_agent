import type { DashboardProvider } from "./provider";
import { gmailProvider } from "./providers/gmail";
import { googleCalendarProvider } from "./providers/google-calendar";
import { whatsappProvider } from "./providers/whatsapp";

/**
 * Every data source the dashboard can aggregate. To support a new app
 * (Slack, Discord, LinkedIn, Notion, …) implement DashboardProvider and add it
 * here — nothing else changes.
 */
export const DASHBOARD_PROVIDERS: readonly DashboardProvider[] = [
  gmailProvider,
  googleCalendarProvider,
  whatsappProvider,
];
