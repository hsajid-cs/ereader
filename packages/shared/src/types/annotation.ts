export type AnnotationType = "HIGHLIGHT" | "NOTE" | "BOOKMARK" | "DRAWING";

export type ReaderTheme = "light" | "dark" | "sepia";

export interface DrawingPoint {
  x: number;
  y: number;
}

export interface DrawingStroke {
  points: DrawingPoint[];
  color: string;
  widthPx: number;
}

export interface DrawingData {
  strokes: DrawingStroke[];
  viewport: { width: number; height: number };
  fontSize: number;
  theme: ReaderTheme;
}

export interface Annotation {
  id: string;
  userId: string;
  bookId: string;
  type: AnnotationType;
  locationStart: string;
  locationEnd: string | null;
  color: string | null;
  noteText: string | null;
  drawingData: DrawingData | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAnnotationRequest {
  type: AnnotationType;
  locationStart: string;
  locationEnd?: string;
  color?: string;
  noteText?: string;
  drawingData?: DrawingData;
}

export interface UpdateAnnotationRequest {
  color?: string;
  noteText?: string;
  drawingData?: DrawingData;
}
