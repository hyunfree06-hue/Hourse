import { Suspense } from "react";
import type { Metadata } from "next";
import { AppHeader, LandingHeader, LandingFooter } from "@/components/layout/site-header";
import { PricingCards } from "@/components/billing/pricing-cards";
import { getCurrentUser, getCurrentProfile } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Pricing",
};

export default async function PricingPage() {
  const user = await getCurrentUser();
  const profile = await getCurrentProfile();

  return (
    <div className="flex min-h-full flex-col bg-[#F7F7F8]">
      {user ? (
        <AppHeader
          credits={profile?.credit_balance}
          displayName={profile?.display_name}
        />
      ) : (
        <LandingHeader />
      )}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-12 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-950">
          Pricing
        </h1>
        <p className="mt-1.5 text-[14px] text-neutral-600">
          Start with free credits, then add a subscription or credit pack when
          you need more. All payments are in USD.
        </p>
        <div className="mt-10">
          <Suspense fallback={<div className="text-[13px] text-neutral-400">Loading&hellip;</div>}>
            <PricingCards isLoggedIn={Boolean(user)} />
          </Suspense>
        </div>
      </main>
      {!user && <LandingFooter />}
    </div>
  );
}
