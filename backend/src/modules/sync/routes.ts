import { Router } from "express";

import { prisma } from "../../db/prisma";
import { requireAuth } from "../../middleware/auth";
import { toAnnotationDto } from "../annotations/dto";
import { toBookDto } from "../books/dto";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const since = typeof req.query.since === "string" ? new Date(req.query.since) : new Date(0);
    const userId = req.userId!;

    const [books, progress, annotations, collections] = await Promise.all([
      prisma.book.findMany({ where: { userId, updatedAt: { gt: since } } }),
      prisma.readingProgress.findMany({ where: { userId, updatedAt: { gt: since } } }),
      prisma.annotation.findMany({ where: { userId, updatedAt: { gt: since } } }),
      prisma.collection.findMany({ where: { userId, updatedAt: { gt: since } } }),
    ]);

    res.json({
      books: books.map(toBookDto),
      progress: progress.map((p) => ({
        bookId: p.bookId,
        userId: p.userId,
        location: p.location,
        percentage: p.percentage,
        updatedAt: p.updatedAt.toISOString(),
      })),
      annotations: annotations.map(toAnnotationDto),
      collections: collections.map((c) => ({
        id: c.id,
        userId: c.userId,
        name: c.name,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      })),
      serverTime: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
