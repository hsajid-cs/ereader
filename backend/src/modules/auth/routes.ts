import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";

import { requireAuth } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import * as authService from "./service";

const router = Router();

const email = z.string().trim().toLowerCase().pipe(z.string().email());

const registerSchema = z.object({
  email,
  password: z.string().min(8),
  displayName: z.string().min(1).optional(),
});

const loginSchema = z.object({
  email,
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

// Slow down password guessing and signup abuse (disabled under test).
const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
  message: { error: "rate_limited", message: "Too many attempts, try again later" },
});

router.post(
  "/register",
  credentialLimiter,
  validateBody(registerSchema),
  async (req, res, next) => {
    try {
      const { email, password, displayName } = req.body;
      const result = await authService.register(email, password, displayName);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
);

router.post("/login", credentialLimiter, validateBody(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await authService.login(email, password);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post("/refresh", validateBody(refreshSchema), async (req, res, next) => {
  try {
    const result = await authService.refresh(req.body.refreshToken);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post("/logout", validateBody(refreshSchema), async (req, res, next) => {
  try {
    await authService.logout(req.body.refreshToken);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

router.post(
  "/change-password",
  requireAuth,
  validateBody(changePasswordSchema),
  async (req, res, next) => {
    try {
      res.json(
        await authService.changePassword(
          req.userId!,
          req.body.currentPassword,
          req.body.newPassword,
        ),
      );
    } catch (err) {
      next(err);
    }
  },
);

export default router;
