import crypto from "node:crypto";

import { Router } from "express";
import type { Request } from "express";
import multer from "multer";
import { z } from "zod";

import { prisma } from "../../db/prisma";
import { requireAuth } from "../../middleware/auth";
import { ApiError } from "../../middleware/errorHandler";
import { validateBody } from "../../middleware/validate";
import { storage } from "../../storage";
import { toBookDto } from "./dto";
import { extensionForFormat, inferFormat } from "./format";

const router = Router();
router.use(requireAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

router.get("/", async (req, res, next) => {
  try {
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const collectionId = typeof req.query.collectionId === "string" ? req.query.collectionId : undefined;
    const books = await prisma.book.findMany({
      where: {
        userId: req.userId!,
        ...(search
          ? {
              OR: [
                { title: { contains: search, mode: "insensitive" } },
                { author: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
        ...(collectionId ? { collectionBooks: { some: { collectionId } } } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(books.map(toBookDto));
  } catch (err) {
    next(err);
  }
});

const createSchema = z.object({
  title: z.string().min(1),
  author: z.string().optional(),
});

router.post("/", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) {
      throw new ApiError(400, "missing_file", "A book file is required");
    }
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, "validation_error", parsed.error.issues[0]?.message ?? "Invalid request body");
    }
    const format = inferFormat(req.file.originalname);
    const checksumSha256 = crypto.createHash("sha256").update(req.file.buffer).digest("hex");

    const existing = await prisma.book.findUnique({
      where: { userId_checksumSha256: { userId: req.userId!, checksumSha256 } },
    });
    if (existing) {
      res.status(200).json(toBookDto(existing));
      return;
    }

    const bookId = crypto.randomUUID();
    const storageKey = `${req.userId}/${bookId}.${extensionForFormat(format)}`;
    await storage.save(storageKey, req.file.buffer);

    const book = await prisma.book.create({
      data: {
        id: bookId,
        userId: req.userId!,
        title: parsed.data.title,
        author: parsed.data.author,
        format,
        storageKey,
        fileSizeBytes: req.file.size,
        checksumSha256,
      },
    });
    res.status(201).json(toBookDto(book));
  } catch (err) {
    next(err);
  }
});

async function loadOwnedBook(userId: string, bookId: string) {
  const book = await prisma.book.findUnique({ where: { id: bookId } });
  if (!book || book.userId !== userId) {
    throw new ApiError(404, "not_found", "Book not found");
  }
  return book;
}

router.get("/:id", async (req, res, next) => {
  try {
    const book = await loadOwnedBook(req.userId!, req.params.id);
    res.json(toBookDto(book));
  } catch (err) {
    next(err);
  }
});

router.get("/:id/file", async (req, res, next) => {
  try {
    const book = await loadOwnedBook(req.userId!, req.params.id);
    const size = await storage.getSize(book.storageKey);
    const range = req.headers.range;

    if (range) {
      const match = /bytes=(\d+)-(\d*)/.exec(range);
      const start = match ? Number(match[1]) : 0;
      const end = match && match[2] ? Number(match[2]) : size - 1;
      res.status(206);
      res.set({
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(end - start + 1),
      });
      storage.getReadStream(book.storageKey, { start, end }).pipe(res);
      return;
    }

    res.set({ "Content-Length": String(size), "Accept-Ranges": "bytes" });
    storage.getReadStream(book.storageKey).pipe(res);
  } catch (err) {
    next(err);
  }
});

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  author: z.string().optional(),
});

router.patch(
  "/:id",
  validateBody(patchSchema),
  async (req: Request<{ id: string }>, res, next) => {
    try {
      await loadOwnedBook(req.userId!, req.params.id);
      const book = await prisma.book.update({
        where: { id: req.params.id },
        data: req.body,
      });
      res.json(toBookDto(book));
    } catch (err) {
      next(err);
    }
  },
);

router.delete("/:id", async (req, res, next) => {
  try {
    const book = await loadOwnedBook(req.userId!, req.params.id);
    await storage.delete(book.storageKey);
    await prisma.book.delete({ where: { id: book.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
