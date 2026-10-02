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

/** Returns the book file's bytes, downloading and caching on first use. */
export async function loadBookBytes(
  bookId: string,
  format: "EPUB" | "PDF" | "TXT",
): Promise<Uint8Array> {
  const file = localFile(bookId, format);
  if (!file.exists) {
    const buf = await api.downloadBook(bookId);
    file.create();
    file.write(new Uint8Array(buf));
  }
  return file.bytes();
}

/** Downloads (once) and parses a text-based book. PDFs use the PDF viewer instead. */
export async function loadBook(
  bookId: string,
  format: "EPUB" | "PDF" | "TXT",
): Promise<ParsedBook> {
  const cached = memory.get(bookId);
  if (cached) return cached;
  if (format === "PDF") throw new Error("PDFs are shown in the PDF viewer");

  const bytes = await loadBookBytes(bookId, format);
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
