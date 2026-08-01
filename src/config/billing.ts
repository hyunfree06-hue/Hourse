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
    description: "개인 디자이너를 위한 시작 플랜",
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
      "가입 시 10 크레딧",
      "무제한 개인 프로젝트",
      "PNG · JPG · SVG 내보내기",
      "자동 저장",
    ],
  },
  {
    code: "creator_monthly",
    checkoutCode: "creator",
    name: "Creator",
    description: "꾸준히 AI로 작업하는 디자이너용",
    productName: "CanvasAI Creator",
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
      "매월 100 크레딧",
      "OpenAI · FLUX 모두 사용",
      "우선 생성 큐",
      "이메일 지원",
    ],
  },
  {
    code: "pro_monthly",
    checkoutCode: "pro",
    name: "Pro",
    description: "고품질 생성을 자주 사용하는 경우",
    productName: "CanvasAI Pro",
    variantName: "Pro Monthly",
    billingType: "subscription",
    billingInterval: "month",
    priceAmountCents: 4900,
    currency: "USD",
    credits: 300,
    planCode: "pro",
    variantEnvKey: "LEMONSQUEEZY_VARIANT_PRO_MONTHLY",
    features: [
      "매월 300 크레딧",
      "고품질 생성 우선",
      "대용량 업로드",
      "우선 지원",
    ],
  },
  {
    code: "credit_pack",
    checkoutCode: "credit_pack",
    name: "Credit Pack 50",
    description: "필요할 때 한 번에 충전",
    productName: "CanvasAI Credit Pack",
    variantName: "50 Credits",
    billingType: "credit_pack",
    billingInterval: null,
    priceAmountCents: 999,
    currency: "USD",
    credits: 50,
    planCode: null,
    variantEnvKey: "LEMONSQUEEZY_VARIANT_CREDIT_PACK",
    features: ["50 크레딧 추가", "구독 없이 사용", "만료 없음"],
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
  return (
    getPlanByCheckoutCode(code) ??
    getPlanByCode(code)
  );
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
  // $19 / $49 — trim trailing .00 for whole dollars
  return formatUsdFromCents(plan.priceAmountCents, { trimZeroCents: true });
}

export function formatPlanPriceLabel(plan: BillingPlan): string {
  if (plan.billingType === "free") return "무료";
  if (plan.billingInterval === "month") return "/월";
  return "일회성 결제";
}

export function getPlanDisplayPrice(plan: BillingPlan): string {
  if (plan.billingType === "free") return "$0";
  if (plan.billingInterval === "month") {
    return `${formatPlanPrice(plan)}`;
  }
  return formatPlanPrice(plan);
}
