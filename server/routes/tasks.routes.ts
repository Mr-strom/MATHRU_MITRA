/**
 * MaatruMitra — Tasks routes.
 */

import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { TaskCompleteSchema, PaginationQuerySchema } from "@shared/schemas.js";
import * as tasksRepo from "../repositories/tasks.repo.js";
import * as reviewWorkflow from "../services/reviewWorkflow.service.js";
import { NotFoundError } from "../services/errors.js";
import type { TaskState } from "@shared/states.js";

const router = Router();

// GET /tasks — Role/area-scoped task queue
router.get(
  "/",
  requireAuth,
  validate(PaginationQuerySchema, "query"),
  (req, res, next) => {
    try {
      const user = req.user!;
      const { cursor, limit } = req.query as unknown as { cursor?: string; limit: number };
      const statusParam = (req.query as Record<string, unknown>).status as TaskState | undefined;

      let tasks: tasksRepo.TaskRow[];
      if (user.role === "ASHA_WORKER" || user.role === "ANM_REVIEWER") {
        tasks = tasksRepo.findByOwner(user.id, statusParam, cursor, limit);
      } else {
        // PHC_ADMIN: all tasks in area
        tasks = user.assigned_area_id
          ? tasksRepo.findByArea(user.assigned_area_id, statusParam, cursor, limit)
          : tasksRepo.findByOwner(user.id, statusParam, cursor, limit);
      }

      res.json({
        items: tasks,
        next_cursor: tasks.length === limit ? tasks[tasks.length - 1]?.created_at ?? null : null,
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /tasks/:id
router.get("/:id", requireAuth, (req, res, next) => {
  try {
    const task = tasksRepo.findById(req.params.id);
    if (!task) throw new NotFoundError("Task not found.");
    res.json(task);
  } catch (err) {
    next(err);
  }
});

// POST /tasks/:id/acknowledge
router.post("/:id/acknowledge", requireAuth, (req, res, next) => {
  try {
    const task = reviewWorkflow.acknowledgeTask(req.params.id, req.user!.id);
    res.json({ task, notice: "Task acknowledged. No automated messages have been sent." });
  } catch (err) {
    next(err);
  }
});

// POST /tasks/:id/complete
router.post(
  "/:id/complete",
  requireAuth,
  validate(TaskCompleteSchema),
  (req, res, next) => {
    try {
      const task = reviewWorkflow.completeTask(
        req.params.id,
        req.user!.id,
        req.body.completion_note
      );
      res.json({ task, notice: "Task marked complete. No automated messages have been sent." });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
