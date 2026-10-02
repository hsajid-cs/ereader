export interface Mark {
  id: string;
  start: number;
  end: number;
  color: string | null;
  isNote: boolean;
}

export interface Segment {
  text: string;
  mark: Mark | null;
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

/** Cuts a paragraph into plain and marked segments. Later marks win on overlap. */
export function segmentParagraph(span: ParagraphSpan, marks: Mark[]): Segment[] {
  const owner: (Mark | null)[] = new Array(span.text.length).fill(null);
  for (const m of marks) {
    const from = Math.max(m.start, span.start) - span.start;
    const to = Math.min(m.end, span.end) - span.start;
    for (let i = from; i < to; i++) owner[i] = m;
  }
  const out: Segment[] = [];
  let i = 0;
  while (i < span.text.length) {
    let j = i + 1;
    while (j < span.text.length && owner[j] === owner[i]) j++;
    out.push({ text: span.text.slice(i, j), mark: owner[i] });
    i = j;
  }
  return out;
}
