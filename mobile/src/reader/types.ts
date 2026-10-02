export interface Chapter {
  title: string;
  /** Paragraphs separated by blank lines are joined with "\n\n". */
  text: string;
}

export interface ParsedBook {
  chapters: Chapter[];
  /** Image id -> data URI. Chapter text references an image as IMAGE_MARK + id + IMAGE_MARK. */
  images?: Record<string, string>;
}

/** Object replacement character, wrapped around an image id inside chapter text. */
export const IMAGE_MARK = "\uFFFC";
export const IMAGE_RE = /\uFFFC([^\uFFFC]+)\uFFFC/g;

/** Removes image markers, e.g. before speaking or searching text. */
export const stripImages = (text: string) => text.replace(IMAGE_RE, "");

/** If the whole paragraph is one image marker, returns its id. */
export function imageIdOf(paragraph: string): string | null {
  const m = /^\uFFFC([^\uFFFC]+)\uFFFC$/.exec(paragraph.trim());
  return m ? m[1] : null;
}

export interface Page {
  /** Global character offset where this page starts. */
  start: number;
  end: number;
  chapterIndex: number;
  text: string;
  /** True when the page is a single full-page image. */
  figure?: boolean;
}
