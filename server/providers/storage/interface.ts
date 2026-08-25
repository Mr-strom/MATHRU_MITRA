/**
 * MaatruMitra — Storage provider interface.
 *
 * All storage provider implementations must satisfy this interface.
 * Audio files are never executed, only stored and served via authorized URLs.
 */

export interface StorageProvider {
  readonly name: string;

  /** Generate a non-guessable storage key for a new upload. */
  generateKey(userId: string, mimeType: string): string;

  /** Return an authorized URL for client upload. In local dev, this is the upload endpoint. */
  getUploadUrl(key: string): Promise<string>;

  /** Return an authorized URL for accessing a stored file. Short-lived. */
  getAccessUrl(key: string): Promise<string>;

  /** Store file data (used by server-mediated upload). */
  putObject(key: string, data: Buffer, mimeType: string): Promise<void>;

  /** Delete a stored object (for retention/deletion workflows). */
  deleteObject(key: string): Promise<void>;
}
