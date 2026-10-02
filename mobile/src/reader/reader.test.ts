import JSZip from "jszip";

import { decodeEntities, htmlToText, parseEpub } from "./parseEpub";
import { parseTxt } from "./parseTxt";
import { estimateCharsPerPage, pageIndexForOffset, paginate } from "./paginate";

test("parseTxt splits chapters and joins wrapped lines", () => {
  const book = parseTxt("Chapter 1\nHello\nworld.\n\nSecond para.\n\nChapter 2\nBye.");
  expect(book.chapters.map((c) => c.title)).toEqual(["Chapter 1", "Chapter 2"]);
  expect(book.chapters[0].text).toBe("Chapter 1 Hello world.\n\nSecond para.");
});

test("htmlToText strips tags and decodes entities", () => {
  const { text, heading } = htmlToText(
    "<body><h1>Intro</h1><p>A &amp; B&#8217;s</p><p>Two</p></body>",
  );
  expect(heading).toBe("Intro");
  expect(text).toBe("Intro\n\nA & B’s\n\nTwo");
  expect(decodeEntities("&lt;x&gt;")).toBe("<x>");
});

test("parseEpub reads spine order", async () => {
  const zip = new JSZip();
  zip.file(
    "META-INF/container.xml",
    '<container><rootfiles><rootfile full-path="OEBPS/c.opf"/></rootfiles></container>',
  );
  zip.file(
    "OEBPS/c.opf",
    '<package><manifest><item id="b" href="b.xhtml"/><item id="a" href="a.xhtml"/></manifest><spine><itemref idref="a"/><itemref idref="b"/></spine></package>',
  );
  zip.file("OEBPS/a.xhtml", "<body><h1>One</h1><p>first</p></body>");
  zip.file("OEBPS/b.xhtml", "<body><h1>Two</h1><p>second</p></body>");
  const book = await parseEpub(await zip.generateAsync({ type: "uint8array" }));
  expect(book.chapters.map((c) => c.title)).toEqual(["One", "Two"]);
});

test("paginate covers all text with monotonically increasing offsets", () => {
  const text = Array.from({ length: 40 }, (_, i) => `Sentence number ${i}. `).join("");
  const pages = paginate({ chapters: [{ title: "t", text }] }, 100);
  expect(pages.length).toBeGreaterThan(5);
  for (let i = 1; i < pages.length; i++) expect(pages[i].start).toBeGreaterThan(pages[i - 1].start);
  expect(
    pages
      .map((p) => p.text)
      .join(" ")
      .replace(/\s+/g, " "),
  ).toBe(text.trim().replace(/\s+/g, " "));
  expect(pageIndexForOffset(pages, pages[3].start + 1)).toBe(3);
  expect(pageIndexForOffset(pages, 0)).toBe(0);
});

test("larger fonts give fewer chars per page", () => {
  expect(estimateCharsPerPage(360, 600, 24)).toBeLessThan(estimateCharsPerPage(360, 600, 16));
});

import { IMAGE_MARK, imageIdOf, stripImages } from "./types";

test("parseEpub extracts real images, resolves relative paths and drops tiny/svg ones", async () => {
  const big = new Uint8Array(6000).fill(7);
  const zip = new JSZip();
  zip.file(
    "META-INF/container.xml",
    '<container><rootfiles><rootfile full-path="OEBPS/c.opf"/></rootfiles></container>',
  );
  zip.file(
    "OEBPS/c.opf",
    '<package><manifest><item id="a" href="text/a.xhtml"/><item id="p" href="images/pic.png" media-type="image/png"/></manifest><spine><itemref idref="a"/></spine></package>',
  );
  zip.file(
    "OEBPS/text/a.xhtml",
    '<body><h1>Pics</h1><p>Before.</p><img src="../images/pic.png" alt="x"/><p>Middle.</p><img src="../images/tiny.png"/><img src="../images/art.svg"/><p>After.</p></body>',
  );
  zip.file("OEBPS/images/pic.png", big);
  zip.file("OEBPS/images/tiny.png", new Uint8Array(100));
  zip.file("OEBPS/images/art.svg", "<svg/>");
  const book = await parseEpub(await zip.generateAsync({ type: "uint8array" }));

  expect(Object.keys(book.images ?? {})).toEqual(["img0"]);
  expect(book.images?.img0.startsWith("data:image/png;base64,")).toBe(true);
  const paragraphs = book.chapters[0].text.split("\n\n");
  expect(paragraphs).toEqual([
    "Pics",
    "Before.",
    `${IMAGE_MARK}img0${IMAGE_MARK}`,
    "Middle.",
    "After.",
  ]);
  expect(imageIdOf(paragraphs[2])).toBe("img0");
  expect(imageIdOf(paragraphs[1])).toBeNull();
  expect(stripImages(book.chapters[0].text)).not.toContain(IMAGE_MARK);
});

test("paginate puts each image on its own figure page and keeps offsets consistent", () => {
  const marker = `${IMAGE_MARK}img0${IMAGE_MARK}`;
  const text = `First part of the text.\n\n${marker}\n\nSecond part of the text.`;
  const pages = paginate({ chapters: [{ title: "t", text }] }, 1000);
  expect(pages.map((p) => !!p.figure)).toEqual([false, true, false]);
  expect(pages[1].text).toBe(marker);
  for (const pg of pages) expect(text.slice(pg.start, pg.end).trim()).toBe(pg.text);
  expect(pageIndexForOffset(pages, pages[1].start)).toBe(1);
});

import { charsPerLineFromProbe, charsPerPageFromProbe, PROBE_TEXT } from "./paginate";

test("probe measurement converts to a page capacity", () => {
  // The probe wrapped into 6 lines of 18pt/1.5 text.
  const cpl = charsPerLineFromProbe(6 * 18 * 1.5, 18, 1.5);
  expect(cpl).toBeCloseTo(PROBE_TEXT.length / 6);
  // 20 lines fit; 8% is held back for ragged edges and paragraph gaps.
  expect(charsPerPageFromProbe(cpl, 20 * 27, 18, 1.5)).toBe(Math.floor(cpl * 20 * 0.92));
  expect(charsPerPageFromProbe(10, 1, 18, 1.5)).toBeGreaterThanOrEqual(100);
});
