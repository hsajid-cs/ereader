import type { Book } from "@ereader/shared";

export type SortKey = "added" | "title" | "author" | "progress";
export type FilterKey = "all" | "unread" | "reading" | "finished";

export const FINISHED_AT = 98;

export function sortBooks(books: Book[], key: SortKey, progress: Record<string, number>): Book[] {
  const copy = [...books];
  switch (key) {
    case "title":
      return copy.sort((a, b) => a.title.localeCompare(b.title));
    case "author":
      return copy.sort((a, b) => {
        if (!a.author !== !b.author) return a.author ? -1 : 1; // unknown authors last
        return (a.author ?? "").localeCompare(b.author ?? "") || a.title.localeCompare(b.title);
      });
    case "progress":
      // Books in progress first (most recently advanced is unknown, so highest % first), unread last.
      return copy.sort((a, b) => (progress[b.id] ?? 0) - (progress[a.id] ?? 0));
    default:
      return copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

export function filterBooks(
  books: Book[],
  key: FilterKey,
  progress: Record<string, number>,
): Book[] {
  if (key === "all") return books;
  return books.filter((b) => {
    const pct = progress[b.id] ?? 0;
    if (key === "unread") return pct === 0;
    if (key === "finished") return pct >= FINISHED_AT;
    return pct > 0 && pct < FINISHED_AT;
  });
}

const COVER_COLORS = [
  "#8e6c8a",
  "#5b8e7d",
  "#c1666b",
  "#4a6fa5",
  "#d4a373",
  "#6d597a",
  "#3d5a80",
  "#b56576",
];

/** Stable cover colour derived from the title. */
export function coverColor(title: string): string {
  let h = 0;
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) >>> 0;
  return COVER_COLORS[h % COVER_COLORS.length];
}
