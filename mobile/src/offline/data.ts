import type { Annotation, CreateAnnotationRequest, ReadingProgress } from "@ereader/shared";

import { api } from "../api/client";
import { applyQueue, TEMP_PREFIX } from "./queue";
import { addOp, cached, getQueue, newId } from "./store";

export async function loadAnnotations(bookId: string, userId: string): Promise<Annotation[]> {
  let base: Annotation[];
  try {
    base = await cached(`annotations:${bookId}`, () => api.listAnnotations(bookId));
  } catch {
    base = [];
  }
  return applyQueue(base, await getQueue(), bookId, userId);
}

export async function createAnnotation(bookId: string, body: CreateAnnotationRequest) {
  await addOp({
    id: newId(),
    kind: "createAnnotation",
    bookId,
    tempId: `${TEMP_PREFIX}${newId()}`,
    body,
    at: new Date().toISOString(),
  });
}

export async function deleteAnnotation(annotationId: string) {
  await addOp({ id: newId(), kind: "deleteAnnotation", annotationId });
}

export async function loadProgress(
  bookId: string,
): Promise<Pick<ReadingProgress, "location" | "percentage"> | null> {
  const pending = (await getQueue()).find((o) => o.kind === "putProgress" && o.bookId === bookId);
  if (pending && pending.kind === "putProgress") return pending.body;
  return cached(`progress:${bookId}`, () => api.getProgress(bookId));
}

export async function saveProgress(bookId: string, location: string, percentage: number) {
  await addOp({
    id: newId(),
    kind: "putProgress",
    bookId,
    body: { location, percentage },
    at: new Date().toISOString(),
  });
}

export async function logSession(body: {
  bookId: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
}) {
  await addOp({ id: newId(), kind: "logSession", body });
}
