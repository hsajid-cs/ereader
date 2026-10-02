import { paragraphSpans } from "./segments";

test("paragraphSpans tracks global offsets", () => {
  const spans = paragraphSpans("Hello world.\n\nSecond.", 100);
  expect(spans).toEqual([
    { text: "Hello world.", start: 100, end: 112 },
    { text: "Second.", start: 114, end: 121 },
  ]);
});
