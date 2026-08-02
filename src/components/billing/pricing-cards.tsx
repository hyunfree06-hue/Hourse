"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  billingPlans,
  formatPlanPrice,
  formatPlanPriceLabel,
  type CheckoutPlanCode,
} from "@/config/billing";
import { Button } from "@/components/ui/button";
import { GoogleAuthButton } from "@/components/auth/google-auth-button";
import { hasSupabasePublicConfig } from "@/lib/validation/env.client";
import { createClient } from "@/lib/supabase/client";

const CHECKOUT_CODES: CheckoutPlanCode[] = ["creator", "pro", "credit_pack"];

export function PricingCards({ isLoggedIn }: { isLoggedIn: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loadingCode, setLoadingCode] = useState<string | null>(null);

  useEffect(() => {
    const plan = searchParams.get("plan");
    if (plan && isLoggedIn) {
      void startCheckout(plan);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn]);

  async function startCheckout(planCode: string) {
    if (!isLoggedIn) return;
    if (!CHECKOUT_CODES.includes(planCode as CheckoutPlanCode)) return;

    setLoadingCode(planCode);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message ?? "Failed to create checkout session.");
      }
      window.location.href = data.url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Checkout failed");
      setLoadingCode(null);
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-[13px] text-neutral-500">
        All prices are in USD. Your card issuer may apply foreign transaction or
        currency conversion fees.
      </p>
      <div className="grid gap-5 lg:grid-cols-4">
        {billingPlans.map((plan) => {
          const checkoutKey = plan.checkoutCode ?? plan.code;
          return (
            <div
              key={plan.code}
              className={`flex flex-col rounded-lg border p-5 ${
                plan.highlighted
                  ? "border-[#635BFF]/30 bg-[#635BFF]/[0.03]"
                  : "border-neutral-200 bg-white"
              }`}
            >
              <h2 className="text-[15px] font-semibold text-neutral-900">
                {plan.name}
              </h2>
              <p className="mt-1 text-[13px] text-neutral-500">{plan.description}</p>
              <p className="mt-4 text-2xl font-semibold text-neutral-950">
                {formatPlanPrice(plan)}
              </p>
              <p className="text-[12px] text-neutral-400">
                {formatPlanPriceLabel(plan)}
              </p>
              <ul className="mt-4 flex-1 space-y-1.5 text-[13px] text-neutral-600">
                {plan.features.map((f) => (
                  <li key={f}>&middot; {f}</li>
                ))}
              </ul>
              <div className="mt-5">
                {plan.billingType === "free" ? (
                  isLoggedIn ? (
                    <Button
                      className="w-full"
                      size="sm"
                      variant="outline"
                      onClick={() => router.push("/dashboard")}
                    >
                      Go to dashboard
                    </Button>
                  ) : (
                    <GoogleAuthButton
                      className="w-full"
                      size="sm"
                      label="Start free"
                      nextPath="/dashboard"
                    />
                  )
                ) : isLoggedIn ? (
                  <Button
                    className="w-full"
                    size="sm"
                    variant={plan.highlighted ? "default" : "outline"}
                    loading={loadingCode === checkoutKey}
                    onClick={() => startCheckout(checkoutKey)}
                  >
                    Select
                  </Button>
                ) : (
                  <GoogleAuthButton
                    className="w-full"
                    size="sm"
                    variant={plan.highlighted ? "default" : "outline"}
                    label="Sign in to select"
                    nextPath={`/pricing?plan=${checkoutKey}`}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function useIsLoggedInClient() {
  const [loggedIn, setLoggedIn] = useState(false);
  useEffect(() => {
    if (!hasSupabasePublicConfig()) return;
    const supabase = createClient();
    void supabase.auth.getUser().then(({ data }) => {
      setLoggedIn(Boolean(data.user));
    });
  }, []);
  return loggedIn;
}
