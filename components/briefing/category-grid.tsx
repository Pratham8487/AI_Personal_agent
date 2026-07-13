"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { memo } from "react";
import type { BriefingCategories } from "@/lib/briefing-types";
import type { BriefingsStatus } from "@/lib/use-briefings";
import { CATEGORY_META, type CategoryMeta } from "./category-meta";

function CategoryCard({
  meta,
  categories,
  briefingHref,
}: {
  meta: CategoryMeta;
  categories: BriefingCategories;
  briefingHref: string | null;
}) {
  const category = categories[meta.id];
  const count = category?.count ?? 0;
  const clickable = Boolean(category && count > 0 && briefingHref);

  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white ${meta.iconBg}`}
        >
          <HugeiconsIcon icon={meta.icon} size={16} strokeWidth={1.8} />
        </span>
        <span className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">
          {category ? count : "—"}
        </span>
      </div>
      <p className="mt-3 text-xs font-semibold text-zinc-900 dark:text-white">
        {meta.label}
      </p>
      <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">
        {!category
          ? "Not tracked by this briefing."
          : count > 0 && category.summary
            ? category.summary
            : meta.emptyText}
      </p>
    </>
  );

  if (clickable) {
    return (
      <Link
        href={`${briefingHref}?category=${meta.slug}`}
        className="glass-card glass-hover block p-4"
      >
        {body}
      </Link>
    );
  }
  return <div className="glass-card p-4 opacity-60">{body}</div>;
}

/** The five category tiles under the hero; counts come from today's brief. */
function CategoryGrid({
  status,
  categories,
  briefingHref,
}: {
  status: BriefingsStatus;
  categories: BriefingCategories | null;
  briefingHref: string | null;
}) {
  if (status !== "ready" && status !== "error") {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {CATEGORY_META.map((meta) => (
          <div key={meta.id} className="skeleton h-32 rounded-3xl" />
        ))}
      </div>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {CATEGORY_META.map((meta) => (
        <CategoryCard
          key={meta.id}
          meta={meta}
          categories={categories ?? {}}
          briefingHref={briefingHref}
        />
      ))}
    </div>
  );
}

export default memo(CategoryGrid);
