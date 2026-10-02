import { paginate } from "./paginate";
import { searchBook } from "./search";
import { tokenizeWords } from "./words";

// ~2 MB of text: a long novel. Generous thresholds, aimed at catching accidental O(n^2) behaviour.
const words = [
  "the",
  "quick",
  "brown",
  "fox",
  "jumps",
  "over",
  "lazy",
  "dog",
  "while",
  "readers",
  "turn",
  "pages",
];
function chapter(seed: number, paragraphs: number) {
  let s = seed;
  const next = () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  return Array.from({ length: paragraphs }, () =>
    Array.from(
      { length: 30 + Math.floor(next() * 120) },
      () => words[Math.floor(next() * words.length)],
    ).join(" "),
  ).join("\n\n");
}
const book = {
  chapters: Array.from({ length: 40 }, (_, i) => ({
    title: `Chapter ${i}`,
    text: chapter(i + 1, 80),
  })),
};
const chars = book.chapters.reduce((n, c) => n + c.text.length, 0);

function time<T>(fn: () => T): [T, number] {
  const t = performance.now();
  const r = fn();
  return [r, performance.now() - t];
}

test(`paginates ${Math.round(chars / 1e6)}M characters quickly`, () => {
  expect(chars).toBeGreaterThan(1_000_000);
  const [pages, ms] = time(() =>
    paginate(book, { charsPerLine: 38, height: 560, lineHeightPx: 27, paragraphGapPx: 9 }),
  );
  expect(pages.length).toBeGreaterThan(1000);
  expect(ms).toBeLessThan(1500);
});

test("searches the whole book quickly", () => {
  const [hits, ms] = time(() => searchBook(book, "lazy dog"));
  expect(hits.length).toBeGreaterThan(0);
  expect(ms).toBeLessThan(1000);
});

test("tokenizing a page of text is trivial", () => {
  const [, ms] = time(() => tokenizeWords(book.chapters[0].text.slice(0, 3000), 0));
  expect(ms).toBeLessThan(50);
});
