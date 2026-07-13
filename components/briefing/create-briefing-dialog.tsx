"use client";

import { SparklesIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import AppIcon from "@/components/dashboard/app-icon";
import {
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/dashboard/form-classes";
import Modal from "@/components/dashboard/modal";
import type {
  BriefingCategoryId,
  BriefingDefinition,
  BriefingDefinitionInput,
  BriefingFrequency,
  GeneratedBriefing,
} from "@/lib/briefing-types";
import type { PriorityLevel } from "@/lib/dashboard-brief-types";
import { PROVIDERS } from "@/lib/integrations";
import { CATEGORY_META } from "./category-meta";

type Phase = "editing" | "saving" | "generating";

const LIVE_PROVIDERS = PROVIDERS.filter((p) => p.hasLiveTools);

const chipBase =
  "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors";
const chipOn =
  "border-violet-500/50 bg-violet-500/10 text-violet-700 dark:text-violet-300";
const chipOff =
  "border-zinc-200 text-zinc-600 hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5";
const chipDisabled =
  "border-zinc-200 text-zinc-400 opacity-50 cursor-not-allowed dark:border-white/10 dark:text-zinc-500";

/** Native select popups ignore the page theme; style options explicitly. */
const optionClass = "bg-white text-zinc-900 dark:bg-[#17111f] dark:text-white";

/** ISO → value usable by <input type="datetime-local">. */
function toLocalInputValue(iso: string | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Create/edit a briefing config; Generate Now saves first, then runs it. */
export default function CreateBriefingDialog({
  connectedProviderIds,
  initial,
  savingError,
  onSave,
  onGenerateNow,
  onClose,
}: {
  connectedProviderIds: string[];
  initial?: BriefingDefinition | null;
  savingError: string | null;
  onSave: (
    input: BriefingDefinitionInput,
    enabled: boolean,
  ) => Promise<BriefingDefinition | null>;
  onGenerateNow: (briefingId: string) => Promise<GeneratedBriefing | null>;
  onClose: () => void;
}) {
  const router = useRouter();
  const isDefault = initial?.isDefault === true;

  const [phase, setPhase] = useState<Phase>("editing");
  const [localError, setLocalError] = useState<string | null>(null);
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [apps, setApps] = useState<string[]>(
    initial
      ? initial.apps.length > 0
        ? initial.apps
        : connectedProviderIds
      : connectedProviderIds,
  );
  const [categories, setCategories] = useState<BriefingCategoryId[]>(
    initial?.categories ?? CATEGORY_META.map((m) => m.id),
  );
  const [scheduleTime, setScheduleTime] = useState(initial?.scheduleTime ?? "08:00");
  const [frequency, setFrequency] = useState<BriefingFrequency>(
    initial?.frequency ?? "daily",
  );
  const [priority, setPriority] = useState<PriorityLevel>(
    initial?.priority ?? "medium",
  );
  const [runAtLocal, setRunAtLocal] = useState(toLocalInputValue(initial?.runAt));
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);

  const timezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    [],
  );

  const toggle = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const canSubmit =
    Boolean(name.trim()) &&
    apps.length > 0 &&
    categories.length > 0 &&
    (frequency !== "once" || Boolean(runAtLocal)) &&
    phase === "editing";

  const buildInput = useCallback((): BriefingDefinitionInput | null => {
    if (frequency === "once") {
      const at = new Date(runAtLocal);
      if (Number.isNaN(at.getTime()) || at.getTime() <= Date.now()) {
        setLocalError("Pick a date and time in the future.");
        return null;
      }
      return {
        name: name.trim(),
        description: description.trim(),
        apps,
        categories,
        priority,
        frequency,
        scheduleTime,
        timezone: initial?.timezone ?? timezone,
        runAt: at.toISOString(),
      };
    }
    return {
      name: name.trim(),
      description: description.trim(),
      apps,
      categories,
      priority,
      frequency,
      scheduleTime,
      timezone: initial?.timezone ?? timezone,
    };
  }, [
    name,
    description,
    apps,
    categories,
    priority,
    frequency,
    scheduleTime,
    runAtLocal,
    timezone,
    initial?.timezone,
  ]);

  const save = useCallback(async (): Promise<BriefingDefinition | null> => {
    setLocalError(null);
    const input = buildInput();
    if (!input) return null;
    return onSave(input, enabled);
  }, [buildInput, onSave, enabled]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!canSubmit) return;
      setPhase("saving");
      const saved = await save();
      if (saved) {
        onClose();
      } else {
        setPhase("editing");
      }
    },
    [canSubmit, save, onClose],
  );

  const handleGenerateNow = useCallback(async () => {
    if (!canSubmit) return;
    setPhase("generating");
    const saved = await save();
    if (!saved) {
      setPhase("editing");
      return;
    }
    const generated = await onGenerateNow(saved.id);
    onClose();
    if (generated) router.push(`/briefing/${generated.id}`);
  }, [canSubmit, save, onGenerateNow, onClose, router]);

  const error = localError ?? savingError;

  return (
    <Modal
      title={initial ? "Edit briefing" : "Create briefing"}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="briefing-name" className={labelClass}>
            Name
          </label>
          <input
            id="briefing-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Client work briefing"
            maxLength={80}
            disabled={isDefault}
            className={`${inputClass} disabled:opacity-60`}
          />
          {isDefault && (
            <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
              The daily brief&apos;s name and schedule are managed in Settings.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="briefing-description" className={labelClass}>
            Description or goal
          </label>
          <textarea
            id="briefing-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What should this briefing focus on?"
            maxLength={300}
            rows={2}
            className={`${inputClass} resize-none`}
          />
        </div>

        <div>
          <span className={labelClass}>Apps</span>
          <div className="flex flex-wrap gap-2">
            {LIVE_PROVIDERS.map((provider) => {
              const connected = connectedProviderIds.includes(provider.id);
              const selected = apps.includes(provider.id);
              return (
                <button
                  key={provider.id}
                  type="button"
                  disabled={!connected}
                  title={!connected ? "Connect in Integrations first" : undefined}
                  onClick={() => setApps((prev) => toggle(prev, provider.id))}
                  className={`${chipBase} ${!connected ? chipDisabled : selected ? chipOn : chipOff}`}
                >
                  <AppIcon app={provider.id} className="h-3.5 w-3.5" />
                  {provider.name}
                </button>
              );
            })}
          </div>
          {apps.length === 0 && (
            <p className="mt-1 text-xs text-rose-500">Select at least one app.</p>
          )}
        </div>

        <div>
          <span className={labelClass}>Categories</span>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_META.map((meta) => {
              const selected = categories.includes(meta.id);
              return (
                <button
                  key={meta.id}
                  type="button"
                  onClick={() =>
                    setCategories((prev) => toggle(prev, meta.id))
                  }
                  className={`${chipBase} ${selected ? chipOn : chipOff}`}
                >
                  <HugeiconsIcon icon={meta.icon} size={12} strokeWidth={1.8} />
                  {meta.label}
                </button>
              );
            })}
          </div>
          {categories.length === 0 && (
            <p className="mt-1 text-xs text-rose-500">
              Select at least one category.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="briefing-frequency" className={labelClass}>
              Frequency
            </label>
            <select
              id="briefing-frequency"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as BriefingFrequency)}
              disabled={isDefault}
              className={`${inputClass} disabled:opacity-60`}
            >
              <option value="daily" className={optionClass}>
                Daily
              </option>
              <option value="weekdays" className={optionClass}>
                Weekdays
              </option>
              <option value="weekly" className={optionClass}>
                Weekly
              </option>
              <option value="once" className={optionClass}>
                One time
              </option>
            </select>
          </div>
          {frequency === "once" ? (
            <div className="col-span-2">
              <label htmlFor="briefing-runat" className={labelClass}>
                Date &amp; time
              </label>
              <input
                id="briefing-runat"
                type="datetime-local"
                value={runAtLocal}
                onChange={(e) => setRunAtLocal(e.target.value)}
                className={inputClass}
              />
            </div>
          ) : (
            <div>
              <label htmlFor="briefing-time" className={labelClass}>
                Scheduled time
              </label>
              <input
                id="briefing-time"
                type="time"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
                disabled={isDefault}
                className={`${inputClass} disabled:opacity-60`}
              />
            </div>
          )}
          <div>
            <label htmlFor="briefing-priority" className={labelClass}>
              Priority level
            </label>
            <select
              id="briefing-priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as PriorityLevel)}
              className={inputClass}
            >
              <option value="low" className={optionClass}>
                Low
              </option>
              <option value="medium" className={optionClass}>
                Medium
              </option>
              <option value="high" className={optionClass}>
                High
              </option>
            </select>
          </div>
        </div>

        {initial && !isDefault && (
          <label className="flex items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4 rounded accent-violet-500"
            />
            Scheduled generation enabled
          </label>
        )}

        {error && <p className="text-xs text-rose-500">{error}</p>}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={handleGenerateNow}
            disabled={!canSubmit}
            className={`flex items-center gap-1.5 ${secondaryButtonClass}`}
          >
            <HugeiconsIcon
              icon={SparklesIcon}
              size={12}
              strokeWidth={1.8}
              className={phase === "generating" ? "animate-spin" : ""}
            />
            {phase === "generating" ? "Generating…" : "Generate now"}
          </button>
          <button type="submit" disabled={!canSubmit} className={primaryButtonClass}>
            {phase === "saving"
              ? "Saving…"
              : initial
                ? "Save changes"
                : "Create briefing"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
