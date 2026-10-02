import { enqueue, applyQueue, flushQueue, type Op } from "../offline/queue";
import { searchBook } from "./search";
import { cleanWord, tokenizeWords } from "./words";

const book = {
  chapters: [
    { title: "a", text: "The cat sat." },
    { title: "b", text: "Another Cat appears." },
  ],
};

test("searchBook is case-insensitive and offsets span chapters", () => {
  const hits = searchBook(book, "cat");
  expect(hits.map((h) => h.offset)).toEqual([4, 13 + 8]);
  expect(hits[1].chapterIndex).toBe(1);
  expect(searchBook(book, "c")).toEqual([]);
});

test("tokenizeWords keeps offsets and cleanWord strips punctuation", () => {
  const w = tokenizeWords("Hi, there!", 10);
  expect(w.map((x) => [x.start, x.end])).toEqual([
    [10, 14],
    [14, 20],
  ]);
  expect(cleanWord("“There!”")).toBe("there");
});

test("enqueue coalesces progress and cancels temp annotations", () => {
  let q: Op[] = [];
  q = enqueue(q, {
    id: "1",
    kind: "putProgress",
    bookId: "b",
    body: { location: "1", percentage: 1 },
    at: "t",
  });
  q = enqueue(q, {
    id: "2",
    kind: "putProgress",
    bookId: "b",
    body: { location: "9", percentage: 9 },
    at: "t",
  });
  expect(q).toHaveLength(1);
  q = enqueue(q, {
    id: "3",
    kind: "createAnnotation",
    bookId: "b",
    tempId: "local-x",
    body: { type: "BOOKMARK", locationStart: "5" },
    at: "t",
  });
  expect(applyQueue([], q, "b", "u").map((a) => a.id)).toEqual(["local-x"]);
  q = enqueue(q, { id: "4", kind: "deleteAnnotation", annotationId: "local-x" });
  expect(q.map((o) => o.id)).toEqual(["2"]);
});

test("flushQueue stops on transient errors and drops permanent ones", async () => {
  const q: Op[] = [
    { id: "a", kind: "deleteAnnotation", annotationId: "1" },
    { id: "b", kind: "deleteAnnotation", annotationId: "2" },
    { id: "c", kind: "deleteAnnotation", annotationId: "3" },
  ];
  const ran: string[] = [];
  const rest = await flushQueue(q, {
    run: async (op) => {
      ran.push(op.id);
      if (op.id === "a") throw new Error("permanent");
      if (op.id === "c") throw new Error("offline");
    },
    isTransient: (e) => (e as Error).message === "offline",
  });
  expect(ran).toEqual(["a", "b", "c"]);
  expect(rest.map((o) => o.id)).toEqual(["c"]);
});

test("search ignores image markers", () => {
  const withImage = {
    chapters: [{ title: "a", text: "Look at this.\n\n￼img0￼\n\nThe cat img0." }],
  };
  const hits = searchBook(withImage, "img0");
  expect(hits).toHaveLength(1); // only the real text match, not the marker
  expect(hits[0].snippet).not.toContain("￼");
});

test("snippets start and end on word boundaries", () => {
  const book = {
    chapters: [
      {
        title: "a",
        text: "Alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november",
      },
    ],
  };
  const [hit] = searchBook(book, "golf");
  expect(
    hit.snippet
      .replace(/…/g, "")
      .trim()
      .split(" ")
      .every((w) => /^[a-z]+$/.test(w)),
  ).toBe(true);
  expect(hit.snippet.startsWith("…")).toBe(true);
  expect(hit.snippet).toContain("golf");
});
