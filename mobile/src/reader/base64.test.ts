import { bytesToBase64 } from "./base64";
import { pdfHtml } from "./pdfHtml";

test("bytesToBase64 matches Buffer for large inputs", () => {
  const bytes = new Uint8Array(100_000).map((_, i) => i % 256);
  expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString("base64"));
});

test("pdfHtml embeds data and clamps the start page", () => {
  const html = pdfHtml("QUJD", 0, { background: "#fff", text: "#000" });
  expect(html).toContain('atob("QUJD")');
  expect(html).toContain("__goto(1)");
});
