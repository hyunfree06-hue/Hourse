import { describe, expect, it } from "vitest";
import {
  billingPlans,
  formatPlanPrice,
  getPlanByCheckoutCode,
  getPlanByCode,
  getProductByCode,
} from "@/config/billing";
import { formatUsdFromCents, isUsdCurrency } from "@/lib/billing/money";
import { shouldGrantCreditsForWebhook } from "@/lib/billing/lemonsqueezy";
import { checkoutSchema } from "@/lib/validation/schemas";

describe("USD billing catalog", () => {
  const free = getPlanByCode("free")!;
  const creator = getPlanByCheckoutCode("creator")!;
  const pro = getPlanByCheckoutCode("pro")!;
  const pack = getPlanByCheckoutCode("credit_pack")!;

  it("Free is 0 cents", () => {
    expect(free.priceAmountCents).toBe(0);
    expect(free.currency).toBe("USD");
    expect(free.credits).toBe(10);
  });

  it("Creator is 1900 cents", () => {
    expect(creator.priceAmountCents).toBe(1900);
    expect(creator.credits).toBe(100);
    expect(creator.planCode).toBe("creator");
  });

  it("Pro is 4900 cents", () => {
    expect(pro.priceAmountCents).toBe(4900);
    expect(pro.credits).toBe(300);
    expect(pro.planCode).toBe("pro");
  });

  it("Credit Pack is 999 cents", () => {
    expect(pack.priceAmountCents).toBe(999);
    expect(pack.credits).toBe(50);
    expect(pack.planCode).toBeNull();
  });

  it("formats cents to USD correctly", () => {
    expect(formatUsdFromCents(1900, { trimZeroCents: true })).toBe("$19");
    expect(formatUsdFromCents(4900, { trimZeroCents: true })).toBe("$49");
    expect(formatUsdFromCents(999)).toBe("$9.99");
    expect(formatUsdFromCents(0, { trimZeroCents: true })).toBe("$0");
  });

  it("UI plan prices show $19, $49, $9.99", () => {
    expect(formatPlanPrice(creator)).toBe("$19");
    expect(formatPlanPrice(pro)).toBe("$49");
    expect(formatPlanPrice(pack)).toBe("$9.99");
  });

  it("has no KRW symbols in catalog display helpers", () => {
    const joined = billingPlans
      .map((p) => `${formatPlanPrice(p)}${p.name}${p.productName ?? ""}`)
      .join(" ");
    expect(joined).not.toMatch(/₩|KRW|원/);
  });
});

describe("checkout trust boundary", () => {
  it("accepts only safe plan codes", () => {
    expect(checkoutSchema.parse({ planCode: "creator" }).planCode).toBe(
      "creator",
    );
    expect(() =>
      checkoutSchema.parse({ planCode: "creator_monthly" }),
    ).toThrow();
    expect(() =>
      checkoutSchema.parse({
        planCode: "creator",
        price: 1,
        credits: 9999,
      }),
    ).not.toThrow(); // extra keys stripped by default zod object? zod strips unknown by default in zod 3; zod 4 might differ
  });

  it("does not map arbitrary codes", () => {
    expect(getProductByCode("unknown")).toBeUndefined();
  });
});

describe("webhook grant rules", () => {
  it("rejects non-USD live webhooks", () => {
    const result = shouldGrantCreditsForWebhook({
      isProduction: true,
      testMode: false,
      currency: "KRW",
      variantAllowed: true,
      productBillingType: "subscription",
      eventName: "subscription_payment_success",
    });
    expect(result.grant).toBe(false);
    expect(result.reason).toBe("currency_not_usd");
  });

  it("rejects unknown variants", () => {
    expect(
      shouldGrantCreditsForWebhook({
        isProduction: true,
        testMode: false,
        currency: "USD",
        variantAllowed: false,
        productBillingType: null,
        eventName: "order_created",
      }).grant,
    ).toBe(false);
  });

  it("rejects production test_mode", () => {
    expect(
      shouldGrantCreditsForWebhook({
        isProduction: true,
        testMode: true,
        currency: "USD",
        variantAllowed: true,
        productBillingType: "subscription",
        eventName: "subscription_payment_success",
      }).grant,
    ).toBe(false);
  });

  it("grants Creator/Pro 100/300 and pack 50 via catalog", () => {
    expect(getPlanByCheckoutCode("creator")!.credits).toBe(100);
    expect(getPlanByCheckoutCode("pro")!.credits).toBe(300);
    expect(getPlanByCheckoutCode("credit_pack")!.credits).toBe(50);
  });

  it("Credit Pack does not change plan_code", () => {
    expect(getPlanByCheckoutCode("credit_pack")!.planCode).toBeNull();
  });

  it("subscription order_created does not grant", () => {
    expect(
      shouldGrantCreditsForWebhook({
        isProduction: false,
        testMode: false,
        currency: "USD",
        variantAllowed: true,
        productBillingType: "subscription",
        eventName: "order_created",
      }).grant,
    ).toBe(false);
  });

  it("subscription_payment_success can grant once (idempotency elsewhere)", () => {
    expect(
      shouldGrantCreditsForWebhook({
        isProduction: false,
        testMode: false,
        currency: "USD",
        variantAllowed: true,
        productBillingType: "subscription",
        eventName: "subscription_payment_success",
      }).grant,
    ).toBe(true);
  });

  it("detects USD currency helper", () => {
    expect(isUsdCurrency("USD")).toBe(true);
    expect(isUsdCurrency("usd")).toBe(true);
    expect(isUsdCurrency("KRW")).toBe(false);
  });
});
