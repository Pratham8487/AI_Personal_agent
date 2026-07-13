import {
  AtIcon,
  CheckListIcon,
  Clock01Icon,
  Mail01Icon,
  Message01Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { categorySlug, type BriefingCategoryId } from "@/lib/briefing-types";

export type CategoryMeta = {
  id: BriefingCategoryId;
  slug: string;
  label: string;
  icon: IconSvgElement;
  iconBg: string;
  emptyText: string;
};

/** Display metadata per briefing category, in hub display order. */
export const CATEGORY_META: CategoryMeta[] = [
  {
    id: "email",
    slug: categorySlug("email"),
    label: "Email",
    icon: Mail01Icon,
    iconBg: "bg-rose-500 shadow-lg shadow-rose-500/30",
    emptyText: "No new emails in this brief.",
  },
  {
    id: "messages",
    slug: categorySlug("messages"),
    label: "Messages",
    icon: Message01Icon,
    iconBg: "bg-emerald-500 shadow-lg shadow-emerald-500/30",
    emptyText: "No new messages in this brief.",
  },
  {
    id: "mentions",
    slug: categorySlug("mentions"),
    label: "Mentions",
    icon: AtIcon,
    iconBg: "bg-blue-500 shadow-lg shadow-blue-500/30",
    emptyText: "No mentions in this brief.",
  },
  {
    id: "tasks",
    slug: categorySlug("tasks"),
    label: "Tasks",
    icon: CheckListIcon,
    iconBg: "bg-indigo-500 shadow-lg shadow-indigo-500/30",
    emptyText: "No tasks in this brief.",
  },
  {
    id: "follow_ups",
    slug: categorySlug("follow_ups"),
    label: "Follow-ups",
    icon: Clock01Icon,
    iconBg: "bg-amber-500 shadow-lg shadow-amber-500/30",
    emptyText: "No pending follow-ups.",
  },
];

export const CATEGORY_BY_ID = new Map(CATEGORY_META.map((m) => [m.id, m]));
