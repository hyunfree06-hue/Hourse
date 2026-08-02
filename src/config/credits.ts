export type AiProviderId = "openai" | "bfl";
export type AiQuality = "fast" | "standard" | "high";
export type AiMode = "generate" | "edit" | "replace" | "design";

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

/**
 * Design (editable scene) costs live only here.
 * Two internal LLM passes + optional raster layers are one billable action.
 * High quality includes headroom for optional image layers.
 */
const DESIGN_COSTS: Record<AiQuality, number> = {
  fast: 2,
  standard: 3,
  high: 6,
};

export function calculateCreditCost(input: {
  provider: AiProviderId;
  quality: AiQuality;
  mode: AiMode;
}): number {
  if (input.mode === "design") {
    return DESIGN_COSTS[input.quality];
  }
  const base = baseCosts[input.provider][input.quality];
  if (input.mode === "generate") return base;
  return base + EDIT_SURCHARGE;
}

export const creditCostTable = {
  openai: baseCosts.openai,
  bfl: baseCosts.bfl,
  editSurcharge: EDIT_SURCHARGE,
  design: DESIGN_COSTS,
} as const;

export const QUALITY_LABELS: Record<AiQuality, string> = {
  fast: "Fast",
  standard: "Standard",
  high: "High",
};

export const MODE_LABELS: Record<AiMode, string> = {
  generate: "Generate",
  edit: "Reference selection",
  replace: "Replace region",
  design: "Design",
};

export const PROVIDER_LABELS: Record<AiProviderId, string> = {
  openai: "OpenAI",
  bfl: "FLUX",
};
