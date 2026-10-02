import { IMAGE_RE, type Page, type ParsedBook } from "./types";

/** Paragraph spacing below each paragraph, in em. Shared with the page renderer so layouts agree. */
export const PARAGRAPH_GAP_EM = 0.5;

/** Rough characters per line before the real font has been measured (average glyph ~0.5em). */
export function estimateCharsPerLine(width: number, fontSize: number): number {
  return Math.max(10, Math.floor(width / (fontSize * 0.5)));
}

/** Representative English text used to measure real glyph widths on the device. */
const PROBE_SENTENCES =
  "The old lighthouse keeper watched the evening tide roll in over the rocks, thinking of letters never sent and " +
  "ships that had long since passed. Nothing about the harbour had changed in years, yet every morning felt like " +
  "the first page of a new story, quiet and strangely full of promise for anyone patient enough to read it. ";

// Several lines' worth, so one ragged line end cannot skew the average by more than a few percent.
export const PROBE_TEXT = (PROBE_SENTENCES.repeat(3) as string).trim();

/** Characters that fit on one line, from the measured height of PROBE_TEXT laid out at the page width. */
export function charsPerLineFromProbe(
  probeHeight: number,
  fontSize: number,
  lineHeight: number,
): number {
  const lines = Math.max(1, Math.round(probeHeight / (fontSize * lineHeight)));
  return PROBE_TEXT.length / lines;
}

export interface PageLayout {
  /** Average characters per line (measured, or estimated). */
  charsPerLine: number;
  /** Height available for text on one page, in px. */
  height: number;
  lineHeightPx: number;
  /** Space below each paragraph, in px. */
  paragraphGapPx: number;
}

/** Word wrap leaves ragged line ends, so a line holds slightly fewer characters than the average. */
const WRAP_SAFETY = 0.96;

function linesFor(length: number, charsPerLine: number): number {
  return Math.max(1, Math.ceil(length / (charsPerLine * WRAP_SAFETY)));
}

/**
 * Splits each chapter into pages by simulating line layout: a paragraph takes ceil(chars / charsPerLine)
 * lines plus a gap, and paragraphs are packed until the page height is used up. A paragraph that does
 * not fit is split at a word boundary, leaving at least two lines on each side (no widows or orphans).
 * Images get their own page.
 */
export function paginate(book: ParsedBook, layout: PageLayout): Page[] {
  const { charsPerLine, height, lineHeightPx, paragraphGapPx } = layout;
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

      let pageStart: number | null = null; // first character on the current page
      let lastEnd = 0; // end of the last character placed on the current page
      let used = 0; // px used on the current page

      const flush = () => {
        if (pageStart === null) return;
        pages.push({
          start: base + pageStart,
          end: base + lastEnd,
          chapterIndex,
          text: text.slice(pageStart, lastEnd).trim(),
        });
        pageStart = null;
        used = 0;
      };

      // Paragraph ranges (separated by blank lines), skipping blank ones.
      const paragraphs: { start: number; end: number }[] = [];
      let cursor = 0;
      for (const piece of text.split("\n\n")) {
        const lead = piece.length - piece.trimStart().length;
        const trimmed = piece.trim();
        if (trimmed.length > 0) {
          paragraphs.push({ start: cursor + lead, end: cursor + lead + trimmed.length });
        }
        cursor += piece.length + 2;
      }

      for (const para of paragraphs) {
        let pos = para.start;
        while (pos < para.end) {
          const need = linesFor(para.end - pos, charsPerLine);
          const gap = pageStart === null ? 0 : paragraphGapPx;
          const avail = height - used - gap;

          if (need * lineHeightPx <= avail) {
            pageStart ??= pos;
            used += gap + need * lineHeightPx;
            lastEnd = para.end;
            pos = para.end;
            break;
          }

          const availLines = Math.floor(avail / lineHeightPx);
          const pageEmpty = pageStart === null;
          const canSplit = pageEmpty ? availLines >= 1 : availLines >= 2 && need - availLines >= 2;
          if (!canSplit) {
            if (pageEmpty) {
              // Degenerate layout (page shorter than one line): force progress.
              pageStart = pos;
              lastEnd = para.end;
              pos = para.end;
              flush();
            } else {
              flush(); // continue this paragraph on a fresh page
            }
            continue;
          }

          // Take as many whole lines as fit, but leave at least two for the next page.
          let takeLines = availLines;
          if (need - takeLines < 2) takeLines = Math.max(1, Math.min(takeLines, need - 2));

          // End on a word boundary.
          let cut = Math.min(
            para.end,
            Math.max(pos + 1, pos + Math.floor(takeLines * charsPerLine * WRAP_SAFETY)),
          );
          const space = text.lastIndexOf(" ", cut);
          if (space > pos) cut = space;
          pageStart ??= pos;
          lastEnd = cut;
          flush();
          pos = cut;
          while (pos < para.end && /\s/.test(text[pos])) pos++;
        }
      }
      flush();
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
