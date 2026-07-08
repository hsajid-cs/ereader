import type { BookFormat } from "@prisma/client";

import { ApiError } from "../../middleware/errorHandler";

const EXTENSION_TO_FORMAT: Record<string, BookFormat> = {
  epub: "EPUB",
  pdf: "PDF",
  txt: "TXT",
};

export function inferFormat(filename: string): BookFormat {
  const ext = filename.split(".").pop()?.toLowerCase();
  const format = ext ? EXTENSION_TO_FORMAT[ext] : undefined;
  if (!format) {
    throw new ApiError(400, "unsupported_format", "Only .epub, .pdf, and .txt files are supported");
  }
  return format;
}

export function extensionForFormat(format: BookFormat): string {
  return format.toLowerCase();
}
