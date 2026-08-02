export type AiProviderId = "openai" | "bfl";
export type AiQuality = "fast" | "standard" | "high";
export type AiMode = "generate" | "edit" | "replace";

const baseCosts: Record<AiProviderId, Record<AiQuality, number>> = {
  openai: {
    fast: 1,
    standard: 2,
    high: 4,
  },
  bfl: {
    fast: 1,
    standard: 2,
    high: 4,
  },
};

/** Edit/replace costs 1 credit more than generate at the same quality. */
const EDIT_SURCHARGE = 1;

export function calculateCreditCost(input: {
  provider: AiProviderId;
  quality: AiQuality;
  mode: AiMode;
}): number {
  const base = baseCosts[input.provider][input.quality];
  if (input.mode === "generate") return base;
  return base + EDIT_SURCHARGE;
}

export const creditCostTable = {
  openai: baseCosts.openai,
  bfl: baseCosts.bfl,
  editSurcharge: EDIT_SURCHARGE,
} as const;

export const QUALITY_LABELS: Record<AiQuality, string> = {
  fast: "Fast",
  standard: "Standard",
  high: "High quality",
};

export const MODE_LABELS: Record<AiMode, string> = {
  generate: "Generate",
  edit: "Reference selection",
  replace: "Replace region",
};

export const PROVIDER_LABELS: Record<AiProviderId, string> = {
  openai: "OpenAI",
  bfl: "FLUX",
};
