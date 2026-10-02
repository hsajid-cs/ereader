export interface Mark {
  id: string;
  start: number;
  end: number;
  color: string | null;
  isNote: boolean;
}

export interface ParagraphSpan {
  text: string;
  start: number;
  end: number;
}

/** Splits page text into paragraphs, tracking their global character offsets. */
export function paragraphSpans(pageText: string, pageStart: number): ParagraphSpan[] {
  const spans: ParagraphSpan[] = [];
  let cursor = 0;
  for (const part of pageText.split("\n\n")) {
    const idx = pageText.indexOf(part, cursor);
    spans.push({ text: part, start: pageStart + idx, end: pageStart + idx + part.length });
    cursor = idx + part.length;
  }
  return spans.filter((s) => s.text.length > 0);
}
