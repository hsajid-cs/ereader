import { Router } from "express";
import { z } from "zod";

import { prisma } from "../../db/prisma";
import { requireAuth } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { toUserDto } from "../auth/service";

const router = Router();

router.use(requireAuth);

router.get("/me", async (req, res, next) => {
  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId! } });
    res.json(toUserDto(user));
  } catch (err) {
    next(err);
  }
});

const patchSchema = z.object({
  displayName: z.string().min(1).optional(),
});

router.patch("/me", validateBody(patchSchema), async (req, res, next) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.userId! },
      data: { displayName: req.body.displayName },
    });
    res.json(toUserDto(user));
  } catch (err) {
    next(err);
  }
});

export default router;
