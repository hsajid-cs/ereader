import type {
  Annotation,
  CreateAnnotationRequest,
  CreateReadingSessionRequest,
  UpdateProgressRequest,
} from "@ereader/shared";

export type Op =
  | {
      id: string;
      kind: "createAnnotation";
      bookId: string;
      tempId: string;
      body: CreateAnnotationRequest;
      at: string;
    }
  | { id: string; kind: "deleteAnnotation"; annotationId: string }
  | { id: string; kind: "putProgress"; bookId: string; body: UpdateProgressRequest; at: string }
  | { id: string; kind: "logSession"; body: CreateReadingSessionRequest };

export const TEMP_PREFIX = "local-";
export const isTempId = (id: string) => id.startsWith(TEMP_PREFIX);

let counter = 0;
export const newId = () =>
  `${Date.now().toString(36)}-${(counter++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** Adds an op, coalescing where the result is equivalent. */
export function enqueue(queue: Op[], op: Op): Op[] {
  if (op.kind === "putProgress") {
    return [...queue.filter((o) => !(o.kind === "putProgress" && o.bookId === op.bookId)), op];
  }
  if (op.kind === "deleteAnnotation" && isTempId(op.annotationId)) {
    // The annotation never reached the server: just cancel the pending create.
    return queue.filter((o) => !(o.kind === "createAnnotation" && o.tempId === op.annotationId));
  }
  return [...queue, op];
}

/** Overlays pending operations on a server annotation list so the UI shows local changes. */
export function applyQueue(
  base: Annotation[],
  queue: Op[],
  bookId: string,
  userId: string,
): Annotation[] {
  let list = base;
  for (const op of queue) {
    if (op.kind === "deleteAnnotation") {
      list = list.filter((a) => a.id !== op.annotationId);
    } else if (op.kind === "createAnnotation" && op.bookId === bookId) {
      list = [
        ...list,
        {
          id: op.tempId,
          userId,
          bookId,
          type: op.body.type,
          locationStart: op.body.locationStart,
          locationEnd: op.body.locationEnd ?? null,
          color: op.body.color ?? null,
          noteText: op.body.noteText ?? null,
          drawingData: op.body.drawingData ?? null,
          createdAt: op.at,
          updatedAt: op.at,
        },
      ];
    }
  }
  return list;
}

export interface FlushDeps {
  run: (op: Op) => Promise<void>;
  /** True when the error means "try again later" (offline / 5xx) rather than a permanent rejection. */
  isTransient: (err: unknown) => boolean;
}

/** Runs ops in order. Stops at the first transient failure; drops permanently rejected ops. */
export async function flushQueue(queue: Op[], deps: FlushDeps): Promise<Op[]> {
  const remaining = [...queue];
  while (remaining.length > 0) {
    try {
      await deps.run(remaining[0]);
    } catch (err) {
      if (deps.isTransient(err)) break;
    }
    remaining.shift();
  }
  return remaining;
}
