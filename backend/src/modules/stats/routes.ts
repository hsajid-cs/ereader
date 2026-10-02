import { Router } from "express";
import { z } from "zod";

import { requireAuth } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import * as statsService from "./service";

const router = Router();
router.use(requireAuth);

/** Client timezone as minutes east of UTC (e.g. +60 for CET); defaults to UTC. */
function tzOffset(value: unknown): number {
  const n = typeof value === "string" ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(n) && Math.abs(n) <= 14 * 60 ? n : 0;
}

router.get("/summary", async (req, res, next) => {
  try {
    res.json(await statsService.getSummary(req.userId!, tzOffset(req.query.tz)));
  } catch (err) {
    next(err);
  }
});

router.get("/daily", async (req, res, next) => {
  try {
    const days = Number.parseInt(String(req.query.days ?? "14"), 10);
    res.json(
      await statsService.getDaily(
        req.userId!,
        Number.isFinite(days) ? days : 14,
        tzOffset(req.query.tz),
      ),
    );
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
