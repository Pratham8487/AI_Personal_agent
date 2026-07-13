"use client";

import Link from "next/link";
import { memo } from "react";
import type {
  BriefingCategories,
  BriefingCategoryId,
} from "@/lib/briefing-types";
import { CATEGORY_META } from "./category-meta";

const pillBase =
  "rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors";
const pillActive =
  "bg-gradient-to-r from-violet-500 to-blue-500 text-white shadow-lg shadow-violet-500/25";
const pillIdle =
  "border border-zinc-200 text-zinc-600 hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5";

/** Pill tabs for the detail page; each tab is a link (back/forward works). */
function CategoryTabs({
  categories,
  active,
  makeHref,
}: {
  categories: BriefingCategories;
  active: BriefingCategoryId | "all";
  makeHref: (slug: string | null) => string;
}) {
  const present = CATEGORY_META.filter((meta) => categories[meta.id]);
  if (present.length === 0) return null;
  return (
    <nav aria-label="Categories" className="no-scrollbar flex gap-2 overflow-x-auto">
      <Link
        href={makeHref(null)}
        className={`${pillBase} ${active === "all" ? pillActive : pillIdle}`}
      >
        All
      </Link>
      {present.map((meta) => (
        <Link
          key={meta.id}
          href={makeHref(meta.slug)}
          className={`${pillBase} whitespace-nowrap ${active === meta.id ? pillActive : pillIdle}`}
        >
          {meta.label} ({categories[meta.id]?.count ?? 0})
        </Link>
      ))}
    </nav>
  );
}

export default memo(CategoryTabs);
