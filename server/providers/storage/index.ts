/**
 * MaatruMitra — Storage provider registry.
 */

import type { StorageProvider } from "./interface.js";
import { LocalFsStorageProvider } from "./localFsProvider.js";

let _provider: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (_provider) return _provider;
  // Future: switch on STORAGE_PROVIDER env var for S3/GCS
  _provider = new LocalFsStorageProvider();
  return _provider;
}

export function setStorageProvider(p: StorageProvider): void {
  _provider = p;
}
