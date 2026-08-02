import { AppError } from "@/lib/utils/errors";

/**
 * Strict Lemon Squeezy test-mode parser.
 * Only the string "true" enables test mode. Missing env => false (live).
 * Never use Boolean("false") or z.coerce.boolean().default(true).
 */
export function parseLemonSqueezyTestMode(
  raw: string | undefined | null,
): boolean {
  return raw === "true";
}

export function isNodeProduction(
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  return nodeEnv === "production";
}

/** Production must never grant credits/plan from test_mode webhooks. */
export function shouldIgnoreTestWebhookGrants(input: {
  isProduction: boolean;
  payloadTestMode: boolean;
}): boolean {
  return input.isProduction && input.payloadTestMode;
}

export function extractPayloadTestMode(payload: {
  meta?: { test_mode?: unknown };
  data?: { attributes?: { test_mode?: unknown } | Record<string, unknown> };
}): boolean {
  const attrMode = payload.data?.attributes?.test_mode;
  if (typeof attrMode === "boolean") return attrMode;
  const metaMode = payload.meta?.test_mode;
  if (typeof metaMode === "boolean") return metaMode;
  return false;
}

export function assertCheckoutTestModeMatches(input: {
  expectedTestMode: boolean;
  actualTestMode: boolean;
}): void {
  if (input.expectedTestMode !== input.actualTestMode) {
    throw new AppError(
      "checkout_mode_mismatch",
      `Checkout test_mode (${String(input.actualTestMode)}) does not match the server configuration (${String(input.expectedTestMode)}). Do not mix live and test variants, API keys, or stores.`,
      502,
    );
  }
}

export type LiveBillingEnv = {
  LEMONSQUEEZY_TEST_MODE: boolean;
  LEMONSQUEEZY_API_KEY: string;
  LEMONSQUEEZY_STORE_ID: string;
  LEMONSQUEEZY_VARIANT_CREATOR_MONTHLY: string;
  LEMONSQUEEZY_VARIANT_PRO_MONTHLY: string;
  LEMONSQUEEZY_VARIANT_CREDIT_PACK: string;
};

/**
 * In production, refuse test mode and require live store/API/variant IDs.
 */
export function assertProductionLiveBilling(
  env: LiveBillingEnv,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): void {
  if (!isNodeProduction(nodeEnv)) return;

  if (env.LEMONSQUEEZY_TEST_MODE) {
    console.error(
      "[billing] CRITICAL: LEMONSQUEEZY_TEST_MODE=true in production. Live checkout is blocked.",
    );
    throw new AppError(
      "billing_test_mode_in_production",
      "Test billing mode is enabled in production. Set LEMONSQUEEZY_TEST_MODE=false.",
      503,
    );
  }

  if (!env.LEMONSQUEEZY_API_KEY) {
    throw new AppError(
      "billing_live_api_key_missing",
      "A live-mode API key is required in production.",
      503,
    );
  }

  if (!env.LEMONSQUEEZY_STORE_ID) {
    throw new AppError(
      "billing_live_store_missing",
      "A live store ID is required in production.",
      503,
    );
  }

  const missingVariants = [
    ["Creator", env.LEMONSQUEEZY_VARIANT_CREATOR_MONTHLY],
    ["Pro", env.LEMONSQUEEZY_VARIANT_PRO_MONTHLY],
    ["Credit Pack", env.LEMONSQUEEZY_VARIANT_CREDIT_PACK],
  ]
    .filter(([, id]) => !id)
    .map(([name]) => name);

  if (missingVariants.length > 0) {
    throw new AppError(
      "billing_live_variant_missing",
      `Live variant IDs are required in production: ${missingVariants.join(", ")}`,
      503,
    );
  }
}

export function warnIfTestModeInNonLocal(input: {
  testMode: boolean;
  nodeEnv?: string;
}): void {
  if (!input.testMode) return;
  if (isNodeProduction(input.nodeEnv)) {
    console.error(
      "[billing] WARNING: LEMONSQUEEZY_TEST_MODE=true while NODE_ENV=production",
    );
  }
}

/**
 * Ensures configured variant IDs are only used with the matching checkout mode.
 * Mismatch between requested testMode and checkout response is treated as mixing.
 */
export function assertVariantModeConsistency(input: {
  configuredTestMode: boolean;
  checkoutTestMode: boolean;
  variantId: string;
}): void {
  assertCheckoutTestModeMatches({
    expectedTestMode: input.configuredTestMode,
    actualTestMode: input.checkoutTestMode,
  });

  if (!input.variantId.trim()) {
    throw new AppError("variant_missing", "Variant ID is empty.", 400);
  }
}
