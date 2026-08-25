/**
 * MaatruMitra — Extraction provider registry.
 * Returns the active extraction provider based on EXTRACTION_PROVIDER env var.
 * Defaults to the fake provider in development.
 */

import type { ExtractionProvider } from "./interface.js";
import { FakeExtractionProvider } from "./fakeProvider.js";

let _provider: ExtractionProvider | null = null;

export function getExtractionProvider(): ExtractionProvider {
  if (_provider) return _provider;

  const providerName = process.env.EXTRACTION_PROVIDER ?? "fake";

  switch (providerName) {
    case "fake":
    default:
      _provider = new FakeExtractionProvider();
      break;
    // Future: case "openai": _provider = new OpenAIExtractionProvider(); break;
  }

  return _provider;
}

/** For testing: override the active provider */
export function setExtractionProvider(provider: ExtractionProvider): void {
  _provider = provider;
}
