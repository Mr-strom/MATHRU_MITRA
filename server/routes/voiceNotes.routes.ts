/**
 * MaatruMitra — Voice notes routes.
 */

import { Router } from "express";
import multer from "multer";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { uploadRateLimit } from "../middleware/rateLimit.middleware.js";
import { CreateVoiceNoteSchema, AddTranscriptRevisionSchema } from "@shared/schemas.js";
import * as voiceNoteService from "../services/voiceNote.service.js";
import * as transcriptService from "../services/transcript.service.js";
import { getStorageProvider } from "../providers/storage/index.js";
import * as voiceNotesRepo from "../repositories/voiceNotes.repo.js";
import { NotFoundError, PolicyError } from "../services/errors.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 26_214_400 } });

// POST /voice-notes — Create upload intent
router.post(
  "/",
  requireAuth,
  requireRole("ASHA_WORKER"),
  uploadRateLimit,
  validate(CreateVoiceNoteSchema),
  async (req, res, next) => {
    try {
      const result = await voiceNoteService.createUploadIntent(req.user!.id, req.body);
      res.status(201).json({
        voice_note: result.voiceNote,
        upload_url: result.uploadUrl,
        prototype_notice: "PROTOTYPE — No live patient data. Upload URL is for demo use only.",
      });
    } catch (err) {
      next(err);
    }
  }
);

const ALLOWED_MIME_TYPES = (
  process.env.ALLOWED_MIME_TYPES ??
  "audio/webm,audio/ogg,audio/wav,audio/mp4,audio/mpeg,audio/flac"
).split(",");

const MAX_BYTES = parseInt(process.env.MAX_UPLOAD_BYTES ?? "26214400", 10);

// POST /voice-notes/upload/:key — Server-mediated file upload (local dev)
router.post(
  "/upload/:key",
  requireAuth,
  requireRole("ASHA_WORKER"),
  upload.single("audio"),
  async (req, res, next) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "No file uploaded.", code: "NO_FILE" });
        return;
      }

      if (!ALLOWED_MIME_TYPES.includes(req.file.mimetype)) {
        res.status(422).json({
          error: `MIME type ${req.file.mimetype} is not allowed. Allowed: ${ALLOWED_MIME_TYPES.join(", ")}`,
          code: "UNSUPPORTED_MIME_TYPE",
        });
        return;
      }

      if (req.file.size > MAX_BYTES) {
        res.status(422).json({
          error: `File size exceeds ${MAX_BYTES} byte limit.`,
          code: "FILE_TOO_LARGE",
        });
        return;
      }

      const key = decodeURIComponent(req.params.key);
      const vn = voiceNotesRepo.findByStorageKey(key);
      if (!vn) {
        throw new NotFoundError("Voice note record for this storage key not found.");
      }

      if (vn.created_by_user_id !== req.user!.id) {
        throw new PolicyError("You can only upload audio for your own voice notes.", "FORBIDDEN");
      }

      if (vn.status !== "DRAFT") {
        throw new PolicyError(`Cannot upload audio to voice note in status ${vn.status}.`, "ILLEGAL_STATUS");
      }

      const storage = getStorageProvider();
      await storage.putObject(key, req.file.buffer, req.file.mimetype);
      res.json({ message: "File stored.", key });
    } catch (err) {
      next(err);
    }
  }
);

// POST /voice-notes/:id/submit — Queue for transcription
router.post("/:id/submit", requireAuth, requireRole("ASHA_WORKER"), async (req, res, next) => {
  try {
    await voiceNoteService.submitForTranscription(req.params.id, req.user!.id);
    res.json({ message: "Voice note submitted for transcription." });
  } catch (err) {
    next(err);
  }
});

// GET /voice-notes/:id
router.get("/:id", requireAuth, (req, res, next) => {
  try {
    const vn = voiceNoteService.getAuthorized(
      req.params.id,
      req.user!.id,
      req.user!.role,
      req.user!.assigned_area_id
    );
    res.json(vn);
  } catch (err) {
    next(err);
  }
});

// GET /voice-notes/:id/transcripts
router.get("/:id/transcripts", requireAuth, (req, res, next) => {
  try {
    const transcripts = transcriptService.getTranscripts(
      req.params.id,
      req.user!.id,
      req.user!.role
    );
    res.json({ transcripts });
  } catch (err) {
    next(err);
  }
});

// POST /voice-notes/:id/transcripts — Add worker-edited revision
router.post(
  "/:id/transcripts",
  requireAuth,
  requireRole("ASHA_WORKER", "ANM_REVIEWER"),
  validate(AddTranscriptRevisionSchema),
  (req, res, next) => {
    try {
      const transcript = transcriptService.addWorkerRevision(
        req.params.id,
        req.user!.id,
        req.user!.role,
        req.body
      );
      res.status(201).json({ transcript });
    } catch (err) {
      next(err);
    }
  }
);

// GET /voice-notes/file/:key — Serve stored audio file (dev only)
router.get("/file/:key", requireAuth, async (req, res, next) => {
  try {
    const key = decodeURIComponent(req.params.key);
    // Resolve voice note first, then enforce role and area authorization
    const vn = voiceNotesRepo.findByStorageKey(key);
    if (!vn) {
      throw new NotFoundError("Audio file not found.");
    }

    voiceNoteService.getAuthorized(
      vn.id,
      req.user!.id,
      req.user!.role,
      req.user!.assigned_area_id
    );

    const storage = getStorageProvider() as import("../providers/storage/localFsProvider.js").LocalFsStorageProvider;
    if (!("resolvePath" in storage)) {
      next(new PolicyError("File serving not available with this storage provider.", "NOT_SUPPORTED"));
      return;
    }
    const filePath = storage.resolvePath(key);
    res.sendFile(filePath, (err) => {
      if (err) next(new NotFoundError("Audio file not found."));
    });
  } catch (err) {
    next(err);
  }
});

export default router;
