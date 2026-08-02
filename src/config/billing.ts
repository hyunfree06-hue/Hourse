import { formatUsdFromCents } from "@/lib/billing/money";

export type PlanCode = "free" | "creator" | "pro";

/** Client checkout codes — only these paid codes may be sent to the API. */
export type CheckoutPlanCode = "creator" | "pro" | "credit_pack";

export type BillingPlan = {
  /** Stable app/DB code */
  code: "free" | "creator_monthly" | "pro_monthly" | "credit_pack";
  /** Safe client checkout key (null for free) */
  checkoutCode: CheckoutPlanCode | null;
  name: string;
  description: string;
  productName: string | null;
  variantName: string | null;
  billingType: "free" | "subscription" | "credit_pack";
  billingInterval: "month" | null;
  priceAmountCents: number;
  currency: "USD";
  credits: number;
  planCode: PlanCode | null;
  variantEnvKey:
    | "LEMONSQUEEZY_VARIANT_CREATOR_MONTHLY"
    | "LEMONSQUEEZY_VARIANT_PRO_MONTHLY"
    | "LEMONSQUEEZY_VARIANT_CREDIT_PACK"
    | null;
  features: string[];
  highlighted?: boolean;
};

export const billingPlans: BillingPlan[] = [
  {
    code: "free",
    checkoutCode: null,
    name: "Free",
    description: "Start creating with a focused personal workspace.",
    productName: null,
    variantName: null,
    billingType: "free",
    billingInterval: null,
    priceAmountCents: 0,
    currency: "USD",
    credits: 10,
    planCode: "free",
    variantEnvKey: null,
    features: [
      "10 credits on signup",
      "Unlimited personal projects",
      "PNG, JPG, and SVG export",
      "Autosave",
    ],
  },
  {
    code: "creator_monthly",
    checkoutCode: "creator",
    name: "Creator",
    description: "For creators who generate and refine on a steady rhythm.",
    productName: "Hourse Creator",
    variantName: "Creator Monthly",
    billingType: "subscription",
    billingInterval: "month",
    priceAmountCents: 1900,
    currency: "USD",
    credits: 100,
    planCode: "creator",
    variantEnvKey: "LEMONSQUEEZY_VARIANT_CREATOR_MONTHLY",
    highlighted: true,
    features: [
      "100 credits every month",
      "Access to leading image models",
      "Priority generation queue",
      "Email support",
    ],
  },
  {
    code: "pro_monthly",
    checkoutCode: "pro",
    name: "Pro",
    description: "For frequent, high-finish visual work.",
    productName: "Hourse Pro",
    variantName: "Pro Monthly",
    billingType: "subscription",
    billingInterval: "month",
    priceAmountCents: 4900,
    currency: "USD",
    credits: 300,
    planCode: "pro",
    variantEnvKey: "LEMONSQUEEZY_VARIANT_PRO_MONTHLY",
    features: [
      "300 credits every month",
      "Priority for high-quality runs",
      "Larger asset uploads",
      "Priority support",
    ],
  },
  {
    code: "credit_pack",
    checkoutCode: "credit_pack",
    name: "Credit Pack 50",
    description: "Top up when you need more runway.",
    productName: "Hourse Credit Pack",
    variantName: "50 Credits",
    billingType: "credit_pack",
    billingInterval: null,
    priceAmountCents: 999,
    currency: "USD",
    credits: 50,
    planCode: null,
    variantEnvKey: "LEMONSQUEEZY_VARIANT_CREDIT_PACK",
    features: [
      "50 additional credits",
      "No subscription required",
      "Credits do not expire",
    ],
  },
];

/** @deprecated Use billingPlans — kept as alias for gradual migration */
export const billingProducts = billingPlans;

export function getPlanByCode(code: string): BillingPlan | undefined {
  return billingPlans.find((p) => p.code === code);
}

export function getPlanByCheckoutCode(
  checkoutCode: string,
): BillingPlan | undefined {
  return billingPlans.find((p) => p.checkoutCode === checkoutCode);
}

export function getProductByCode(code: string): BillingPlan | undefined {
  return getPlanByCheckoutCode(code) ?? getPlanByCode(code);
}

export function getVariantIdForProduct(product: BillingPlan): string | null {
  if (!product.variantEnvKey) return null;
  const value = process.env[product.variantEnvKey];
  return value && value.length > 0 ? value : null;
}

export function getAllowedVariantIds(): string[] {
  return billingPlans
    .map((p) => getVariantIdForProduct(p))
    .filter((id): id is string => Boolean(id));
}

export function getProductByVariantId(
  variantId: string,
): BillingPlan | undefined {
  return billingPlans.find((p) => getVariantIdForProduct(p) === variantId);
}

export function formatPlanPrice(plan: BillingPlan): string {
  if (plan.priceAmountCents === 0) return formatUsdFromCents(0);
  if (plan.billingType === "credit_pack") {
    return formatUsdFromCents(plan.priceAmountCents);
  }
  return formatUsdFromCents(plan.priceAmountCents, { trimZeroCents: true });
}

export function formatPlanPriceLabel(plan: BillingPlan): string {
  if (plan.billingType === "free") return "Free";
  if (plan.billingInterval === "month") return "/month";
  return "one-time";
}

export function getPlanDisplayPrice(plan: BillingPlan): string {
  if (plan.billingType === "free") return "$0";
  return formatPlanPrice(plan);
}
