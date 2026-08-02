import { Suspense } from "react";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { BillingClient } from "./billing-client";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Billing",
};

export default async function BillingPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/?next=/billing");

  const supabase = await createClient();
  const [{ data: subscription }, { data: payments }, { data: ledger }] =
    await Promise.all([
      supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", profile.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("payments")
        .select("*")
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("credit_ledger")
        .select("*")
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

  return (
    <Suspense>
      <BillingClient
        profile={profile}
        subscription={subscription}
        payments={payments ?? []}
        ledger={ledger ?? []}
      />
    </Suspense>
  );
}
