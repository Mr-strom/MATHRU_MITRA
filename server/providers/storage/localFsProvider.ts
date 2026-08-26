/**
 * MaatruMitra — Local filesystem storage provider.
 *
 * Stores audio files in UPLOAD_DIR (default: ./uploads/).
 * Access URLs are server-mediated API paths — files are never directly exposed.
 * File contents are never executed.
 *
 * NOT suitable for production. Swap for an S3/GCS provider before any real deployment.
 */

import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import type { StorageProvider } from "./interface.js";

const MIME_TO_EXT: Record<string, string> = {
  "audio/webm": ".webm",
  "audio/ogg": ".ogg",
  "audio/wav": ".wav",
  "audio/mp4": ".mp4",
  "audio/mpeg": ".mp3",
  "audio/flac": ".flac",
};

export class LocalFsStorageProvider implements StorageProvider {
  readonly name = "local-fs";
  private readonly uploadDir: string;

  constructor() {
    this.uploadDir = path.resolve(
      process.cwd(),
      process.env.UPLOAD_DIR ?? "./uploads"
    );
    fs.mkdirSync(this.uploadDir, { recursive: true });
  }

  generateKey(userId: string, mimeType: string): string {
    const ext = MIME_TO_EXT[mimeType] ?? ".bin";
    const id = nanoid(32);
    return `${userId.substring(0, 8)}/${id}${ext}`;
  }

  async getUploadUrl(key: string): Promise<string> {
    // In dev, upload goes through the server API endpoint
    return `/api/v1/voice-notes/upload/${encodeURIComponent(key)}`;
  }

  async getAccessUrl(key: string): Promise<string> {
    // Server-mediated access — file is not directly addressable
    return `/api/v1/voice-notes/file/${encodeURIComponent(key)}`;
  }

  async putObject(key: string, data: Buffer, _mimeType: string): Promise<void> {
    const filePath = this.resolvePath(key);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    // Validate no path traversal
    if (!filePath.startsWith(this.uploadDir)) {
      throw new Error("Path traversal attempt detected in storage key.");
    }
    fs.writeFileSync(filePath, data);
  }

  async hasObject(key: string): Promise<boolean> {
    const filePath = this.resolvePath(key);
    if (!filePath.startsWith(this.uploadDir)) {
      return false;
    }
    return fs.existsSync(filePath);
  }

  async deleteObject(key: string): Promise<void> {
    const filePath = this.resolvePath(key);
    if (!filePath.startsWith(this.uploadDir)) {
      throw new Error("Path traversal attempt detected in storage key.");
    }
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  resolvePath(key: string): string {
    return path.resolve(this.uploadDir, key);
  }
}
