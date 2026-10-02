import JSZip from "jszip";

import { readEpubMeta } from "../src/modules/books/epubMeta";

async function makeEpub(opf: string, extra: Record<string, string | Buffer> = {}) {
  const zip = new JSZip();
  zip.file("META-INF/container.xml", '<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>');
  zip.file("OEBPS/content.opf", opf);
  for (const [name, data] of Object.entries(extra)) zip.file(name, data);
  return zip.generateAsync({ type: "nodebuffer" });
}

describe("readEpubMeta", () => {
  it("reads title, author and a cover declared via <meta name=cover>", async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const epub = await makeEpub(
      `<package><metadata><dc:title>Tom &amp; Jerry</dc:title><dc:creator opf:role="aut">A. Writer</dc:creator><meta name="cover" content="img1"/></metadata>
       <manifest><item id="img1" href="images/c.png" media-type="image/png"/></manifest></package>`,
      { "OEBPS/images/c.png": png },
    );
    const meta = await readEpubMeta(epub);
    expect(meta.title).toBe("Tom & Jerry");
    expect(meta.author).toBe("A. Writer");
    expect(meta.cover?.contentType).toBe("image/png");
    expect(meta.cover?.data.equals(png)).toBe(true);
  });

  it("finds EPUB3 cover-image property", async () => {
    const epub = await makeEpub(
      `<package><metadata><dc:title>T</dc:title></metadata><manifest><item id="x" href="c.jpg" media-type="image/jpeg" properties="cover-image"/></manifest></package>`,
      { "OEBPS/c.jpg": Buffer.from("jpg") },
    );
    expect((await readEpubMeta(epub)).cover?.ext).toBe("jpg");
  });

  it("returns empty for non-epub data", async () => {
    expect(await readEpubMeta(Buffer.from("not a zip"))).toEqual({});
  });
});
