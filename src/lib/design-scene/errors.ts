import { AppError } from "@/lib/utils/errors";

export type DesignGenerationErrorCode =
  | "DESIGN_PROVIDER_REFUSED"
  | "DESIGN_PROVIDER_INCOMPLETE"
  | "DESIGN_OUTPUT_EMPTY"
  | "DESIGN_OUTPUT_PARSE_FAILED"
  | "DESIGN_OUTPUT_SCHEMA_INVALID"
  | "DESIGN_SCENE_INVALID"
  | "DESIGN_REGION_TOO_SMALL"
  | "DESIGN_NORMALIZATION_FAILED"
  | "DESIGN_OPERATIONS_EMPTY"
  | "DESIGN_OBJECT_CONVERSION_FAILED";

export type DesignFailureStage =
  | "provider_request_start"
  | "provider_response_received"
  | "provider_response_status"
  | "provider_refusal"
  | "provider_incomplete"
  | "structured_output_parse"
  | "scene_schema_validation"
  | "scene_normalization"
  | "operation_validation"
  | "operation_count"
  | "object_conversion_preflight"
  | "generation_persistence"
  | "refund_start"
  | "refund_complete"
  | "refund_failed"
  | "generation_failed"
  | "region_validation";

const SAFE_MESSAGES: Record<DesignGenerationErrorCode, string> = {
  DESIGN_PROVIDER_REFUSED:
    "This design request could not be completed.",
  DESIGN_PROVIDER_INCOMPLETE:
    "The design model did not finish the request.",
  DESIGN_OUTPUT_EMPTY: "No editable elements were created.",
  DESIGN_OUTPUT_PARSE_FAILED: "The generated design could not be prepared.",
  DESIGN_OUTPUT_SCHEMA_INVALID: "The generated design could not be prepared.",
  DESIGN_SCENE_INVALID: "The design could not be prepared.",
  DESIGN_REGION_TOO_SMALL: "The selected design area is too small.",
  DESIGN_NORMALIZATION_FAILED: "The design could not be prepared.",
  DESIGN_OPERATIONS_EMPTY: "No editable elements were created.",
  DESIGN_OBJECT_CONVERSION_FAILED: "The design could not be prepared.",
};

export function httpStatusForDesignError(
  code: DesignGenerationErrorCode,
): number {
  switch (code) {
    case "DESIGN_REGION_TOO_SMALL":
      return 400;
    case "DESIGN_PROVIDER_REFUSED":
    case "DESIGN_PROVIDER_INCOMPLETE":
    case "DESIGN_OUTPUT_EMPTY":
    case "DESIGN_OUTPUT_PARSE_FAILED":
      return 502;
    case "DESIGN_OUTPUT_SCHEMA_INVALID":
    case "DESIGN_SCENE_INVALID":
    case "DESIGN_NORMALIZATION_FAILED":
    case "DESIGN_OPERATIONS_EMPTY":
    case "DESIGN_OBJECT_CONVERSION_FAILED":
      return 422;
    default:
      return 422;
  }
}

export class DesignGenerationError extends AppError {
  readonly failureStage: DesignFailureStage;
  readonly internalReason?: string;

  constructor(
    code: DesignGenerationErrorCode,
    opts?: {
      stage?: DesignFailureStage;
      internalReason?: string;
      details?: unknown;
      requestId?: string;
      message?: string;
    },
  ) {
    super(
      code,
      opts?.message ?? SAFE_MESSAGES[code],
      httpStatusForDesignError(code),
      {
        failureStage: opts?.stage,
        internalReason: opts?.internalReason,
        ...(opts?.details && typeof opts.details === "object"
          ? (opts.details as object)
          : opts?.details
            ? { detail: opts.details }
            : {}),
      },
      opts?.requestId,
    );
    this.name = "DesignGenerationError";
    this.failureStage = opts?.stage ?? "generation_failed";
    this.internalReason = opts?.internalReason;
  }
}

export function withCreditsRestoredMessage(
  message: string,
  refunded: boolean,
): string {
  if (!refunded) return message;
  if (/credits were restored/i.test(message)) return message;
  return `${message} Your credits were restored.`;
}
