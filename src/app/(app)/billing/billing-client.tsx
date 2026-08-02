"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { CreditLedger, Payment, Profile, Subscription } from "@/types/database";

type Props = {
  profile: Profile;
  subscription: Subscription | null;
  payments: Payment[];
  ledger: CreditLedger[];
};

export function BillingClient({
  profile,
  subscription,
  payments,
  ledger,
}: Props) {
  const searchParams = useSearchParams();
  const [confirming, setConfirming] = useState(
    () => searchParams.get("checkout") === "success",
  );
  const [credits, setCredits] = useState(profile.credit_balance);
  const [planCode, setPlanCode] = useState(profile.plan_code);

  useEffect(() => {
    if (searchParams.get("checkout") !== "success") return;
    let attempts = 0;
    const timer = setInterval(async () => {
      attempts += 1;
      const res = await fetch("/api/account");
      if (res.ok) {
        const data = await res.json();
        if (data.profile) {
          setCredits(data.profile.credit_balance);
          setPlanCode(data.profile.plan_code);
          if (
            data.profile.credit_balance !== profile.credit_balance ||
            data.profile.plan_code !== profile.plan_code ||
            attempts > 8
          ) {
            setConfirming(false);
            clearInterval(timer);
            if (attempts <= 8) toast.success("Payment confirmed.");
          }
        }
      }
      if (attempts > 10) {
        setConfirming(false);
        clearInterval(timer);
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [profile.credit_balance, profile.plan_code, searchParams]);

  async function openPortal() {
    const res = await fetch("/api/billing/portal");
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error?.message ?? "Unable to open billing portal.");
      return;
    }
    window.location.href = data.url;
  }

  const planLabel = planCode.charAt(0).toUpperCase() + planCode.slice(1);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-neutral-950">Billing &amp; Credits</h1>
        <p className="mt-1 text-[13px] text-neutral-500">
          View your current plan and credit usage. All payments are processed in
          USD. Your card issuer may apply foreign transaction or conversion fees.
        </p>
      </div>

      {confirming && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-[13px] text-indigo-900">
          Confirming your payment&hellip; This may take a moment.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">Current plan</p>
          <p className="mt-1 text-lg font-semibold text-neutral-900">{planLabel}</p>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">Credits remaining</p>
          <p className="mt-1 text-lg font-semibold text-neutral-900">{credits}</p>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">Subscription</p>
          <p className="mt-1 text-lg font-semibold text-neutral-900">
            {subscription?.status ?? "None"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button size="sm" asChild>
          <Link href="/pricing">Change plan</Link>
        </Button>
        <Button size="sm" variant="outline" onClick={openPortal}>
          Manage payment method
        </Button>
      </div>

      <section>
        <h2 className="text-[15px] font-semibold text-neutral-900">Credit history</h2>
        {ledger.length === 0 ? (
          <p className="mt-3 text-[13px] text-neutral-500">No activity yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white">
            {ledger.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between px-4 py-2.5 text-[13px]"
              >
                <div>
                  <p className="font-medium text-neutral-800">{item.reason}</p>
                  <p className="text-[11px] text-neutral-400">
                    {new Date(item.created_at).toLocaleString("en-US")}
                  </p>
                </div>
                <span
                  className={
                    item.delta >= 0 ? "font-medium text-emerald-600" : "text-neutral-800"
                  }
                >
                  {item.delta >= 0 ? "+" : ""}
                  {item.delta}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-[15px] font-semibold text-neutral-900">Payment history</h2>
        {payments.length === 0 ? (
          <p className="mt-3 text-[13px] text-neutral-500">No payments recorded.</p>
        ) : (
          <ul className="mt-3 divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white">
            {payments.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between px-4 py-2.5 text-[13px]"
              >
                <div>
                  <p className="font-medium text-neutral-800">{p.payment_type}</p>
                  <p className="text-[11px] text-neutral-400">
                    {p.status} &middot; {new Date(p.created_at).toLocaleString("en-US")}
                  </p>
                </div>
                <span className="text-neutral-700">{p.credits_granted} credits</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
