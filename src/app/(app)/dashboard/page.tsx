import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { DashboardClient } from "./dashboard-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Projects",
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const profile = await getCurrentProfile();

  const { data: projects } = await supabase
    .from("projects")
    .select("*")
    .order("updated_at", { ascending: false });

  return (
    <DashboardClient
      projects={projects ?? []}
      credits={profile?.credit_balance ?? 0}
      planCode={profile?.plan_code ?? "free"}
    />
  );
}
