import type { Page, ParsedBook } from "./types";

export interface PageMetrics {
  charsPerPage: number;
}

/**
 * Estimates how many characters fit on a page for the given viewport and font size.
 * Average glyph width is ~0.5em for proportional fonts.
 */
export function estimateCharsPerPage(
  width: number,
  height: number,
  fontSize: number,
  lineHeight = 1.5,
): number {
  const charsPerLine = Math.max(10, Math.floor(width / (fontSize * 0.5)));
  const lines = Math.max(5, Math.floor(height / (fontSize * lineHeight)));
  return Math.floor(charsPerLine * lines * 0.9);
}

/** Splits each chapter into pages, preferring paragraph then sentence then word boundaries. */
export function paginate(book: ParsedBook, charsPerPage: number): Page[] {
  const pages: Page[] = [];
  let offset = 0;

  book.chapters.forEach((chapter, chapterIndex) => {
    const text = chapter.text;
    let pos = 0;
    while (pos < text.length) {
      let end = Math.min(pos + charsPerPage, text.length);
      if (end < text.length) {
        const window = text.slice(pos, end);
        const cut = Math.max(
          window.lastIndexOf("\n\n"),
          window.lastIndexOf(". ") + 1,
          window.lastIndexOf(" "),
        );
        if (cut > charsPerPage * 0.5) end = pos + cut;
      }
      const slice = text.slice(pos, end).replace(/^\s+/, "");
      const lead =
        end - pos - (end - pos > 0 ? text.slice(pos, end).replace(/^\s+/, "").length : 0);
      pages.push({
        start: offset + pos + lead,
        end: offset + end,
        chapterIndex,
        text: slice.replace(/\s+$/, ""),
      });
      pos = end;
    }
    offset += text.length + 1;
  });
  return pages;
}

export function pageIndexForOffset(pages: Page[], offset: number): number {
  let lo = 0;
  let hi = pages.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (pages[mid].start <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export function totalLength(book: ParsedBook): number {
  return book.chapters.reduce((n, c) => n + c.text.length + 1, 0);
}
