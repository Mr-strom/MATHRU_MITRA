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
      const key = decodeURIComponent(req.params.key);
      const storage = getStorageProvider();
      await storage.putObject(key, req.file.buffer, req.file.mimetype);
      res.json({ message: "File stored.", key });
    } catch (err) {
      next(err);
    }
  }
);

// POST /voice-notes/:id/submit — Queue for transcription
router.post("/:id/submit", requireAuth, requireRole("ASHA_WORKER"), (req, res, next) => {
  try {
    voiceNoteService.submitForTranscription(req.params.id, req.user!.id);
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
    // Verify the user has access to a voice note with this key
    const vn = (voiceNotesRepo.findByCreator(req.user!.id) as voiceNotesRepo.VoiceNoteRow[])
      .find((v) => v.storage_key === key);
    if (!vn && req.user!.role === "ASHA_WORKER") {
      next(new NotFoundError("File not found or access denied."));
      return;
    }
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
