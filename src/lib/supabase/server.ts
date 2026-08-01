import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";
import { getServerEnv } from "@/lib/validation/env.server";

export async function createClient() {
  const cookieStore = await cookies();
  const env = getServerEnv();
  // Placeholders keep RSC pages from crashing when env is not yet configured;
  // auth calls simply fail and protected layouts redirect.
  const url = env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
  const key =
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder";

  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component — ignore if proxy already refreshed.
        }
      },
    },
  });
}
