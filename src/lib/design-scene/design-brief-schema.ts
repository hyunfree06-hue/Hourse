import { z } from "zod";

/**
 * Canonical Design brief schema.
 * This exact Zod instance is used for:
 * - OpenAI Structured Outputs (via zodTextFormat)
 * - local safeParse after the provider response
 * - persisted brief validation
 * - tests
 *
 * Do not recreate a parallel hand-written JSON Schema for the brief.
 * Do not add .transform / .refine / .default / .optional / .nullish here —
 * those belong in normalizeDesignBrief after parse.
 */
export const DesignBriefSchema = z.object({
  category: z.string(),
  tone: z.string(),
  hierarchy: z.string(),
  layout: z.string(),
  typography: z.string(),
  paletteNotes: z.string(),
  requiredObjects: z.array(z.string()),
  /** Numeric spacing scale only — never a comma-separated string. */
  spacingRhythm: z.array(z.number()),
  /** Optional descriptive notes about spacing (separate from the scale). */
  spacingNotes: z.string(),
});

export type DesignBrief = z.infer<typeof DesignBriefSchema>;

/** @deprecated Prefer DesignBriefSchema — alias kept for existing imports. */
export const designBriefSchema = DesignBriefSchema;

const DEFAULT_SPACING_RHYTHM = [4, 8, 12, 16, 24, 32] as const;

export function summarizeUnknownValue(value: unknown): {
  receivedType: string;
  arrayLength: number | null;
  missing: boolean;
} {
  if (value === undefined) {
    return { receivedType: "undefined", arrayLength: null, missing: true };
  }
  if (value === null) {
    return { receivedType: "null", arrayLength: null, missing: false };
  }
  if (Array.isArray(value)) {
    return {
      receivedType: "array",
      arrayLength: value.length,
      missing: false,
    };
  }
  return {
    receivedType: typeof value,
    arrayLength: null,
    missing: false,
  };
}

export function summarizeZodIssue(
  issue: {
    code: string;
    path: PropertyKey[];
    expected?: unknown;
  },
  raw: unknown,
): {
  issuePath: string;
  zodCode: string;
  expectedType: string | null;
  receivedType: string;
  arrayLength: number | null;
  missing: boolean;
  fieldSummary: ReturnType<typeof summarizeUnknownValue>;
} {
  const issuePath = issue.path.map(String).join(".");
  let cursor: unknown = raw;
  for (const key of issue.path) {
    if (cursor == null || typeof cursor !== "object") {
      cursor = undefined;
      break;
    }
    cursor = (cursor as Record<string | number, unknown>)[
      key as string | number
    ];
  }

  const fieldSummary = summarizeUnknownValue(cursor);
  const expectedType =
    typeof issue.expected === "string" ? issue.expected : null;

  return {
    issuePath: issuePath || "(root)",
    zodCode: issue.code,
    expectedType,
    receivedType: fieldSummary.receivedType,
    arrayLength: fieldSummary.arrayLength,
    missing: fieldSummary.missing,
    fieldSummary,
  };
}

/**
 * Business normalization after Structured Outputs parse.
 * Deduplicate / sort / clamp spacing tokens; trim strings; drop empties.
 */
export function normalizeDesignBrief(brief: DesignBrief): DesignBrief {
  const spacingRhythm = [
    ...new Set(
      brief.spacingRhythm
        .filter((n) => typeof n === "number" && Number.isFinite(n) && n > 0)
        .map((n) => Math.round(n)),
    ),
  ]
    .filter((n) => n <= 512)
    .sort((a, b) => a - b);

  const requiredObjects = brief.requiredObjects
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, 24);

  return {
    category: brief.category.trim() || "general",
    tone: brief.tone.trim() || "neutral",
    hierarchy: brief.hierarchy.trim() || "primary focus with supporting elements",
    layout: brief.layout.trim() || "balanced composition",
    typography: brief.typography.trim() || "clear sans hierarchy",
    paletteNotes: brief.paletteNotes.trim() || "high-contrast neutrals",
    requiredObjects:
      requiredObjects.length > 0 ? requiredObjects : ["primary mark", "wordmark"],
    spacingRhythm:
      spacingRhythm.length > 0 ? spacingRhythm : [...DEFAULT_SPACING_RHYTHM],
    spacingNotes: brief.spacingNotes.trim() || "Use the spacing rhythm consistently.",
  };
}
