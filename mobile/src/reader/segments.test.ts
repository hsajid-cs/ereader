import { paragraphSpans, segmentParagraph, type Mark } from "./segments";

test("paragraphSpans tracks global offsets", () => {
  const spans = paragraphSpans("Hello world.\n\nSecond.", 100);
  expect(spans).toEqual([
    { text: "Hello world.", start: 100, end: 112 },
    { text: "Second.", start: 114, end: 121 },
  ]);
});

test("segmentParagraph splits around a highlight", () => {
  const span = { text: "Hello world.", start: 100, end: 112 };
  const mark: Mark = { id: "a", start: 106, end: 111, color: "#ff0", isNote: false };
  const segs = segmentParagraph(span, [mark]);
  expect(segs.map((s) => s.text)).toEqual(["Hello ", "world", "."]);
  expect(segs[1].mark?.id).toBe("a");
});

test("marks outside the paragraph are ignored", () => {
  const span = { text: "abc", start: 0, end: 3 };
  expect(
    segmentParagraph(span, [{ id: "x", start: 10, end: 20, color: null, isNote: true }]),
  ).toEqual([{ text: "abc", mark: null }]);
});
