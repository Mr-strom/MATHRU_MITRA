/**
 * MaatruMitra — Users routes.
 * Area-scoped user lookup for role assignment.
 */

import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";
import * as usersRepo from "../repositories/users.repo.js";

const router = Router();

// GET /api/v1/users/assignable-ashas — Returns active ASHA workers within caller's area
router.get(
  "/assignable-ashas",
  requireAuth,
  requireRole("ANM_REVIEWER", "PHC_ADMIN"),
  (req, res, next) => {
    try {
      const user = req.user!;
      let ashas: usersRepo.SafeUser[];

      if (user.assigned_area_id) {
        ashas = usersRepo.findByRoleAndArea("ASHA_WORKER", user.assigned_area_id);
      } else if (user.role === "PHC_ADMIN") {
        ashas = usersRepo.findByRole("ASHA_WORKER");
      } else {
        ashas = [];
      }

      res.json({ items: ashas });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
