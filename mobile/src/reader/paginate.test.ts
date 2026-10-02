import {
  charsPerLineFromProbe,
  estimateCharsPerLine,
  pageIndexForOffset,
  paginate,
  PROBE_TEXT,
  type PageLayout,
} from "./paginate";
import { IMAGE_MARK, type Page } from "./types";

// Ten lines of 10px per page, 20 characters per line (about 19 after the wrap allowance), 5px paragraph gaps.
const L: PageLayout = { charsPerLine: 20, height: 100, lineHeightPx: 10, paragraphGapPx: 5 };
const WRAP = 0.96;
const lines = (len: number, cpl = L.charsPerLine) => Math.max(1, Math.ceil(len / (cpl * WRAP)));

/** Height of a page under the same model the paginator uses. */
function modelHeight(page: Page, layout = L): number {
  const paras = page.text.split("\n\n");
  return (
    paras.reduce((h, p) => h + lines(p.length, layout.charsPerLine) * layout.lineHeightPx, 0) +
    (paras.length - 1) * layout.paragraphGapPx
  );
}

// Small deterministic PRNG so the property tests are reproducible.
function rng(seed: number) {
  return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

function randomChapter(seed: number, paragraphs: number): string {
  const r = rng(seed);
  const words = [
    "alpha",
    "bravo",
    "charlie",
    "delta",
    "echo",
    "foxtrot",
    "golf",
    "hotel",
    "india",
    "juliet",
  ];
  return Array.from({ length: paragraphs }, () =>
    Array.from(
      { length: 1 + Math.floor(r() * 60) },
      () => words[Math.floor(r() * words.length)],
    ).join(" "),
  ).join("\n\n");
}

const norm = (t: string) => t.replace(/\s+/g, " ").trim();

describe("paginate", () => {
  const text = randomChapter(7, 40);
  const book = { chapters: [{ title: "t", text }] };
  const pages = paginate(book, L);

  it("never lets a page exceed the height budget", () => {
    expect(pages.length).toBeGreaterThan(10);
    for (const pg of pages) expect(modelHeight(pg)).toBeLessThanOrEqual(L.height);
  });

  it("holds under many random books and layouts", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const layout: PageLayout = {
        charsPerLine: 15 + (seed % 30),
        height: 60 + (seed % 7) * 40,
        lineHeightPx: 10 + (seed % 3) * 4,
        paragraphGapPx: seed % 12,
      };
      const t = randomChapter(seed, 30);
      const ps = paginate({ chapters: [{ title: "t", text: t }] }, layout);
      for (const pg of ps) expect(modelHeight(pg, layout)).toBeLessThanOrEqual(layout.height);
      expect(norm(ps.map((p) => p.text).join(" "))).toBe(norm(t));
    }
  });

  it("covers all the text exactly once, in order", () => {
    expect(norm(pages.map((p) => p.text).join(" "))).toBe(norm(text));
  });

  it("reports exact offsets", () => {
    for (const pg of pages) expect(text.slice(pg.start, pg.end).trim()).toBe(pg.text);
    for (let i = 1; i < pages.length; i++) {
      expect(pages[i].start).toBeGreaterThan(pages[i - 1].start);
      expect(pages[i].start).toBeGreaterThanOrEqual(pages[i - 1].end);
    }
    expect(pageIndexForOffset(pages, pages[3].start + 1)).toBe(3);
    expect(pageIndexForOffset(pages, 0)).toBe(0);
  });

  it("starts pages on word boundaries", () => {
    for (const pg of pages) expect(pg.start === 0 || /\s/.test(text[pg.start - 1])).toBe(true);
  });

  it("splits paragraphs without leaving single-line widows or orphans", () => {
    let splits = 0;
    for (let i = 0; i + 1 < pages.length; i++) {
      const between = text.slice(pages[i].end, pages[i + 1].start);
      if (between.includes("\n\n")) continue; // the page break fell on a paragraph boundary
      splits++;
      const tail = pages[i].text.split("\n\n").at(-1)!;
      const head = pages[i + 1].text.split("\n\n")[0];
      expect(lines(tail.length)).toBeGreaterThanOrEqual(2);
      expect(lines(head.length)).toBeGreaterThanOrEqual(2);
    }
    expect(splits).toBeGreaterThan(0); // the test actually exercised paragraph splitting
  });

  it("gives more pages for taller lines and larger gaps", () => {
    const base = pages.length;
    expect(paginate(book, { ...L, lineHeightPx: 14 }).length).toBeGreaterThan(base);
    expect(paginate(book, { ...L, paragraphGapPx: 12 }).length).toBeGreaterThanOrEqual(base);
    expect(paginate(book, { ...L, height: 200 }).length).toBeLessThan(base);
  });

  it("starts each chapter on a new page", () => {
    const two = paginate(
      {
        chapters: [
          { title: "a", text: "short one" },
          { title: "b", text: "short two" },
        ],
      },
      L,
    );
    expect(two.map((p) => [p.chapterIndex, p.text])).toEqual([
      [0, "short one"],
      [1, "short two"],
    ]);
  });

  it("terminates on degenerate layouts and still covers the text", () => {
    const tiny: PageLayout = { charsPerLine: 1, height: 5, lineHeightPx: 10, paragraphGapPx: 20 };
    const t = "one two three\n\nfour five";
    const ps = paginate({ chapters: [{ title: "t", text: t }] }, tiny);
    expect(ps.length).toBeGreaterThan(0);
    expect(norm(ps.map((p) => p.text).join(" "))).toBe(norm(t));
  });

  it("puts each image on its own figure page between the surrounding text", () => {
    const marker = `${IMAGE_MARK}img0${IMAGE_MARK}`;
    const t = `First part of the text.\n\n${marker}\n\nSecond part of the text.`;
    const ps = paginate({ chapters: [{ title: "t", text: t }] }, L);
    expect(ps.map((p) => !!p.figure)).toEqual([false, true, false]);
    expect(ps[1].text).toBe(marker);
    for (const pg of ps) expect(t.slice(pg.start, pg.end).trim()).toBe(pg.text);
  });
});

describe("measuring", () => {
  it("estimates fewer characters per line for larger fonts", () => {
    expect(estimateCharsPerLine(360, 24)).toBeLessThan(estimateCharsPerLine(360, 16));
    expect(estimateCharsPerLine(10, 40)).toBeGreaterThanOrEqual(10);
  });

  it("derives characters per line from the measured probe height", () => {
    // The probe wrapped into 9 lines of 18pt / 1.5 text.
    expect(charsPerLineFromProbe(9 * 18 * 1.5, 18, 1.5)).toBeCloseTo(PROBE_TEXT.length / 9);
    expect(charsPerLineFromProbe(0, 18, 1.5)).toBe(PROBE_TEXT.length); // never divides by zero
  });
});
