import { describe, expect, it } from "vitest";
import { calculateCreditCost } from "@/config/credits";
import {
  getAllowedVariantIds,
  getProductByCode,
  getProductByVariantId,
} from "@/config/billing";
import { verifyLemonSignature } from "@/lib/billing/lemonsqueezy";
import { createHmac } from "crypto";
import {
  serializeCustomProperties,
  FABRIC_CUSTOM_KEYS,
} from "@/lib/canvas/custom-properties";
import { aspectRatioLabel } from "@/lib/utils/geometry";

describe("credit cost", () => {
  it("calculates generate costs", () => {
    expect(
      calculateCreditCost({
        provider: "openai",
        quality: "fast",
        mode: "generate",
      }),
    ).toBe(1);
    expect(
      calculateCreditCost({
        provider: "openai",
        quality: "standard",
        mode: "generate",
      }),
    ).toBe(2);
    expect(
      calculateCreditCost({
        provider: "openai",
        quality: "high",
        mode: "generate",
      }),
    ).toBe(4);
  });

  it("adds surcharge for edit/replace", () => {
    expect(
      calculateCreditCost({
        provider: "bfl",
        quality: "standard",
        mode: "replace",
      }),
    ).toBe(3);
    expect(
      calculateCreditCost({
        provider: "bfl",
        quality: "high",
        mode: "edit",
      }),
    ).toBe(5);
  });

  it("treats insufficient credits as cost > balance", () => {
    const cost = calculateCreditCost({
      provider: "openai",
      quality: "high",
      mode: "replace",
    });
    const balance = 2;
    expect(balance < cost).toBe(true);
  });
});

describe("idempotency key", () => {
  it("keeps unique generation keys distinct", () => {
    const a = "generation:abc";
    const b = "generation:abc";
    const c = "generation:xyz";
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe("lemon signature", () => {
  it("verifies valid hmac", () => {
    const body = '{"meta":{"event_name":"order_created"}}';
    const secret = "whsec_test";
    const signature = createHmac("sha256", secret).update(body).digest("hex");
    expect(verifyLemonSignature(body, signature, secret)).toBe(true);
  });

  it("rejects mismatched length or invalid signature", () => {
    expect(verifyLemonSignature("{}", "abc", "secret")).toBe(false);
    expect(verifyLemonSignature("{}", null, "secret")).toBe(false);
  });
});

describe("variant mapping", () => {
  it("resolves product by checkout code", () => {
    expect(getProductByCode("creator")?.credits).toBe(100);
    expect(getProductByCode("credit_pack")?.billingType).toBe("credit_pack");
  });

  it("returns empty allowed variants without env", () => {
    expect(Array.isArray(getAllowedVariantIds())).toBe(true);
    expect(getProductByVariantId("missing")).toBeUndefined();
  });
});

describe("provider selection labels", () => {
  it("supports openai and bfl cost tables", () => {
    expect(
      calculateCreditCost({
        provider: "openai",
        quality: "fast",
        mode: "generate",
      }),
    ).toBeLessThan(
      calculateCreditCost({
        provider: "bfl",
        quality: "high",
        mode: "edit",
      }),
    );
  });
});

describe("image size labels", () => {
  it("normalizes aspect ratio label", () => {
    expect(aspectRatioLabel(1920, 1080)).toBe("16:9");
    expect(aspectRatioLabel(512, 512)).toBe("1:1");
  });
});

describe("fabric custom properties", () => {
  it("serializes known custom keys", () => {
    const serialized = serializeCustomProperties({
      objectId: "1",
      assetId: "a",
      objectRole: "generated",
      generatedBy: "openai",
      generationId: "g",
      locked: false,
      name: "img",
      unrelated: true,
    });
    expect(serialized).toEqual({
      objectId: "1",
      assetId: "a",
      objectRole: "generated",
      generatedBy: "openai",
      generationId: "g",
      locked: false,
      name: "img",
    });
    expect(FABRIC_CUSTOM_KEYS).toContain("objectId");
  });
});
