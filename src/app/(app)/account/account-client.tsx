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
        "정말 탈퇴하시겠습니까? 프로젝트와 에셋이 삭제되며 되돌릴 수 없습니다.",
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch("/api/account", { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error?.message ?? "탈퇴에 실패했습니다.");
      }
      toast.success("계정이 삭제되었습니다.");
      router.push("/");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "탈퇴 실패");
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-950">계정</h1>
        <p className="mt-1 text-sm text-neutral-500">
          프로필과 로그인 세션을 관리합니다.
        </p>
      </div>

      <div className="flex items-center gap-4 rounded-xl border border-neutral-200 bg-white p-5">
        <Avatar className="size-14">
          <AvatarImage src={profile.avatar_url ?? undefined} alt="" />
          <AvatarFallback>
            {(profile.display_name ?? "U").slice(0, 1)}
          </AvatarFallback>
        </Avatar>
        <div>
          <p className="font-medium text-neutral-900">
            {profile.display_name ?? "사용자"}
          </p>
          <p className="text-sm text-neutral-500">{profile.email}</p>
          <p className="mt-1 text-xs text-neutral-400">
            플랜 {profile.plan_code} · 크레딧 {profile.credit_balance}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button variant="outline" loading={loading} onClick={logout}>
          로그아웃
        </Button>
        <Button
          variant="destructive"
          loading={deleting}
          onClick={deleteAccount}
        >
          회원 탈퇴
        </Button>
      </div>
    </div>
  );
}
