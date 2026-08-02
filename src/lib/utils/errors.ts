import { randomUUID } from "crypto";
import { ZodError } from "zod";

export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;
  readonly requestId?: string;

  constructor(
    code: string,
    message: string,
    status = 400,
    details?: unknown,
    requestId?: string,
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
    this.requestId = requestId;
  }
}

export function createRequestId(): string {
  return randomUUID();
}

type LogFields = {
  requestId: string;
  route: string;
  stage?: string;
  projectId?: string | null;
  userId?: string | null;
  generationId?: string | null;
  code?: string;
  message?: string;
  supabase?: {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
  };
  provider?: {
    status?: number | string;
    code?: string;
    type?: string;
    request_id?: string;
  };
  [key: string]: unknown;
};

const SECRET_KEY_PATTERN =
  /api[_-]?key|authorization|cookie|service[_-]?role|secret|token|password/i;

/** Structured server log — never include secrets. */
export function logServerError(fields: LogFields): void {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (SECRET_KEY_PATTERN.test(key)) continue;
    if (value === undefined) continue;
    safe[key] = value;
  }
  console.error(JSON.stringify({ level: "error", ...safe }));
}

export function logServerInfo(fields: Omit<LogFields, "message"> & { message?: string }): void {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (SECRET_KEY_PATTERN.test(key)) continue;
    if (value === undefined) continue;
    safe[key] = value;
  }
  console.info(JSON.stringify({ level: "info", ...safe }));
}

export function supabaseErrorFields(error: {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
} | null | undefined) {
  if (!error) return undefined;
  return {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  };
}

export function toErrorResponse(
  error: unknown,
  requestId?: string,
): {
  status: number;
  body: { error: { code: string; message: string; requestId?: string } };
} {
  const id = requestId ?? (error instanceof AppError ? error.requestId : undefined);

  if (error instanceof AppError) {
    return {
      status: error.status,
      body: {
        error: {
          code: error.code,
          message: error.message,
          ...(id ? { requestId: id } : {}),
        },
      },
    };
  }

  if (error instanceof ZodError) {
    return {
      status: 400,
      body: {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request.",
          ...(id ? { requestId: id } : {}),
        },
      },
    };
  }

  console.error(
    JSON.stringify({
      level: "error",
      requestId: id,
      code: "internal_error",
      message: error instanceof Error ? error.message : "unknown",
    }),
  );

  return {
    status: 500,
    body: {
      error: {
        code: "INTERNAL_ERROR",
        message: "Something went wrong. Please try again.",
        ...(id ? { requestId: id } : {}),
      },
    },
  };
}
