"use client";

import { Fragment, useMemo, type ReactNode } from "react";

/**
 * Minimal GitHub-flavored markdown renderer for chat bubbles. Builds React
 * nodes directly (never HTML strings), so model output cannot inject markup.
 * Supports: headings, ordered/unordered lists, fenced code, inline code,
 * links, tables, bold/italic/strikethrough, blockquotes, and rules.
 */

type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "code"; lang: string; code: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "table"; header: string[]; rows: string[][] }
  | { kind: "quote"; lines: string[] }
  | { kind: "hr" }
  | { kind: "p"; lines: string[] };

const FENCE = /^\s*```(\w*)\s*$/;
const HEADING = /^(#{1,6})\s+(.+)$/;
const RULE = /^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;
const QUOTE = /^\s*>\s?(.*)$/;
const UL_ITEM = /^\s*[-*+]\s+(.+)$/;
const OL_ITEM = /^\s*\d{1,3}[.)]\s+(.+)$/;
const TABLE_DIVIDER = /^\s*\|?(?:\s*:?-{2,}:?\s*\|)+\s*:?-{2,}:?\s*\|?\s*$/;

const INLINE_SOURCE =
  /(`+)(.+?)\1|\*\*([^*]+?)\*\*|__([^_]+?)__|\*([^*\n]+?)\*|\b_([^_\n]+?)_\b|~~([^~]+?)~~|\[([^\]]+)\]\(([^)\s]+)\)/
    .source;

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
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
      blocks.push({ kind: "heading", level: heading[1].length, text: heading[2] });
      i += 1;
      continue;
    }

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

    const listMatch = line.match(UL_ITEM) ?? line.match(OL_ITEM);
    if (listMatch) {
      const ordered = OL_ITEM.test(line) && !UL_ITEM.test(line);
      const pattern = ordered ? OL_ITEM : UL_ITEM;
      const items: string[] = [];
      while (i < lines.length) {
        const item = lines[i].match(pattern);
        if (!item) break;
        items.push(item[1]);
        i += 1;
      }
      blocks.push({ kind: "list", ordered, items });
      continue;
    }

    if (line.includes("|") && i + 1 < lines.length && TABLE_DIVIDER.test(lines[i + 1])) {
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
    while (
      i < lines.length &&
      lines[i].trim() &&
      !FENCE.test(lines[i]) &&
      !HEADING.test(lines[i]) &&
      !RULE.test(lines[i]) &&
      !QUOTE.test(lines[i]) &&
      !UL_ITEM.test(lines[i]) &&
      !OL_ITEM.test(lines[i]) &&
      !(lines[i].includes("|") && i + 1 < lines.length && TABLE_DIVIDER.test(lines[i + 1]))
    ) {
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
    const [, , code, bold, boldAlt, italic, italicAlt, strike, linkText, linkHref] =
      match;
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
        nodes.push(renderInline(linkText));
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

function renderBlock(block: Block, key: number): ReactNode {
  switch (block.kind) {
    case "heading":
      return (
        <p
          key={key}
          className={`mt-4 mb-1.5 first:mt-0 ${
            HEADING_CLASSES[block.level] ?? "text-sm font-semibold"
          } text-zinc-900 dark:text-white`}
        >
          {renderInline(block.text)}
        </p>
      );
    case "code":
      return (
        <pre
          key={key}
          className="my-2 overflow-x-auto rounded-lg bg-zinc-900 p-3 font-mono text-xs leading-relaxed text-zinc-100 dark:bg-black/50"
        >
          <code>{block.code}</code>
        </pre>
      );
    case "list": {
      const ListTag = block.ordered ? "ol" : "ul";
      return (
        <ListTag
          key={key}
          className={`my-2 space-y-1 pl-5 ${
            block.ordered ? "list-decimal" : "list-disc"
          }`}
        >
          {block.items.map((item, index) => (
            <li key={index}>{renderInline(item)}</li>
          ))}
        </ListTag>
      );
    }
    case "table":
      return (
        <div key={key} className="my-2 overflow-x-auto">
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
        <blockquote
          key={key}
          className="my-2 border-l-2 border-violet-400 pl-3 text-zinc-500 italic dark:text-zinc-400"
        >
          {renderLines(block.lines)}
        </blockquote>
      );
    case "hr":
      return (
        <hr key={key} className="my-3 border-zinc-200 dark:border-white/10" />
      );
    case "p":
      return (
        <p key={key} className="my-2 leading-relaxed first:mt-0 last:mb-0">
          {renderLines(block.lines)}
        </p>
      );
  }
}

export default function Markdown({ text }: { text: string }) {
  const blocks = useMemo(() => parseBlocks(text), [text]);
  return <div className="min-w-0">{blocks.map(renderBlock)}</div>;
}
