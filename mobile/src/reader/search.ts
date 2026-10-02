import { IMAGE_RE, stripImages, type ParsedBook } from "./types";

export interface SearchHit {
  chapterIndex: number;
  /** Global character offset of the match (same coordinate space as pages). */
  offset: number;
  snippet: string;
}

export function searchBook(book: ParsedBook, query: string, limit = 100): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const hits: SearchHit[] = [];
  let base = 0;
  for (let ci = 0; ci < book.chapters.length; ci++) {
    const text = book.chapters[ci].text;
    // Blank out image markers (same length) so ids like "img0" never match.
    const lower = text.replace(IMAGE_RE, (m) => " ".repeat(m.length)).toLowerCase();
    let from = 0;
    for (;;) {
      const idx = lower.indexOf(q, from);
      if (idx < 0) break;
      const a = Math.max(0, idx - 30);
      const b = Math.min(text.length, idx + q.length + 50);
      hits.push({
        chapterIndex: ci,
        offset: base + idx,
        snippet:
          (a > 0 ? "…" : "") +
          stripImages(text.slice(a, b)).replace(/\s+/g, " ") +
          (b < text.length ? "…" : ""),
      });
      if (hits.length >= limit) return hits;
      from = idx + q.length;
    }
    base += text.length + 1;
  }
  return hits;
}
