import type { Annotation } from "./annotation";
import type { Book } from "./book";
import type { Collection } from "./collection";
import type { ReadingProgress } from "./progress";

export interface SyncDelta {
  books: Book[];
  progress: ReadingProgress[];
  annotations: Annotation[];
  collections: Collection[];
  serverTime: string;
}

export interface ApiErrorBody {
  error: string;
  message: string;
}
