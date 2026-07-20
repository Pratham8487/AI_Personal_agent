"use client";

import { Fragment, memo, useMemo, type ReactNode } from "react";

/**
 * Minimal GitHub-flavored markdown renderer for chat bubbles. Builds React
 * nodes directly (never HTML strings), so model output cannot inject markup.
 *
 * Supports: headings, nested ordered/unordered lists, task lists, fenced code,
 * inline code, links, tables, bold/italic/strikethrough, blockquotes, rules.
 *
 * Streaming note: the full answer is re-parsed on every token, so each block
 * is rendered through a memo that compares a cheap structural signature. Only
 * the block currently being written re-renders; finished tables and code
 * blocks above it stay untouched.
 */

type ListItem = {
  text: string;
  /** Nested content (sub-lists, extra paragraphs) under this item. */
  children: Block[];
  /** null when the item is not a task-list entry. */
  checked: boolean | null;
};

type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "code"; lang: string; code: string }
  | { kind: "list"; ordered: boolean; start: number; items: ListItem[] }
  | { kind: "table"; header: string[]; rows: string[][] }
  | { kind: "quote"; lines: string[] }
  | { kind: "hr" }
  | { kind: "p"; lines: string[] };

const FENCE = /^\s*```(\w*)\s*$/;
const HEADING = /^(#{1,6})\s+(.+)$/;
const RULE = /^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;
const QUOTE = /^\s*>\s?(.*)$/;
const UL_ITEM = /^(\s*)[-*+]\s+(.*)$/;
const OL_ITEM = /^(\s*)(\d{1,9})[.)]\s+(.*)$/;
const TASK = /^\[([ xX])\]\s+(.*)$/;
const TABLE_DIVIDER =
  /^\s*\|?(?:\s*:?-{2,}:?\s*\|)+\s*:?-{2,}:?\s*\|?\s*$/;

const INLINE_SOURCE =
  /(`+)(.+?)\1|\*\*([^*]+?)\*\*|__([^_]+?)__|\*([^*\n]+?)\*|\b_([^_\n]+?)_\b|~~([^~]+?)~~|\[([^\]]+)\]\(([^)\s]+)\)/
    .source;

/** Leading whitespace width, with tabs counted as four columns. */
function indentOf(line: string): number {
  const match = /^[ \t]*/.exec(line)?.[0] ?? "";
  let width = 0;
  for (const char of match) width += char === "\t" ? 4 : 1;
  return width;
}

function isListLine(line: string): boolean {
  return UL_ITEM.test(line) || OL_ITEM.test(line);
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isTableStart(lines: string[], index: number): boolean {
  return (
    lines[index].includes("|") &&
    index + 1 < lines.length &&
    TABLE_DIVIDER.test(lines[index + 1])
  );
}

/** True when the line ends the paragraph it would otherwise continue. */
function breaksParagraph(lines: string[], index: number): boolean {
  const line = lines[index];
  return (
    !line.trim() ||
    FENCE.test(line) ||
    HEADING.test(line) ||
    RULE.test(line) ||
    QUOTE.test(line) ||
    isListLine(line) ||
    isTableStart(lines, index)
  );
}

/**
 * Parses one list, consuming nested items. Lines indented past the list's own
 * marker are gathered and re-parsed as the item's children, which is what
 * makes sub-lists render as sub-lists instead of collapsing flat.
 */
function parseList(
  lines: string[],
  start: number,
): { block: Block; next: number } {
  const first = lines[start];
  const ordered = OL_ITEM.test(first) && !UL_ITEM.test(first);
  const pattern = ordered ? OL_ITEM : UL_ITEM;
  const baseIndent = indentOf(first);
  const startNumber = ordered ? Number(OL_ITEM.exec(first)?.[2] ?? 1) : 1;

  const items: ListItem[] = [];
  let buffer: string[] = [];
  let i = start;

  const flush = () => {
    if (!items.length) return;
    // Children are dedented so nested parsing sees them at column zero.
    const dedent = Math.min(
      ...buffer.filter((l) => l.trim()).map((l) => indentOf(l)),
    );
    const owner = items[items.length - 1];
    owner.children = buffer.some((l) => l.trim())
      ? parseBlocks(buffer.map((l) => l.slice(dedent)).join("\n"))
      : [];
    buffer = [];
  };

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      // A blank line only continues the list if indented content follows.
      const next = lines[i + 1];
      if (next && next.trim() && indentOf(next) > baseIndent) {
        buffer.push(line);
        i += 1;
        continue;
      }
      break;
    }

    const indent = indentOf(line);
    const match = pattern.exec(line);

    if (match && indent === baseIndent) {
      flush();
      const raw = (ordered ? match[3] : match[2]) ?? "";
      const task = TASK.exec(raw);
      items.push({
        text: task ? task[2] : raw,
        children: [],
        checked: task ? task[1].toLowerCase() === "x" : null,
      });
      i += 1;
      continue;
    }

    if (indent > baseIndent && items.length) {
      buffer.push(line);
      i += 1;
      continue;
    }

    // A sibling marker of the other type, or dedented text: list is over.
    break;
  }
  flush();

  return {
    block: { kind: "list", ordered, start: startNumber, items },
    next: i,
  };
}

function parseBlocks(text: string): Block[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i += 1;
      continue;
    }

    const fence = line.match(FENCE);
    if (fence) {
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !FENCE.test(lines[i])) {
        code.push(lines[i]);
        i += 1;
      }
      i += 1; // closing fence (or EOF while streaming)
      blocks.push({ kind: "code", lang: fence[1] ?? "", code: code.join("\n") });
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      blocks.push({
        kind: "heading",
        level: heading[1].length,
        text: heading[2],
      });
      i += 1;
      continue;
    }

    // Checked before lists so "---" is never read as a bullet.
    if (RULE.test(line)) {
      blocks.push({ kind: "hr" });
      i += 1;
      continue;
    }

    if (QUOTE.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length) {
        const match = lines[i].match(QUOTE);
        if (!match) break;
        quoted.push(match[1]);
        i += 1;
      }
      blocks.push({ kind: "quote", lines: quoted });
      continue;
    }

    if (isListLine(line)) {
      const { block, next } = parseList(lines, i);
      blocks.push(block);
      i = next;
      continue;
    }

    if (isTableStart(lines, i)) {
      const header = splitTableRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
        rows.push(splitTableRow(lines[i]));
        i += 1;
      }
      blocks.push({ kind: "table", header, rows });
      continue;
    }

    const paragraph: string[] = [line];
    i += 1;
    while (i < lines.length && !breaksParagraph(lines, i)) {
      paragraph.push(lines[i]);
      i += 1;
    }
    blocks.push({ kind: "p", lines: paragraph });
  }

  return blocks;
}

function renderInline(text: string): ReactNode {
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;
  // Fresh regex per call: renderInline recurses for bold/italic/links, and a
  // shared global regex's lastIndex would be clobbered by the inner call,
  // re-matching the same token forever.
  const inline = new RegExp(INLINE_SOURCE, "g");
  for (let match = inline.exec(text); match; match = inline.exec(text)) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const [
      ,
      ,
      code,
      bold,
      boldAlt,
      italic,
      italicAlt,
      strike,
      linkText,
      linkHref,
    ] = match;
    key += 1;
    if (code !== undefined) {
      nodes.push(
        <code
          key={key}
          className="rounded bg-zinc-200/70 px-1 py-0.5 font-mono text-[0.85em] dark:bg-white/10"
        >
          {code}
        </code>,
      );
    } else if (bold !== undefined || boldAlt !== undefined) {
      nodes.push(
        <strong key={key} className="font-semibold">
          {renderInline(bold ?? boldAlt ?? "")}
        </strong>,
      );
    } else if (italic !== undefined || italicAlt !== undefined) {
      nodes.push(<em key={key}>{renderInline(italic ?? italicAlt ?? "")}</em>);
    } else if (strike !== undefined) {
      nodes.push(
        <span key={key} className="line-through opacity-70">
          {renderInline(strike)}
        </span>,
      );
    } else if (linkText !== undefined) {
      // Only http(s) is linkable; javascript:/data: URLs render as plain text.
      if (/^https?:\/\//i.test(linkHref ?? "")) {
        nodes.push(
          <a
            key={key}
            href={linkHref}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-violet-600 underline underline-offset-2 hover:opacity-80 dark:text-violet-400"
          >
            {renderInline(linkText)}
          </a>,
        );
      } else {
        nodes.push(<Fragment key={key}>{renderInline(linkText)}</Fragment>);
      }
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes.length === 1 ? nodes[0] : nodes;
}

function renderLines(lines: string[]): ReactNode {
  return lines.map((line, index) => (
    <Fragment key={index}>
      {index > 0 && <br />}
      {renderInline(line)}
    </Fragment>
  ));
}

const HEADING_CLASSES: Record<number, string> = {
  1: "text-lg font-semibold",
  2: "text-base font-semibold",
  3: "text-sm font-semibold",
};

function renderListItems(items: ListItem[]): ReactNode {
  return items.map((item, index) => (
    <li key={index} className={item.checked === null ? "" : "list-none -ml-5"}>
      {item.checked !== null && (
        <input
          type="checkbox"
          checked={item.checked}
          readOnly
          aria-hidden
          className="mr-2 align-middle accent-violet-500"
        />
      )}
      {renderInline(item.text)}
      {item.children.map((child, childIndex) => (
        <BlockView key={childIndex} block={child} sig={signature(child)} />
      ))}
    </li>
  ));
}

function renderBlock(block: Block): ReactNode {
  switch (block.kind) {
    case "heading":
      return (
        <p
          className={`mt-4 mb-1.5 first:mt-0 ${
            HEADING_CLASSES[block.level] ?? "text-sm font-semibold"
          } text-zinc-900 dark:text-white`}
        >
          {renderInline(block.text)}
        </p>
      );
    case "code":
      return (
        <pre className="my-2 overflow-x-auto rounded-lg bg-zinc-900 p-3 font-mono text-xs leading-relaxed text-zinc-100 dark:bg-black/50">
          <code>{block.code}</code>
        </pre>
      );
    case "list": {
      const ListTag = block.ordered ? "ol" : "ul";
      return (
        <ListTag
          start={block.ordered && block.start !== 1 ? block.start : undefined}
          className={`my-2 space-y-1 pl-5 ${
            block.ordered ? "list-decimal" : "list-disc"
          } marker:text-zinc-400 dark:marker:text-zinc-500`}
        >
          {renderListItems(block.items)}
        </ListTag>
      );
    }
    case "table":
      return (
        <div className="my-2 overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr>
                {block.header.map((cell, index) => (
                  <th
                    key={index}
                    className="border-b border-zinc-300 px-2 py-1.5 font-semibold text-zinc-900 dark:border-white/20 dark:text-white"
                  >
                    {renderInline(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {block.header.map((_, cellIndex) => (
                    <td
                      key={cellIndex}
                      className="border-b border-zinc-200 px-2 py-1.5 align-top dark:border-white/10"
                    >
                      {renderInline(row[cellIndex] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "quote":
      return (
        <blockquote className="my-2 border-l-2 border-violet-400 pl-3 text-zinc-500 italic dark:text-zinc-400">
          {renderLines(block.lines)}
        </blockquote>
      );
    case "hr":
      return <hr className="my-3 border-zinc-200 dark:border-white/10" />;
    case "p":
      return (
        <p className="my-2 leading-relaxed first:mt-0 last:mb-0">
          {renderLines(block.lines)}
        </p>
      );
  }
}

/** Cheap structural identity, used to skip re-rendering settled blocks. */
function signature(block: Block): string {
  return JSON.stringify(block);
}

const BlockView = memo(
  function BlockView({ block }: { block: Block; sig: string }) {
    return <>{renderBlock(block)}</>;
  },
  (prev, next) => prev.sig === next.sig,
);

export default function Markdown({ text }: { text: string }) {
  const blocks = useMemo(() => parseBlocks(text), [text]);
  return (
    <div className="min-w-0">
      {blocks.map((block, index) => (
        <BlockView key={index} block={block} sig={signature(block)} />
      ))}
    </div>
  );
}
