import type { Annotation } from "@prisma/client";

export function toAnnotationDto(annotation: Annotation) {
  return {
    id: annotation.id,
    userId: annotation.userId,
    bookId: annotation.bookId,
    type: annotation.type,
    locationStart: annotation.locationStart,
    locationEnd: annotation.locationEnd,
    color: annotation.color,
    noteText: annotation.noteText,
    drawingData: annotation.drawingData,
    createdAt: annotation.createdAt.toISOString(),
    updatedAt: annotation.updatedAt.toISOString(),
  };
}
