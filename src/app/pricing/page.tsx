import { Suspense } from "react";
import { AppHeader } from "@/components/layout/site-header";
import { LandingHeader, LandingFooter } from "@/components/layout/site-header";
import { PricingCards } from "@/components/billing/pricing-cards";
import { getCurrentUser, getCurrentProfile } from "@/lib/auth/session";

export default async function PricingPage() {
  const user = await getCurrentUser();
  const profile = await getCurrentProfile();

  return (
    <div className="flex min-h-full flex-col bg-neutral-50">
      {user ? (
        <AppHeader
          credits={profile?.credit_balance}
          displayName={profile?.display_name}
        />
      ) : (
        <LandingHeader />
      )}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight text-neutral-950">
          요금제
        </h1>
        <p className="mt-2 text-neutral-600">
          가입 크레딧으로 시작하고, 필요할 때 구독 또는 크레딧 팩을 추가하세요.
          결제는 미국 달러(USD)로 처리됩니다.
        </p>
        <div className="mt-10">
          <Suspense fallback={<div className="text-sm text-neutral-500">불러오는 중...</div>}>
            <PricingCards isLoggedIn={Boolean(user)} />
          </Suspense>
        </div>
      </main>
      {!user && <LandingFooter />}
    </div>
  );
}
