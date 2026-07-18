export type DomainErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "POLL_CLOSED"
  | "DEADLINE_PASSED"
  | "NOT_ELIGIBLE"
  | "NO_ACTIVE_MEMBERS"
  | "DINGTALK_ERROR"
  | "CONFLICT";

const statusByCode: Record<DomainErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  POLL_CLOSED: 409,
  DEADLINE_PASSED: 409,
  NOT_ELIGIBLE: 403,
  NO_ACTIVE_MEMBERS: 409,
  DINGTALK_ERROR: 502,
  CONFLICT: 409,
};

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: DomainErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.status = statusByCode[code];
    this.details = details;
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}

