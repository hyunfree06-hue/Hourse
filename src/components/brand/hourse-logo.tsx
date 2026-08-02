import { cn } from "@/lib/utils/cn";
import { siteConfig } from "@/config/site";

export type HourseLogoProps = {
  variant?: "mark" | "lockup";
  tone?: "dark" | "light";
  className?: string;
  /** Height in CSS pixels; width follows intrinsic aspect ratio. */
  height?: number;
  priority?: boolean;
  /** When true, alt is empty for decorative repeats. */
  decorative?: boolean;
};

const ASSETS = {
  mark: {
    dark: "/brand/hourse-mark-dark.png",
    light: "/brand/hourse-mark-light.png",
  },
  lockup: {
    dark: "/brand/hourse-lockup-dark.png",
    light: "/brand/hourse-lockup-light.png",
  },
} as const;

/** Intrinsic aspect ratios from approved asset crops (width / height). */
const ASPECT = {
  mark: 401 / 241,
  lockup: 800 / 241,
} as const;

/**
 * Official Hourse brand mark / lockup. Uses approved PNG masters derived from
 * the final uploaded logo without redrawing or recoloring.
 */
export function HourseLogo({
  variant = "lockup",
  tone = "dark",
  className,
  height = variant === "lockup" ? 26 : 24,
  priority = false,
  decorative = false,
}: HourseLogoProps) {
  const src = ASSETS[variant][tone];
  const width = Math.round(height * ASPECT[variant]);

  return (
    // eslint-disable-next-line @next/next/no-img-element -- local brand SVG/PNG; avoid next/image distortion
    <img
      src={src}
      alt={decorative ? "" : siteConfig.name}
      width={width}
      height={height}
      decoding="async"
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      draggable={false}
      className={cn("inline-block max-w-none select-none object-contain", className)}
      style={{ width, height }}
    />
  );
}

/** @deprecated Use HourseLogo — kept as a thin alias during migration. */
export function HourseMark({
  className,
  showWordmark = true,
  markClassName,
}: {
  className?: string;
  markClassName?: string;
  showWordmark?: boolean;
  wordmarkClassName?: string;
}) {
  return (
    <HourseLogo
      variant={showWordmark ? "lockup" : "mark"}
      tone="dark"
      className={cn(className, markClassName)}
      height={showWordmark ? 26 : 24}
    />
  );
}
