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
            if (attempts <= 8) toast.success("결제가 반영되었습니다.");
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
      toast.error(data.error?.message ?? "포털을 열 수 없습니다.");
      return;
    }
    window.location.href = data.url;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-950">결제 및 크레딧</h1>
        <p className="mt-1 text-sm text-neutral-500">
          현재 요금제와 크레딧 사용 내역을 확인합니다. 결제는 미국 달러(USD)로
          처리되며, 카드사에 따라 해외 결제 수수료 또는 환전 수수료가 발생할 수
          있습니다.
        </p>
      </div>

      {confirming && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
          결제가 확인되는 중입니다. 잠시만 기다려 주세요…
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <p className="text-xs text-neutral-500">현재 플랜</p>
          <p className="mt-1 text-xl font-semibold capitalize">{planCode}</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <p className="text-xs text-neutral-500">잔여 크레딧</p>
          <p className="mt-1 text-xl font-semibold">{credits}</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <p className="text-xs text-neutral-500">구독 상태</p>
          <p className="mt-1 text-xl font-semibold">
            {subscription?.status ?? "없음"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/pricing">요금제 변경</Link>
        </Button>
        <Button variant="outline" onClick={openPortal}>
          결제 수단 · 구독 관리
        </Button>
      </div>

      <section>
        <h2 className="text-lg font-semibold">크레딧 내역</h2>
        {ledger.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">아직 내역이 없습니다.</p>
        ) : (
          <ul className="mt-3 divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white">
            {ledger.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-medium text-neutral-800">{item.reason}</p>
                  <p className="text-xs text-neutral-500">
                    {new Date(item.created_at).toLocaleString("ko-KR")}
                  </p>
                </div>
                <span
                  className={
                    item.delta >= 0 ? "text-emerald-600" : "text-neutral-800"
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
        <h2 className="text-lg font-semibold">결제 기록</h2>
        {payments.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">결제 기록이 없습니다.</p>
        ) : (
          <ul className="mt-3 divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white">
            {payments.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-medium">{p.payment_type}</p>
                  <p className="text-xs text-neutral-500">
                    {p.status} · {new Date(p.created_at).toLocaleString("ko-KR")}
                  </p>
                </div>
                <span>{p.credits_granted} 크레딧</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
