"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/types/database";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function AccountClient({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function logout() {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  async function deleteAccount() {
    if (
      !window.confirm(
        "Are you sure you want to delete your account? All projects and assets will be permanently removed.",
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch("/api/account", { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error?.message ?? "Account deletion failed.");
      }
      toast.success("Account deleted.");
      router.push("/");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Deletion failed");
      setDeleting(false);
    }
  }

  const planLabel = profile.plan_code.charAt(0).toUpperCase() + profile.plan_code.slice(1);

  return (
    <div className="mx-auto max-w-lg space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-neutral-950">Account</h1>
        <p className="mt-1 text-[13px] text-neutral-500">
          Manage your profile and login session.
        </p>
      </div>

      <div className="flex items-center gap-4 rounded-lg border border-neutral-200 bg-white p-5">
        <Avatar className="size-12">
          <AvatarImage src={profile.avatar_url ?? undefined} alt="" />
          <AvatarFallback>
            {(profile.display_name ?? "U").slice(0, 1)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-[14px] font-medium text-neutral-900">
            {profile.display_name ?? "User"}
          </p>
          <p className="text-[13px] text-neutral-500">{profile.email}</p>
          <p className="mt-0.5 text-[11px] text-neutral-400">
            {planLabel} plan &middot; {profile.credit_balance} credits
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button size="sm" variant="outline" loading={loading} onClick={logout}>
          Sign out
        </Button>
        <Button
          size="sm"
          variant="destructive"
          loading={deleting}
          onClick={deleteAccount}
        >
          Delete account
        </Button>
      </div>
    </div>
  );
}
