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
