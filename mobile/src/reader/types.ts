export interface Chapter {
  title: string;
  /** Paragraphs separated by blank lines are joined with "\n\n". */
  text: string;
}

export interface ParsedBook {
  chapters: Chapter[];
}

export interface Page {
  /** Global character offset where this page starts. */
  start: number;
  end: number;
  chapterIndex: number;
  text: string;
}
