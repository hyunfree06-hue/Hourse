import { createHmac, timingSafeEqual } from "crypto";
import {
  lemonSqueezySetup,
  createCheckout,
  getSubscription,
  getVariant,
} from "@lemonsqueezy/lemonsqueezy.js";
import { getServerEnv, hasLemonConfig } from "@/lib/validation/env.server";
import {
  type BillingPlan,
  type CheckoutPlanCode,
  getAllowedVariantIds,
  getPlanByCheckoutCode,
  getProductByVariantId,
  getVariantIdForProduct,
} from "@/config/billing";
import { AppError } from "@/lib/utils/errors";
import { createServiceClient } from "@/lib/supabase/admin";
import { grantCreditsAtomic } from "@/lib/ai/credits";
import {
  assertProductionLiveBilling,
  assertVariantModeConsistency,
  extractPayloadTestMode,
  isNodeProduction,
  shouldIgnoreTestWebhookGrants,
} from "@/lib/billing/mode";
import { isUsdCurrency } from "@/lib/billing/money";

export function setupLemon() {
  const env = getServerEnv();
  if (!hasLemonConfig()) {
    throw new AppError(
      "billing_not_configured",
      "결제 설정이 완료되지 않았습니다.",
      503,
    );
  }
  lemonSqueezySetup({ apiKey: env.LEMONSQUEEZY_API_KEY });
}

export function verifyLemonSignature(
  rawBody: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature || !secret) return false;
  const hmac = createHmac("sha256", secret);
  const digest = Buffer.from(hmac.update(rawBody).digest("hex"), "utf8");
  const checksum = Buffer.from(signature, "utf8");
  if (digest.length !== checksum.length) return false;
  return timingSafeEqual(digest, checksum);
}

async function assertLiveVariantMatchesPlan(
  variantId: string,
  plan: BillingPlan,
): Promise<void> {
  const { data, error } = await getVariant(variantId, {
    include: ["price-model"],
  });

  if (error || !data?.data) {
    throw new AppError(
      "variant_lookup_failed",
      "Lemon Squeezy Variant를 확인할 수 없습니다.",
      502,
    );
  }

  const attrs = data.data.attributes as {
    name?: string;
    test_mode?: boolean;
    price?: number;
    is_subscription?: boolean;
  };

  if (Boolean(attrs.test_mode) !== Boolean(getServerEnv().LEMONSQUEEZY_TEST_MODE)) {
    throw new AppError(
      "variant_mode_mismatch",
      "Variant의 test/live 모드가 서버 설정과 다릅니다.",
      502,
    );
  }

  const included = (
    data as {
      data: { attributes: typeof attrs };
      included?: Array<{
        type: string;
        attributes?: {
          unit_price?: number;
          category?: string;
          interval?: string | null;
        };
      }>;
    }
  ).included;

  const priceModel = included?.find((i) => i.type === "prices");
  const unitPrice =
    priceModel?.attributes?.unit_price ??
    (typeof attrs.price === "number" ? attrs.price : undefined);
  const category = priceModel?.attributes?.category;
  const interval = priceModel?.attributes?.interval ?? null;

  if (typeof unitPrice === "number" && unitPrice !== plan.priceAmountCents) {
    throw new AppError(
      "variant_price_mismatch",
      `Variant 가격(${unitPrice})이 서버 설정(${plan.priceAmountCents} cents USD)과 다릅니다.`,
      502,
    );
  }

  if (plan.billingType === "subscription") {
    const looksSubscription =
      category === "subscription" ||
      attrs.is_subscription === true ||
      interval === "month";
    if (category && category !== "subscription" && !looksSubscription) {
      throw new AppError(
        "variant_type_mismatch",
        "구독 상품 Variant가 아닙니다.",
        502,
      );
    }
  }

  if (plan.billingType === "credit_pack") {
    if (category === "subscription" || attrs.is_subscription === true) {
      throw new AppError(
        "variant_type_mismatch",
        "일회성 Credit Pack Variant가 아닙니다.",
        502,
      );
    }
  }
}

export async function createLemonCheckout(input: {
  planCode: CheckoutPlanCode;
  userId: string;
  email: string;
}): Promise<{ url: string; testMode: boolean }> {
  setupLemon();
  const env = getServerEnv();

  assertProductionLiveBilling({
    LEMONSQUEEZY_TEST_MODE: env.LEMONSQUEEZY_TEST_MODE,
    LEMONSQUEEZY_API_KEY: env.LEMONSQUEEZY_API_KEY,
    LEMONSQUEEZY_STORE_ID: env.LEMONSQUEEZY_STORE_ID,
    LEMONSQUEEZY_VARIANT_CREATOR_MONTHLY:
      env.LEMONSQUEEZY_VARIANT_CREATOR_MONTHLY,
    LEMONSQUEEZY_VARIANT_PRO_MONTHLY: env.LEMONSQUEEZY_VARIANT_PRO_MONTHLY,
    LEMONSQUEEZY_VARIANT_CREDIT_PACK: env.LEMONSQUEEZY_VARIANT_CREDIT_PACK,
  });

  const expectedTestMode = env.LEMONSQUEEZY_TEST_MODE;
  const product = getPlanByCheckoutCode(input.planCode);
  if (!product || !product.variantEnvKey) {
    throw new AppError("invalid_product", "유효하지 않은 요금제입니다.", 400);
  }

  const variantId = getVariantIdForProduct(product);
  if (!variantId) {
    throw new AppError(
      "variant_missing",
      "상품 Variant ID가 설정되지 않았습니다.",
      503,
    );
  }

  const allowed = getAllowedVariantIds();
  if (!allowed.includes(variantId)) {
    throw new AppError("variant_not_allowed", "허용되지 않은 상품입니다.", 400);
  }

  await assertLiveVariantMatchesPlan(variantId, product);

  const { data, error } = await createCheckout(
    env.LEMONSQUEEZY_STORE_ID,
    variantId,
    {
      checkoutData: {
        email: input.email,
        custom: {
          user_id: input.userId,
        },
      },
      productOptions: {
        redirectUrl: `${env.NEXT_PUBLIC_APP_URL}/billing?checkout=success`,
      },
      testMode: expectedTestMode,
    },
  );

  if (error || !data?.data?.attributes?.url) {
    throw new AppError(
      "checkout_failed",
      "Checkout 생성에 실패했습니다.",
      500,
    );
  }

  const attrs = data.data.attributes;
  const actualTestMode = Boolean(attrs.test_mode);

  assertVariantModeConsistency({
    configuredTestMode: expectedTestMode,
    checkoutTestMode: actualTestMode,
    variantId,
  });

  return {
    url: attrs.url as string,
    testMode: actualTestMode,
  };
}

export async function getPortalUrl(userId: string): Promise<string | null> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("subscriptions")
    .select("customer_portal_url, lemon_subscription_id")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (data?.customer_portal_url) return data.customer_portal_url;

  if (data?.lemon_subscription_id && hasLemonConfig()) {
    setupLemon();
    const { data: sub } = await getSubscription(data.lemon_subscription_id);
    const url = sub?.data?.attributes?.urls?.customer_portal ?? null;
    if (url) {
      await admin
        .from("subscriptions")
        .update({ customer_portal_url: url })
        .eq("lemon_subscription_id", data.lemon_subscription_id);
      return url;
    }
  }

  return null;
}

type LemonWebhookPayload = {
  meta?: {
    event_name?: string;
    custom_data?: { user_id?: string };
    test_mode?: boolean;
  };
  data?: {
    id?: string;
    type?: string;
    attributes?: Record<string, unknown>;
  };
};

export type ProcessWebhookResult = {
  skipped?: boolean;
  reason?: string;
};

function validateWebhookCommerce(input: {
  payloadTestMode: boolean;
  currency: string;
  variantId: string;
  product: BillingPlan | undefined;
  eventName: string;
}): ProcessWebhookResult | null {
  if (
    shouldIgnoreTestWebhookGrants({
      isProduction: isNodeProduction(),
      payloadTestMode: input.payloadTestMode,
    })
  ) {
    return { skipped: true, reason: "test_mode_in_production" };
  }

  if (!isUsdCurrency(input.currency)) {
    console.warn("[billing] Non-USD webhook ignored", {
      currency: input.currency,
      eventName: input.eventName,
    });
    return { skipped: true, reason: "currency_not_usd" };
  }

  if (input.variantId && !input.product) {
    console.warn("[billing] Unknown variant webhook ignored", {
      variantId: input.variantId,
      eventName: input.eventName,
    });
    return { skipped: true, reason: "variant_not_allowed" };
  }

  if (input.product) {
    const isSubEvent =
      input.eventName.startsWith("subscription_") ||
      input.eventName === "subscription_payment_success";
    const isOrderEvent =
      input.eventName === "order_created" ||
      input.eventName === "order_refunded";

    if (
      input.product.billingType === "credit_pack" &&
      isSubEvent &&
      input.eventName !== "order_refunded"
    ) {
      // credit pack should not be processed as subscription payment grants
      if (input.eventName === "subscription_payment_success") {
        return { skipped: true, reason: "credit_pack_as_subscription" };
      }
    }

    if (
      input.product.billingType === "subscription" &&
      isOrderEvent &&
      input.eventName === "order_created"
    ) {
      // subscriptions intentionally skip credit grant on order_created
    }

    if (
      input.product.billingType === "subscription" &&
      input.eventName === "order_created"
    ) {
      // ok — no grant
    }
  }

  return null;
}

export async function processLemonWebhook(
  eventName: string,
  externalId: string,
  payload: LemonWebhookPayload,
): Promise<ProcessWebhookResult> {
  const payloadTestMode = extractPayloadTestMode(payload);
  const attrs = payload.data?.attributes ?? {};
  const currency = String(attrs.currency ?? "USD");

  const firstOrderItem = attrs.first_order_item as
    | { variant_id?: string | number }
    | undefined;
  const variantId = String(
    attrs.variant_id ?? firstOrderItem?.variant_id ?? "",
  );
  const product = variantId
    ? getProductByVariantId(String(variantId))
    : undefined;

  const blocked = validateWebhookCommerce({
    payloadTestMode,
    currency,
    variantId,
    product,
    eventName,
  });
  if (blocked?.skipped) {
    console.warn("[billing] Webhook skipped", {
      eventName,
      externalId,
      reason: blocked.reason,
    });
    return blocked;
  }

  if (
    product?.billingType === "subscription" &&
    eventName === "order_created"
  ) {
    // still record payment below without granting — fall through
  }

  if (
    product?.billingType === "credit_pack" &&
    eventName === "subscription_payment_success"
  ) {
    return { skipped: true, reason: "credit_pack_as_subscription" };
  }

  const admin = createServiceClient();
  const customUserId =
    payload.meta?.custom_data?.user_id ??
    (attrs.custom_data as { user_id?: string } | undefined)?.user_id;
  const userId = customUserId;

  switch (eventName) {
    case "order_created": {
      if (!userId || !product) break;
      const orderId = String(payload.data?.id ?? externalId);
      const amount = Number(attrs.total ?? 0);

      const { data: payment } = await admin
        .from("payments")
        .upsert(
          {
            user_id: userId,
            lemon_order_id: orderId,
            lemon_variant_id: variantId || null,
            payment_type: product.billingType,
            status: "paid",
            amount,
            currency: currency.toUpperCase(),
            credits_granted:
              product.billingType === "credit_pack" ? product.credits : 0,
            test_mode: payloadTestMode,
          },
          { onConflict: "lemon_order_id" },
        )
        .select("*")
        .single();

      if (product.billingType === "credit_pack") {
        await grantCreditsAtomic({
          userId,
          amount: product.credits,
          reason: "credit_pack",
          idempotencyKey: `credit_pack:order:${orderId}`,
          paymentId: payment?.id,
          metadata: { variantId, productCode: product.code },
        });
      }
      break;
    }
    case "subscription_created":
    case "subscription_updated":
    case "subscription_cancelled":
    case "subscription_expired":
    case "subscription_paused":
    case "subscription_unpaused": {
      if (!userId) break;
      if (product && product.billingType !== "subscription") {
        return { skipped: true, reason: "subscription_event_for_non_sub" };
      }
      const subId = String(payload.data?.id ?? "");
      const status = String(attrs.status ?? eventName);
      const urls = attrs.urls as
        | { customer_portal?: string; update_payment_method?: string }
        | undefined;

      await admin.from("subscriptions").upsert(
        {
          user_id: userId,
          lemon_subscription_id: subId,
          lemon_customer_id: attrs.customer_id
            ? String(attrs.customer_id)
            : null,
          lemon_order_id: attrs.order_id ? String(attrs.order_id) : null,
          lemon_variant_id: variantId || null,
          status,
          renews_at: attrs.renews_at ? String(attrs.renews_at) : null,
          ends_at: attrs.ends_at ? String(attrs.ends_at) : null,
          trial_ends_at: attrs.trial_ends_at
            ? String(attrs.trial_ends_at)
            : null,
          customer_portal_url: urls?.customer_portal ?? null,
          update_payment_method_url: urls?.update_payment_method ?? null,
        },
        { onConflict: "lemon_subscription_id" },
      );

      if (eventName === "subscription_expired" || status === "expired") {
        await admin
          .from("profiles")
          .update({ plan_code: "free" })
          .eq("id", userId);
      } else if (product?.planCode) {
        await admin
          .from("profiles")
          .update({ plan_code: product.planCode })
          .eq("id", userId);
      }
      break;
    }
    case "subscription_payment_success": {
      if (!userId || !product) break;
      if (product.billingType !== "subscription" || !product.planCode) {
        return { skipped: true, reason: "subscription_type_mismatch" };
      }
      const invoiceId = String(payload.data?.id ?? externalId);
      const orderId = attrs.order_id ? String(attrs.order_id) : invoiceId;
      const isRenewal = Boolean(
        attrs.billing_reason === "renewal" || attrs.renewal,
      );

      const { data: payment } = await admin
        .from("payments")
        .upsert(
          {
            user_id: userId,
            lemon_order_id: `subpay:${orderId}`,
            lemon_invoice_id: invoiceId,
            lemon_variant_id: variantId || null,
            payment_type: "subscription",
            status: "paid",
            amount: Number(attrs.total ?? 0),
            currency: currency.toUpperCase(),
            credits_granted: product.credits,
            test_mode: payloadTestMode,
          },
          { onConflict: "lemon_order_id" },
        )
        .select("*")
        .single();

      await grantCreditsAtomic({
        userId,
        amount: product.credits,
        reason: isRenewal ? "subscription_renewal" : "subscription_initial",
        idempotencyKey: `subscription_payment:${invoiceId}`,
        paymentId: payment?.id,
        metadata: { variantId, productCode: product.code },
      });

      await admin
        .from("profiles")
        .update({ plan_code: product.planCode })
        .eq("id", userId);
      break;
    }
    case "order_refunded":
    case "subscription_payment_refunded": {
      if (!userId || !product) break;
      const orderId = String(payload.data?.id ?? externalId);
      const { data: profile } = await admin
        .from("profiles")
        .select("credit_balance")
        .eq("id", userId)
        .single();

      const reclaim = Math.min(product.credits, profile?.credit_balance ?? 0);
      if (reclaim > 0) {
        const { error } = await admin.rpc("consume_credits", {
          p_user_id: userId,
          p_amount: reclaim,
          p_reason: "payment_refund",
          p_idempotency_key: `payment_refund:${orderId}`,
          p_metadata: { eventName, productCode: product.code },
        });
        if (error) {
          throw error;
        }
      }
      await admin
        .from("payments")
        .update({ status: "refunded" })
        .eq("lemon_order_id", orderId);
      break;
    }
    case "subscription_payment_failed": {
      break;
    }
    default:
      break;
  }

  return {};
}

/** Test helpers (pure) */
export function shouldGrantCreditsForWebhook(input: {
  isProduction: boolean;
  testMode: boolean;
  currency: string;
  variantAllowed: boolean;
  productBillingType: BillingPlan["billingType"] | null;
  eventName: string;
}): { grant: boolean; reason?: string } {
  if (input.isProduction && input.testMode) {
    return { grant: false, reason: "test_mode_in_production" };
  }
  if (!isUsdCurrency(input.currency)) {
    return { grant: false, reason: "currency_not_usd" };
  }
  if (!input.variantAllowed) {
    return { grant: false, reason: "variant_not_allowed" };
  }
  if (
    input.productBillingType === "credit_pack" &&
    input.eventName === "subscription_payment_success"
  ) {
    return { grant: false, reason: "credit_pack_as_subscription" };
  }
  if (
    input.productBillingType === "subscription" &&
    input.eventName === "order_created"
  ) {
    return { grant: false, reason: "subscription_order_created_no_grant" };
  }
  return { grant: true };
}
