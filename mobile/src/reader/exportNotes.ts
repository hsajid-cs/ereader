import type { Annotation } from "@ereader/shared";

import { chapterIndexForOffset, textForRange } from "./range";
import type { ParsedBook } from "./types";

/** Formats highlights and notes as shareable text, grouped by chapter in reading order. */
export function formatExport(
  title: string,
  author: string | null,
  annotations: Annotation[],
  book: ParsedBook,
): string {
  const items = annotations
    .filter((a) => (a.type === "HIGHLIGHT" || a.type === "NOTE") && a.locationEnd)
    .map((a) => ({ a, start: Number(a.locationStart), end: Number(a.locationEnd) }))
    .sort((x, y) => x.start - y.start);

  const lines = [
    title + (author ? ` — ${author}` : ""),
    `${items.length} highlight${items.length === 1 ? "" : "s"} & notes`,
    "",
  ];
  let lastChapter = -1;
  for (const { a, start, end } of items) {
    const ci = chapterIndexForOffset(book, start);
    if (ci !== lastChapter) {
      lines.push(`## ${book.chapters[ci]?.title ?? "Untitled"}`);
      lastChapter = ci;
    }
    const quote = textForRange(book, start, end);
    if (quote) lines.push(`> ${quote}`);
    if (a.noteText) lines.push(`Note: ${a.noteText}`);
    lines.push("");
  }
  return lines.join("\n").trim();
}
