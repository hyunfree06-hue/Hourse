import Link from "next/link";
import {
  billingPlans,
  formatPlanPrice,
  formatPlanPriceLabel,
} from "@/config/billing";
import { Button } from "@/components/ui/button";
import { GoogleAuthButton } from "@/components/auth/google-auth-button";

export function LandingPricingTeaser() {
  const plans = billingPlans.filter(
    (p) => p.billingType === "free" || p.billingType === "subscription",
  );

  return (
    <section id="pricing" className="border-t border-neutral-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight text-neutral-950">
              필요한 만큼만
            </h2>
            <p className="mt-3 text-neutral-600">
              가입 크레딧으로 시작하고, 필요할 때 구독 또는 크레딧 팩을 추가하세요.
              결제는 미국 달러(USD)로 처리됩니다.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/pricing">전체 요금제 보기</Link>
          </Button>
        </div>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.code}
              className={`rounded-xl border p-6 ${
                plan.highlighted
                  ? "border-indigo-300 bg-indigo-50/40"
                  : "border-neutral-200 bg-white"
              }`}
            >
              <h3 className="text-lg font-semibold text-neutral-900">
                {plan.name}
              </h3>
              <p className="mt-1 text-sm text-neutral-500">{plan.description}</p>
              <p className="mt-4 text-3xl font-semibold text-neutral-950">
                {formatPlanPrice(plan)}
              </p>
              <p className="text-sm text-neutral-500">
                {formatPlanPriceLabel(plan)}
              </p>
              <ul className="mt-5 space-y-2 text-sm text-neutral-600">
                {plan.features.slice(0, 3).map((f) => (
                  <li key={f}>· {f}</li>
                ))}
              </ul>
              <div className="mt-6">
                {plan.billingType === "free" ? (
                  <GoogleAuthButton
                    className="w-full"
                    label="무료로 시작"
                    nextPath="/dashboard"
                  />
                ) : (
                  <GoogleAuthButton
                    className="w-full"
                    variant={plan.highlighted ? "default" : "outline"}
                    label="요금제 선택"
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
