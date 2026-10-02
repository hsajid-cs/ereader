import { IMAGE_RE, type Page, type ParsedBook } from "./types";

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

/** Representative English text used to measure real glyph widths on the device. */
export const PROBE_TEXT =
  "The old lighthouse keeper watched the evening tide roll in over the rocks, thinking of letters never sent and " +
  "ships that had long since passed. Nothing about the harbour had changed in years, yet every morning felt like " +
  "the first page of a new story, quiet and strangely full of promise for anyone patient enough to read it.";

/** Characters that fit on one line, from the measured height of PROBE_TEXT laid out at the page width. */
export function charsPerLineFromProbe(
  probeHeight: number,
  fontSize: number,
  lineHeight: number,
): number {
  const lines = Math.max(1, Math.round(probeHeight / (fontSize * lineHeight)));
  return PROBE_TEXT.length / lines;
}

/**
 * Characters per page from a measured line capacity. The 0.92 allowance covers ragged line ends
 * and paragraph spacing, so text is never clipped at the bottom of the page.
 */
export function charsPerPageFromProbe(
  charsPerLine: number,
  height: number,
  fontSize: number,
  lineHeight: number,
): number {
  const lines = Math.max(3, Math.floor(height / (fontSize * lineHeight)));
  return Math.max(100, Math.floor(charsPerLine * lines * 0.92));
}

/** Splits each chapter into pages, preferring paragraph then sentence then word boundaries. Images get their own page. */
export function paginate(book: ParsedBook, charsPerPage: number): Page[] {
  const pages: Page[] = [];
  let offset = 0;

  book.chapters.forEach((chapter, chapterIndex) => {
    const full = chapter.text;

    // Text runs between image markers, and the markers themselves.
    const parts: { start: number; end: number; image: boolean }[] = [];
    let last = 0;
    for (const m of full.matchAll(IMAGE_RE)) {
      if (m.index > last) parts.push({ start: last, end: m.index, image: false });
      parts.push({ start: m.index, end: m.index + m[0].length, image: true });
      last = m.index + m[0].length;
    }
    if (last < full.length) parts.push({ start: last, end: full.length, image: false });

    for (const part of parts) {
      if (part.image) {
        pages.push({
          start: offset + part.start,
          end: offset + part.end,
          chapterIndex,
          text: full.slice(part.start, part.end),
          figure: true,
        });
        continue;
      }
      const text = full.slice(part.start, part.end);
      const base = offset + part.start;
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
        const raw = text.slice(pos, end);
        const trimmed = raw.replace(/^\s+/, "");
        if (trimmed.trim().length > 0) {
          pages.push({
            start: base + pos + (raw.length - trimmed.length),
            end: base + end,
            chapterIndex,
            text: trimmed.replace(/\s+$/, ""),
          });
        }
        pos = end;
      }
    }
    offset += full.length + 1;
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
