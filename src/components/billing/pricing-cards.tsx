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
        throw new Error(data.error?.message ?? "Checkout 생성에 실패했습니다.");
      }
      window.location.href = data.url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "결제 시작 실패");
      setLoadingCode(null);
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-neutral-500">
        결제는 미국 달러(USD)로 처리됩니다. 카드사에 따라 해외 결제 수수료 또는
        환전 수수료가 발생할 수 있습니다.
      </p>
      <div className="grid gap-6 lg:grid-cols-4">
        {billingPlans.map((plan) => {
          const checkoutKey = plan.checkoutCode ?? plan.code;
          return (
            <div
              key={plan.code}
              className={`flex flex-col rounded-xl border p-6 ${
                plan.highlighted
                  ? "border-indigo-300 bg-indigo-50/30"
                  : "border-neutral-200 bg-white"
              }`}
            >
              <h2 className="text-lg font-semibold text-neutral-900">
                {plan.name}
              </h2>
              <p className="mt-1 text-sm text-neutral-500">{plan.description}</p>
              <p className="mt-4 text-3xl font-semibold">
                {formatPlanPrice(plan)}
              </p>
              <p className="text-sm text-neutral-500">
                {formatPlanPriceLabel(plan)}
              </p>
              <ul className="mt-5 flex-1 space-y-2 text-sm text-neutral-600">
                {plan.features.map((f) => (
                  <li key={f}>· {f}</li>
                ))}
              </ul>
              <div className="mt-6">
                {plan.billingType === "free" ? (
                  isLoggedIn ? (
                    <Button
                      className="w-full"
                      variant="outline"
                      onClick={() => router.push("/dashboard")}
                    >
                      대시보드로 이동
                    </Button>
                  ) : (
                    <GoogleAuthButton
                      className="w-full"
                      label="무료로 시작"
                      nextPath="/dashboard"
                    />
                  )
                ) : isLoggedIn ? (
                  <Button
                    className="w-full"
                    variant={plan.highlighted ? "default" : "outline"}
                    loading={loadingCode === checkoutKey}
                    onClick={() => startCheckout(checkoutKey)}
                  >
                    선택하기
                  </Button>
                ) : (
                  <GoogleAuthButton
                    className="w-full"
                    variant={plan.highlighted ? "default" : "outline"}
                    label="로그인 후 선택"
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
