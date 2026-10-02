import { stripImages, type ParsedBook } from "./types";

/** Returns the book text between two global offsets (chapters are separated by one offset unit). */
export function textForRange(book: ParsedBook, start: number, end: number): string {
  let base = 0;
  const parts: string[] = [];
  for (const c of book.chapters) {
    const a = Math.max(start, base) - base;
    const b = Math.min(end, base + c.text.length) - base;
    if (b > a) parts.push(c.text.slice(a, b));
    base += c.text.length + 1;
    if (base >= end) break;
  }
  return stripImages(parts.join(" ")).replace(/\s+/g, " ").trim();
}

export function chapterIndexForOffset(book: ParsedBook, offset: number): number {
  let base = 0;
  for (let i = 0; i < book.chapters.length; i++) {
    base += book.chapters[i].text.length + 1;
    if (offset < base) return i;
  }
  return book.chapters.length - 1;
}
