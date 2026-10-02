import type { Annotation } from "@ereader/shared";

import { formatExport } from "./exportNotes";
import { chapterIndexForOffset, textForRange } from "./range";

const book = {
  chapters: [
    { title: "One", text: "Alpha beta gamma." },
    { title: "Two", text: "Delta epsilon." },
  ],
};

test("textForRange handles ranges inside and across chapters", () => {
  expect(textForRange(book, 6, 10)).toBe("beta");
  expect(textForRange(book, 11, 23)).toBe("gamma. Delta");
  expect(chapterIndexForOffset(book, 18)).toBe(1);
});

const ann = (
  id: string,
  type: Annotation["type"],
  s: number,
  e: number,
  noteText: string | null = null,
): Annotation => ({
  id,
  userId: "u",
  bookId: "b",
  type,
  locationStart: String(s),
  locationEnd: String(e),
  color: null,
  noteText,
  drawingData: null,
  createdAt: "",
  updatedAt: "",
});

test("formatExport groups by chapter in reading order", () => {
  const out = formatExport(
    "Book",
    "Me",
    [ann("2", "NOTE", 18, 23, "hm"), ann("1", "HIGHLIGHT", 0, 5)],
    book,
  );
  expect(out).toBe(
    "Book — Me\n2 highlights & notes\n\n## One\n> Alpha\n\n## Two\n> Delta\nNote: hm",
  );
});
