import { Router } from "express";
import type { Request } from "express";
import { z } from "zod";

import { prisma } from "../../db/prisma";
import { requireAuth } from "../../middleware/auth";
import { ApiError } from "../../middleware/errorHandler";
import { validateBody } from "../../middleware/validate";

const router = Router();
router.use(requireAuth);

function toCollectionDto(collection: {
  id: string;
  userId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: collection.id,
    userId: collection.userId,
    name: collection.name,
    createdAt: collection.createdAt.toISOString(),
    updatedAt: collection.updatedAt.toISOString(),
  };
}

async function loadOwnedCollection(userId: string, id: string) {
  const collection = await prisma.collection.findUnique({ where: { id } });
  if (!collection || collection.userId !== userId) {
    throw new ApiError(404, "not_found", "Collection not found");
  }
  return collection;
}

router.get("/", async (req, res, next) => {
  try {
    const collections = await prisma.collection.findMany({
      where: { userId: req.userId! },
      orderBy: { createdAt: "asc" },
    });
    res.json(collections.map(toCollectionDto));
  } catch (err) {
    next(err);
  }
});

const createSchema = z.object({ name: z.string().min(1) });

router.post("/", validateBody(createSchema), async (req, res, next) => {
  try {
    const collection = await prisma.collection.create({
      data: { userId: req.userId!, name: req.body.name },
    });
    res.status(201).json(toCollectionDto(collection));
  } catch (err) {
    next(err);
  }
});

router.patch(
  "/:id",
  validateBody(createSchema),
  async (req: Request<{ id: string }>, res, next) => {
    try {
      await loadOwnedCollection(req.userId!, req.params.id);
      const collection = await prisma.collection.update({
        where: { id: req.params.id },
        data: { name: req.body.name },
      });
      res.json(toCollectionDto(collection));
    } catch (err) {
      next(err);
    }
  },
);

router.delete("/:id", async (req, res, next) => {
  try {
    await loadOwnedCollection(req.userId!, req.params.id);
    await prisma.collection.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

router.post("/:id/books/:bookId", async (req, res, next) => {
  try {
    await loadOwnedCollection(req.userId!, req.params.id);
    const book = await prisma.book.findUnique({ where: { id: req.params.bookId } });
    if (!book || book.userId !== req.userId) {
      throw new ApiError(404, "not_found", "Book not found");
    }
    await prisma.collectionBook.upsert({
      where: { collectionId_bookId: { collectionId: req.params.id, bookId: req.params.bookId } },
      create: { collectionId: req.params.id, bookId: req.params.bookId },
      update: {},
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

router.delete("/:id/books/:bookId", async (req, res, next) => {
  try {
    await loadOwnedCollection(req.userId!, req.params.id);
    await prisma.collectionBook.deleteMany({
      where: { collectionId: req.params.id, bookId: req.params.bookId },
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
