/**
 * Format USD amounts from integer cents.
 * Whole dollars may omit cents ($19); fractional amounts keep two digits ($9.99).
 */
export function formatUsdFromCents(
  amountCents: number,
  options?: { trimZeroCents?: boolean },
): string {
  const dollars = amountCents / 100;
  const trim =
    options?.trimZeroCents === true && Number.isInteger(dollars);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: trim ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(dollars);
}

export const ALLOWED_CHECKOUT_CURRENCY = "USD" as const;

export function isUsdCurrency(currency: string | null | undefined): boolean {
  return (currency ?? "").toUpperCase() === "USD";
}
