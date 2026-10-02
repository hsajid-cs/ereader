export type BookFormat = "EPUB" | "PDF" | "TXT";

export interface Book {
  id: string;
  userId: string;
  title: string;
  author: string | null;
  format: BookFormat;
  fileSizeBytes: number;
  coverUrl: string | null;
  totalLocations: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBookRequest {
  /** Defaults to the EPUB metadata title, then the file name. */
  title?: string;
  author?: string;
}
