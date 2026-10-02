import fs from "node:fs";
import JSZip from "jszip";

const API = (process.env.SERVER ?? "http://localhost:4001") + "/api";
const email = `harness-${Date.now()}@example.com`;
const para = (i) =>
  `Paragraph ${i}. The quick brown fox jumps over the lazy dog while the reader keeps turning pages, noticing how the words flow across the screen and how each sentence ends with a quiet full stop. It was a bright cold day in April, and the clocks were striking thirteen.`;

const zip = new JSZip();
zip.file("mimetype", "application/epub+zip");
zip.file(
  "META-INF/container.xml",
  '<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>',
);
const icon = fs.readFileSync(new URL("../assets/icon.png", import.meta.url));
zip.file("OEBPS/images/cover.png", icon);
zip.file(
  "OEBPS/content.opf",
  `<package><metadata><dc:title>Harness Test Book</dc:title><dc:creator>Test Author</dc:creator><meta name="cover" content="cover"/></metadata>
   <manifest><item id="cover" href="images/cover.png" media-type="image/png"/><item id="c1" href="c1.xhtml"/><item id="c2" href="c2.xhtml"/></manifest>
   <spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>`,
);
zip.file(
  "OEBPS/c1.xhtml",
  `<body><h1>Chapter One</h1>${Array.from({ length: 14 }, (_, i) => `<p>${para(i)}</p>`).join("")}<img src="images/cover.png"/>${Array.from({ length: 6 }, (_, i) => `<p>${para(i + 14)}</p>`).join("")}</body>`,
);
zip.file(
  "OEBPS/c2.xhtml",
  `<body><h1>Chapter Two</h1>${Array.from({ length: 12 }, (_, i) => `<p>${para(i)}</p>`).join("")}</body>`,
);
const epub = await zip.generateAsync({ type: "nodebuffer" });

const reg = await (
  await fetch(`${API}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "password123" }),
  })
).json();
const form = new FormData();
form.append("file", new Blob([epub]), "harness.epub");
const up = await fetch(`${API}/books`, {
  method: "POST",
  headers: { Authorization: `Bearer ${reg.accessToken}` },
  body: form,
});
const book = await up.json();
const H = { "Content-Type": "application/json", Authorization: `Bearer ${reg.accessToken}` };
const ann = (body) =>
  fetch(`${API}/books/${book.id}/annotations`, {
    method: "POST",
    headers: H,
    body: JSON.stringify(body),
  });
await ann({ type: "HIGHLIGHT", locationStart: "13", locationEnd: "45", color: "#fff176" });
await ann({ type: "HIGHLIGHT", locationStart: "190", locationEnd: "230", color: "#90caf9" });
await ann({
  type: "NOTE",
  locationStart: "300",
  locationEnd: "340",
  noteText: "Remember this line",
});
await ann({ type: "BOOKMARK", locationStart: "0" });
await fetch(`${API}/stats/sessions`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({
    bookId: book.id,
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    durationSeconds: 1500,
  }),
});
console.log(JSON.stringify({ email, status: up.status, id: book.id }));
