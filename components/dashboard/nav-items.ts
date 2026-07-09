import {
  AiBrain01Icon,
  CreditCardIcon,
  DashboardSquare01Icon,
  News01Icon,
  Notification01Icon,
  PlugSocketIcon,
  Settings02Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";

export type NavItem = {
  label: string;
  description: string;
  href: string;
  icon: IconSvgElement;
  iconBg: string;
};

export const mainNavItems: NavItem[] = [
  {
    label: "Dashboard",
    description: "Overview of your inboxes",
    href: "/dashboard",
    icon: DashboardSquare01Icon,
    iconBg: "bg-indigo-500 shadow-lg shadow-indigo-500/30",
  },
  {
    label: "AI Agent",
    description: "Ask anything across your accounts",
    href: "/agent",
    icon: AiBrain01Icon,
    iconBg: "bg-violet-500 shadow-lg shadow-violet-500/30",
  },
  {
    label: "Briefing",
    description: "Your daily digest",
    href: "/briefing",
    icon: News01Icon,
    iconBg: "bg-amber-500 shadow-lg shadow-amber-500/30",
  },
  {
    label: "Integrations",
    description: "Connect email & chat apps",
    href: "/integrations",
    icon: PlugSocketIcon,
    iconBg: "bg-emerald-500 shadow-lg shadow-emerald-500/30",
  },
  {
    label: "Alerts",
    description: "Reminders and notifications",
    href: "/alerts",
    icon: Notification01Icon,
    iconBg: "bg-rose-500 shadow-lg shadow-rose-500/30",
  },
  {
    label: "Settings",
    description: "Account and preferences",
    href: "/settings",
    icon: Settings02Icon,
    iconBg: "bg-sky-500 shadow-lg shadow-sky-500/30",
  },
];

export const bottomNavItem: NavItem = {
  label: "Pricing Settings",
  description: "Plan, billing, and usage",
  href: "/pricing",
  icon: CreditCardIcon,
  iconBg: "bg-fuchsia-500 shadow-lg shadow-fuchsia-500/30",
};
