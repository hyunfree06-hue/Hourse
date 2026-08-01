"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { hasSupabasePublicConfig } from "@/lib/validation/env.client";
import { Button, type ButtonProps } from "@/components/ui/button";
import { toast } from "sonner";

type GoogleAuthButtonProps = ButtonProps & {
  nextPath?: string;
  label?: string;
};

export function GoogleAuthButton({
  nextPath = "/dashboard",
  label = "Google로 계속하기",
  ...props
}: GoogleAuthButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      if (!hasSupabasePublicConfig()) {
        toast.error(
          "Supabase가 아직 설정되지 않았습니다. .env.local을 확인하세요.",
        );
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        router.push(nextPath);
        return;
      }

      const origin = window.location.origin;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
          queryParams: {
            prompt: "select_account",
          },
        },
      });

      if (error) {
        toast.error(error.message || "로그인에 실패했습니다.");
        setLoading(false);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "로그인에 실패했습니다.",
      );
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      loading={loading}
      onClick={handleClick}
      aria-label={label}
      {...props}
    >
      {label}
    </Button>
  );
}
