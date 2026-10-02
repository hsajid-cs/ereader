import JSZip from "jszip";

import { decodeEntities, htmlToText, parseEpub } from "./parseEpub";
import { parseTxt } from "./parseTxt";

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
