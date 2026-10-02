import type { Book } from "@ereader/shared";

import { coverColor, filterBooks, sortBooks } from "./library";

const b = (id: string, title: string, author: string | null, createdAt: string): Book => ({
  id,
  userId: "u",
  title,
  author,
  format: "EPUB",
  fileSizeBytes: 1,
  coverUrl: null,
  totalLocations: null,
  createdAt,
  updatedAt: createdAt,
});
const books = [
  b("1", "Zebra", "Ann", "2026-01-01"),
  b("2", "Apple", null, "2026-03-01"),
  b("3", "Mango", "Bob", "2026-02-01"),
];
const progress = { "1": 100, "3": 40 };

test("sortBooks orders by each key", () => {
  expect(sortBooks(books, "added", progress).map((x) => x.id)).toEqual(["2", "3", "1"]);
  expect(sortBooks(books, "title", progress).map((x) => x.id)).toEqual(["2", "3", "1"]);
  expect(sortBooks(books, "author", progress).map((x) => x.id)).toEqual(["1", "3", "2"]);
  expect(sortBooks(books, "progress", progress).map((x) => x.id)).toEqual(["1", "3", "2"]);
});

test("filterBooks splits unread / reading / finished", () => {
  expect(filterBooks(books, "unread", progress).map((x) => x.id)).toEqual(["2"]);
  expect(filterBooks(books, "reading", progress).map((x) => x.id)).toEqual(["3"]);
  expect(filterBooks(books, "finished", progress).map((x) => x.id)).toEqual(["1"]);
});

test("coverColor is stable", () => {
  expect(coverColor("Dune")).toBe(coverColor("Dune"));
});
