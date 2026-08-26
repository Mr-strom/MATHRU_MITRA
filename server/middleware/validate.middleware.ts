/**
 * MaatruMitra — Zod validation middleware.
 * Validates request body, query, or params against a Zod schema.
 * Returns 422 with structured field errors on failure.
 */

import type { Request, Response, NextFunction } from "express";
import { z } from "zod";

type Target = "body" | "query" | "params";

export function validate<T extends z.ZodTypeAny>(
  schema: T,
  target: Target = "body"
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse((req as unknown as Record<string, unknown>)[target]);
    if (!result.success) {
      res.status(422).json({
        error: "Validation failed.",
        code: "VALIDATION_ERROR",
        details: result.error.flatten(),
      });
      return;
    }
    // Replace raw input with parsed (includes defaults, coercions)
    (req as unknown as Record<string, unknown>)[target] = result.data;
    next();
  };
}
