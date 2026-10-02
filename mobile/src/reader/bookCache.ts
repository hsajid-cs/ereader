import { Directory, File, Paths } from "expo-file-system";

import { api } from "../api/client";
import { parseEpub } from "./parseEpub";
import { parseTxt } from "./parseTxt";
import type { ParsedBook } from "./types";

const memory = new Map<string, ParsedBook>();

function localFile(bookId: string, format: string) {
  const dir = new Directory(Paths.document, "books");
  if (!dir.exists) dir.create();
  return new File(dir, `${bookId}.${format.toLowerCase()}`);
}

/** Downloads (once) and parses a book. Throws for unsupported formats. */
export async function loadBook(
  bookId: string,
  format: "EPUB" | "PDF" | "TXT",
): Promise<ParsedBook> {
  const cached = memory.get(bookId);
  if (cached) return cached;
  if (format === "PDF")
    throw new Error("PDF reading is not supported yet. Import an EPUB or TXT file.");

  const file = localFile(bookId, format);
  if (!file.exists) {
    const buf = await api.downloadBook(bookId);
    file.create();
    file.write(new Uint8Array(buf));
  }
  const bytes = await file.bytes();
  const parsed =
    format === "EPUB" ? await parseEpub(bytes) : parseTxt(new TextDecoder("utf-8").decode(bytes));
  memory.set(bookId, parsed);
  return parsed;
}

export function evictBook(bookId: string, format: string) {
  memory.delete(bookId);
  const file = localFile(bookId, format);
  if (file.exists) file.delete();
}
