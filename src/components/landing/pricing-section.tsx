"use client";

import Link from "next/link";
import {
  billingPlans,
  formatPlanPrice,
  formatPlanPriceLabel,
} from "@/config/billing";
import { GoogleAuthButton } from "@/components/auth/google-auth-button";
import { Button } from "@/components/ui/button";

export function PricingSection() {
  const plans = billingPlans.filter(
    (p) => p.billingType === "free" || p.billingType === "subscription",
  );

  return (
    <section id="pricing" className="border-t border-[#E4E4E7] bg-white">
      <div className="mx-auto max-w-[1120px] px-5 py-16 sm:py-20">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-[28px] font-semibold leading-[1.2] tracking-[-0.02em] text-[#111113] sm:text-[32px]">
              Simple, credit-based pricing.
            </h2>
            <p className="mt-3 max-w-md text-[15px] leading-[1.6] text-[#71717A]">
              Start with free credits. Subscribe when you need a steady supply.
              Billed in USD.
            </p>
          </div>
          <Button asChild variant="outline" size="sm" className="w-fit rounded-[8px] border-[#E4E4E7] text-[13px] text-[#3F3F46]">
            <Link href="/pricing">View all plans</Link>
          </Button>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.code}
              className={`rounded-[12px] border p-6 ${
                plan.highlighted
                  ? "border-[#635BFF]/30 bg-[#635BFF]/[0.03]"
                  : "border-[#E4E4E7] bg-white"
              }`}
            >
              <h3 className="text-[16px] font-semibold text-[#111113]">
                {plan.name}
              </h3>
              <p className="mt-1 text-[13px] text-[#71717A]">
                {plan.description}
              </p>
              <p className="mt-5 text-[32px] font-semibold tracking-tight text-[#111113]">
                {formatPlanPrice(plan)}
              </p>
              <p className="text-[13px] text-[#71717A]">
                {formatPlanPriceLabel(plan)}
              </p>
              <ul className="mt-5 space-y-2 text-[13px] text-[#3F3F46]">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <span className="mt-1 block size-1 shrink-0 rounded-full bg-[#635BFF]" />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-6">
                {plan.billingType === "free" ? (
                  <GoogleAuthButton
                    className="w-full rounded-[8px] bg-[#111113] text-[13px] font-medium text-white hover:bg-[#27272A]"
                    label="Start free"
                    nextPath="/dashboard"
                  />
                ) : (
                  <GoogleAuthButton
                    className={`w-full rounded-[8px] text-[13px] font-medium ${
                      plan.highlighted
                        ? "bg-[#635BFF] text-white hover:bg-[#5046E5]"
                        : "border border-[#E4E4E7] bg-white text-[#3F3F46] hover:border-[#D4D4D8] hover:text-[#111113]"
                    }`}
                    variant={plan.highlighted ? "default" : "outline"}
                    label="Get started"
                    nextPath={`/pricing?plan=${plan.checkoutCode}`}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
