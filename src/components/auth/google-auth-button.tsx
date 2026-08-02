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
  label = "Continue with Google",
  ...props
}: GoogleAuthButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      if (!hasSupabasePublicConfig()) {
        toast.error(
          "Supabase is not configured yet. Check your .env.local file.",
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
        toast.error(error.message || "Sign-in failed.");
        setLoading(false);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Sign-in failed.",
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
