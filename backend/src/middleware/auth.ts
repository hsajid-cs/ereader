import type { NextFunction, Request, Response } from "express";

import { verifyAccessToken } from "../modules/auth/jwt";
import { ApiError } from "./errorHandler";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    next(new ApiError(401, "unauthorized", "Missing bearer token"));
    return;
  }
  try {
    const payload = verifyAccessToken(header.slice("Bearer ".length));
    req.userId = payload.sub;
    next();
  } catch {
    next(new ApiError(401, "unauthorized", "Invalid or expired token"));
  }
}
