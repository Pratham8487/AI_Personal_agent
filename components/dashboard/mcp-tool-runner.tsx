"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "./form-classes";
import type { JsonSchema, McpResult, McpTool } from "@/lib/mcp-types";
import { toolTitle } from "@/lib/tool-title";

/**
 * One expandable MCP tool, with its form generated from the server's
 * inputSchema. Nothing about any specific tool is encoded here, so tools the
 * MCP server adds or changes render correctly without a code change.
 */

export type Preset = {
  label: string;
  args: () => Record<string, unknown>;
  /** Optional post-filter applied to the result view (e.g. recurring only). */
  filter?: string;
};

/**
 * What the result view is given besides the payload. `loadMore` re-runs the
 * same tool with the same arguments plus overrides — enough for a paginated
 * view to ask for the next page without knowing which tool it is rendering.
 */
export type ResultContext = {
  filter?: string;
  toolName: string;
  args: Record<string, unknown>;
  /** Increments on every run, so views can reset their accumulated state. */
  runId: number;
  loadMore: (overrides: Record<string, unknown>) => Promise<McpResult>;
};

type FieldValue = string | boolean;

type ToolField = { name: string; schema: JsonSchema; required: boolean };

/** Required fields first; deprecated ones are dropped entirely. */
function toFields(schema: JsonSchema | undefined): ToolField[] {
  const properties = schema?.properties ?? {};
  const required = new Set(schema?.required ?? []);
  return Object.entries(properties)
    .filter(([, field]) => !field.deprecated)
    .map(([name, field]) => ({
      name,
      schema: field,
      required: required.has(name),
    }))
    .sort((a, b) => Number(b.required) - Number(a.required));
}

/** Turns a form value into the JSON type the schema asks for. */
function coerce(schema: JsonSchema, raw: FieldValue): unknown {
  // Unchecked booleans stay absent — every boolean here is an optional flag.
  if (typeof raw === "boolean") return raw ? true : undefined;

  const value = raw.trim();
  if (!value) return undefined;

  switch (schema.type) {
    case "integer":
    case "number": {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    case "boolean":
      return value === "true";
    case "array": {
      if (schema.items?.type === "object") {
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? parsed : undefined;
        } catch {
          return undefined;
        }
      }
      return value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
    }
    case "object":
      try {
        return JSON.parse(value);
      } catch {
        return undefined;
      }
    default:
      return value;
  }
}

/** True when every required field has a usable value. */
function requirementsMet(fields: ToolField[], values: Record<string, FieldValue>) {
  return fields
    .filter((field) => field.required)
    .every((field) => coerce(field.schema, values[field.name] ?? "") !== undefined);
}

function buildArgs(fields: ToolField[], values: Record<string, FieldValue>) {
  const args: Record<string, unknown> = {};
  for (const field of fields) {
    const coerced = coerce(field.schema, values[field.name] ?? "");
    if (coerced !== undefined) args[field.name] = coerced;
  }
  return args;
}

/** Placeholder that hints at the shape a free-text field expects. */
function placeholderFor(schema: JsonSchema): string {
  if (schema.type === "array") {
    return schema.items?.type === "object"
      ? '[{ "…": "…" }]'
      : "comma, separated, values";
  }
  if (schema.type === "object") return '{ "…": "…" }';
  return "";
}

function Field({
  field,
  value,
  onChange,
}: {
  field: ToolField;
  value: FieldValue | undefined;
  onChange: (next: FieldValue) => void;
}) {
  const { name, schema, required } = field;
  const options = schema.enum ?? schema.items?.enum;
  const id = `${name}-input`;

  const label = (
    <label htmlFor={id} className={labelClass}>
      {name}
      {required && <span className="ml-1 text-rose-500">*</span>}
    </label>
  );

  if (schema.type === "boolean") {
    return (
      <div className="flex items-start gap-2">
        <input
          id={id}
          type="checkbox"
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-violet-500 focus:ring-violet-500/40 dark:border-white/20 dark:bg-white/5"
        />
        <span className="min-w-0">
          <label
            htmlFor={id}
            className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300"
          >
            {name}
          </label>
          {schema.description && (
            <span className="mt-0.5 block text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
              {schema.description}
            </span>
          )}
        </span>
      </div>
    );
  }

  // Single-choice enums render as a select; array-of-enum falls through to the
  // comma-separated text input so several values can be sent.
  if (options && schema.type !== "array") {
    return (
      <div>
        {label}
        <select
          id={id}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
          className={inputClass}
        >
          <option value="">—</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        {schema.description && (
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
            {schema.description}
          </p>
        )}
      </div>
    );
  }

  const multiline =
    schema.type === "object" ||
    (schema.type === "array" && schema.items?.type === "object");

  return (
    <div>
      {label}
      {multiline ? (
        <textarea
          id={id}
          rows={3}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholderFor(schema)}
          className={`${inputClass} font-mono text-xs`}
        />
      ) : (
        <input
          id={id}
          type={schema.type === "integer" || schema.type === "number" ? "number" : "text"}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholderFor(schema) || (options ? options.join(" | ") : "")}
          className={inputClass}
        />
      )}
      {schema.description && (
        <p className="mt-1 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
          {schema.description}
        </p>
      )}
    </div>
  );
}

type Phase = "idle" | "loading" | "done" | "error";

export default function McpToolRunner({
  tool,
  presets = [],
  run,
  renderResult,
}: {
  tool: McpTool;
  presets?: Preset[];
  run: (name: string, args: Record<string, unknown>) => Promise<McpResult>;
  renderResult: (result: McpResult, context: ResultContext) => ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showOptional, setShowOptional] = useState(false);
  const [values, setValues] = useState<Record<string, FieldValue>>({});
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<McpResult | null>(null);
  const [filter, setFilter] = useState<string | undefined>();
  const [confirming, setConfirming] = useState(false);
  // The arguments behind the displayed result, so the view can page on them.
  const [lastArgs, setLastArgs] = useState<Record<string, unknown>>({});
  const [runId, setRunId] = useState(0);

  const fields = useMemo(() => toFields(tool.inputSchema), [tool.inputSchema]);
  const requiredFields = fields.filter((field) => field.required);
  const optionalFields = fields.filter((field) => !field.required);
  const destructive = tool.annotations?.destructiveHint === true;
  const ready = requirementsMet(fields, values);

  const execute = (args: Record<string, unknown>, nextFilter?: string) => {
    setPhase("loading");
    setFilter(nextFilter);
    setConfirming(false);
    setLastArgs(args);
    setRunId((id) => id + 1);
    run(tool.name, args)
      .then((outcome) => {
        setResult(outcome);
        setPhase(outcome.ok ? "done" : "error");
      })
      .catch(() => {
        setResult({
          ok: false,
          message: "Could not reach the server. Please retry.",
          structured: null,
        });
        setPhase("error");
      });
  };

  const runForm = () => execute(buildArgs(fields, values));

  const runPreset = (preset: Preset) => {
    setValues({});
    execute(preset.args(), preset.filter);
  };

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    // Read-only tools with nothing required answer immediately on open.
    if (
      next &&
      phase === "idle" &&
      requiredFields.length === 0 &&
      tool.annotations?.readOnlyHint !== false
    ) {
      execute({});
    }
  };

  return (
    <li className="rounded-xl border border-zinc-200 bg-zinc-50 dark:border-white/10 dark:bg-white/5">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between gap-3 p-3 text-left"
        aria-expanded={expanded}
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-zinc-900 dark:text-white">
            {tool.annotations?.title ?? toolTitle(tool.name)}
          </span>
          {tool.description && (
            <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              {tool.description}
            </span>
          )}
        </span>
        <span className="shrink-0 text-xs font-semibold text-violet-500 dark:text-violet-400">
          {expanded ? "Hide" : "Run"}
        </span>
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-zinc-200 p-3 dark:border-white/10">
          {presets.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {presets.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => runPreset(preset)}
                  disabled={phase === "loading"}
                  className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-600 transition-colors hover:bg-violet-100 disabled:opacity-50 dark:border-violet-400/30 dark:bg-violet-500/10 dark:text-violet-300 dark:hover:bg-violet-500/20"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          )}

          {requiredFields.map((field) => (
            <Field
              key={field.name}
              field={field}
              value={values[field.name]}
              onChange={(next) =>
                setValues((prev) => ({ ...prev, [field.name]: next }))
              }
            />
          ))}

          {optionalFields.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setShowOptional((prev) => !prev)}
                className="text-[11px] font-semibold text-violet-500 dark:text-violet-400"
              >
                {showOptional ? "Hide" : "Show"} optional fields (
                {optionalFields.length})
              </button>
              {showOptional && (
                <div className="space-y-3 rounded-lg border border-zinc-200 p-3 dark:border-white/10">
                  {optionalFields.map((field) => (
                    <Field
                      key={field.name}
                      field={field}
                      value={values[field.name]}
                      onChange={(next) =>
                        setValues((prev) => ({ ...prev, [field.name]: next }))
                      }
                    />
                  ))}
                </div>
              )}
            </>
          )}

          <div className="flex items-center gap-2">
            {confirming ? (
              <>
                <span className="text-xs text-zinc-600 dark:text-zinc-300">
                  This change cannot be undone.
                </span>
                <button
                  type="button"
                  onClick={runForm}
                  className="rounded-lg bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-85"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className={secondaryButtonClass}
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => (destructive ? setConfirming(true) : runForm())}
                disabled={phase === "loading" || !ready}
                className={primaryButtonClass}
              >
                {phase === "loading" ? "Running…" : "Run"}
              </button>
            )}
          </div>

          {phase === "loading" && (
            <div className="space-y-2">
              <div className="skeleton h-10 rounded-lg" />
              <div className="skeleton h-10 rounded-lg" />
            </div>
          )}

          {phase === "error" && result && (
            <p className="text-sm text-rose-500">{result.message}</p>
          )}

          {phase === "done" &&
            result &&
            renderResult(result, {
              filter,
              toolName: tool.name,
              args: lastArgs,
              runId,
              loadMore: (overrides) => run(tool.name, { ...lastArgs, ...overrides }),
            })}
        </div>
      )}
    </li>
  );
}
