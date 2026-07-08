import { Router } from "express";
import type { Request } from "express";
import { z } from "zod";

import { prisma } from "../../db/prisma";
import { requireAuth } from "../../middleware/auth";
import { ApiError } from "../../middleware/errorHandler";
import { validateBody } from "../../middleware/validate";
import { toAnnotationDto } from "./dto";

const annotationTypeSchema = z.enum(["HIGHLIGHT", "NOTE", "BOOKMARK", "DRAWING"]);

const drawingDataSchema = z.object({
  strokes: z.array(
    z.object({
      points: z.array(z.object({ x: z.number(), y: z.number() })),
      color: z.string(),
      widthPx: z.number(),
    }),
  ),
  viewport: z.object({ width: z.number(), height: z.number() }),
  fontSize: z.number(),
  theme: z.enum(["light", "dark", "sepia"]),
});

const createSchema = z.object({
  type: annotationTypeSchema,
  locationStart: z.string().min(1),
  locationEnd: z.string().optional(),
  color: z.string().optional(),
  noteText: z.string().optional(),
  drawingData: drawingDataSchema.optional(),
});

const updateSchema = z.object({
  color: z.string().optional(),
  noteText: z.string().optional(),
  drawingData: drawingDataSchema.optional(),
});

async function assertOwnsBook(userId: string, bookId: string) {
  const book = await prisma.book.findUnique({ where: { id: bookId } });
  if (!book || book.userId !== userId) {
    throw new ApiError(404, "not_found", "Book not found");
  }
}

async function loadOwnedAnnotation(userId: string, id: string) {
  const annotation = await prisma.annotation.findUnique({ where: { id } });
  if (!annotation || annotation.userId !== userId) {
    throw new ApiError(404, "not_found", "Annotation not found");
  }
  return annotation;
}

export const bookAnnotationsRouter = Router({ mergeParams: true });
bookAnnotationsRouter.use(requireAuth);

bookAnnotationsRouter.get(
  "/:bookId/annotations",
  async (req: Request<{ bookId: string }>, res, next) => {
    try {
      await assertOwnsBook(req.userId!, req.params.bookId);
      const type = typeof req.query.type === "string" ? req.query.type : undefined;
      const annotations = await prisma.annotation.findMany({
        where: { bookId: req.params.bookId, ...(type ? { type: type as never } : {}) },
        orderBy: { createdAt: "asc" },
      });
      res.json(annotations.map(toAnnotationDto));
    } catch (err) {
      next(err);
    }
  },
);

bookAnnotationsRouter.post(
  "/:bookId/annotations",
  validateBody(createSchema),
  async (req: Request<{ bookId: string }>, res, next) => {
    try {
      await assertOwnsBook(req.userId!, req.params.bookId);
      const annotation = await prisma.annotation.create({
        data: {
          userId: req.userId!,
          bookId: req.params.bookId,
          type: req.body.type,
          locationStart: req.body.locationStart,
          locationEnd: req.body.locationEnd,
          color: req.body.color,
          noteText: req.body.noteText,
          drawingData: req.body.drawingData,
        },
      });
      res.status(201).json(toAnnotationDto(annotation));
    } catch (err) {
      next(err);
    }
  },
);

export const annotationsRouter = Router();
annotationsRouter.use(requireAuth);

annotationsRouter.get("/", async (req, res, next) => {
  try {
    const type = typeof req.query.type === "string" ? req.query.type : undefined;
    const bookId = typeof req.query.bookId === "string" ? req.query.bookId : undefined;
    const annotations = await prisma.annotation.findMany({
      where: {
        userId: req.userId!,
        ...(type ? { type: type as never } : {}),
        ...(bookId ? { bookId } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(annotations.map(toAnnotationDto));
  } catch (err) {
    next(err);
  }
});

annotationsRouter.patch(
  "/:id",
  validateBody(updateSchema),
  async (req: Request<{ id: string }>, res, next) => {
    try {
      await loadOwnedAnnotation(req.userId!, req.params.id);
      const annotation = await prisma.annotation.update({
        where: { id: req.params.id },
        data: req.body,
      });
      res.json(toAnnotationDto(annotation));
    } catch (err) {
      next(err);
    }
  },
);

annotationsRouter.delete("/:id", async (req: Request<{ id: string }>, res, next) => {
  try {
    await loadOwnedAnnotation(req.userId!, req.params.id);
    await prisma.annotation.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
