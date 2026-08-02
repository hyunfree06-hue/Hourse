/**
 * Central allowlisted fonts for AI Design generation.
 * Models may only return fonts from this registry.
 */
export const designFonts = [
  "Inter",
  "Geist",
  "Noto Sans KR",
  "IBM Plex Sans",
  "Space Grotesk",
  "Playfair Display",
] as const;

export type DesignFont = (typeof designFonts)[number];

const FONT_SET = new Set<string>(designFonts);

const FONT_FALLBACKS: Record<string, DesignFont> = {
  arial: "Inter",
  helvetica: "Inter",
  "sans-serif": "Inter",
  roboto: "Inter",
  "sf pro": "Inter",
  "noto sans": "Noto Sans KR",
  "noto serif": "Playfair Display",
  georgia: "Playfair Display",
  "times new roman": "Playfair Display",
  geist: "Geist",
  inter: "Inter",
  "ibm plex": "IBM Plex Sans",
  "space grotesk": "Space Grotesk",
  playfair: "Playfair Display",
};

export const DESIGN_FONT_STACK: Record<DesignFont, string> = {
  Inter: 'Inter, "Noto Sans KR", system-ui, sans-serif',
  Geist: 'Geist, Inter, "Noto Sans KR", system-ui, sans-serif',
  "Noto Sans KR": '"Noto Sans KR", Inter, system-ui, sans-serif',
  "IBM Plex Sans": '"IBM Plex Sans", Inter, "Noto Sans KR", sans-serif',
  "Space Grotesk": '"Space Grotesk", Inter, "Noto Sans KR", sans-serif',
  "Playfair Display": '"Playfair Display", Georgia, serif',
};

export function isRegisteredDesignFont(font: string): font is DesignFont {
  return FONT_SET.has(font);
}

/** Map model-returned font names onto the allowlist. */
export function resolveDesignFont(requested: string | null | undefined): DesignFont {
  if (!requested) return "Inter";
  const trimmed = requested.trim();
  if (isRegisteredDesignFont(trimmed)) return trimmed;
  const lower = trimmed.toLowerCase();
  for (const [key, value] of Object.entries(FONT_FALLBACKS)) {
    if (lower.includes(key)) return value;
  }
  // Prefer Korean-capable font when CJK characters appear in the request string itself.
  if (/[\u3131-\uD79D]/.test(trimmed)) return "Noto Sans KR";
  return "Inter";
}

export function fontStackFor(font: DesignFont): string {
  return DESIGN_FONT_STACK[font];
}

/** Prefer Noto Sans KR for strings containing Hangul. */
export function preferFontForText(text: string, requested?: string | null): DesignFont {
  const resolved = resolveDesignFont(requested);
  if (/[\u3131-\uD79D]/.test(text) && resolved !== "Noto Sans KR") {
    return "Noto Sans KR";
  }
  return resolved;
}

export async function ensureDesignFontsLoaded(
  fonts: Iterable<string> = designFonts,
): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  const loads: Promise<unknown>[] = [];
  for (const font of fonts) {
    const family = resolveDesignFont(font);
    loads.push(document.fonts.load(`16px "${family}"`));
  }
  loads.push(document.fonts.ready);
  await Promise.allSettled(loads);
}
