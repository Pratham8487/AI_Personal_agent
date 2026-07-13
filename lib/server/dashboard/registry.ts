import type { DashboardProvider } from "./provider";
import { gmailProvider } from "./providers/gmail";
import { whatsappProvider } from "./providers/whatsapp";

/**
 * Every data source the dashboard can aggregate. To support a new app
 * (Slack, Calendar, Discord, LinkedIn, Notion, …) implement DashboardProvider
 * and add it here — nothing else changes.
 */
export const DASHBOARD_PROVIDERS: readonly DashboardProvider[] = [
  gmailProvider,
  whatsappProvider,
];
