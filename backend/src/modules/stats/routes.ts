import { Router } from "express";
import { z } from "zod";

import { requireAuth } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import * as statsService from "./service";

const router = Router();
router.use(requireAuth);

router.get("/summary", async (req, res, next) => {
  try {
    res.json(await statsService.getSummary(req.userId!));
  } catch (err) {
    next(err);
  }
});

router.get("/goal", async (req, res, next) => {
  try {
    res.json(await statsService.getGoal(req.userId!));
  } catch (err) {
    next(err);
  }
});

const goalSchema = z.object({ dailyMinutesGoal: z.number().int().min(1).max(1440) });

router.put("/goal", validateBody(goalSchema), async (req, res, next) => {
  try {
    res.json(await statsService.setGoal(req.userId!, req.body.dailyMinutesGoal));
  } catch (err) {
    next(err);
  }
});

const sessionSchema = z.object({
  bookId: z.string().min(1),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  durationSeconds: z.number().int().min(0),
});

router.post("/sessions", validateBody(sessionSchema), async (req, res, next) => {
  try {
    const session = await statsService.recordSession(
      req.userId!,
      req.body.bookId,
      new Date(req.body.startedAt),
      new Date(req.body.endedAt),
      req.body.durationSeconds,
    );
    res.status(201).json(session);
  } catch (err) {
    next(err);
  }
});

export default router;
