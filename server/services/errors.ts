/**
 * MaatruMitra — Custom error classes.
 * These map to specific HTTP status codes in the error handler middleware.
 */

export class PolicyError extends Error {
  constructor(
    message: string,
    public readonly code: string = "POLICY_VIOLATION"
  ) {
    super(message);
    this.name = "PolicyError";
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class AuthError extends Error {
  constructor(message: string, public readonly code = "UNAUTHORIZED") {
    super(message);
    this.name = "AuthError";
  }
}

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

export class SafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SafetyError";
  }
}
