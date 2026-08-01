import { describe, expect, it } from "vitest";
import {
  assertCheckoutTestModeMatches,
  assertProductionLiveBilling,
  assertVariantModeConsistency,
  extractPayloadTestMode,
  parseLemonSqueezyTestMode,
  shouldIgnoreTestWebhookGrants,
} from "@/lib/billing/mode";
import { AppError } from "@/lib/utils/errors";

describe("parseLemonSqueezyTestMode", () => {
  it('parses "false" as false', () => {
    expect(parseLemonSqueezyTestMode("false")).toBe(false);
  });

  it('parses "true" as true', () => {
    expect(parseLemonSqueezyTestMode("true")).toBe(true);
  });

  it("defaults missing env to false (live)", () => {
    expect(parseLemonSqueezyTestMode(undefined)).toBe(false);
    expect(parseLemonSqueezyTestMode(null)).toBe(false);
    expect(parseLemonSqueezyTestMode("")).toBe(false);
  });

  it('does not treat random strings as true (unlike Boolean("false"))', () => {
    expect(Boolean("false")).toBe(true);
    expect(parseLemonSqueezyTestMode("false")).toBe(false);
    expect(parseLemonSqueezyTestMode("1")).toBe(false);
    expect(parseLemonSqueezyTestMode("yes")).toBe(false);
  });
});

describe("production test webhook grants", () => {
  it("does not grant credits for test_mode webhooks in production", () => {
    expect(
      shouldIgnoreTestWebhookGrants({
        isProduction: true,
        payloadTestMode: true,
      }),
    ).toBe(true);
  });

  it("allows live webhooks in production", () => {
    expect(
      shouldIgnoreTestWebhookGrants({
        isProduction: true,
        payloadTestMode: false,
      }),
    ).toBe(false);
  });

  it("allows test webhooks outside production", () => {
    expect(
      shouldIgnoreTestWebhookGrants({
        isProduction: false,
        payloadTestMode: true,
      }),
    ).toBe(false);
  });
});

describe("checkout test mode consistency", () => {
  it("accepts live checkout when configured for live", () => {
    expect(() =>
      assertVariantModeConsistency({
        configuredTestMode: false,
        checkoutTestMode: false,
        variantId: "12345",
      }),
    ).not.toThrow();
  });

  it("rejects returning checkout URL when response test_mode mismatches", () => {
    expect(() =>
      assertCheckoutTestModeMatches({
        expectedTestMode: false,
        actualTestMode: true,
      }),
    ).toThrow(AppError);
  });

  it("rejects mixing live config with test checkout response", () => {
    expect(() =>
      assertVariantModeConsistency({
        configuredTestMode: false,
        checkoutTestMode: true,
        variantId: "999",
      }),
    ).toThrow(/test_mode/);
  });
});

describe("production live billing guard", () => {
  const liveEnv = {
    LEMONSQUEEZY_TEST_MODE: false,
    LEMONSQUEEZY_API_KEY: "live_key",
    LEMONSQUEEZY_STORE_ID: "store_1",
    LEMONSQUEEZY_VARIANT_CREATOR_MONTHLY: "v1",
    LEMONSQUEEZY_VARIANT_PRO_MONTHLY: "v2",
    LEMONSQUEEZY_VARIANT_CREDIT_PACK: "v3",
  };

  it("allows complete live config in production", () => {
    expect(() =>
      assertProductionLiveBilling(liveEnv, "production"),
    ).not.toThrow();
  });

  it("blocks test mode in production", () => {
    expect(() =>
      assertProductionLiveBilling(
        { ...liveEnv, LEMONSQUEEZY_TEST_MODE: true },
        "production",
      ),
    ).toThrow(AppError);
  });

  it("requires live variant IDs in production", () => {
    expect(() =>
      assertProductionLiveBilling(
        { ...liveEnv, LEMONSQUEEZY_VARIANT_CREATOR_MONTHLY: "" },
        "production",
      ),
    ).toThrow(/Live Variant/);
  });

  it("skips guards outside production", () => {
    expect(() =>
      assertProductionLiveBilling(
        { ...liveEnv, LEMONSQUEEZY_TEST_MODE: true },
        "development",
      ),
    ).not.toThrow();
  });
});

describe("extractPayloadTestMode", () => {
  it("reads attributes.test_mode", () => {
    expect(
      extractPayloadTestMode({
        data: { attributes: { test_mode: true } },
      }),
    ).toBe(true);
  });

  it("defaults to false when absent", () => {
    expect(extractPayloadTestMode({})).toBe(false);
  });
});
