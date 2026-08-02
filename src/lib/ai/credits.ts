import { createServiceClient } from "@/lib/supabase/admin";
import { AppError, logServerError, supabaseErrorFields } from "@/lib/utils/errors";
import type { Json } from "@/types/database";

export async function consumeCreditsAtomic(input: {
  userId: string;
  amount: number;
  idempotencyKey: string;
  generationId?: string;
  metadata?: Record<string, unknown>;
  requestId?: string;
}): Promise<number> {
  const admin = createServiceClient();
  const { data, error } = await admin.rpc("consume_credits", {
    p_user_id: input.userId,
    p_amount: input.amount,
    p_reason: "generation",
    p_idempotency_key: input.idempotencyKey,
    p_generation_id: input.generationId ?? null,
    p_metadata: (input.metadata as Json | undefined) ?? null,
  });

  if (error) {
    logServerError({
      requestId: input.requestId ?? "unknown",
      route: "consume_credits",
      stage: "credit_consumption",
      userId: input.userId,
      generationId: input.generationId,
      supabase: supabaseErrorFields(error),
    });
    if (error.message.includes("insufficient_credits")) {
      throw new AppError(
        "INSUFFICIENT_CREDITS",
        "You don't have enough credits for this generation.",
        402,
        undefined,
        input.requestId,
      );
    }
    throw new AppError(
      "CREDIT_ERROR",
      "Unable to deduct credits.",
      500,
      undefined,
      input.requestId,
    );
  }

  return data as number;
}

export async function refundCreditsAtomic(input: {
  userId: string;
  amount: number;
  idempotencyKey: string;
  generationId?: string;
  metadata?: Record<string, unknown>;
  requestId?: string;
}): Promise<number> {
  const admin = createServiceClient();
  const { data, error } = await admin.rpc("refund_credits", {
    p_user_id: input.userId,
    p_amount: input.amount,
    p_reason: "generation_refund",
    p_idempotency_key: input.idempotencyKey,
    p_generation_id: input.generationId ?? null,
    p_payment_id: null,
    p_metadata: (input.metadata as Json | undefined) ?? null,
  });

  if (error) {
    logServerError({
      requestId: input.requestId ?? "unknown",
      route: "refund_credits",
      stage: "refund",
      userId: input.userId,
      generationId: input.generationId,
      supabase: supabaseErrorFields(error),
    });
    throw new AppError(
      "CREDIT_REFUND_ERROR",
      "Unable to refund credits.",
      500,
      undefined,
      input.requestId,
    );
  }

  return data as number;
}

export async function grantCreditsAtomic(input: {
  userId: string;
  amount: number;
  reason:
    | "signup_bonus"
    | "subscription_initial"
    | "subscription_renewal"
    | "credit_pack"
    | "payment_refund"
    | "admin_adjustment";
  idempotencyKey: string;
  paymentId?: string;
  metadata?: Record<string, unknown>;
}): Promise<number> {
  const admin = createServiceClient();
  const { data, error } = await admin.rpc("grant_credits", {
    p_user_id: input.userId,
    p_amount: input.amount,
    p_reason: input.reason,
    p_idempotency_key: input.idempotencyKey,
    p_payment_id: input.paymentId ?? null,
    p_metadata: (input.metadata as Json | undefined) ?? null,
  });

  if (error) {
    throw new AppError("CREDIT_GRANT_ERROR", "Unable to grant credits.", 500);
  }

  return data as number;
}
