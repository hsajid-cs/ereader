import type { ParsedBook } from "./types";

const CHAPTER_RE = /^(chapter\s+[\divxlc]+\b.*|part\s+[\divxlc]+\b.*)$/i;

/** Splits a plain-text book into chapters on "Chapter N" style headings. */
export function parseTxt(raw: string, fallbackTitle = "Text"): ParsedBook {
  const text = raw.replace(/\r\n?/g, "\n").trim();
  const lines = text.split("\n");
  const chapters: { title: string; lines: string[] }[] = [];
  let current = { title: fallbackTitle, lines: [] as string[] };

  for (const line of lines) {
    if (CHAPTER_RE.test(line.trim()) && line.trim().length < 80) {
      if (current.lines.join("").trim()) chapters.push(current);
      current = { title: line.trim(), lines: [] };
    }
    current.lines.push(line);
  }
  if (current.lines.join("").trim()) chapters.push(current);

  return {
    chapters: chapters.map((c) => ({
      title: c.title,
      text: normalizeParagraphs(c.lines.join("\n")),
    })),
  };
}

/** Joins hard-wrapped lines into paragraphs; blank lines separate paragraphs. */
export function normalizeParagraphs(text: string): string {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");
}
