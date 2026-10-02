import type { Book } from "@ereader/shared";
import { Directory, File, Paths } from "expo-file-system";

import { fetchBinary } from "../api/client";
import { bytesToBase64 } from "../reader/base64";

export function sniffImageMime(bytes: Uint8Array): string {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif";
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46)
    return "image/webp";
  return "image/jpeg";
}

const memory = new Map<string, Promise<string | null>>();

function coverFile(bookId: string) {
  const dir = new Directory(Paths.document, "covers");
  if (!dir.exists) dir.create();
  return new File(dir, `${bookId}.img`);
}

/**
 * Data URI for a book's cover, from the disk cache or the server (authenticated).
 * Resolves to null when the book has no cover or it cannot be loaded.
 */
export function loadCover(book: Pick<Book, "id" | "coverUrl">): Promise<string | null> {
  if (!book.coverUrl) return Promise.resolve(null);
  let pending = memory.get(book.id);
  if (!pending) {
    pending = (async () => {
      try {
        const file = coverFile(book.id);
        let bytes: Uint8Array;
        if (file.exists) {
          bytes = await file.bytes();
        } else {
          bytes = new Uint8Array(await fetchBinary(book.coverUrl!.replace(/^\/api/, "")));
          file.create();
          file.write(bytes);
        }
        return `data:${sniffImageMime(bytes)};base64,${bytesToBase64(bytes)}`;
      } catch {
        memory.delete(book.id); // allow a retry next time (e.g. back online)
        return null;
      }
    })();
    memory.set(book.id, pending);
  }
  return pending;
}

export function forgetCover(bookId: string) {
  memory.delete(bookId);
  const file = coverFile(bookId);
  if (file.exists) file.delete();
}
