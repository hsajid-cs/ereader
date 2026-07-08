import type { Book } from "@prisma/client";

export function toBookDto(book: Book) {
  return {
    id: book.id,
    userId: book.userId,
    title: book.title,
    author: book.author,
    format: book.format,
    fileSizeBytes: book.fileSizeBytes,
    coverUrl: book.coverStorageKey ? `/api/books/${book.id}/cover` : null,
    totalLocations: book.totalLocations,
    createdAt: book.createdAt.toISOString(),
    updatedAt: book.updatedAt.toISOString(),
  };
}
