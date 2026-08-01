import { z } from "zod";
import { parseLemonSqueezyTestMode, warnIfTestModeInNonLocal } from "@/lib/billing/mode";

/**
 * Server-only env schema. Do not import this module from client components.
 */
const serverEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_BRAND_NAME: z.string().default("CanvasAI"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().optional().default(""),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().optional().default(""),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional().default(""),
  OPENAI_API_KEY: z.string().optional().default(""),
  OPENAI_IMAGE_MODEL: z.string().default("gpt-image-2"),
  BFL_API_KEY: z.string().optional().default(""),
  BFL_API_BASE_URL: z.string().url().default("https://api.bfl.ai/v1"),
  BFL_MODEL: z.string().default("flux-2-pro"),
  AI_PROVIDER_DEFAULT: z.enum(["openai", "bfl"]).default("openai"),
  AI_MAX_UPLOAD_MB: z.coerce.number().positive().default(10),
  AI_GENERATION_TIMEOUT_MS: z.coerce.number().positive().default(120_000),
  AI_POLL_INTERVAL_MS: z.coerce.number().positive().default(2_000),
  AI_MAX_POLL_ATTEMPTS: z.coerce.number().positive().default(60),
  LEMONSQUEEZY_API_KEY: z.string().optional().default(""),
  LEMONSQUEEZY_STORE_ID: z.string().optional().default(""),
  LEMONSQUEEZY_WEBHOOK_SECRET: z.string().optional().default(""),
  /** Only the literal string "true" enables test mode. Missing => false (live). */
  LEMONSQUEEZY_TEST_MODE: z
    .string()
    .optional()
    .transform((v) => parseLemonSqueezyTestMode(v)),
  LEMONSQUEEZY_VARIANT_CREATOR_MONTHLY: z.string().optional().default(""),
  LEMONSQUEEZY_VARIANT_PRO_MONTHLY: z.string().optional().default(""),
  LEMONSQUEEZY_VARIANT_CREDIT_PACK: z.string().optional().default(""),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | null = null;

export function resetServerEnvCache(): void {
  cached = null;
}

export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid server env", parsed.error.flatten().fieldErrors);
    throw new Error("서버 환경변수 검증에 실패했습니다.");
  }
  cached = parsed.data;
  warnIfTestModeInNonLocal({
    testMode: cached.LEMONSQUEEZY_TEST_MODE,
    nodeEnv: process.env.NODE_ENV,
  });
  return cached;
}

export function hasOpenAiKey(): boolean {
  return Boolean(getServerEnv().OPENAI_API_KEY);
}

export function hasBflKey(): boolean {
  return Boolean(getServerEnv().BFL_API_KEY);
}

export function hasLemonConfig(): boolean {
  const env = getServerEnv();
  return Boolean(env.LEMONSQUEEZY_API_KEY && env.LEMONSQUEEZY_STORE_ID);
}

export function hasServiceRole(): boolean {
  return Boolean(getServerEnv().SUPABASE_SERVICE_ROLE_KEY);
}

export function getProviderAvailability(): {
  openai: boolean;
  bfl: boolean;
} {
  return {
    openai: hasOpenAiKey(),
    bfl: hasBflKey(),
  };
}
