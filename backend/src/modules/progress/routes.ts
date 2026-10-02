import { Router } from "express";
import type { Request } from "express";
import { z } from "zod";

import { prisma } from "../../db/prisma";
import { requireAuth } from "../../middleware/auth";
import { ApiError } from "../../middleware/errorHandler";
import { validateBody } from "../../middleware/validate";

const router = Router({ mergeParams: true });
router.use(requireAuth);

function toProgressDto(progress: {
  bookId: string;
  userId: string;
  location: string;
  percentage: number;
  updatedAt: Date;
}) {
  return {
    bookId: progress.bookId,
    userId: progress.userId,
    location: progress.location,
    percentage: progress.percentage,
    updatedAt: progress.updatedAt.toISOString(),
  };
}

async function assertOwnsBook(userId: string, bookId: string) {
  const book = await prisma.book.findUnique({ where: { id: bookId } });
  if (!book || book.userId !== userId) {
    throw new ApiError(404, "not_found", "Book not found");
  }
}

router.get("/:bookId/progress", async (req: Request<{ bookId: string }>, res, next) => {
  try {
    await assertOwnsBook(req.userId!, req.params.bookId);
    const progress = await prisma.readingProgress.findUnique({
      where: { bookId: req.params.bookId },
    });
    if (!progress) {
      res.status(404).json({ error: "not_found", message: "No progress recorded for this book" });
      return;
    }
    res.json(toProgressDto(progress));
  } catch (err) {
    next(err);
  }
});

const putSchema = z.object({
  location: z.string().min(1),
  percentage: z.number().min(0).max(100),
});

router.put(
  "/:bookId/progress",
  validateBody(putSchema),
  async (req: Request<{ bookId: string }>, res, next) => {
    try {
      await assertOwnsBook(req.userId!, req.params.bookId);
      const progress = await prisma.readingProgress.upsert({
        where: { bookId: req.params.bookId },
        create: {
          bookId: req.params.bookId,
          userId: req.userId!,
          location: req.body.location,
          percentage: req.body.percentage,
        },
        update: {
          location: req.body.location,
          percentage: req.body.percentage,
        },
      });
      res.json(toProgressDto(progress));
    } catch (err) {
      next(err);
    }
  },
);

export default router;
