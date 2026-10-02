import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";

import { ApiError } from "./errorHandler";

export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(
        new ApiError(
          400,
          "validation_error",
          result.error.issues[0]?.message ?? "Invalid request body",
        ),
      );
      return;
    }
    req.body = result.data;
    next();
  };
}
